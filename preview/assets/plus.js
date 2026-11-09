/* Forecast range, model runs, day/night detail, forecasters' take and the hourly explorer.
   Sources: Open-Meteo ensemble and single-run APIs, NWS gridded forecast, hourly forecast and station
   observations, and the NWS Area Forecast Discussion. Classic script: uses globals from common.js and app.js. */

(() => {
const H = 3600000;
const plusCache = new Map();
/* Cache a promise for ttl minutes; failed requests are forgotten so the next view retries. */
function memo(key, ttlMin, fn) {
  const hit = plusCache.get(key);
  if (hit && Date.now() - hit.time < ttlMin * 60000) return hit.promise;
  const promise = fn();
  plusCache.set(key, { time: Date.now(), promise });
  promise.catch(() => plusCache.delete(key));
  return promise;
}
const omTime = (s) => Date.parse(s.length === 16 ? s + "Z" : s);
const fin = (v) => Number.isFinite(v);
const sum = (a) => a.reduce((x, y) => x + y, 0);
function quant(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/* ---------- time helpers (local to the place's time zone) ---------- */
const zfmt = {};
function zParts(ms, zone) {
  const f = (zfmt[zone] ||= new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
  }));
  const o = {};
  for (const p of f.formatToParts(ms)) o[p.type] = p.value;
  return { hour: +o.hour % 24, day: `${o.year}-${o.month}-${o.day}`, wd: o.weekday };
}
const hourFloor = (ms) => Math.floor(ms / H) * H;
/* 12-hour blocks from the local 6 am / 6 pm boundary at or before `from`. */
function blocks12(zone, n, from = Date.now()) {
  let b = hourFloor(from);
  for (let k = 0; k < 13 && ![6, 18].includes(zParts(b, zone).hour); k++) b -= H;
  const out = [];
  for (let i = 0; i < n; i++) {
    let e = b + H;
    for (let k = 0; k < 14 && ![6, 18].includes(zParts(e, zone).hour); k++) e += H;
    const p = zParts(b, zone);
    out.push({ start: b, end: e, day: p.hour === 6, wd: p.wd, date: p.day });
    b = e;
  }
  return out;
}
function hourLabel(ms, zone) {
  return new Date(ms).toLocaleString("en-US", { hour: "numeric", timeZone: zone }).replace(" ", "").toLowerCase();
}
function agoText(ms) {
  if (!fin(ms)) return "time unknown";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

/* ---------- #9 freshness line: when, from what, and how to read it ---------- */
function freshLine({ updated, source, detail, help, stale }) {
  const old = stale ?? (fin(updated) && Date.now() - updated > 12 * H);
  return `<div class="fresh${old ? " fresh-old" : ""}"><span class="fresh-when">${fin(updated) ? `Updated <b>${agoText(updated)}</b>` : "Update time unknown"}</span>${source ? `<span class="fresh-src">${source}</span>` : ""}${detail ? `<span class="fresh-detail">${detail}</span>` : ""}${help ? `<details class="howto"><summary>How to read this</summary><div>${help}</div></details>` : ""}</div>`;
}
window.freshLine = freshLine;
window.agoText = agoText;

/* ---------- NWS gridded forecast → hourly maps ---------- */
function isoHours(d) {
  const m = String(d || "").match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?)?/);
  return m ? +(m[1] || 0) * 24 + +(m[2] || 0) : 0;
}
/* Every hour a grid value covers. sum: spread an accumulation evenly over its hours. */
function gridHours(prop, sumIt = false) {
  const m = new Map();
  for (const q of prop?.values || []) {
    const [s, d] = q.validTime.split("/"),
      from = Date.parse(s),
      hrs = isoHours(d);
    if (!fin(from) || !hrs || !fin(q.value)) continue;
    for (let k = 0; k < hrs; k++) m.set(from + k * H, sumIt ? q.value / hrs : q.value);
  }
  return m;
}
function gridSeries(grid) {
  return {
    temp: gridHours(grid.temperature),
    feels: gridHours(grid.apparentTemperature),
    rh: gridHours(grid.relativeHumidity),
    wind: gridHours(grid.windSpeed),
    gust: gridHours(grid.windGust),
    dir: gridHours(grid.windDirection),
    sky: gridHours(grid.skyCover),
    pop: gridHours(grid.probabilityOfPrecipitation),
    qpf: gridHours(grid.quantitativePrecipitation, true),
    snow: gridHours(grid.snowfallAmount, true),
  };
}
function over(map, a, b, how) {
  const v = [];
  for (let t = hourFloor(a); t < b; t += H) if (map.has(t)) v.push(map.get(t));
  if (!v.length) return null;
  return how === "sum" ? sum(v) : how === "max" ? Math.max(...v) : how === "min" ? Math.min(...v) : sum(v) / v.length;
}
const mmIn = (v) => (fin(v) ? v / 25.4 : null);

/* ---------- precipitation type letters (never colour alone) ---------- */
function ptype(liquid, rain, snowLiquid) {
  if (!fin(liquid) || liquid < 0.005) return "";
  let rf = fin(rain) ? rain / liquid : fin(snowLiquid) ? 1 - Math.min(1, snowLiquid / liquid) : null;
  if (rf == null) return "";
  return rf <= 0.2 ? "S" : rf >= 0.8 ? "R" : "M";
}
const PT_NAME = { S: "snow", M: "mix", R: "rain" };

/* =====================================================================
   #1 Forecast range: every ensemble member, the middle 80%, the median and the NWS forecast
   ===================================================================== */
const RANGE_ENS = [
  ["ncep_gefs025", "GEFS", "US · 31 runs"],
  ["ecmwf_ifs025_ensemble", "ECMWF ENS", "European · 51 runs"],
];
const RANGE_VARS = {
  temp: { name: "Temperature", unit: "°F", key: "temperature_2m", digits: 0 },
  total: { name: "Total precip", unit: "″", key: "precipitation", digits: 2, accum: true },
  p12: { name: "Precip (12 h)", unit: "″", key: "precipitation", digits: 2, block: true },
  wind: { name: "Wind", unit: " mph", key: "wind_speed_10m", digits: 0 },
  gust: { name: "Gusts", unit: " mph", key: "wind_gusts_10m", digits: 0 },
  cloud: { name: "Clouds", unit: "%", key: "cloud_cover", digits: 0 },
};
let rangeVar = "temp",
  rangeSet = "all",
  rangeDays = typeof innerWidth === "number" && innerWidth < 700 ? 7 : 15;

function rangeFetch(p) {
  return memo(`range:${p[0]},${p[1]}`, 30, async () => {
    const u = new URL("https://ensemble-api.open-meteo.com/v1/ensemble");
    Object.entries({
      latitude: p[0],
      longitude: p[1],
      hourly: "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,cloud_cover",
      models: RANGE_ENS.map((m) => m[0]).join(","),
      forecast_days: 15,
      temporal_resolution: "hourly_3",
      timezone: "UTC",
      temperature_unit: "fahrenheit",
      precipitation_unit: "inch",
      wind_speed_unit: "mph",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    const [ens, nws] = await Promise.allSettled([getJSON(u.toString()), mountainPoint(p)]);
    if (ens.status !== "fulfilled" || !ens.value.hourly?.time) throw Error("No ensemble");
    return { ens: ens.value, nws: nws.status === "fulfilled" ? nws.value : null, fetched: Date.now() };
  });
}
/* Members for one variable as [{model, values}], on the ensemble's 3-hourly times. */
function rangeMembers(ens, key) {
  const out = [];
  for (const [id, name] of RANGE_ENS) {
    for (const k of Object.keys(ens.hourly)) {
      if (!k.startsWith(key) || !k.endsWith(id)) continue;
      const rest = k.slice(key.length, -id.length);
      if (rest !== "_" && !/^_member\d+_$/.test(rest)) continue;
      out.push({ model: name, values: ens.hourly[k].map((v) => (fin(v) ? v : null)) });
    }
  }
  return out;
}
function nwsRangeSeries(grid, v, times) {
  if (!grid) return null;
  const g = gridSeries(grid);
  const conv = {
    temp: (x) => cToF(x),
    wind: (x) => kmhToMph(x),
    gust: (x) => kmhToMph(x),
    cloud: (x) => x,
  };
  if (conv[v]) {
    const m = g[{ temp: "temp", wind: "wind", gust: "gust", cloud: "sky" }[v]];
    return times.map((t) => (m.has(t) ? conv[v](m.get(t)) : null));
  }
  return null;
}
function buildRange(data, v, set, days) {
  const cfg = RANGE_VARS[v],
    ens = data.ens,
    allTimes = ens.hourly.time.map(omTime),
    now = Date.now(),
    first = allTimes.findIndex((t) => t + 3 * H > now),
    last = allTimes.findIndex((t) => t > now + days * 24 * H);
  const i0 = Math.max(0, first),
    i1 = last < 0 ? allTimes.length : last;
  let members = rangeMembers(ens, cfg.key).filter((m) => set === "all" || m.model === set);
  let times = allTimes.slice(i0, i1);
  members = members.map((m) => ({ ...m, values: m.values.slice(i0, i1) }));
  let nws = null;
  if (cfg.accum) {
    members = members.map((m) => {
      let t = 0,
        seen = false;
      return {
        ...m,
        values: m.values.map((x) => {
          if (fin(x)) {
            t += x;
            seen = true;
          }
          return seen || fin(x) ? +t.toFixed(3) : null;
        }),
      };
    });
    if (data.nws?.grid) {
      const q = gridHours(data.nws.grid.quantitativePrecipitation, true);
      let t = 0,
        any = false;
      nws = times.map((tm, k) => {
        const a = k ? times[k - 1] : now;
        const add = over(q, a, tm + 3 * H, "sum");
        if (add != null) {
          t += add / 25.4;
          any = true;
          return +t.toFixed(3);
        }
        return null;
      });
      if (!any) nws = null;
    }
  } else if (cfg.block) {
    const zone = data.zone,
      blocks = blocks12(zone, days * 2 + 1).filter((b) => b.end > now);
    const bt = blocks.map((b) => b.start + (b.end - b.start) / 2);
    members = members.map((m) => ({
      ...m,
      values: blocks.map((b) => {
        const v = times.map((t, k) => (t >= b.start && t < b.end ? m.values[k] : null)).filter(fin);
        return v.length ? +sum(v).toFixed(3) : null;
      }),
    }));
    if (data.nws?.grid) {
      const q = gridHours(data.nws.grid.quantitativePrecipitation, true);
      nws = blocks.map((b) => {
        const s = over(q, Math.max(b.start, now), b.end, "sum");
        return s == null ? null : +(s / 25.4).toFixed(3);
      });
      if (!nws.some(fin)) nws = null;
    }
    times = bt;
  } else {
    nws = nwsRangeSeries(data.nws?.grid, v, times);
    if (nws && !nws.some(fin)) nws = null;
  }
  const stats = times.map((t, k) => {
    const s = members.map((m) => m.values[k]).filter(fin).sort((a, b) => a - b);
    return s.length
      ? { n: s.length, min: s[0], p10: quant(s, 0.1), p50: quant(s, 0.5), p90: quant(s, 0.9), max: s.at(-1) }
      : null;
  });
  return { cfg, times, members, stats, nws };
}
function rangeSVG(r, zone, width, v) {
  const w = Math.max(320, Math.round(width)),
    h = 300,
    left = 44,
    right = 14,
    top = 18,
    plotH = 220,
    n = r.times.length;
  if (n < 2) return '<p class="muted">Not enough model data for this view.</p>';
  const t0 = r.times[0],
    t1 = r.times[n - 1],
    x = (t) => left + ((t - t0) / (t1 - t0)) * (w - left - right);
  let vals = r.members.flatMap((m) => m.values).concat(r.nws || []).filter(fin);
  let lo = Math.min(...vals),
    hi = Math.max(...vals);
  if (v === "temp") {
    lo = Math.floor((lo - 2) / 10) * 10;
    hi = Math.ceil((hi + 2) / 10) * 10;
  } else if (v === "cloud") {
    lo = 0;
    hi = 100;
  } else {
    lo = 0;
    const steps = [0.1, 0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 20, 30, 40, 60, 80, 100];
    hi = steps.find((s) => s >= hi * 1.05) || Math.ceil(hi);
  }
  if (hi === lo) hi = lo + 1;
  const y = (val) => top + ((hi - val) / (hi - lo)) * plotH;
  const path = (values) => {
    let d = "",
      pen = false;
    values.forEach((val, k) => {
      if (fin(val)) {
        d += `${pen ? "L" : "M"}${x(r.times[k]).toFixed(1)},${y(val).toFixed(1)}`;
        pen = true;
      } else pen = false;
    });
    return d;
  };
  let grid = "";
  for (let j = 0; j <= 4; j++) {
    const val = lo + ((hi - lo) * j) / 4;
    grid += `<line x1="${left}" x2="${w - right}" y1="${y(val).toFixed(1)}" y2="${y(val).toFixed(1)}" class="rg-grid"/><text x="${left - 6}" y="${(y(val) + 4).toFixed(1)}" text-anchor="end" class="axis-label">${(+val.toFixed(r.cfg.digits > 0 && hi < 2 ? 2 : r.cfg.digits > 0 ? 1 : 0)).toString()}${v === "temp" ? "°" : v === "cloud" ? "%" : ""}</text>`;
  }
  // Day separators and labels at local midnight.
  let days = "";
  const step = (w - left - right) / ((t1 - t0) / (24 * H));
  for (let t = hourFloor(t0); t <= t1; t += H) {
    if (zParts(t, zone).hour !== 0) continue;
    const X = x(t);
    days += `<line x1="${X.toFixed(1)}" x2="${X.toFixed(1)}" y1="${top}" y2="${top + plotH}" class="rg-day"/>`;
    if (step >= 26 || zParts(t, zone).wd === "Mon")
      days += `<text x="${(X + 3).toFixed(1)}" y="${top + plotH + 16}" class="axis-label">${escapeHTML(step >= 44 ? new Date(t).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: zone }) : zParts(t, zone).wd.slice(0, 2))}</text>`;
  }
  const band =
    r.stats.every((s) => !s) ? "" :
    (() => {
      const pts = r.stats.map((s, k) => (s ? [x(r.times[k]), y(s.p90), y(s.p10)] : null)).filter(Boolean);
      return `<path d="M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}L${pts
        .slice()
        .reverse()
        .map((p) => `${p[0].toFixed(1)},${p[2].toFixed(1)}`)
        .join("L")}Z" class="rg-band"/>`;
    })();
  const lines = r.members
    .map((m) => `<path d="${path(m.values)}" class="rg-member ${m.model === "GEFS" ? "rg-gefs" : "rg-ecmwf"}"/>`)
    .join("");
  const median = `<path d="${path(r.stats.map((s) => (s ? s.p50 : null)))}" class="rg-median"/>`;
  const nws = r.nws ? `<path d="${path(r.nws)}" class="rg-nws"/>` : "";
  const freeze =
    v === "temp" && lo < 32 && hi > 32
      ? `<line x1="${left}" x2="${w - right}" y1="${y(32)}" y2="${y(32)}" class="rg-freeze"/><text x="${w - right - 4}" y="${y(32) - 5}" text-anchor="end" class="rg-freeze-lbl">32°F</text>`
      : "";
  return `<svg class="rg-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeHTML(r.cfg.name)} forecast range from ${r.members.length} ensemble runs">${grid}${days}${band}${lines}${freeze}${median}${nws}<line class="rg-cursor" x1="0" x2="0" y1="${top}" y2="${top + plotH}" visibility="hidden"/><rect class="rg-hit" x="${left}" y="${top}" width="${w - left - right}" height="${plotH}" fill="transparent"/></svg>`;
}
function rangeReadout(r, k, zone, v) {
  const s = r.stats[k];
  if (!s) return '<p class="muted">No model data at this time.</p>';
  const f = (val) => (fin(val) ? (+val).toFixed(r.cfg.digits) + r.cfg.unit : "–");
  const t = r.times[k];
  const when = r.cfg.block
    ? `${new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: zone })} ${zParts(t, zone).hour < 12 || zParts(t, zone).hour >= 18 ? "night" : "day"} (12 h)`
    : new Date(t).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", timeZone: zone });
  const extra =
    v === "temp"
      ? `<li><span>Runs below freezing</span><b>${Math.round((r.members.filter((m) => fin(m.values[k]) && m.values[k] < 32).length / s.n) * 100)}%</b></li>`
      : r.cfg.accum || r.cfg.block
        ? `<li><span>Runs with ≥0.10″</span><b>${Math.round((r.members.filter((m) => fin(m.values[k]) && m.values[k] >= 0.1).length / s.n) * 100)}%</b></li>`
        : "";
  return `<div class="rg-when">${escapeHTML(when)}${r.cfg.accum ? " · total from now" : ""}</div><ul class="rg-stats"><li><span>Highest run</span><b>${f(s.max)}</b></li><li><span>90th percentile</span><b>${f(s.p90)}</b></li><li class="rg-mid"><span>Median</span><b>${f(s.p50)}</b></li><li><span>10th percentile</span><b>${f(s.p10)}</b></li><li><span>Lowest run</span><b>${f(s.min)}</b></li>${r.nws && fin(r.nws[k]) ? `<li class="rg-nws-row"><span>NWS forecast</span><b>${f(r.nws[k])}</b></li>` : ""}${extra}</ul>`;
}
async function loadRange(pt, section) {
  const el = document.querySelector("#plus-range");
  if (!el) return;
  const p = pt.p,
    zone = regionZone(section);
  try {
    const data = await rangeFetch(p);
    if (!el.isConnected) return;
    data.zone = zone;
    const draw = () => {
      if (!el.isConnected) return;
      const r = buildRange(data, rangeVar, rangeSet, rangeDays);
      const counts = RANGE_ENS.map(([, name]) => [name, rangeMembers(data.ens, "temperature_2m").filter((m) => m.model === name).length]);
      const total = counts.reduce((a, c) => a + (rangeSet === "all" || rangeSet === c[0] ? c[1] : 0), 0);
      el.innerHTML = `<div class="ins-head"><h3>Forecast range</h3><span class="muted">${total} ensemble runs</span></div><p class="afd-intro">Each faint line is one run of a weather model ensemble. Lines bunched together = models agree; fanned out = uncertain. The bright line is the median and the shaded band holds the middle 80% of runs.</p><div class="rg-tabs seg" role="tablist" aria-label="Variable">${Object.entries(RANGE_VARS)
        .map(([k, c]) => `<button type="button" role="tab" data-rv="${k}" class="${k === rangeVar ? "active" : ""}" aria-selected="${k === rangeVar}">${c.name}</button>`)
        .join("")}</div><div class="rg-opts"><div class="seg" aria-label="Models">${[["all", "All runs"], ...RANGE_ENS.map((m) => [m[1], m[1]])]
        .map(([k, n]) => `<button type="button" data-rs="${k}" class="${k === rangeSet ? "active" : ""}" aria-pressed="${k === rangeSet}">${n}</button>`)
        .join("")}</div><div class="seg" aria-label="Days">${[3, 7, 15]
        .map((d) => `<button type="button" data-rd="${d}" class="${d === rangeDays ? "active" : ""}" aria-pressed="${d === rangeDays}">${d} days</button>`)
        .join("")}</div></div><div class="rg-wrap"><div class="rg-chart"></div><div class="rg-readout" aria-live="polite"></div></div><div class="rg-legend"><span><i class="lg-gefs"></i>GEFS run</span><span><i class="lg-ecmwf"></i>ECMWF ENS run</span><span><i class="lg-band"></i>Middle 80%</span><span><i class="lg-median"></i>Median</span>${r.nws ? '<span><i class="lg-nws"></i>NWS forecast (dashed)</span>' : ""}</div>${freshLine({
        updated: data.fetched,
        source: `Open-Meteo ensembles: ${counts.map((c) => `${c[0]} (${c[1]} runs)`).join(", ")}${r.nws ? " · NWS grid" : ""}`,
        detail: `${escapeHTML(p[2])} · 3-hourly`,
        help: `<p><b>Tap or hover</b> the chart to read the highest, 10th/50th/90th percentile and lowest run at that time.</p><p><b>Narrow band</b>: the models agree, trust the details. <b>Wide band</b> or two clusters of lines: the outcome is still uncertain, so plan for a range. Uncertainty normally grows with time; days 10–15 show trends, not specifics.</p><p><b>Total precip</b> adds up liquid (melted) precipitation from now, so the lines only go up. <b>Precip (12 h)</b> is each day and night on its own. Ensembles run on coarse grids, so mountain totals can run low and valley temperatures can run warm.</p>`,
      })}`;
      const box = el.querySelector(".rg-chart"),
        out = el.querySelector(".rg-readout");
      box.innerHTML = rangeSVG(r, zone, chartWidth(box), rangeVar);
      const svg = box.querySelector("svg");
      const pick = (k) => {
        out.innerHTML = rangeReadout(r, k, zone, rangeVar);
        const cur = svg?.querySelector(".rg-cursor");
        if (!cur) return;
        const t0 = r.times[0],
          t1 = r.times.at(-1),
          W = +svg.getAttribute("width"),
          X = 44 + ((r.times[k] - t0) / (t1 - t0)) * (W - 58);
        cur.setAttribute("x1", X);
        cur.setAttribute("x2", X);
        cur.setAttribute("visibility", "visible");
      };
      // Default readout: the widest spread in the first five days (usually the next storm).
      let best = 0,
        spread = -1;
      r.stats.forEach((s, k) => {
        if (s && r.times[k] < Date.now() + 5 * 24 * H && s.p90 - s.p10 > spread) {
          spread = s.p90 - s.p10;
          best = k;
        }
      });
      if (r.cfg.accum) best = r.times.length - 1;
      pick(best);
      const hit = svg?.querySelector(".rg-hit");
      if (hit) {
        const move = (e) => {
          const rect = svg.getBoundingClientRect(),
            W = +svg.getAttribute("width"),
            px = ((e.clientX - rect.left) / rect.width) * W,
            frac = Math.min(1, Math.max(0, (px - 44) / (W - 58))),
            t = r.times[0] + frac * (r.times.at(-1) - r.times[0]);
          let k = 0;
          r.times.forEach((tt, j) => {
            if (Math.abs(tt - t) < Math.abs(r.times[k] - t)) k = j;
          });
          pick(k);
        };
        hit.addEventListener("pointermove", move);
        hit.addEventListener("pointerdown", move);
      }
      el.querySelectorAll("[data-rv]").forEach((b) => (b.onclick = () => ((rangeVar = b.dataset.rv), draw())));
      el.querySelectorAll("[data-rs]").forEach((b) => (b.onclick = () => ((rangeSet = b.dataset.rs), draw())));
      el.querySelectorAll("[data-rd]").forEach((b) => (b.onclick = () => ((rangeDays = +b.dataset.rd), draw())));
    };
    draw();
    redrawOnResize(el, draw);
  } catch {
    if (el.isConnected)
      el.innerHTML = '<h3>Forecast range</h3><div class="error">Ensemble model data is temporarily unavailable.</div>';
  }
}

/* =====================================================================
   #2 Precipitation by model run: the last few runs of each model, by 12-hour block
   ===================================================================== */
const RUN_MODELS = [
  // [label, single-run model id, metadata id, hours between runs, typical hours until available]
  ["GFS", "ncep_gfs013", "ncep_gfs013", 6, 5],
  ["ECMWF", "ecmwf_ifs025", "ecmwf_ifs025", 6, 8],
  ["AIFS", "ecmwf_aifs025_single", "ecmwf_aifs025_single", 6, 7],
  ["GEM", "gem_global", null, 12, 7],
];
const RUN_NOTES = {
  GFS: "NOAA's Global Forecast System (US)",
  ECMWF: "European Centre model, usually the most skilful global model",
  AIFS: "ECMWF's AI model",
  GEM: "Environment Canada's global model",
};
let runsMode = "block";

async function latestInit(meta, every, lag) {
  if (meta) {
    try {
      const m = await memo(`meta:${meta}`, 20, () => getJSON(`https://api.open-meteo.com/data/${meta}/static/meta.json`));
      const t = m.last_run_initialisation_time * 1000;
      if (fin(t) && Date.now() - t < 30 * H) return t;
    } catch {}
  }
  const step = every * H;
  return Math.floor((Date.now() - lag * H) / step) * step;
}
function runISO(ms) {
  return new Date(ms).toISOString().slice(0, 16);
}
function runFetch(p, model, init) {
  return memo(`run:${p[0]},${p[1]}:${model}:${init}`, 180, async () => {
    const u = new URL("https://single-runs-api.open-meteo.com/v1/forecast");
    Object.entries({
      latitude: p[0],
      longitude: p[1],
      hourly: "precipitation,rain",
      models: model,
      run: runISO(init),
      forecast_days: 12,
      timezone: "UTC",
      precipitation_unit: "inch",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    const j = await getJSON(u.toString());
    if (!j.hourly?.time) throw Error("No run");
    return j;
  });
}
async function modelRuns(p, [name, id, meta, every, lag]) {
  const init = await latestInit(meta, every, lag);
  const inits = [0, 1, 2, 3].map((k) => init - k * every * H);
  const res = await Promise.allSettled(inits.map((t) => runFetch(p, id, t)));
  return res
    .map((r, k) => ({ name, init: inits[k], data: r.status === "fulfilled" ? r.value : null }))
    .filter((r) => r.data && (r.data.hourly.precipitation || []).some(fin))
    .slice(0, 3);
}
function runBlocks(run, blocks) {
  const t = run.data.hourly.time.map(omTime),
    pr = run.data.hourly.precipitation,
    rn = run.data.hourly.rain;
  // Open-Meteo hourly precipitation is the total for the hour ending at the timestamp.
  return blocks.map((b) => {
    let liq = 0,
      rain = 0,
      n = 0,
      rainN = 0;
    t.forEach((tm, k) => {
      if (tm > b.start && tm <= b.end && fin(pr[k])) {
        liq += pr[k];
        n++;
        if (fin(rn?.[k])) {
          rain += rn[k];
          rainN++;
        }
      }
    });
    return n ? { v: liq, type: ptype(liq, rainN ? rain : null, null) } : null;
  });
}
function nwsBlocks(grid, blocks) {
  if (!grid) return null;
  const q = gridHours(grid.quantitativePrecipitation, true),
    s = gridHours(grid.snowfallAmount, true),
    now = Date.now();
  const out = blocks.map((b) => {
    const liq = over(q, Math.max(b.start, hourFloor(now)), b.end, "sum");
    if (liq == null) return null;
    const sn = over(s, Math.max(b.start, hourFloor(now)), b.end, "sum") || 0;
    const L = liq / 25.4;
    return { v: L, type: ptype(L, null, sn / 25.4 / 10) };
  });
  return out.some(Boolean) ? out : null;
}
function runCell(c, max) {
  if (!c) return '<td class="rt-na">–</td>';
  const v = c.v;
  if (v < 0.005) return '<td class="rt-zero"></td>';
  const a = Math.min(1, v / Math.max(0.3, max * 0.8));
  return `<td style="--rt:${(0.12 + a * 0.68).toFixed(2)}" class="${a > 0.55 ? "rt-hi" : ""}" title="${v.toFixed(2)} in liquid${c.type ? ", " + PT_NAME[c.type] : ""}">${v < 0.1 ? v.toFixed(2).replace(/^0/, "") : v.toFixed(2)}${c.type ? `<i>${c.type}</i>` : ""}</td>`;
}
async function loadRuns(pt, section) {
  const el = document.querySelector("#plus-runs");
  if (!el) return;
  const p = pt.p,
    zone = regionZone(section);
  try {
    const [nws, ...groups] = await Promise.all([
      mountainPoint(p).catch(() => null),
      ...RUN_MODELS.map((m) => modelRuns(p, m).catch(() => [])),
    ]);
    if (!el.isConnected) return;
    if (!groups.some((g) => g.length)) throw Error("No runs");
    const blocks = blocks12(zone, 21).filter((b) => b.end > Date.now()).slice(0, 20);
    const nwsRow = nwsBlocks(nws?.grid, blocks);
    const rows = groups.map((g) => g.map((r) => ({ ...r, cells: runBlocks(r, blocks) })));
    const draw = () => {
      const view = (cells) => {
        if (runsMode !== "total" || !cells) return cells;
        let t = 0,
          types = "";
        return cells.map((c) => {
          if (!c) return null;
          t += c.v;
          if (c.type && c.v >= 0.01) types = types && types !== c.type ? "M" : c.type;
          return { v: t, type: t >= 0.005 ? types : "" };
        });
      };
      const all = [...(nwsRow ? [view(nwsRow)] : []), ...rows.flat().map((r) => view(r.cells))];
      const max = Math.max(0.1, ...all.flat().filter(Boolean).map((c) => c.v));
      const head = `<tr><th class="rt-model" rowspan="2">Model run</th>${(() => {
        const days = [];
        blocks.forEach((b) => {
          const last = days[days.length - 1];
          if (last && last.date === b.date) last.n++;
          else days.push({ date: b.date, wd: b.wd, n: 1, first: b });
        });
        return days
          .map((d) => {
            const lbl = new Date(d.first.start + 3 * H).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: zone });
            return `<th colspan="${d.n}" class="rt-day">${escapeHTML(lbl)}</th>`;
          })
          .join("");
      })()}</tr><tr>${blocks.map((b) => `<th class="rt-half">${b.day ? "Day" : "Night"}</th>`).join("")}</tr>`;
      const runAge = (r) => {
        const hz = new Date(r.init).getUTCHours().toString().padStart(2, "0");
        const local = new Date(r.init).toLocaleString("en-US", { weekday: "short", hour: "numeric", timeZone: zone });
        return { tag: `${hz}Z`, local };
      };
      const body = `${nwsRow ? `<tr class="rt-nws"><th class="rt-model"><b>★ NWS forecast</b><small>official · ${agoText(Date.parse(nws.grid.updateTime))}</small></th>${view(nwsRow).map((c) => runCell(c, max)).join("")}</tr>` : ""}${rows
        .map((g, gi) =>
          g
            .map((r, k) => {
              const a = runAge(r);
              return `<tr class="${k === 0 ? "rt-first" : "rt-older"}"><th class="rt-model"><b>${escapeHTML(r.name)} ${a.tag}</b><small>${k === 0 ? "newest · " : ""}${escapeHTML(a.local)}</small></th>${view(r.cells).map((c) => runCell(c, max)).join("")}</tr>`;
            })
            .join("") || `<tr class="rt-first"><th class="rt-model"><b>${RUN_MODELS[gi][0]}</b><small>unavailable</small></th><td colspan="${blocks.length}" class="rt-na">Runs could not be loaded right now.</td></tr>`,
        )
        .join("")}`;
      const newest = rows
        .map((g) => g[0])
        .filter(Boolean)
        .map((r) => `${r.name} ${runAge(r).tag}`)
        .join(", ");
      el.innerHTML = `<div class="ins-head"><h3>Precipitation by model run</h3><div class="seg" aria-label="Amounts"><button type="button" data-rm="block" class="${runsMode === "block" ? "active" : ""}" aria-pressed="${runsMode === "block"}">Each 12 h</button><button type="button" data-rm="total" class="${runsMode === "total" ? "active" : ""}" aria-pressed="${runsMode === "total"}">Storm totals</button></div></div><p class="afd-intro">Liquid (melted) precipitation in inches from the latest three runs of each global model, day 6 am–6 pm and night 6 pm–6 am. Read down a column to see if the newest runs are trending wetter or drier.</p><div class="rt-wrap"><table class="rt-table"><thead>${head}</thead><tbody>${body}</tbody></table></div><p class="rt-key"><span><i>S</i> snow</span><span><i>M</i> mix</span><span><i>R</i> rain</span><span>stronger blue = more · blank = dry · – = beyond that run</span></p>${freshLine({
        updated: Math.max(...rows.flat().map((r) => r.init + (RUN_MODELS.find((m) => m[0] === r.name)?.[4] ?? 6) * H).filter((t) => t < Date.now()), 0) || null,
        source: `Newest runs: ${escapeHTML(newest)} · Open-Meteo single-run API${nwsRow ? " · NWS grid" : ""}`,
        detail: escapeHTML(p[2]),
        help: `<p>Each row is one run of one model, named by its start time in UTC (00Z = 5 pm MST / 7 pm EST the evening before). New runs come out every 6 hours (GEM every 12), roughly 5–8 hours after their start time.</p><p><b>Consistency matters</b>: if the last three runs of a model show similar amounts in the same column, that model is locked in. If they jump around, the storm's track or timing is still uncertain. The NWS row is the official forecast and stops after about 7 days.</p><p>${RUN_MODELS.map((m) => `<b>${m[0]}</b>: ${RUN_NOTES[m[0]]}`).join(" · ")}. ECMWF's 06Z and 18Z runs only go 6 days.</p><p>Letters give the precipitation type the model expects (from its rain share): <b>S</b> mostly snow, <b>M</b> mixed, <b>R</b> mostly rain.</p>`,
      })}`;
      el.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => ((runsMode = b.dataset.rm), draw())));
    };
    draw();
  } catch {
    if (el.isConnected)
      el.innerHTML = '<h3>Precipitation by model run</h3><div class="error">Model run data is temporarily unavailable.</div>';
  }
}

/* =====================================================================
   #4 Day / night detail table and richer period cards (Forecast view)
   ===================================================================== */
function periodStats(g, q) {
  const a = Date.parse(q.startTime),
    b = Date.parse(q.endTime);
  const f = (m, how) => over(m, a, b, how);
  return {
    feelsLo: cToF(f(g.feels, "min")),
    feelsHi: cToF(f(g.feels, "max")),
    pop: f(g.pop, "max"),
    qpf: mmIn(f(g.qpf, "sum")),
    gust: kmhToMph(f(g.gust, "max")),
    windLo: kmhToMph(f(g.wind, "min")),
    windHi: kmhToMph(f(g.wind, "max")),
    rh: f(g.rh, "avg"),
    sky: f(g.sky, "avg"),
  };
}
const fmtIn = (v) => (!fin(v) ? "–" : v < 0.005 ? "0″" : v < 0.1 ? v.toFixed(2).replace(/^0/, "") + "″" : v.toFixed(2) + "″");
function dayNightHTML(periods, g, zone, gridTime, label) {
  const cols = periods.slice(0, 14).map((q) => ({ q, s: periodStats(g, q) }));
  const row = (name, fn, cls = "") =>
    `<tr class="${cls}"><th scope="row">${name}</th>${cols.map((c) => `<td class="${c.q.isDaytime ? "dn-day" : "dn-night"}">${fn(c)}</td>`).join("")}</tr>`;
  const wd = (c) => new Date(c.q.startTime).toLocaleDateString("en-US", { weekday: "short", timeZone: zone });
  return `<div class="dn-wrap"><table class="dn-table"><thead><tr><th></th>${cols
    .map((c, i) => `<th scope="col" class="${c.q.isDaytime ? "dn-day" : "dn-night"}"><b>${escapeHTML(i === 0 ? (/^(This|Today)/i.test(c.q.name) ? "Today" : /night/i.test(c.q.name) ? "Tonight" : wd(c)) : wd(c))}</b><small>${c.q.isDaytime ? "day" : "night"}</small></th>`)
    .join("")}</tr></thead><tbody>${row("", (c) => forecastIcon(c.q, "small"), "dn-icons")}${row(
    "Temp",
    (c) => `<b class="dn-temp">${c.q.temperature ?? "–"}°</b><small>${c.q.isDaytime ? "high" : "low"}</small>`,
  )}${row("Feels like", (c) => (fin(c.s.feelsLo) ? (c.s.feelsLo === c.s.feelsHi ? `${c.s.feelsLo}°` : `${c.s.feelsLo}–${c.s.feelsHi}°`) : "–"))}${row(
    "Precip chance",
    (c) => {
      const v = c.q.probabilityOfPrecipitation?.value ?? (fin(c.s.pop) ? Math.round(c.s.pop) : null);
      return v == null ? "–" : `${v}%`;
    },
  )}${row("Precip amount", (c) => fmtIn(c.s.qpf))}${row(
    "Wind",
    (c) => `${escapeHTML(c.q.windDirection || "")} ${fin(c.s.windHi) ? (c.s.windLo === c.s.windHi ? c.s.windHi : `${c.s.windLo}–${c.s.windHi}`) : escapeHTML((c.q.windSpeed || "–").replace(/ mph/, ""))}<small>mph</small>`,
  )}${row("Gusts", (c) => (fin(c.s.gust) && c.s.gust > 0 ? `${c.s.gust}<small>mph</small>` : "–"))}${row("Humidity", (c) => (fin(c.s.rh) ? `${Math.round(c.s.rh)}%` : "–"))}${row(
    "Cloud cover",
    (c) => (fin(c.s.sky) ? `${Math.round(c.s.sky / 10) * 10}%` : "–"),
  )}${row("Forecast", (c) => `<span class="dn-text">${escapeHTML(c.q.shortForecast || "")}</span>`, "dn-words")}</tbody></table></div>${freshLine({
    updated: gridTime,
    source: "NWS forecast periods and gridded forecast",
    detail: escapeHTML(label),
    help: "<p>Each column is one NWS forecast period: <b>day</b> (6 am–6 pm) or <b>night</b> (6 pm–6 am). Temperature is the period's high or low. Feels like, gusts, precipitation amount, humidity and cloud cover come from the NWS gridded forecast for the same hours: feels like and wind show the period's range, precipitation amount is the liquid total for the period, humidity and cloud cover are averages.</p><p>Scroll sideways for the full week. Select a period card below for its hour-by-hour forecast.</p>",
  })}`;
}
async function loadDayNight(pts, section) {
  const el = document.querySelector("#plus-daynight");
  if (!el) return;
  const idx = Math.min(hourlyPoint[section] || 0, pts.length - 1),
    pt = pts[idx];
  try {
    const d = await mountainPoint(pt.p);
    if (!el.isConnected) return;
    const periods = (d.forecast.periods || []).filter((q) => Date.parse(q.endTime) > Date.now());
    if (!periods.length) throw Error("No periods");
    const toggle =
      pts.length > 1
        ? `<div class="seg" aria-label="Elevation">${pts.map((x, k) => `<button type="button" data-dnp="${k}" class="${idx === k ? "active" : ""}" aria-pressed="${idx === k}">${escapeHTML(x.label)}</button>`).join("")}</div>`
        : "";
    el.innerHTML = `<div class="ins-head"><h3>Day &amp; night</h3>${toggle}</div>${dayNightHTML(periods, gridSeries(d.grid), regionZone(section), Date.parse(d.grid.updateTime || d.forecast.updateTime), pt.p[2])}`;
    el.querySelectorAll("[data-dnp]").forEach(
      (b) =>
        (b.onclick = () => {
          hourlyPoint[section] = +b.dataset.dnp;
          loadDayNight(pts, section);
          loadHourlyPlus(pts, section);
        }),
    );
  } catch {
    if (el.isConnected) el.innerHTML = '<h3>Day &amp; night</h3><div class="error">NWS gridded forecast is temporarily unavailable.</div>';
  }
}
/* Fill the per-period metrics on the Forecast cards from the NWS grid. */
async function enrichPeriods(root, p, periods) {
  try {
    const d = await mountainPoint(p);
    if (!root?.isConnected) return;
    const g = gridSeries(d.grid);
    root.querySelectorAll("[data-period-hourly]").forEach((btn) => {
      const q = periods[+btn.dataset.periodHourly],
        box = btn.closest(".discussion-period")?.querySelector(".period-metrics");
      if (!q || !box || box.dataset.enriched) return;
      box.dataset.enriched = "1";
      const s = periodStats(g, q);
      const popSpan = [...box.querySelectorAll("span")].find((x) => /Precip chance/.test(x.textContent));
      if (popSpan && /Unavailable/.test(popSpan.textContent) && fin(s.pop))
        popSpan.innerHTML = `Precip chance <b>${Math.round(s.pop)}%</b>`;
      const add = [];
      if (fin(s.qpf) && s.qpf >= 0.005) add.push(`Precip amount <b>${fmtIn(s.qpf)}</b>`);
      if (fin(s.gust) && s.gust >= 15) add.push(`Gusts <b>${s.gust} mph</b>`);
      if (fin(s.feelsLo) && fin(q.temperature) && Math.abs((q.isDaytime ? s.feelsHi : s.feelsLo) - q.temperature) >= 4)
        add.push(`Feels like <b>${q.isDaytime ? s.feelsHi : s.feelsLo}°</b>`);
      if (fin(s.sky)) add.push(`Clouds <b>${Math.round(s.sky / 10) * 10}%</b>`);
      if (fin(s.rh)) add.push(`Humidity <b>${Math.round(s.rh)}%</b>`);
      box.insertAdjacentHTML("beforeend", add.map((x) => `<span>${x}</span>`).join(""));
    });
  } catch {}
}

/* =====================================================================
   #6 Forecasters' take (Forecast view): NWS key messages, with age and a way into Insights
   ===================================================================== */
async function loadTake(pt, section) {
  const el = document.querySelector("#plus-take");
  if (!el) return;
  try {
    if (typeof window.insAFD !== "function") throw Error("No AFD helper");
    const a = await window.insAFD(pt.p);
    if (!el.isConnected) return;
    const n = window.afdNotes(a);
    if (!n) throw Error("No text");
    const items = (n.keys.length ? n.keys : n.conf).slice(0, 3);
    const office = { SLC: "Salt Lake City", BOX: "Boston", BTV: "Burlington", GYX: "Gray, Maine", ALY: "Albany", OKX: "New York" }[n.code] || n.code;
    el.innerHTML = `<div class="ins-head"><h3>Forecasters' take</h3>${n.tone ? `<span class="ins-conf ins-conf-${n.tone === "sure" ? "high" : "low"}">${n.tone === "sure" ? "Confident" : "Uncertain"}</span>` : ""}</div>${
      items.length
        ? `<ul class="take-list">${items.map((k) => `<li>${escapeHTML(k.length > 260 ? k.slice(0, 255).replace(/\s\S*$/, "") + "…" : k)}</li>`).join("")}</ul>`
        : '<p class="muted">The latest discussion has no key messages. Open the full discussion for details.</p>'
    }<p class="take-links"><button type="button" class="linkish" data-view="insights">Storm totals and model ranges in Insights ›</button><button type="button" class="linkish" data-view="afd">Full discussion ›</button></p>${freshLine({
      updated: Date.parse(n.issued),
      source: `NWS ${escapeHTML(office)} forecasters · Area Forecast Discussion`,
      stale: Date.now() - Date.parse(n.issued) > 14 * H,
      help: "<p>Written by the National Weather Service forecasters responsible for this area, usually twice a day plus updates. <b>Key messages</b> are their headline points. The Insights tab turns their discussion and the models into a plain-English summary with storm totals.</p>",
    })}`;
    el.querySelectorAll("[data-view]").forEach(
      (b) =>
        (b.onclick = () => {
          view[section] = b.dataset.view;
          render();
          scrollTo(0, 0);
        }),
    );
  } catch {
    if (el.isConnected) el.remove();
  }
}

/* =====================================================================
   #11 + #12 Hourly explorer: one chart with variable tabs over an hourly table,
   past hours from the nearest station, and jump-to-day links
   ===================================================================== */
const HP_VARS = {
  temp: { name: "Temp", unit: "°F", short: "°" },
  feels: { name: "Feels like", unit: "°F", short: "°" },
  pop: { name: "Precip %", unit: "%", short: "%" },
  qpf: { name: "Precip in", unit: " in", short: "″" },
  wind: { name: "Wind", unit: " mph", short: "" },
  gust: { name: "Gusts", unit: " mph", short: "" },
  sky: { name: "Clouds", unit: "%", short: "%" },
  rh: { name: "Humidity", unit: "%", short: "%" },
};
let hpVar = "temp",
  hpMode = "forecast";
const HP_COL = 40;

async function stationHistory(p) {
  return memo(`hist:${p[0]},${p[1]}`, 15, async () => {
    const o = await observation(p);
    const start = new Date(Date.now() - 26 * H).toISOString().replace(/\.\d+Z$/, "Z");
    const j = await getJSON(`https://api.weather.gov/stations/${o.id}/observations?start=${start}&limit=200`);
    const obs = (j.features || [])
      .map((f) => f.properties)
      .map((x) => ({
        time: Date.parse(x.timestamp),
        temp: cToF(x.temperature?.value),
        feels: cToF(x.windChill?.value ?? x.heatIndex?.value ?? x.temperature?.value),
        wind: kmhToMph(x.windSpeed?.value),
        gust: kmhToMph(x.windGust?.value),
        dir: x.windDirection?.value,
        rh: fin(x.relativeHumidity?.value) ? Math.round(x.relativeHumidity.value) : null,
        qpf: fin(x.precipitationLastHour?.value) ? x.precipitationLastHour.value / 25.4 : null,
        sky: (() => {
          const L = x.cloudLayers || [];
          const amt = { CLR: 0, SKC: 0, FEW: 20, SCT: 40, BKN: 75, OVC: 100, VV: 100 };
          const v = L.map((c) => amt[c.amount]).filter(fin);
          return v.length ? Math.max(...v) : null;
        })(),
        text: x.textDescription,
      }))
      .filter((x) => fin(x.time));
    // One reading per hour: the observation closest to the top of the hour.
    const byHour = new Map();
    for (const x of obs) {
      const h0 = Math.round(x.time / H) * H;
      const cur = byHour.get(h0);
      if (!cur || Math.abs(x.time - h0) < Math.abs(cur.time - h0)) byHour.set(h0, x);
    }
    return { station: o, hours: byHour };
  });
}
function hpForecastRows(hourly, grid) {
  const g = grid ? gridSeries(grid) : null;
  return (hourly.periods || [])
    .filter((q) => Date.parse(q.endTime) > Date.now())
    .map((q) => {
      const t = Date.parse(q.startTime);
      const gv = (k, conv) => (g && g[k].has(t) ? conv(g[k].get(t)) : null);
      return {
        time: t,
        past: false,
        temp: q.temperature,
        feels: gv("feels", cToF) ?? q.temperature,
        pop: q.probabilityOfPrecipitation?.value ?? gv("pop", (v) => v),
        qpf: gv("qpf", mmIn),
        wind: windNum(q.windSpeed),
        dirText: q.windDirection || "",
        gust: gv("gust", kmhToMph),
        sky: gv("sky", (v) => v),
        rh: q.relativeHumidity?.value ?? gv("rh", (v) => v),
        text: q.shortForecast,
        icon: q,
      };
    });
}
function hpPastRows(hist, from, to) {
  const out = [];
  if (!hist) return out;
  for (let t = hourFloor(from); t < to; t += H) {
    const x = hist.hours.get(t);
    out.push(
      x
        ? { time: t, past: true, temp: x.temp, feels: x.feels, pop: null, qpf: x.qpf, wind: x.wind, dirText: compass(x.dir), gust: x.gust, sky: x.sky, rh: x.rh, text: x.text }
        : { time: t, past: true, missing: true },
    );
  }
  return out;
}
function hpChart(rows, v, zone) {
  const cfg = HP_VARS[v],
    n = rows.length,
    w = n * HP_COL,
    h = 170,
    top = 22,
    plotH = 112;
  const vals = rows.map((r) => r[v]).filter(fin);
  if (!vals.length) return `<svg width="${w}" height="${h}" class="hp-svg"><text x="12" y="${h / 2}" class="axis-label">${escapeHTML(cfg.name)} not available for these hours.</text></svg>`;
  let lo = Math.min(...vals),
    hi = Math.max(...vals);
  if (["pop", "sky", "rh"].includes(v)) {
    lo = 0;
    hi = 100;
  } else if (v === "qpf" || v === "wind" || v === "gust") {
    lo = 0;
    hi = Math.max(hi * 1.1, v === "qpf" ? 0.1 : 10);
  } else {
    lo = Math.floor(lo - 4);
    hi = Math.ceil(hi + 2);
  }
  const y = (val) => top + ((hi - val) / (hi - lo)) * plotH;
  let bars = "",
    labels = "",
    days = "";
  rows.forEach((r, i) => {
    const x0 = i * HP_COL;
    const zp = zParts(r.time, zone);
    if (zp.hour === 0 && i) days += `<line x1="${x0}" x2="${x0}" y1="0" y2="${h}" class="hp-daysep"/>`;
    if (zp.hour === 0 || i === 0)
      days += `<text x="${x0 + 4}" y="12" class="hp-daylbl">${escapeHTML(new Date(r.time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: zone }))}</text>`;
    const val = r[v];
    if (fin(val)) {
      const yy = y(val),
        bh = Math.max(1.5, top + plotH - yy);
      bars += `<rect x="${x0 + 6}" y="${(top + plotH - bh).toFixed(1)}" width="${HP_COL - 12}" height="${bh.toFixed(1)}" rx="3" class="${r.past ? "hp-bar-past" : "hp-bar"}"><title>${escapeHTML(hourLabel(r.time, zone))} ${r.past ? "observed" : "forecast"}: ${v === "qpf" ? val.toFixed(2) : Math.round(val)}${cfg.unit}</title></rect>`;
      const show = v === "qpf" ? val >= 0.01 : true;
      if (show && (i % 2 === 0 || n < 30))
        labels += `<text x="${x0 + HP_COL / 2}" y="${(top + plotH - bh - 4).toFixed(1)}" text-anchor="middle" class="hp-val">${v === "qpf" ? val.toFixed(2).replace(/^0/, "") : Math.round(val)}</text>`;
    }
  });
  const nowX = rows.findIndex((r) => !r.past);
  const nowLine = nowX > 0 ? `<line x1="${nowX * HP_COL}" x2="${nowX * HP_COL}" y1="${top - 4}" y2="${top + plotH}" class="hp-now"/><text x="${nowX * HP_COL + 3}" y="${top + plotH + 14}" class="hp-nowlbl">now</text>` : "";
  const freeze = (v === "temp" || v === "feels") && lo < 32 && hi > 32 ? `<line x1="0" x2="${w}" y1="${y(32)}" y2="${y(32)}" class="hp-freeze"/>` : "";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="hp-svg" role="img" aria-label="Hourly ${escapeHTML(cfg.name)}">${days}${freeze}${bars}${labels}${nowLine}</svg>`;
}
function hpTable(rows, zone) {
  const cell = (r, fn) => `<td class="${r.past ? "hp-past" : ""}">${r.missing ? "·" : fn(r)}</td>`;
  const n0 = (v, s = "") => (fin(v) ? Math.round(v) + s : "–");
  const line = (name, fn, cls = "") => `<tr class="${cls}"><th scope="row">${name}</th>${rows.map((r) => cell(r, fn)).join("")}</tr>`;
  return `<table class="hp-table"><thead><tr><th scope="col">Hour</th>${rows
    .map((r) => {
      const zp = zParts(r.time, zone);
      return `<th scope="col" class="${r.past ? "hp-past" : ""}${zp.hour === 0 ? " hp-midnight" : ""}" data-hp-time="${r.time}">${escapeHTML(hourLabel(r.time, zone))}${zp.hour === 0 ? `<small>${escapeHTML(zp.wd)}</small>` : ""}</th>`;
    })
    .join("")}</tr></thead><tbody>${line("Sky", (r) => (r.icon ? `<span title="${escapeHTML(r.text || "")}">${forecastIcon(r.icon, "small")}</span>` : `<span class="hp-wx" title="${escapeHTML(r.text || "")}">${escapeHTML(shortWx(r.text))}</span>`), "hp-icons")}${line("Temp", (r) => `<b>${n0(r.temp, "°")}</b>`)}${line("Feels like", (r) => n0(r.feels, "°"))}${line("Precip %", (r) => (r.past ? "" : n0(r.pop, "%")))}${line(
    "Precip in",
    (r) => (fin(r.qpf) ? (r.qpf < 0.005 ? "0" : r.qpf.toFixed(2).replace(/^0/, "")) : "–"),
  )}${line("Wind", (r) => `${n0(r.wind)}<small>${escapeHTML(r.dirText || "")}</small>`)}${line("Gusts", (r) => n0(r.gust))}${line("Clouds", (r) => n0(r.sky, "%"))}${line("Humidity", (r) => n0(r.rh, "%"))}</tbody></table>`;
}
function shortWx(t) {
  t = String(t || "");
  if (!t) return "–";
  const map = [
    [/thunder/i, "T-storm"],
    [/freezing/i, "Frz rain"],
    [/sleet/i, "Sleet"],
    [/rain and snow|snow and rain|wintry mix|rain\/snow|snow\/rain/i, "Mix"],
    [/heavy snow/i, "Hvy snow"],
    [/snow/i, "Snow"],
    [/drizzle/i, "Drizzle"],
    [/rain|shower/i, "Rain"],
    [/fog|haze|smoke/i, "Fog"],
    [/overcast|cloudy/i, /mostly|partly/i.test(t) ? (/mostly/i.test(t) ? "M cloudy" : "P cloudy") : "Cloudy"],
    [/clear|sunny|fair/i, /mostly|partly/i.test(t) ? (/mostly/i.test(t) ? "M sunny" : "P sunny") : /clear|fair/i.test(t) ? "Clear" : "Sunny"],
    [/wind|breez/i, "Windy"],
  ];
  const hit = map.find(([re]) => re.test(t));
  return hit ? hit[1] : t.split(" ").slice(0, 2).join(" ");
}
async function loadHourlyPlus(pts, section) {
  const el = document.querySelector("#plus-hourly");
  if (!el) return;
  const zone = regionZone(section);
  const idx = Math.min(hourlyPoint[section] || 0, pts.length - 1),
    pt = pts[idx],
    p = pt.p;
  try {
    const [hr, mp, hist] = await Promise.all([
      hourly(p),
      mountainPoint(p).catch(() => null),
      stationHistory(p).catch(() => null),
    ]);
    if (!el.isConnected) return;
    const fc = hpForecastRows(hr, mp?.grid);
    if (fc.length < 6) throw Error("No hourly");
    const firstFc = fc[0].time;
    const todayStart = (() => {
      let t = hourFloor(Date.now());
      for (let k = 0; k < 24 && zParts(t, zone).hour !== 0; k++) t -= H;
      return t;
    })();
    const draw = () => {
      if (!el.isConnected) return;
      const rows =
        hpMode === "history"
          ? hpPastRows(hist, Date.now() - 24 * H, firstFc)
          : [...hpPastRows(hist, todayStart, firstFc), ...fc];
      const dayStarts = [];
      rows.forEach((r, i) => {
        const zp = zParts(r.time, zone);
        if ((zp.hour === 0 || i === 0) && !dayStarts.some((d) => d.day === zp.day)) dayStarts.push({ day: zp.day, wd: zp.wd, i });
      });
      const nowI = rows.findIndex((r) => !r.past);
      const st = hist?.station;
      el.innerHTML = `<div class="chart-controls"><h3>Hourly${pts.length > 1 ? ` · ${escapeHTML(pt.label)}` : ""}</h3><div class="hourly-options"><div class="seg" aria-label="Forecast or history"><button type="button" data-hpm="forecast" class="${hpMode === "forecast" ? "active" : ""}" aria-pressed="${hpMode === "forecast"}">Forecast</button><button type="button" data-hpm="history" class="${hpMode === "history" ? "active" : ""}" aria-pressed="${hpMode === "history"}" ${hist ? "" : "disabled"}>Past 24 h</button></div>${
        pts.length > 1
          ? `<div class="seg" aria-label="Elevation">${pts.map((x, k) => `<button type="button" data-hpp="${k}" class="${idx === k ? "active" : ""}" aria-pressed="${idx === k}">${escapeHTML(x.label)}</button>`).join("")}</div>`
          : ""
      }</div></div><div class="hp-tabs seg" role="tablist" aria-label="Chart variable">${Object.entries(HP_VARS)
        .map(([k, c]) => `<button type="button" role="tab" data-hpv="${k}" class="${k === hpVar ? "active" : ""}" aria-selected="${k === hpVar}">${c.name}</button>`)
        .join("")}</div>${
        hpMode === "forecast"
          ? `<nav class="hp-jump" aria-label="Jump to"><span>Jump to</span>${nowI >= 0 ? `<button type="button" data-hpj="${nowI}">Now</button>` : ""}${dayStarts
              .slice(1)
              .map((d) => `<button type="button" data-hpj="${d.i}">${escapeHTML(d.wd)}</button>`)
              .join("")}</nav>`
          : ""
      }<div class="hp-scroll" tabindex="0" aria-label="Hourly chart and table, scrolls sideways"><div class="hp-inner" style="--hp-col:${HP_COL}px;--hp-n:${rows.length}"><div class="hp-chart-row"><div class="hp-chart-gutter">${escapeHTML(HP_VARS[hpVar].name)}<small>${escapeHTML(HP_VARS[hpVar].unit.trim())}</small></div>${hpChart(rows, hpVar, zone)}</div>${hpTable(rows, zone)}</div></div><div class="hp-key"><span><i class="hp-k-past"></i>observed${st ? ` at ${escapeHTML(st.station)}${st.elevFt ? ` (${st.elevFt.toLocaleString()} ft)` : ""}` : ""}</span><span><i class="hp-k-fc"></i>forecast</span></div>${freshLine({
        updated: Date.parse(hr.updateTime),
        source: `NWS hourly forecast and gridded forecast${hist ? ` · station ${escapeHTML(st.id)}` : ""}`,
        detail: escapeHTML(p[2]),
        help: `<p>Choose a variable above the chart; the table underneath always shows every variable, hour by hour, and scrolls with the chart. <b>Jump to</b> moves to the start of a day. <b>Outlined bars</b> are what a nearby station actually measured earlier today; <b>solid bars</b> are the forecast.</p><p><b>Past 24 h</b> shows only observations, which may come from a station at a different elevation than the forecast point. Precipitation chance is the NWS probability of at least 0.01″; precipitation is the forecast liquid amount for that hour.</p>`,
      })}`;
      const sc = el.querySelector(".hp-scroll");
      const jump = (i) => sc && (sc.scrollLeft = Math.max(0, i * HP_COL - 8));
      if (hpMode === "forecast" && nowI > 0) jump(Math.max(0, nowI - 2));
      if (hpMode === "history") jump(rows.length);
      el.querySelectorAll("[data-hpj]").forEach((b) => (b.onclick = () => jump(+b.dataset.hpj)));
      el.querySelectorAll("[data-hpv]").forEach(
        (b) =>
          (b.onclick = () => {
            const left = sc.scrollLeft;
            hpVar = b.dataset.hpv;
            draw();
            el.querySelector(".hp-scroll").scrollLeft = left;
          }),
      );
      el.querySelectorAll("[data-hpm]").forEach((b) => (b.onclick = () => ((hpMode = b.dataset.hpm), draw())));
      el.querySelectorAll("[data-hpp]").forEach(
        (b) =>
          (b.onclick = () => {
            hourlyPoint[section] = +b.dataset.hpp;
            loadHourlyPlus(pts, section);
            if (document.querySelector("#plus-daynight [data-dnp]")) loadDayNight(pts, section);
          }),
      );
    };
    draw();
  } catch {
    if (el.isConnected) el.innerHTML = '<h3>Hourly</h3><div class="error">NWS hourly forecast is temporarily unavailable.</div>';
  }
}

window.plus = {
  loadRange,
  loadRuns,
  loadDayNight,
  enrichPeriods,
  loadTake,
  loadHourlyPlus,
  clear: () => plusCache.clear(),
  util: { H, memo, omTime, quant, zParts, blocks12, hourFloor, agoText, freshLine, gridHours, gridSeries, over, mmIn, ptype, PT_NAME, fmtIn },
  // exported for tests
  _: { blocks12, gridHours, isoHours, ptype, quant, buildRange, rangeMembers, runBlocks, shortWx, zParts, periodStats, gridSeries },
};
})();
