const RESORTS = utah.slice(2);

const SNOTEL_URL = "https://raw.githubusercontent.com/bg197550/weather-window/data/snotel.json";
let snotel = null;
const content = document.querySelector("#content");
let focusResort = "",
  tab = "forecast",
  forecastRegion = WW.region() === "ne" ? "ne" : "utah",
  hourlyResort = 0,
  hourlyPoint = 1,
  lastLoad = Date.now();
/* Region page: every mountain side by side (list or map) and the measured snowpack. One mountain's detail lives on
   its Snow tab (Weather page). The map is a view of the Snow forecast, not a tab of its own. */
const TABS = { forecast: "Snow forecast", snowpack: "Snowpack" };

function makePlot(series, labels, unit, type, selected) {
  const n = labels.length,
    w = 760,
    h = 268,
    left = 48,
    right = type === "bar" ? 22 : 92,
    top = 25,
    bottom = 47,
    plotW = w - left - right,
    plotH = h - top - bottom;
  let values = series.flatMap((x) => x.values).filter(Number.isFinite),
    lo =
      type === "bar"
        ? 0
        : unit === " in"
          ? Math.max(0, Math.floor(Math.min(...values) - 2))
          : Math.floor(Math.min(...values) - 2),
    hi = Math.max(...values, lo + 1);
  if (type === "bar") hi = Math.max(hi * 1.15, 0.1);
  else hi = Math.ceil(hi + 2);
  const x = (i) => left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1)),
    y = (v) => top + ((hi - v) / (hi - lo)) * plotH,
    colors = ["#56b4e9", "#e69f00", "#e6e6e6", "#cc79a7"],
    dashes = ["", "9 5", "2 5", "12 4 2 4"],
    shapes = ["circle", "square", "triangle", "diamond"],
    mark = (j, cx, cy, r, i) =>
      shapes[j] === "circle"
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors[j]}" stroke="#102c3b" stroke-width="2" data-chart-day="${i}"/>`
        : shapes[j] === "diamond"
          ? `<path d="M${cx},${cy - r * 1.3}L${cx + r * 1.2},${cy}L${cx},${cy + r * 1.3}L${cx - r * 1.2},${cy}Z" fill="${colors[j]}" stroke="#102c3b" stroke-width="2" data-chart-day="${i}"/>`
          : shapes[j] === "square"
            ? `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" fill="${colors[j]}" stroke="#102c3b" stroke-width="2" data-chart-day="${i}"/>`
            : `<path d="M${cx},${cy - r * 1.2}L${cx + r * 1.1},${cy + r * 0.8}L${cx - r * 1.1},${cy + r * 0.8}Z" fill="${colors[j]}" stroke="#102c3b" stroke-width="2" data-chart-day="${i}"/>`,
    pat = (j) => ["none", "hatch", "dots", "hatch"][j];
  let marks = series
    .map((item, j) =>
      type === "bar"
        ? item.values
            .map((v, i) =>
              Number.isFinite(v)
                ? `<rect x="${x(i) - 24 + j * 16}" y="${y(v)}" width="14" height="${Math.max(0, top + plotH - y(v))}" rx="3" fill="${pat(j) === "none" ? colors[j] : `url(#bar-${pat(j)}-${j})`}" stroke="${colors[j]}" stroke-width="1.5" data-chart-day="${i}"/>`
                : "",
            )
            .join("")
        : `<path d="${item.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${colors[j]}" stroke-width="3" stroke-dasharray="${dashes[j]}"/>${item.values.map((v, i) => (Number.isFinite(v) ? mark(j, x(i), y(v), selected === i ? 7 : 5, i) : "")).join("")}`,
    )
    .join("");
  let ends =
    type === "bar"
      ? []
      : series
          .map((item, j) => {
            let k = item.values.length - 1;
            while (k > 0 && !Number.isFinite(item.values[k])) k--;
            return Number.isFinite(item.values[k])
              ? { j, x: x(k) + 10, y: y(item.values[k]) + 4, name: item.name }
              : null;
          })
          .filter(Boolean)
          .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const endLbls = ends
    .map(
      (e) => `<text x="${e.x}" y="${e.y}" class="end-lbl" fill="${colors[e.j]}">${escapeHTML(e.name)}</text>`,
    )
    .join("");
  const defs = `<defs>${series.map((z, j) => `<pattern id="bar-hatch-${j}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#102c3b"/><line x1="0" y1="0" x2="0" y2="5" stroke="${colors[j]}" stroke-width="3"/></pattern><pattern id="bar-dots-${j}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#102c3b"/><circle cx="2.5" cy="2.5" r="1.6" fill="${colors[j]}"/></pattern>`).join("")}</defs>`;
  return `<div class="chart-scroll"><svg class="forecast-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(series.map((x) => x.name).join(", "))} ${type === "bar" ? "bar" : "line"} chart">${defs}<line x1="${left}" y1="${top + plotH}" x2="${w - right}" y2="${top + plotH}" stroke="#3d6273"/><text x="4" y="${top + 7}" class="axis-label">${hi.toFixed(type === "bar" ? 1 : 0)}${unit}</text><text x="4" y="${top + plotH}" class="axis-label">${lo.toFixed(type === "bar" ? 1 : 0)}${unit}</text><rect x="${x(selected) - Math.min(25, plotW / n / 3)}" y="${top}" width="${Math.min(50, ((plotW / n) * 2) / 3)}" height="${plotH}" fill="#58b6d0" opacity=".12" pointer-events="none"/>${marks}${endLbls}${labels.map((q, i) => `<text x="${x(i)}" y="${h - 16}" text-anchor="middle" class="axis-label">${escapeHTML(q)}</text>`).join("")}</svg></div><div class="chart-legend">${series.map((z, i) => `<span><svg width="30" height="14" aria-hidden="true">${type === "bar" ? `<rect x="8" y="1" width="14" height="12" rx="2" fill="${pat(i) === "none" ? colors[i] : `url(#bar-${pat(i)}-${i})`}" stroke="${colors[i]}"/>` : `<line x1="0" y1="7" x2="30" y2="7" stroke="${colors[i]}" stroke-width="3" stroke-dasharray="${dashes[i]}"/>${mark(i, 15, 7, 4.5, "")}`}</svg>${escapeHTML(z.name)}</span>`).join("")}</div>`;
}

async function loadSnotel() {
  try {
    const r = await fetch(`${SNOTEL_URL}?t=${Math.floor(Date.now() / 600000)}`);
    if (!r.ok) throw Error(r.status);
    snotel = await r.json();
  } catch {
    snotel = snotel || { error: true };
  }
  return snotel;
}
function f1(v) {
  return v == null ? "–" : (Math.round(v * 10) / 10).toString();
}
function sparkBars(daily) {
  const v = daily.map((x) => x.depth).filter((x) => x != null);
  if (v.length < 2) return "";
  const max = Math.max(1, ...v),
    w = 8,
    gap = 3;
  return `<svg width="${v.length * (w + gap)}" height="28" aria-hidden="true">${v.map((d, i) => `<rect x="${i * (w + gap)}" y="${28 - Math.max(1, (d / max) * 26)}" width="${w}" height="${Math.max(1, (d / max) * 26)}" rx="2" fill="#7cc6da"/>`).join("")}</svg>`;
}
function snowpackHTML(d) {
  if (!d) return '<div class="state">Loading SNOTEL…</div>';
  if (d.error) return '<div class="error">SNOTEL data is temporarily unavailable.</div>';
  const age = Math.round((Date.now() - Date.parse(d.generatedAt)) / 60000);
  return `<div class="model-table-wrap"><table class="model-table snow-table"><thead><tr><th>Station</th><th>Snow depth<small>latest</small></th><th>Change<small>24 h / 7 days</small></th><th>Water in snow<small>SWE</small></th><th>Air temp</th><th>Last 8 days</th></tr></thead><tbody>${d.stations.map((s) => `<tr><th>${escapeHTML(s.name || s.triplet)}<small>${escapeHTML(s.near)}</small></th><td data-label="Depth"><span><b>${f1(s.latest?.depth)} in</b><small>${escapeHTML(s.latest?.time || "")}</small></span></td><td data-label="Change"><span>${s.change24 == null ? "–" : (s.change24 > 0 ? "+" : "") + f1(s.change24)} / ${s.change7d == null ? "–" : (s.change7d > 0 ? "+" : "") + f1(s.change7d)} in</span></td><td data-label="SWE"><span>${f1(s.latest?.swe)} in</span></td><td data-label="Temp"><span>${s.latest?.temp == null ? "–" : Math.round(s.latest.temp) + "°F"}</span></td><td data-label="8 days"><span>${sparkBars(s.daily || [])}</span></td></tr>`).join("")}</tbody></table></div><p class="source">Measured by USDA NRCS SNOTEL stations (automated, mid-elevation sites, not resort snow stakes). Updated hourly by a scheduled job · data checked ${age < 60 ? age + " min" : Math.round(age / 60) + " h"} ago. <a href="https://www.nrcs.usda.gov/wps/portal/wcc/home/snowClimateMonitoring/snowpack/" target="_blank" rel="noopener">NRCS snowpack ↗</a></p>`;
}
async function hourlyFor(p) {
  const key = p.slice(0, 2).join(",");
  let e = hourlyCache.get(key);
  if (e && Date.now() - e.time < 10 * 60000) return e.promise;
  const promise = (async () => {
    const point = await pointMeta(p);
    return (await getJSON(point.forecastHourly)).properties;
  })();
  hourlyCache.set(key, { time: Date.now(), promise });
  promise.catch(() => hourlyCache.delete(key));
  return promise;
}
async function loadHourlyView() {
  const el = document.querySelector("#hourly-view");
  const r = RESORTS[hourlyResort],
    p = r.p[Math.min(hourlyPoint, r.p.length - 1)];
  try {
    const [h, m] = await Promise.all([hourlyFor(p), mountainPoint(p)]);
    if (!el?.isConnected) return;
    const per = (m.forecast.periods || []).slice(0, 6);
    const metas = await Promise.all(r.p.map((x) => pointMeta(x).catch(() => null)));
    const sameGrid =
      r.p.length > 1 && metas.every((x) => x) && metas[0].forecastGridData === metas[1].forecastGridData;
    el.innerHTML = `<div class="chart-controls"><h3>${escapeHTML(r.name)} · ${escapeHTML(p[2])}</h3>${sameGrid ? '<span class="muted">Peak and mid mountain share one NWS grid square here</span>' : `<div class="seg" aria-label="Elevation"><button data-hp="1" class="${hourlyPoint === 1 ? "active" : ""}" aria-pressed="${hourlyPoint === 1}">Peak</button><button data-hp="0" class="${hourlyPoint === 0 ? "active" : ""}" aria-pressed="${hourlyPoint === 0}">Mid mountain</button></div>`}</div><div class="hourly-chart"></div><div class="periods-list">${per.map((q) => `<div class="glance-period">${forecastIcon(q, "small")}<div><b>${escapeHTML(q.name)} · ${q.temperature}°</b><span>${escapeHTML(q.detailedForecast || q.shortForecast)}</span></div></div>`).join("")}</div><p class="source">NWS hourly and point forecast · updated ${new Date(h.updateTime).toLocaleString("en-US", { timeZone: "America/Denver" })} MT</p>`;
    const box = el.querySelector(".hourly-chart"),
      draw = () => {
        if (box.isConnected)
          box.innerHTML = hourlyChart(h.periods || [], "America/Denver", 48, chartWidth(el));
      };
    draw();
    redrawOnResize(el, draw);
    el.querySelectorAll("[data-hp]").forEach(
      (b) =>
        (b.onclick = () => {
          hourlyPoint = +b.dataset.hp;
          loadHourlyView();
        }),
    );
  } catch {
    if (el?.isConnected) el.innerHTML = '<div class="error">NWS forecast is temporarily unavailable.</div>';
  }
}
async function loadMountainAlerts() {
  const el = document.querySelector("#alert-banner");
  try {
    const list = sortAlerts((await Promise.all(RESORTS.map((r) => alertsFor(r.p[0])))).flat());
    if (el?.isConnected) el.innerHTML = alertHTML(list);
  } catch {}
}
function resortPills(sel, attr) {
  return `<div class="day-pills" aria-label="Resort">${RESORTS.map((x, i) => `<button ${attr}="${i}" class="${i === sel ? "active" : ""}">${escapeHTML(x.name)}</button>`).join("")}</div>`;
}

/* ---------- 10-day snow forecast (OpenSnow-style favorites table) ---------- */
const FORECAST_DAYS = 10;
function zoneMidnight(dateStr, zone) {
  const guess = Date.parse(dateStr + "T00:00:00Z");
  const off = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(new Date(guess))
    .find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-])(\d\d):?(\d\d)?/);
  const mins = off ? (off[1] === "-" ? -1 : 1) * (+off[2] * 60 + +(off[3] || 0)) : 0;
  return guess - mins * 60000;
}
function forecastDays(zone, n = FORECAST_DAYS) {
  const out = [];
  const start = new Date().toLocaleDateString("en-CA", { timeZone: zone });
  for (let k = 0; k < n; k++) {
    const d = new Date(Date.parse(start + "T12:00:00Z") + k * 86400000).toISOString().slice(0, 10);
    const from = zoneMidnight(d, zone),
      next = new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    out.push({ date: d, from, to: zoneMidnight(next, zone) });
  }
  return out;
}
function gridEnd(values) {
  let end = 0;
  for (const q of values || []) {
    const [stamp, dur] = q.validTime.split("/");
    const m = dur.match(/P(?:(\d+)D)?T?(?:(\d+)H)?/);
    end = Math.max(end, Date.parse(stamp) + ((+(m?.[1] || 0)) * 24 + +(m?.[2] || 0)) * 3600000);
  }
  return end;
}
/* Half-day segments (6am–6pm and 6pm–6am local), like OpenSnow's day/night bars. */
function forecastSegments(zone, n = FORECAST_DAYS) {
  const days = forecastDays(zone, n);
  return days.flatMap((d) => [
    { date: d.date, half: "day", from: d.from + 6 * 3600000, to: d.from + 18 * 3600000 },
    { date: d.date, half: "night", from: d.from + 18 * 3600000, to: d.to + 6 * 3600000 },
  ]);
}
function gridStat(values, from, to, pick) {
  const vals = [];
  for (const q of values || []) {
    const [stamp, dur] = q.validTime.split("/");
    const m = dur.match(/P(?:(\d+)D)?T?(?:(\d+)H)?/);
    const a = Date.parse(stamp),
      b = a + ((+(m?.[1] || 0)) * 24 + +(m?.[2] || 0)) * 3600000;
    if (b > from && a < to && Number.isFinite(q.value)) vals.push(q.value);
  }
  return vals.length ? pick(...vals) : null;
}
const hourlySnowCache = new Map();
function modelHourly(p, zone) {
  const key = p.slice(0, 2).join(",");
  const hit = hourlySnowCache.get(key);
  if (hit && Date.now() - hit.time < 30 * 60000) return hit.promise;
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  Object.entries({
    latitude: p[0],
    longitude: p[1],
    hourly: "snowfall,temperature_2m",
    models: "gfs_seamless,ecmwf_ifs025,gem_seamless",
    forecast_days: 16,
    timezone: "UTC",
    precipitation_unit: "inch",
    temperature_unit: "fahrenheit",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const promise = getJSON(u.toString());
  hourlySnowCache.set(key, { time: Date.now(), promise });
  return promise;
}
/* A forecast amount as a range, the way OpenSnow shows it (1-2", 3-5", 4-8"). */
function snowRange(lo, hi) {
  if (hi < 0.05) return [0, 0];
  let a = Math.max(0, Math.round(lo - 0.2)),
    b = Math.round(hi + 0.2);
  if (b <= a) b = a + 1;
  if (b - a === 1 && b >= 3) b++;
  return [Math.max(0, a), b];
}
const rangeText = ([a, b]) => (b === 0 ? '0"' : `${a}-${b}"`);
/* One resort's snow by half-day from the shared outlook (assets/snowcore.js): the file rebuilt every 3 hours,
   or a live build if it is missing or stale. The Snow tab, the map and Insights read the same numbers. */
async function resortOutlook(r, region) {
  try {
    const sum = await SnowCore.summary();
    const o = sum.places?.[slug(r.name)];
    if (o && Date.now() - Date.parse(o.built) < SnowCore.STALE) return o;
  } catch {}
  return SnowCore.forPlace(r, region);
}
async function resortForecast(r, zone, segs, region) {
  const o = await resortOutlook(r, region);
  const cells = segs.map((g) => {
    const q = o.segments.find((x) => x.date === g.date && x.half === g.half);
    return { ...g, src: q?.src || "", range: q ? snowRange(q.lo, q.hi) : null, mid: q?.mid ?? null, lo: q?.lo, hi: q?.hi, temp: q?.temp ?? null };
  });
  const mids = (a, b) => cells.slice(a * 2, b * 2).reduce((t, x) => t + (x.mid || 0), 0);
  const total = (a, b) => {
    if (a === 0 && o.totals[b]) return snowRange(o.totals[b].lo, o.totals[b].hi);
    // A later stretch (days 6–10): the cumulative ranges' difference would overstate it, so sum and pull in.
    const c = cells.slice(a * 2, b * 2).filter((x) => x.range);
    if (!c.length) return null;
    const lo = c.reduce((t, x) => t + (x.lo || 0), 0),
      hi = c.reduce((t, x) => t + (x.hi || 0), 0),
      mid = mids(a, b);
    return snowRange(mid - (mid - lo) * 0.6, mid + (hi - mid) * 0.6);
  };
  const totalMid = (b) => o.totals[b]?.mid ?? mids(0, b);
  return { r, o, elevFt: o.elev, cells, total, mids, totalMid, next5: total(0, 5), later: total(5, 10), next5mid: totalMid(5) };
}
async function loadSnowForecast(region) {
  const el = document.querySelector("#snow-forecast");
  if (!el) return;
  const zone = region === "ne" ? "America/New_York" : "America/Denver";
  const list = region === "ne" ? ne.filter((x) => /Summit/.test(x.p[0][2] || "")) : utahResorts();
  const segs = forecastSegments(zone);
  let results;
  try {
    results = await Promise.all(list.map((r) => resortForecast(r, zone, segs, region)));
  } catch (e) {
    if (el.isConnected) el.innerHTML = `<div class="error">The snow forecast is temporarily unavailable (${escapeHTML(e.message)}).</div>`;
    return;
  }
  if (!el.isConnected || region !== forecastRegion || tab !== "forecast") return;
  const max = Math.max(4, ...results.flatMap((x) => x.cells.map((c) => c.range?.[1] || 0)));
  const best = Math.max(...results.map((x) => x.next5mid));
  const firstModel = results[0]?.cells.findIndex((c) => c.src === "model");
  const area = (r) => (region === "ne" ? { "Stratton Mountain": "Vermont", Killington: "Vermont", Stowe: "Vermont", Gunstock: "New Hampshire" }[r.name] || "New England" : r.name === "Snowbasin" ? "Ogden Valley" : /Deer Valley|Canyons|Park City/.test(r.name) ? "Park City" : "Cottonwood Canyons");
  el.innerHTML = results
    .map((x) => {
      const top = x.next5mid === best && best >= 1;
      const bars = x.cells
        .map((c, k) => {
          const hgt = c.range ? Math.max(c.range[1] ? 3 : 0, Math.round(((c.range[0] + c.range[1]) / 2 / max) * 56)) : 0;
          const big = c.range && c.range[1] >= 6;
          return `<div class="sf-seg ${c.half} ${c.src === "model" ? "is-model" : ""} ${big ? "is-big" : ""}" title="${escapeHTML(`${c.date} ${c.half}: ${c.range ? rangeText(c.range) : "–"}${c.src === "model" ? " (models)" : ""}`)}"><span class="sf-amt">${c.range ? rangeText(c.range) : "–"}</span><i style="height:${hgt}px"></i><span class="sf-temp">${c.temp != null ? c.temp + "°F" : ""}</span>${
            c.half === "day" ? `<span class="sf-day">${k === 0 ? "Today" : new Date(c.from).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: zone })}</span>` : ""
          }</div>`;
        })
        .join("");
      return `<article class="sf-card ${top ? "is-top" : ""} ${slug(x.r.name) === focusResort ? "is-focus" : ""}" id="sf-${slug(x.r.name)}"><div class="sf-head"><div><a class="sf-name" href="${siteBase()}#${region}/${slug(x.r.name)}/snow">${escapeHTML(x.r.name)} ›</a><div class="sf-meta">Summit ${x.elevFt ? x.elevFt.toLocaleString() + " ft · " : ""}${escapeHTML(area(x.r))} · <a href="${siteBase()}#${region}/${slug(x.r.name)}/forecast">forecast</a>${CAMS[x.r.name] ? ` · <a href="${siteBase()}webcams/#${CAMS[x.r.name]}">cams</a>` : ""}</div></div><div class="sf-totals"><div><small>Next 5 days</small><b>${x.next5 ? rangeText(x.next5) : "–"}</b></div><div><small>Next 10 days</small><b>${x.total(0, 10) ? rangeText(x.total(0, 10)) : "–"}</b></div></div></div><div class="sf-strip-wrap"><div class="sf-strip">${bars}</div><button type="button" class="sf-next" aria-label="Scroll ${escapeHTML(x.r.name)} forecast">›</button></div></article>`;
    })
    .join("") +
    `<p class="source">New snow at each summit in each 12-hour period (6am–6pm and 6pm–6am), shown as a likely range, with the summit high or low temperature below. ${
      firstModel > 0
        ? `NWS forecast through ${new Date(results[0].cells[firstModel].from).toLocaleDateString("en-US", { weekday: "long", timeZone: zone })}; after that (lighter, striped bars) the median of the GEFS and ECMWF ensembles.`
        : "Striped bars come from the GEFS and ECMWF ensembles beyond the NWS forecast."
    } Ranges are the 10th–90th percentile of the ensemble runs, scaled to match NWS over its days. Each mountain's name opens its Snow tab, which uses these same numbers. Highlighted: most snow in the next 5 days. Orange bars: 6″ or more possible.</p>`;
  if (focusResort) document.querySelector(`#sf-${focusResort}`)?.scrollIntoView({ block: "center" });
  el.querySelectorAll(".sf-next").forEach((b) => {
    const strip = b.previousElementSibling;
    b.onclick = () => strip.scrollBy({ left: strip.clientWidth * 0.8, behavior: "smooth" });
  });
}


/* ---------- Powder map: 15-day totals on a map (OpenSnow "Powder Finder" style) ---------- */
const POWDER_DAYS = 15;
let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((res, rej) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => res();
    js.onerror = () => {
      leafletReady = null;
      rej(new Error("Map library failed to load"));
    };
    document.head.appendChild(js);
  });
  return leafletReady;
}
let powderMap = null;
async function loadPowderMap(region) {
  const el = document.querySelector("#powder-map"),
    listEl = document.querySelector("#powder-list");
  if (!el) return;
  const zone = region === "ne" ? "America/New_York" : "America/Denver";
  const list = region === "ne" ? ne.filter((x) => /Summit/.test(x.p[0][2] || "")) : utahResorts();
  const segs = forecastSegments(zone, POWDER_DAYS);
  let results;
  try {
    [results] = await Promise.all([Promise.all(list.map((r) => resortForecast(r, zone, segs, region))), loadLeaflet()]);
  } catch (e) {
    el.innerHTML = `<div class="error">${escapeHTML(e.message)}</div>`;
    return;
  }
  if (!el.isConnected || region !== forecastRegion || tab !== "map") return;
  const rows = results.map((x) => {
    const mid = x.totalMid(POWDER_DAYS);
    return { ...x, mid, range: x.total(0, POWDER_DAYS), parts: [x.total(0, 5), x.total(5, 10), x.total(10, 15)] };
  });
  const tier = (v) => (v >= 24 ? "deep" : v >= 12 ? "good" : v >= 4 ? "some" : "little");
  el.innerHTML = "";
  powderMap?.remove();
  powderMap = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 16,
    attribution: "Imagery © Esri · Forecast NWS, Open-Meteo",
  }).addTo(powderMap);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(powderMap);
  const pts = [],
    markers = [];
  const PIN_W = 84,
    PIN_H = 38;
  const iconFor = (x, dx, dy) =>
    L.divIcon({
      className: "powder-icon",
      html: `<button type="button" class="powder-pin ${tier(x.mid)}" aria-label="${escapeHTML(x.r.name)}: about ${Math.round(x.mid)} inches in 15 days"><b>${Math.round(x.mid)}"</b><span>${escapeHTML(x.r.name)}</span></button>`,
      iconSize: [PIN_W, PIN_H],
      iconAnchor: [PIN_W / 2 - dx, PIN_H / 2 - dy],
    });
  for (const x of rows) {
    const [lat, lon] = x.r.p[0];
    pts.push([lat, lon]);
    const icon = iconFor(x, 0, 0);
    const days = forecastDays(zone, POWDER_DAYS).map((d, k) => {
      const v = (x.cells[k * 2]?.mid || 0) + (x.cells[k * 2 + 1]?.mid || 0);
      return { d, v, model: x.cells[k * 2]?.src === "model" };
    });
    const mx = Math.max(2, ...days.map((q) => q.v));
    const pop = `<div class="powder-pop"><b>${escapeHTML(x.r.name)}</b><div class="pp-total">~${Math.round(x.mid)}″ <small>next 15 days${x.range ? ` · ${rangeText(x.range)}` : ""}</small></div><div class="pp-bars">${days
      .map(
        (q, k) =>
          `<i class="${q.model ? "m" : ""}" style="height:${Math.max(q.v >= 0.5 ? 3 : 1, Math.round((q.v / mx) * 44))}px" title="${new Date(q.d.from + 3 * 3600000).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: zone })}: ${q.v < 0.5 ? "0" : Math.round(q.v)}″"></i>`,
      )
      .join("")}</div><div class="pp-parts"><span>Days 1–5 <b>${x.parts[0] ? rangeText(x.parts[0]) : "–"}</b></span><span>6–10 <b>${x.parts[1] ? rangeText(x.parts[1]) : "–"}</b></span><span>11–15 <b>${x.parts[2] ? rangeText(x.parts[2]) : "–"}</b></span></div><a href="${siteBase()}#${region}/${slug(x.r.name)}/snow">Snow detail ›</a><a href="${siteBase()}#${region}/${slug(x.r.name)}/forecast">Full weather forecast ›</a></div>`;
    markers.push({ x, m: L.marker([lat, lon], { icon, riseOnHover: true }).addTo(powderMap).bindPopup(pop, { maxWidth: 280 }) });
  }
  // Resorts a mile apart (Alta and Snowbird) would stack: nudge labels apart at the current zoom.
  // Candidate label offsets, nearest first: a grid of label-sized steps around the point.
  const SPOTS = [];
  for (let i = -3; i <= 3; i++) for (let j = -4; j <= 4; j++) SPOTS.push([i * (PIN_W + 4), j * (PIN_H + 4)]);
  SPOTS.sort((a, b) => Math.hypot(a[0], a[1] * 1.6) - Math.hypot(b[0], b[1] * 1.6));
  const declutter = () => {
    const placed = [];
    for (const k of markers) {
      const p = powderMap.latLngToLayerPoint(k.m.getLatLng());
      let dx = 0,
        dy = 0;
      for (const [ox, oy] of SPOTS) {
        const cx = p.x + ox,
          cy = p.y + oy;
        if (!placed.some((q) => Math.abs(q[0] - cx) < PIN_W + 2 && Math.abs(q[1] - cy) < PIN_H + 2)) {
          dx = ox;
          dy = oy;
          break;
        }
      }
      placed.push([p.x + dx, p.y + dy]);
      k.m.setIcon(iconFor(k.x, dx, dy));
    }
  };
  powderMap.fitBounds(L.latLngBounds(pts).pad(region === "ne" ? 0.35 : 0.6));
  declutter();
  powderMap.on("zoomend", declutter);
  const best = [...rows].sort((a, b) => b.mid - a.mid);
  if (listEl)
    listEl.innerHTML = `<ol>${best
      .map((x) => `<li><a href="${siteBase()}#${region}/${slug(x.r.name)}/snow"><span>${escapeHTML(x.r.name)}</span><b>${Math.round(x.mid)}″</b><small>${x.range ? rangeText(x.range) : ""}</small></a></li>`)
      .join("")}</ol>`;
}

function snowTabs() {
  const on = tab === "map" ? "forecast" : tab;
  return `<nav class="seg snow-tabs" aria-label="Snow report sections">${Object.entries(TABS)
    .map(([k, n]) => `<a href="#${k}${k === "forecast" ? "/" + forecastRegion : ""}" class="${k === on ? "active" : ""}" ${k === on ? 'aria-current="page"' : ""}>${escapeHTML(n)}</a>`)
    .join("")}</nav>`;
}
function forecastHead(view) {
  const seg = (items, cls, label) => `<nav class="seg snowfc-region ${cls}" aria-label="${label}">${items.map(([href, n, on]) => `<a href="${href}" class="${on ? "active" : ""}"${on ? ' aria-current="true"' : ""}>${n}</a>`).join("")}</nav>`;
  return `<div class="snowfc-head"><h3>${view === "map" ? "Next 15 days" : "Next 10 days"}</h3><div class="snowfc-tools">${seg(
    [
      [`#forecast/${forecastRegion}`, "List", view === "forecast"],
      [`#map/${forecastRegion}`, "Map", view === "map"],
    ],
    "snowfc-view",
    "View",
  )}${seg(
    [
      [`#${view}/utah`, "Utah", forecastRegion === "utah"],
      [`#${view}/ne`, "New England", forecastRegion === "ne"],
    ],
    "",
    "Region",
  )}</div></div>`;
}
function render() {
  const sub = { forecast: "Every mountain side by side · tap one for its Snow tab", map: "Snow expected at each mountain over the next 15 days", snowpack: "Measured snow depth and snow water near the resorts" }[tab];
  const head = `<div class="toolbar"><div><h2>All ${forecastRegion === "ne" ? "New England" : "Utah"} mountains</h2><p class="sub">${sub}</p></div><div class="detail-actions">${forecastRegion === "ne" ? "" : '<a class="xlink" href="https://utahavalanchecenter.org/" target="_blank" rel="noopener">Avalanche forecast ↗</a>'}</div></div><div id="alert-banner"></div>`;
  if (tab === "forecast") {
    content.innerHTML = head + `<article class="card afd-card snowfc-card">${forecastHead("forecast")}<div id="snow-forecast"><div class="state">Loading 10-day snow forecasts…</div></div></article>`;
    loadSnowForecast(forecastRegion);
  } else if (tab === "map") {
    content.innerHTML =
      head +
      `<article class="card afd-card snowfc-card">${forecastHead("map")}<div id="powder-map" class="powder-map"><div class="state">Loading 15-day snow totals…</div></div><div id="powder-list" class="powder-list"></div><p class="source">Total new snow at each summit over the next 15 days: the NWS forecast for its first week, then the median of the GEFS and ECMWF ensembles. Days 11–15 are rough guidance. Tap a mountain for its Snow tab, which uses these same numbers.</p></article>`;
    loadPowderMap(forecastRegion);
  } else {
    content.innerHTML =
      head +
      `<article class="card afd-card"><h3>Measured snowpack · SNOTEL</h3><p class="afd-intro">Automated snow depth and snow-water measurements near the resorts.</p><div id="snowpack">${snowpackHTML(snotel)}</div></article>`;
    loadSnotel().then((d) => {
      const el = document.querySelector("#snowpack");
      if (el) el.innerHTML = snowpackHTML(d);
    });
  }
  content.querySelector(".toolbar")?.insertAdjacentHTML("afterend", snowTabs());
  loadMountainAlerts();
  const h = tab + (tab === "forecast" || tab === "map" ? "/" + forecastRegion + (tab === "forecast" && focusResort ? "/" + focusResort : "") : "");
  if (location.hash.slice(1) !== h) history.replaceState(null, "", "#" + h);
}
function readHash() {
  const parts = location.hash.slice(1).split("/"),
    [t, a] = parts;
  // Retired tabs: one mountain's range and snow level now live on its Snow tab; the rest fold into Snow forecast.
  if (t === "range") {
    const id = a === "at" ? "" : a;
    const place = [...utah, ...ne].find((x) => slug(x.name) === id);
    const sec = place && ne.includes(place) ? "ne" : "utah";
    location.replace(`${siteBase()}#${sec}/${place ? id : sec === "ne" ? "killington" : "alta"}/snow`);
    return;
  }
  tab = t === "map" ? "map" : TABS[t] ? t : "forecast";
  if ((t === "forecast" || t === "map") && (a === "utah" || a === "ne")) forecastRegion = a;
  focusResort = t === "forecast" ? parts[2] || "" : "";
}
window.addEventListener("hashchange", () => {
  readHash();
  render();
});
WW.init({ base: "../", active: "snowreport" });
function stamp() {
  const el = document.querySelector("#today");
  if (el)
    el.textContent = `${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Denver" })} · updated ${ago(lastLoad)}`;
}
setInterval(() => {
  if (document.visibilityState === "visible" && Date.now() - lastLoad > 15 * 60000) {
    cache.clear();
    mountainCache.clear();
    alertCache.clear();
    hourlyCache.clear();
    snowModelCache.clear();
    SnowCore.clear();
    lastLoad = Date.now();
    loadSnotel();
    render();
  }
  stamp();
}, 60000);
// Ask AI context: current tab plus the other snow data already loaded
window.suiteContext = function () {
  const parts = [content.innerText.trim()];
  if (tab !== "snowpack" && snotel?.stations)
    parts.push(
      "SNOTEL measured snowpack:\n" +
        snotel.stations
          .map(
            (s) =>
              `${s.name} (${s.near}): depth ${f1(s.latest?.depth)} in, 24h change ${f1(s.change24)} in, 7-day change ${f1(s.change7d)} in, SWE ${f1(s.latest?.swe)} in`,
          )
          .join("\n"),
    );
  return {
    app: "Snow Report",
    view: TABS[tab],
    text: parts.join("\n\n"),
    note: "Resort snow totals are NWS gridded forecasts; the model tab is independent global model guidance (GFS, ECMWF, AIFS, GEM); SNOTEL values are measured. Times are Mountain.",
  };
};
readHash();
render();
loadSnotel();
stamp();
