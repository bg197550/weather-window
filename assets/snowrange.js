/* Snow Report · Forecast range and Snow level cards (OpenSnow-style), built from free Open-Meteo data in the browser.
   Classic script loaded before snow.js; uses getJSON and escapeHTML from common.js.
   Locations: every Utah and New England place on the dashboard (from common.js), plus extra mountains below.
   Ski areas get base/summit lines and a mid-mountain forecast elevation from RANGE_MOUNTAINS (feet); every other
   place is forecast at its own ground elevation. To add a mountain, add one line to RANGE_MOUNTAINS. */
const RANGE_MOUNTAINS = {
  // Utah
  "park-city-mountain": { name: "Park City Mountain", after: "park-city", lat: 40.636, lon: -111.535, base: 6800, summit: 10026, point: 8400 },
  "deer-valley": { lat: 40.62, lon: -111.485, base: 6530, summit: 9570, point: 8100 },
  "canyons-resort": { lat: 40.687, lon: -111.572, base: 6800, summit: 9990, point: 8000 },
  alta: { lat: 40.59, lon: -111.64, base: 8530, summit: 10550, point: 9895 },
  snowbird: { lat: 40.579, lon: -111.657, base: 7760, summit: 11000, point: 9200 },
  solitude: { lat: 40.622, lon: -111.592, base: 7988, summit: 10488, point: 8900 },
  brighton: { lat: 40.6, lon: -111.582, base: 8755, summit: 10500, point: 9500 },
  snowbasin: { lat: 41.206, lon: -111.858, base: 6391, summit: 9350, point: 7800 },
  // New England
  "stratton-mountain": { lat: 43.0959, lon: -72.9214, base: 1872, summit: 3875, point: 2900 },
  killington: { lat: 43.6045, lon: -72.8201, base: 1165, summit: 4241, point: 2700 },
  stowe: { lat: 44.5437, lon: -72.8143, base: 1559, summit: 3625, point: 2600 },
  gunstock: { lat: 43.5256, lon: -71.3784, base: 900, summit: 2267, point: 1600 },
};
const RANGE_REGIONS = { utah: { name: "Utah", tz: "America/Denver", home: "alta" }, ne: { name: "New England", tz: "America/New_York", home: "killington" } };
function rangeLocations() {
  const out = [];
  const lists = { utah: typeof utah !== "undefined" ? utah : [], ne: typeof ne !== "undefined" ? ne : [] };
  for (const [region, list] of Object.entries(lists))
    for (const x of list) {
      if (x.searched || !x.p?.length) continue;
      const id = slug(x.name),
        m = RANGE_MOUNTAINS[id];
      out.push(m ? { slug: id, name: x.name, region, ...m } : { slug: id, name: x.name, region, lat: x.p[0][0], lon: x.p[0][1], town: true });
      for (const [eid, e] of Object.entries(RANGE_MOUNTAINS)) if (e.after === id) out.push({ slug: eid, region, ...e });
    }
  return out;
}
const M2FT = 3.28084;
const SNOW_LEVEL_OFFSET = 1100; // snow level ≈ freezing level minus ~1,100 ft
const MIX_HALF = 250; // the mix zone is ~500 ft deep, centered on the snow level
/* Deterministic models: each gets its own line style and a direct label, so color is never the only cue. */
const RANGE_DET = [
  { id: "ecmwf_ifs025", label: "ECMWF", color: "#e69f00", dash: "9 4" },
  { id: "gfs_seamless", label: "GFS", color: "#f0e442", dash: "" },
  { id: "icon_seamless", label: "ICON", color: "#cc79a7", dash: "2 3" },
  { id: "gem_seamless", label: "GEM", color: "#ff8a5c", dash: "12 3 2 3" },
  { id: "ncep_hrrr_conus", label: "HRRR", color: "#3cc79a", dash: "1 3" },
  { id: "ncep_nbm_conus", label: "NBM", color: "#c5d3dc", dash: "6 2 1 2 1 2" },
];
const ENS_NAMES = { ncep_gefs025: "GEFS", ecmwf_ifs025_ensemble: "ECMWF ENS", gfs05: "GEFS" };

/* ---------- searched places (any town or ski area) ----------
   A searched place lives in the link itself: #range/at/<lat>,<lon>/<name>[/<base>-<summit>], so it can be shared. */
const RANGE_RECENT_KEY = "ww:range-recent";
const rr4 = (x) => Math.round(x * 10000) / 10000;
function customKey(x) {
  return `at/${rr4(x.lat)},${rr4(x.lon)}/${encodeURIComponent(x.name)}${x.ski ? `/${x.ski.base}-${x.ski.summit}` : ""}`;
}
function parseCustom(key) {
  const m = String(key || "").match(/^at\/(-?[\d.]+),(-?[\d.]+)\/([^/]+)(?:\/(\d+)-(\d+))?$/);
  if (!m) return null;
  let name;
  try {
    name = decodeURIComponent(m[3]);
  } catch {
    name = m[3];
  }
  const lat = +m[1],
    lon = +m[2];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (m[4]) {
    const base = +m[4],
      summit = +m[5];
    if (summit > base) return { slug: key, name, region: "custom", lat, lon, base, summit, point: Math.round((base + summit) / 200) * 100, ski: true };
  }
  return { slug: key, name, region: "custom", lat, lon, town: true };
}
function readRecent() {
  try {
    const l = JSON.parse(localStorage.getItem(RANGE_RECENT_KEY) || "[]");
    return Array.isArray(l) ? l.filter((x) => typeof x === "string" && parseCustom(x)).slice(0, 8) : [];
  } catch {
    return [];
  }
}
function addRecent(key) {
  try {
    localStorage.setItem(RANGE_RECENT_KEY, JSON.stringify([key, ...readRecent().filter((k) => k !== key)].slice(0, 8)));
  } catch {}
}
function removeRecent(key) {
  try {
    localStorage.setItem(RANGE_RECENT_KEY, JSON.stringify(readRecent().filter((k) => k !== key)));
  } catch {}
}
/* The location key from the link's parts after "range". */
function rangeKeyFromHash(parts) {
  if (parts[0] === "at") {
    const c = parseCustom(parts.join("/"));
    return c ? c.slug : "";
  }
  return rangeLocations().some((x) => x.slug === parts[0]) ? parts[0] : "";
}
function findRange(key) {
  return rangeLocations().find((x) => x.slug === key) || parseCustom(key);
}

let rangeResort = "",
  rangeDays = 10,
  levelDays = 10,
  rangeState = null;
const rangeCache = new Map();

/* Snow-to-liquid ratio from the temperature at the forecast point: ~7:1 just above freezing, 8:1 at 32°F,
   rising to 16–17:1 in the teens and colder. */
const SLR_POINTS = [
  [10, 17],
  [15, 16],
  [20, 14],
  [24, 12],
  [28, 10],
  [32, 8],
  [34, 7],
];
function snowRatio(tF) {
  if (tF == null || !Number.isFinite(tF)) return null;
  if (tF <= SLR_POINTS[0][0]) return SLR_POINTS[0][1];
  for (let i = 1; i < SLR_POINTS.length; i++) {
    const [t1, r1] = SLR_POINTS[i - 1],
      [t2, r2] = SLR_POINTS[i];
    if (tF <= t2) return r1 + ((tF - t1) / (t2 - t1)) * (r2 - r1);
  }
  return 7;
}
/* Share of the precipitation falling as snow: all of it at 34°F or colder, none at 38°F or warmer. */
const snowFraction = (tF) => (tF == null ? 0 : tF <= 34 ? 1 : tF >= 38 ? 0 : (38 - tF) / 4);
const hourSnow = (liq, tF) => (liq > 0 && tF != null ? liq * snowRatio(tF) * snowFraction(tF) : 0);

/* Freezing level (ft) from the 700 mb temperature (°F) and height (ft), with a standard 6.5 °C/km lapse rate. */
function freezingFt(t700F, z700ft) {
  if (!Number.isFinite(t700F) || !Number.isFinite(z700ft)) return null;
  return z700ft + ((t700F - 32) / 1.8 / 0.0065) * M2FT;
}
/* Open-Meteo reports heights in feet when Fahrenheit is requested and in meters otherwise; read the unit it sent. */
function heightToFt(resp, word) {
  // Models with no data for a variable report its unit as "undefined", so only a real unit counts.
  const u = Object.entries(resp?.hourly_units || {}).find(([k, v]) => k.includes(word) && (v === "ft" || v === "m"))?.[1];
  return u === "ft" ? 1 : M2FT;
}

function quant(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p,
    a = Math.floor(i),
    b = Math.ceil(i);
  return sorted[a] + (sorted[b] - sorted[a]) * (i - a);
}
/* Open-Meteo returns local times ("2026-11-15T18:00") when asked for a timezone; format them as given. */
const tLocal = (s, o) => new Date(s + ":00Z").toLocaleString("en-US", { ...o, timeZone: "UTC" });
function localHourKey(ms, tz = "America/Denver") {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}
const inch = (v) => (v == null ? "–" : `${v < 10 ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v)}″`);
const feet = (v) => (v == null ? "–" : `${(Math.round(v / 100) * 100).toLocaleString()} ft`);
function omURL(base, params) {
  const u = new URL(base);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

/* Split Open-Meteo's flat hourly object into series: "precipitation_member07_ncep_gefs025" → {model, member, values}. */
function seriesOf(hourly, v) {
  const re = new RegExp(`^${v}(?:_member(\\d+))?(?:_(.+))?$`);
  const out = new Map();
  for (const [k, vals] of Object.entries(hourly || {})) {
    const m = k.match(re);
    if (!m || /^probability/.test(m[2] || "")) continue;
    out.set(`${m[2] || ""}#${m[1] || "00"}`, { model: m[2] || "", member: m[1] || "00", values: vals });
  }
  return out;
}

async function rangeData(r) {
  const hit = rangeCache.get(r.slug);
  if (hit && Date.now() - hit.time < 20 * 60000) return hit.promise;
  const common = {
    latitude: r.lat,
    longitude: r.lon,
    // Towns use the ground elevation Open-Meteo looks up for the point.
    ...(r.point ? { elevation: Math.round(r.point / M2FT) } : {}),
    timezone: RANGE_REGIONS[r.region]?.tz || "auto",
    forecast_days: 15,
    precipitation_unit: "inch",
    temperature_unit: "fahrenheit",
  };
  const ENS = "https://ensemble-api.open-meteo.com/v1/ensemble";
  const promise = Promise.all([
    getJSON(omURL(ENS, { ...common, hourly: "precipitation,temperature_2m,cloud_cover,temperature_700hPa,geopotential_height_700hPa", models: "gfs025,ecmwf_ifs025" })),
    // GEFS at 0.25° has no upper-air data, so its snow levels come from the 0.5° GEFS (31 runs).
    getJSON(omURL(ENS, { ...common, hourly: "temperature_700hPa,geopotential_height_700hPa", models: "gfs05" })).catch(() => null),
    getJSON(
      omURL("https://api.open-meteo.com/v1/forecast", {
        ...common,
        hourly: "precipitation,temperature_2m,freezing_level_height,temperature_700hPa,geopotential_height_700hPa",
        models: RANGE_DET.map((m) => m.id).join(","),
      }),
    ).catch(() => null),
  ]).then(([ens, g05, det]) => buildRange(r, ens, g05, det));
  rangeCache.set(r.slug, { time: Date.now(), promise });
  promise.catch(() => rangeCache.delete(r.slug));
  return promise;
}

/* Everything both cards need, indexed from the current hour (k = 0) forward. */
function buildRange(r, ens, g05, det, nowMs = Date.now()) {
  const times = ens?.hourly?.time;
  if (!times?.length) throw Error("No ensemble data");
  const tz = RANGE_REGIONS[r.region]?.tz || ens.timezone || "UTC";
  const key = localHourKey(nowMs, tz);
  const point = r.point ?? (Number.isFinite(ens.elevation) ? Math.round((ens.elevation * M2FT) / 10) * 10 : 0);
  let i0 = times.findIndex((t) => t >= key);
  if (i0 < 0) i0 = 0;
  const n = times.length - i0;
  const tail = (a) => (a ? a.slice(i0) : []);
  const cumulative = (liq, temp) => {
    const cum = new Array(n).fill(null);
    let tot = 0;
    cum[0] = 0;
    for (let k = 1; k < n; k++) {
      if (!Number.isFinite(liq[k])) break;
      tot += hourSnow(liq[k], temp[k]);
      cum[k] = tot;
    }
    return cum;
  };
  const levelFrom = (t7, z7, fl, zMul, fMul) =>
    Array.from({ length: n }, (_, k) => {
      const f = Number.isFinite(fl?.[k]) ? fl[k] * fMul : Number.isFinite(z7?.[k]) ? freezingFt(t7?.[k], z7[k] * zMul) : null;
      return f == null ? null : f - SNOW_LEVEL_OFFSET;
    });

  const P = seriesOf(ens.hourly, "precipitation"),
    T2 = seriesOf(ens.hourly, "temperature_2m"),
    CC = seriesOf(ens.hourly, "cloud_cover"),
    T7 = seriesOf(ens.hourly, "temperature_700hPa"),
    Z7 = seriesOf(ens.hourly, "geopotential_height_700hPa");
  const members = [];
  for (const [id, p] of P) {
    const liq = tail(p.values),
      temp = tail(T2.get(id)?.values);
    const t7 = T7.get(id)?.values,
      z7 = Z7.get(id)?.values;
    const lv = t7?.some(Number.isFinite) ? levelFrom(tail(t7), tail(z7), null, heightToFt(ens, "geopotential")) : null;
    members.push({ id, fam: ENS_NAMES[p.model] || p.model, liq, temp, cloud: tail(CC.get(id)?.values), cum: cumulative(liq, temp), level: lv });
    const m = members[members.length - 1];
    m.last = m.cum.findLastIndex((v) => v != null);
  }
  // Extra snow-level runs from the 0.5° GEFS (keyed by its own member numbers).
  const levels = members.filter((m) => m.level).map((m) => ({ fam: m.fam, level: m.level }));
  if (g05?.hourly?.time) {
    const off = g05.hourly.time.indexOf(times[i0]);
    if (off >= 0) {
      const t7 = seriesOf(g05.hourly, "temperature_700hPa"),
        z7 = seriesOf(g05.hourly, "geopotential_height_700hPa");
      for (const [id, s] of t7) {
        const zz = z7.get(id)?.values;
        if (!s.values.some(Number.isFinite)) continue;
        levels.push({ fam: "GEFS", level: levelFrom(s.values.slice(off), zz?.slice(off), null, heightToFt(g05, "geopotential")) });
      }
    }
  }
  const dets = [];
  if (det?.hourly?.time) {
    const off = det.hourly.time.indexOf(times[i0]);
    if (off >= 0)
      for (const m of RANGE_DET) {
        const g = (v) => det.hourly[`${v}_${m.id}`]?.slice(off) || [];
        const liq = g("precipitation"),
          temp = g("temperature_2m");
        if (!liq.some(Number.isFinite)) continue;
        const lv = levelFrom(g("temperature_700hPa"), g("geopotential_height_700hPa"), g("freezing_level_height"), heightToFt(det, "geopotential"), heightToFt(det, "freezing_level"));
        const d = { ...m, liq, temp, cum: cumulative(liq, temp), level: lv.some((v) => v != null) ? lv : null };
        dets.push(d);
        if (d.level) levels.push({ fam: m.label, level: d.level, det: true });
      }
  }
  return { r, point, times: times.slice(i0), n, members, dets, levels };
}

/* ---------- layout helpers ---------- */
function chartBox(el, tall) {
  const width = Math.max(300, Math.round(el.clientWidth || 700));
  const phone = width < 560;
  return { width, phone, L: phone ? 38 : 50, T: 14, h: tall ? (phone ? 270 : 330) : phone ? 92 : 104 };
}
function niceStep(span, target) {
  const raw = span / target,
    p = 10 ** Math.floor(Math.log10(raw)),
    f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function dayTicks(times, n, x, y, minGap) {
  let out = "",
    last = -1e9;
  for (let k = 0; k <= n; k++) {
    if (!times[k]?.endsWith("T00:00")) continue;
    const px = x(k);
    out += `<line x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="14" y2="${y}" stroke="#294858" stroke-width="1"/>`;
    if (px - last < minGap) continue;
    last = px;
    out += `<text x="${(px + 3).toFixed(1)}" y="${y + 16}" fill="#9fb1bc" font-size="12">${tLocal(times[k], { weekday: "short", day: "numeric" })}</text>`;
  }
  return out;
}
/* Spread labels vertically so none overlap. */
function spreadLabels(items, top, bottom, gap) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + gap);
  const over = items.length ? items[items.length - 1].y - bottom : 0;
  if (over > 0) items.forEach((it) => (it.y -= over));
  for (let i = items.length - 2; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - gap);
  items.forEach((it) => (it.y = Math.max(top, it.y)));
  return items;
}
const pline = (pts, attrs) => (pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" ${attrs}/>` : "");
function daySeg(which, sel) {
  return `<div class="seg rng-days" role="group" aria-label="Forecast window">${[5, 10, 15]
    .map((d) => `<button type="button" data-${which}-days="${d}" class="${d === sel ? "active" : ""}" aria-pressed="${d === sel}">${d} days</button>`)
    .join("")}</div>`;
}

/* ---------- Card 1: forecast range (spaghetti of running snow totals) ---------- */
function drawRange() {
  const body = document.querySelector("#rng-range .rng-body");
  if (!body || !rangeState) return;
  const { r, times, members, dets } = rangeState;
  const n = Math.min(rangeDays * 24, rangeState.n - 1);
  const box = chartBox(body, true),
    { width, phone, L, T, h } = box;
  const R = phone ? 94 : 132,
    B = 30,
    pw = width - L - R,
    ph = h - T - B;
  const step = n > 200 ? 3 : n > 100 ? 2 : 1;
  const ks = [];
  for (let k = 0; k <= n; k += step) ks.push(k);
  if (ks[ks.length - 1] !== n) ks.push(n);
  // Runs are counted from the current hour, so each ensemble ends a few hours short of a full 10 or 15 days.
  // A run that reaches within a day of the window's end keeps its last total; shorter runs drop out.
  const value = (m, k) => (m.cum[k] != null ? m.cum[k] : m.last >= n - 24 && k <= n ? m.cum[m.last] : null);
  const at = (k) => members.map((m) => value(m, k)).filter((v) => v != null).sort((a, b) => a - b);
  const stats = ks.map((k) => {
    const v = at(k);
    return { k, c: v.length, p10: quant(v, 0.1), p50: quant(v, 0.5), p90: quant(v, 0.9), max: v[v.length - 1] };
  });
  const detMax = dets.map((d) => Math.max(0, ...d.cum.slice(0, n + 1).filter(Number.isFinite)));
  const top = Math.max(4, ...stats.map((s) => s.max ?? 0), ...detMax) * 1.08;
  const x = (k) => L + (k / n) * pw,
    y = (v) => T + ph - (v / top) * ph;
  const xy = (k, v) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`;
  const yStep = niceStep(top, phone ? 4 : 6);
  let grid = "";
  for (let v = 0; v <= top; v += yStep)
    grid += `<line x1="${L}" x2="${L + pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#294858"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" fill="#9fb1bc" font-size="12">${v}″</text>`;
  const runs = members
    .map((m) => pline(ks.filter((k) => m.cum[k] != null).map((k) => xy(k, m.cum[k])), 'stroke="#8fb3c4" stroke-opacity="0.32" stroke-width="1"'))
    .join("");
  const ok = stats.filter((s) => s.c >= 10);
  const band = ok.length > 1 ? `<polygon points="${[...ok.map((s) => xy(s.k, s.p90)), ...ok.map((s) => xy(s.k, s.p10)).reverse()].join(" ")}" fill="#79d7e5" fill-opacity="0.2" stroke="#79d7e5" stroke-opacity="0.7" stroke-dasharray="3 3"/>` : "";
  const median = pline(ok.map((s) => xy(s.k, s.p50)), 'stroke="#0b2130" stroke-width="7" stroke-linejoin="round"') + pline(ok.map((s) => xy(s.k, s.p50)), 'stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"');
  const labels = [];
  const detLines = dets
    .map((d) => {
      const pts = ks.filter((k) => d.cum[k] != null);
      if (pts.length < 2) return "";
      const lk = pts[pts.length - 1];
      const ends = lk < n && !phone ? ` · to ${tLocal(times[lk], { weekday: "short" })}` : "";
      labels.push({ y: y(d.cum[lk]), text: `${d.label} ${inch(d.cum[lk])}${ends}`, color: d.color, dash: d.dash, w: 2.2 });
      return pline(pts.map((k) => xy(k, d.cum[k])), `stroke="${d.color}" stroke-width="2.2" stroke-dasharray="${d.dash}" stroke-linejoin="round"`);
    })
    .join("");
  const last = ok[ok.length - 1];
  if (last) labels.push({ y: y(last.p50), text: `${phone ? "Med" : "Median"} ${inch(last.p50)}`, color: "#ffffff", dash: "", w: 3.5, bold: true });
  const lab = spreadLabels(labels, T + 6, T + ph, phone ? 14 : 15)
    .map(
      (l) =>
        `<line x1="${L + pw + 6}" x2="${L + pw + 22}" y1="${l.y.toFixed(1)}" y2="${l.y.toFixed(1)}" stroke="${l.color}" stroke-width="${l.w}" stroke-dasharray="${l.dash}"/><text x="${L + pw + 26}" y="${(l.y + 4).toFixed(1)}" fill="#e6f3f8" font-size="${phone ? 11 : 12}"${l.bold ? ' font-weight="700"' : ""}>${escapeHTML(l.text)}</text>`,
    )
    .join("");
  const svg = `<svg class="rng-svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Running snow total at ${escapeHTML(r.name)} over the next ${rangeDays} days: ${members.length} ensemble runs with median ${inch(last?.p50)}, 10th to 90th percentile ${inch(last?.p10)} to ${inch(last?.p90)}.">${grid}${dayTicks(times, n, x, T + ph, phone ? 44 : 52)}${runs}${band}${detLines}${median}${lab}<line class="rng-rule" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#ffffff" stroke-width="1" visibility="hidden"/><rect class="rng-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;

  const total = at(n),
    fams = {};
  members.forEach((m) => (fams[m.fam] = (fams[m.fam] || 0) + 1));
  const shortBy = {};
  members.filter((m) => m.last < n - 24).forEach((m) => (shortBy[m.fam] = (shortBy[m.fam] || 0) + 1));
  const short = Object.entries(shortBy).map(([f, c]) => `${c} ${f} runs end before day ${rangeDays}`).join(", ");
  const chip = `<div class="rng-chips"><span class="rng-chip"><b>${rangeDays}-day storm total</b> Min ${inch(total[0])} · Median ${inch(quant(total, 0.5))} · Max ${inch(total[total.length - 1])}</span><span class="rng-chip rng-chip-soft">${total.length} ensemble runs${short ? ` · ${short}` : ""}</span></div>`;
  body.innerHTML = `${chip}<div class="rng-wrap">${svg}<div class="rng-tip" hidden></div></div><p class="ins-legend rng-legend"><span class="ins-key rng-key-runs"></span>Each thin line is one run (${Object.entries(fams)
    .map(([f, c]) => `${c} ${f}`)
    .join(", ")}) <span class="ins-key ins-key-line rng-key-med"></span>Median <span class="ins-key ins-key-band"></span>10th–90th percentile · Labeled lines: single models, each with its own dash pattern</p>`;
  hover(body, n, (k) => {
    const v = at(k),
      temps = members.map((m) => m.temp[k]).filter(Number.isFinite).sort((a, b) => a - b),
      tMed = quant(temps, 0.5),
      ratio = snowRatio(tMed),
      frac = snowFraction(tMed);
    const ratioLine = tMed == null ? "" : frac === 0 ? `Too warm for snow (${Math.round(tMed)}°F)` : `Snow ratio ~${Math.round(ratio)}:1 at ${Math.round(tMed)}°F${frac < 1 ? " (part rain)" : ""}`;
    const dl = dets.filter((d) => d.cum[k] != null).map((d) => `${d.label} ${inch(d.cum[k])}`);
    return `<b>${tLocal(times[k], { weekday: "short", month: "short", day: "numeric", hour: "numeric" })}</b><br>Median ${inch(quant(v, 0.5))} · 10–90%: ${inch(quant(v, 0.1))}–${inch(quant(v, 0.9))}${dl.length ? `<br>${escapeHTML(dl.join(" · "))}` : ""}${ratioLine ? `<br>${ratioLine}` : ""}`;
  }, { L, pw, step: 1 });
}

/* ---------- Card 2: snow level with a 6-hour precipitation strip ---------- */
const PART = (h) => (h < 6 ? "Overnight" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Night");
function precipType(level, point) {
  if (level == null) return null;
  return level <= point - MIX_HALF ? "snow" : level >= point + MIX_HALF ? "rain" : "mix";
}
function levelBlocks(state, n) {
  const { times, members, levels, point } = state;
  const blocks = [];
  let cur = null;
  for (let k = 1; k <= n; k++) {
    const hh = +times[k].slice(11, 13),
      // Hourly precipitation is the total for the hour ending at that time, so 06:00 belongs to the 00–06 block.
      startHour = Math.floor(((hh + 23) % 24) / 6) * 6,
      dateOf = hh === 0 ? times[k - 1].slice(0, 10) : times[k].slice(0, 10),
      id = dateOf + startHour;
    if (!cur || cur.id !== id) {
      cur = { id, a: k - 1, b: k, date: dateOf, part: PART(startHour) };
      blocks.push(cur);
    } else cur.b = k;
  }
  return blocks.map((bl) => {
    const lv = [];
    for (const s of levels) for (let k = bl.a; k <= bl.b; k++) if (Number.isFinite(s.level[k])) lv.push(s.level[k]);
    lv.sort((a, b) => a - b);
    const sums = members
      .map((m) => {
        let t = 0,
          any = false;
        for (let k = bl.a + 1; k <= bl.b; k++)
          if (Number.isFinite(m.liq[k])) {
            t += m.liq[k];
            any = true;
          }
        return any ? t : null;
      })
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    const clouds = members.flatMap((m) => m.cloud.slice(bl.a + 1, bl.b + 1)).filter(Number.isFinite);
    const med = quant(lv, 0.5);
    return {
      ...bl,
      min: lv[0] ?? null,
      max: lv[lv.length - 1] ?? null,
      med,
      chance: sums.length ? sums.filter((v) => v >= 0.02).length / sums.length : null,
      liq: quant(sums, 0.5),
      cloud: clouds.length ? clouds.reduce((a, b) => a + b, 0) / clouds.length : null,
      type: precipType(med, point),
    };
  });
}
function drawLevel() {
  const body = document.querySelector("#rng-level .rng-body");
  if (!body || !rangeState) return;
  const { r, times, levels, point } = rangeState;
  const n = Math.min(levelDays * 24, rangeState.n - 1);
  const box = chartBox(body, true),
    { width, phone, L, T, h } = box;
  const R = phone ? 94 : 132,
    B = 30,
    pw = width - L - R,
    ph = h - T - B;
  const step = n > 200 ? 3 : n > 100 ? 2 : 1;
  const ks = [];
  for (let k = 0; k <= n; k += step) ks.push(k);
  if (ks[ks.length - 1] !== n) ks.push(n);
  const stats = ks.map((k) => {
    const v = levels.map((s) => s.level[k]).filter(Number.isFinite).sort((a, b) => a - b);
    return { k, c: v.length, min: v[0], med: quant(v, 0.5), max: v[v.length - 1] };
  });
  const ok = stats.filter((s) => s.c >= 3);
  if (ok.length < 2) {
    body.innerHTML = '<div class="error">Snow-level data is unavailable for this window.</div>';
    return;
  }
  let lo = Math.min((r.base ?? point) - 1500, ...ok.map((s) => s.min)),
    hi = Math.max((r.summit ?? point) + 1500, ...ok.map((s) => s.max));
  lo = Math.max(r.town && point < 1500 ? -500 : 0, Math.floor(lo / 1000) * 1000);
  hi = Math.min(16000, Math.ceil(hi / 1000) * 1000);
  const x = (k) => L + (k / n) * pw,
    y = (v) => T + ph - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * ph;
  const xy = (k, v) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`;
  const yStep = niceStep(hi - lo, phone ? 4 : 6);
  let grid = "";
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep)
    grid += `<line x1="${L}" x2="${L + pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#294858"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" fill="#9fb1bc" font-size="12">${phone ? `${v / 1000}k` : v.toLocaleString()}</text>`;
  // Zones follow the median snow level: snow above the mix band, rain below it. Each has its own pattern and a text label.
  const upper = ok.map((s) => xy(s.k, s.med + MIX_HALF)),
    lower = ok.map((s) => xy(s.k, s.med - MIX_HALF));
  const x0 = x(ok[0].k).toFixed(1),
    x1 = x(ok[ok.length - 1].k).toFixed(1);
  const zones = `<polygon points="${x0},${T} ${x1},${T} ${[...upper].reverse().join(" ")}" fill="url(#rng-pat-snow)"/><polygon points="${[...upper, ...[...lower].reverse()].join(" ")}" fill="url(#rng-pat-mix)"/><polygon points="${lower.join(" ")} ${x1},${T + ph} ${x0},${T + ph}" fill="url(#rng-pat-rain)"/>`;
  const firstMed = ok[0].med;
  const halo = 'paint-order="stroke" stroke="#0b2130" stroke-width="4" stroke-linejoin="round"';
  const zoneText =
    (y(firstMed + MIX_HALF) - T > 22 ? `<text x="${L + 8}" y="${T + 16}" fill="#e6f3f8" font-size="12" font-weight="700" ${halo}>SNOW ↑</text>` : "") +
    `<text x="${L + 8}" y="${(y(firstMed) + 4).toFixed(1)}" fill="#e6f3f8" font-size="11" font-weight="700" ${halo}>MIX</text>` +
    (T + ph - y(firstMed - MIX_HALF) > 22 ? `<text x="${L + 8}" y="${T + ph - 8}" fill="#e6f3f8" font-size="12" font-weight="700" ${halo}>RAIN ↓</text>` : "");
  const runs = levels
    .map((s) => pline(ks.filter((k) => Number.isFinite(s.level[k])).map((k) => xy(k, s.level[k])), `stroke="#8fb3c4" stroke-opacity="${s.det ? 0.6 : 0.28}" stroke-width="1"`))
    .join("");
  const band = `<polygon points="${[...ok.map((s) => xy(s.k, s.max)), ...ok.map((s) => xy(s.k, s.min)).reverse()].join(" ")}" fill="#79d7e5" fill-opacity="0.16" stroke="#79d7e5" stroke-opacity="0.7" stroke-dasharray="3 3"/>`;
  const median = pline(ok.map((s) => xy(s.k, s.med)), 'stroke="#0b2130" stroke-width="7" stroke-linejoin="round"') + pline(ok.map((s) => xy(s.k, s.med)), 'stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"');
  const kft = (v) => (phone ? `${(v / 1000).toFixed(1)}k` : `${v.toLocaleString()}′`);
  const refs = r.town
    ? [{ v: point, text: `${phone ? "Elev" : "Elevation"} ${kft(point)}`, dash: "", w: 2 }]
    : [
        { v: r.summit, text: `Summit ${kft(r.summit)}`, dash: "", w: 2 },
        { v: point, text: `${phone ? "Point" : "Forecast pt"} ${kft(point)}`, dash: "5 4", w: 1.2 },
        { v: r.base, text: `Base ${kft(r.base)}`, dash: "", w: 2 },
      ];
  const refLines = refs.map((q) => `<line x1="${L}" x2="${L + pw}" y1="${y(q.v).toFixed(1)}" y2="${y(q.v).toFixed(1)}" stroke="#ffd27a" stroke-width="${q.w}" stroke-dasharray="${q.dash}"/>`).join("");
  const lastMed = ok[ok.length - 1].med;
  const refLabels = spreadLabels(
    [...refs.map((q) => ({ y: y(q.v), text: q.text, color: "#ffd27a", dash: q.dash, w: q.w })), { y: y(lastMed), text: phone ? `Med ${kft(Math.round(lastMed / 100) * 100)}` : `Median ${feet(lastMed)}`, color: "#ffffff", dash: "", w: 3.5, bold: true }],
    T + 6,
    T + ph,
    14,
  )
    .map((l) => `<line x1="${L + pw + 4}" x2="${L + pw + 16}" y1="${l.y.toFixed(1)}" y2="${l.y.toFixed(1)}" stroke="${l.color}" stroke-width="${l.w}" stroke-dasharray="${l.dash}"/><text x="${L + pw + 20}" y="${(l.y + 4).toFixed(1)}" fill="#e6f3f8" font-size="${phone ? 11 : 12}"${l.bold ? ' font-weight="700"' : ""}>${escapeHTML(l.text)}</text>`)
    .join("");
  const defs = `<defs><pattern id="rng-pat-snow" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#cfe9f5" fill-opacity="0.07"/></pattern><pattern id="rng-pat-mix" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#cfe9f5" fill-opacity="0.05"/><line x1="0" y1="0" x2="0" y2="7" stroke="#e6f3f8" stroke-opacity="0.45" stroke-width="2"/></pattern><pattern id="rng-pat-rain" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.1" fill="#e6f3f8" fill-opacity="0.35"/></pattern><pattern id="rng-bar-mix" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#7f9aab"/><line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" stroke-width="2.2"/></pattern><pattern id="rng-bar-rain" width="4" height="6" patternUnits="userSpaceOnUse"><rect width="4" height="6" fill="#244a5e"/><line x1="2" y1="0" x2="2" y2="6" stroke="#9fd0ea" stroke-width="1.6"/></pattern></defs>`;
  const svg = `<svg class="rng-svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Snow level at ${escapeHTML(r.name)} over the next ${levelDays} days, median ${feet(ok[0].med)} now and ${feet(lastMed)} at the end.">${defs}${zones}${grid}${dayTicks(times, n, x, T + ph, phone ? 44 : 52)}${runs}${band}${refLines}${median}${zoneText}${refLabels}<line class="rng-rule" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#ffffff" stroke-width="1" visibility="hidden"/><rect class="rng-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;

  // 6-hour strip: bar height = chance of precipitation, fill = precip type at the forecast point; cloud cover behind.
  const blocks = levelBlocks(rangeState, n);
  const sh = phone ? 96 : 110,
    sT = 8,
    sB = 20,
    sph = sh - sT - sB;
  const sy = (f) => sT + sph - f * sph;
  const cloudPts = blocks.filter((b) => b.cloud != null).map((b) => `${((x(b.a) + x(b.b)) / 2).toFixed(1)},${sy(b.cloud / 100).toFixed(1)}`);
  const cloud = cloudPts.length > 1 ? `<polygon points="${x(blocks[0].a).toFixed(1)},${sy(0)} ${cloudPts.join(" ")} ${x(blocks[blocks.length - 1].b).toFixed(1)},${sy(0)}" fill="#c5d3dc" fill-opacity="0.16"/>` : "";
  const FILL = { snow: "#eaf7fd", mix: "url(#rng-bar-mix)", rain: "url(#rng-bar-rain)" };
  const LETTER = { snow: "S", mix: "M", rain: "R" };
  const bars = blocks
    .map((b) => {
      if (!b.chance || !b.type) return "";
      const bx = x(b.a) + 1,
        bw = Math.max(1.5, x(b.b) - x(b.a) - 2),
        by = sy(b.chance);
      const letter = bw >= 13 && b.chance >= 0.2 ? `<text x="${(bx + bw / 2).toFixed(1)}" y="${(by - 3).toFixed(1)}" text-anchor="middle" fill="#e6f3f8" font-size="10" font-weight="700">${LETTER[b.type]}</text>` : "";
      return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${(sy(0) - by).toFixed(1)}" fill="${FILL[b.type]}" stroke="#0b2130" stroke-width="0.5"/>${letter}`;
    })
    .join("");
  const strip = `<svg class="rng-svg rng-strip" width="${width}" height="${sh}" viewBox="0 0 ${width} ${sh}" role="img" aria-label="Chance of precipitation in 6-hour blocks, labeled by type: snow, mix or rain.">${defs.replace(/id="rng-/g, 'id="rng2-').replace(/url\(#rng-/g, "url(#rng2-")}${[0, 0.5, 1]
    .map((f) => `<line x1="${L}" x2="${L + pw}" y1="${sy(f).toFixed(1)}" y2="${sy(f).toFixed(1)}" stroke="#294858"/><text x="${L - 6}" y="${(sy(f) + 4).toFixed(1)}" text-anchor="end" fill="#9fb1bc" font-size="11">${f * 100}%</text>`)
    .join("")}${cloud}${bars.replace(/url\(#rng-/g, "url(#rng2-")}<text x="${L + pw + 6}" y="${sT + 12}" fill="#9fb1bc" font-size="11">Precip</text><text x="${L + pw + 6}" y="${sT + 26}" fill="#9fb1bc" font-size="11">chance</text><line class="rng-rule" x1="0" x2="0" y1="${sT}" y2="${sy(0)}" stroke="#ffffff" stroke-width="1" visibility="hidden"/><rect class="rng-hit" x="${L}" y="${sT}" width="${pw}" height="${sph}" fill="transparent"/></svg>`;
  const swatch = (fill) => `<svg class="rng-swatch" width="18" height="12" aria-hidden="true"><rect width="18" height="12" fill="${fill.replace("url(#rng-", "url(#rng2-")}" stroke="#9fb1bc" stroke-width="0.6"/></svg>`;
  body.innerHTML = `<div class="rng-chips"><span class="rng-chip"><b>Snow level now</b> ${feet(ok[0].med)} <small>(range ${feet(ok[0].min)}–${feet(ok[0].max)})</small></span><span class="rng-chip rng-chip-soft">${levels.length} model runs</span></div><div class="rng-wrap">${svg}${strip}<div class="rng-tip" hidden></div></div><p class="ins-legend rng-legend"><span class="ins-key rng-key-runs"></span>Model runs <span class="ins-key ins-key-line rng-key-med"></span>Median <span class="ins-key ins-key-band"></span>Lowest–highest <span class="ins-key rng-key-ref"></span>${r.town ? "Ground elevation" : "Summit, forecast point, base"} · Zones: snow above, mix (hatched, ~500 ft), rain below (dotted)</p><p class="ins-legend rng-legend">Bars: ${swatch(FILL.snow)} S = snow ${swatch("url(#rng-bar-mix)")} M = mix ${swatch("url(#rng-bar-rain)")} R = rain at ${r.town ? "ground level" : "the forecast point"} · bar height = chance of precipitation · light shading behind = cloud cover</p>`;
  hover(
    body,
    n,
    (k) => {
      const b = blocks.find((q) => k > q.a && k <= q.b) || blocks.find((q) => k >= q.a && k <= q.b);
      if (!b) return "";
      const head = `${tLocal(b.date + "T12:00", { weekday: "short", month: "short", day: "numeric" })} – ${b.part}`;
      const type = b.type ? { snow: "Snow", mix: "Rain/snow mix", rain: "Rain" }[b.type] : "";
      const precip =
        b.chance == null
          ? ""
          : `<br>Precip chance ${Math.round(b.chance * 100)}%${b.liq >= 0.01 ? ` · median ${b.liq.toFixed(2)}″ liquid` : ""}${b.chance >= 0.1 && type ? ` · ${type} at ${point.toLocaleString()} ft` : ""}${b.cloud != null ? ` · Clouds ${Math.round(b.cloud)}%` : ""}`;
      return `<b>${escapeHTML(head)}</b> · Max ${feet(b.max)} · Median ${feet(b.med)} · Min ${feet(b.min)}${precip}`;
    },
    { L, pw, snap: (k) => {
      const b = blocks.find((q) => k > q.a && k <= q.b);
      return b ? (b.a + b.b) / 2 : k;
    } },
  );
}

/* Shared pointer/touch tooltip: a vertical rule in every chart of the card and one text box. */
function hover(body, n, text, { L, pw, snap }) {
  const wrap = body.querySelector(".rng-wrap"),
    tip = wrap?.querySelector(".rng-tip");
  if (!wrap || !tip) return;
  const hide = () => {
    tip.hidden = true;
    wrap.querySelectorAll(".rng-rule").forEach((l) => l.setAttribute("visibility", "hidden"));
  };
  const show = (e) => {
    const svg = e.target.closest("svg");
    const rect = svg.getBoundingClientRect(),
      scale = rect.width / svg.viewBox.baseVal.width;
    const px = (e.clientX - rect.left) / scale;
    let k = Math.round(((px - L) / pw) * n);
    k = Math.max(0, Math.min(n, k));
    const html = text(k);
    if (!html) return hide();
    const pos = snap ? snap(k) : k;
    const lx = (L + (pos / n) * pw).toFixed(1);
    wrap.querySelectorAll(".rng-rule").forEach((l) => {
      l.setAttribute("x1", lx);
      l.setAttribute("x2", lx);
      l.setAttribute("visibility", "visible");
    });
    tip.innerHTML = html;
    tip.hidden = false;
    const wr = wrap.getBoundingClientRect(),
      cx = e.clientX - wr.left,
      cy = e.clientY - wr.top,
      tw = tip.offsetWidth;
    tip.style.left = `${Math.max(4, Math.min(wr.width - tw - 4, cx > wr.width / 2 ? cx - tw - 12 : cx + 12))}px`;
    tip.style.top = `${Math.max(4, cy - tip.offsetHeight - 10)}px`;
  };
  wrap.querySelectorAll(".rng-hit").forEach((h) => {
    h.addEventListener("pointermove", show);
    h.addEventListener("pointerdown", show);
    h.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && hide());
  });
}

async function loadRangeView() {
  const root = document.querySelector("#range-root");
  if (!root) return;
  rangeState = null;
  const all = rangeLocations();
  let r = findRange(rangeResort);
  if (r?.region === "custom") addRecent(r.slug);
  if (!r) {
    // No location in the link: use the place picked elsewhere on the dashboard, else the region's main mountain.
    const c = WW.place();
    r = all.find((x) => x.slug === c.slug) || all.find((x) => x.slug === RANGE_REGIONS[c.section]?.home) || all[0];
    rangeResort = r.slug;
    history.replaceState(null, "", "#range/" + r.slug);
  }
  const recent = readRecent();
  const tabs = { ...RANGE_REGIONS, ...(recent.length ? { custom: { name: "Your searches", home: recent[0] } } : {}) };
  const regionSeg = `<nav class="seg snowfc-region rng-region" aria-label="Region">${Object.entries(tabs)
    .map(([k, v]) => {
      const to = k === r.region ? r.slug : k === "custom" ? v.home : all.find((x) => x.slug === v.home)?.slug || all.find((x) => x.region === k)?.slug;
      return `<a href="#range/${to}" class="${k === r.region ? "active" : ""}"${k === r.region ? ' aria-current="true"' : ""}>${v.name}</a>`;
    })
    .join("")}</nav>`;
  const row = r.region === "custom" ? recent.map(parseCustom) : all.filter((x) => x.region === r.region);
  const pills = `<div class="day-pills rng-resorts" aria-label="Location">${row
    .map((x) => {
      const on = x.slug === r.slug;
      const rm = r.region === "custom" ? `<button type="button" class="rng-x" data-forget="${escapeHTML(x.slug)}" aria-label="Remove ${escapeHTML(x.name)}">✕</button>` : "";
      return `<span class="rng-pill"><a href="#range/${x.slug}" class="${on ? "active" : ""}"${on ? ' aria-current="page"' : ""}>${escapeHTML(x.name)}</a>${rm}</span>`;
    })
    .join("")}</div>`;
  const search = `<form class="place-search-form rng-search" role="search"><label class="sr-only" for="rng-q">Search any town or ski area</label><input id="rng-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Search any town or ski area" /><button type="submit">Search</button></form><div class="place-search-results rng-results" aria-live="polite"></div>`;
  const elevs = r.town
    ? `Forecast at ground level${r.point ? ` (${r.point.toLocaleString()} ft)` : ""}`
    : `Base ${r.base.toLocaleString()} ft · Summit ${r.summit.toLocaleString()} ft · forecast for ${r.point.toLocaleString()} ft`;
  root.innerHTML = `${search}<div class="rng-top">${regionSeg}</div>${pills}<article class="card afd-card rng-card" id="rng-range"><div class="rng-head"><div><h3>Forecast range · ${escapeHTML(r.name)}</h3><p class="sub">${elevs}</p></div>${daySeg("range", rangeDays)}</div><div class="rng-body"><div class="state">Loading ensemble runs…</div></div><p class="source">Running total of new snow ${r.town ? "at ground level" : `at ${r.point.toLocaleString()} ft`} from every GEFS and ECMWF ensemble run, plus the single (deterministic) models. Snow is worked out from each run's liquid precipitation times a snow ratio from its temperature at that elevation (about 8:1 near 32°F, 16–17:1 in the teens), not the model's built-in snowfall, which assumes about 7:1 and reads low in the mountains. Hover or tap the chart for the ratio. Data: Open-Meteo.</p></article><article class="card afd-card rng-card" id="rng-level"><div class="rng-head"><div><h3>Snow level · ${escapeHTML(r.name)}</h3><p class="sub">Elevation where rain turns to snow</p></div>${daySeg("level", levelDays)}</div><div class="rng-body"><div class="state">Loading snow levels…</div></div><p class="source">Snow level ≈ freezing level minus 1,100 ft. Freezing levels come from each model where it reports one (GFS, ICON, HRRR); otherwise from its 700 mb temperature and height (ECMWF, GEM, ECMWF ENS, and the 0.5° GEFS ensemble). Hours a model leaves blank are skipped. Data: Open-Meteo${r.region === "custom" && !r.town ? "; ski area base and summit: OpenSkiMap (OpenStreetMap), forecast at the midpoint" : ""}.</p></article>`;
  wireRangeSearch(root);
  root.querySelectorAll("[data-forget]").forEach(
    (b) =>
      (b.onclick = () => {
        removeRecent(b.dataset.forget);
        const left = readRecent();
        if (b.dataset.forget === rangeResort) location.hash = "#range/" + (left[0] || RANGE_REGIONS[WW.region()]?.home || "alta");
        else loadRangeView();
      }),
  );
  root.querySelectorAll("[data-range-days]").forEach(
    (b) =>
      (b.onclick = () => {
        rangeDays = +b.dataset.rangeDays;
        root.querySelectorAll("[data-range-days]").forEach((q) => {
          q.classList.toggle("active", q === b);
          q.setAttribute("aria-pressed", String(q === b));
        });
        drawRange();
      }),
  );
  root.querySelectorAll("[data-level-days]").forEach(
    (b) =>
      (b.onclick = () => {
        levelDays = +b.dataset.levelDays;
        root.querySelectorAll("[data-level-days]").forEach((q) => {
          q.classList.toggle("active", q === b);
          q.setAttribute("aria-pressed", String(q === b));
        });
        drawLevel();
      }),
  );
  let state;
  try {
    state = await rangeData(r);
  } catch (e) {
    root.querySelectorAll(".rng-body").forEach((el) => (el.innerHTML = `<div class="error">Ensemble forecasts are temporarily unavailable${String(e?.message) === "429" ? " (the free data service is busy; try again in a minute)" : ""}.</div>`));
    return;
  }
  if (!root.isConnected || rangeResort !== r.slug) return;
  rangeState = state;
  if (r.town) root.querySelectorAll(".rng-head .sub").forEach((el, i) => i === 0 && (el.textContent = `Forecast at ground level · ${state.point.toLocaleString()} ft`));
  drawRange();
  drawLevel();
}
/* Search box: the dashboard's own places first, then ski areas anywhere (OpenSkiMap), then towns and ZIP codes. */
function wireRangeSearch(root) {
  const form = root.querySelector(".rng-search"),
    input = root.querySelector("#rng-q"),
    out = root.querySelector(".rng-results");
  if (!form) return;
  let seq = 0,
    timer = 0,
    shown = [];
  const go = (x) => {
    if (x.slug) location.hash = "#range/" + x.slug;
    else {
      const key = customKey(x);
      addRecent(key);
      location.hash = "#range/" + key;
    }
  };
  const draw = (list, note) => {
    shown = list;
    out.innerHTML = `${list.length ? `<ul>${list.map((x, i) => `<li><button type="button" data-hit="${i}"><b>${escapeHTML(x.name)}</b><small>${escapeHTML(x.detail || "")}</small></button></li>`).join("")}</ul>` : ""}${note || ""}`;
    out.querySelectorAll("[data-hit]").forEach((b) => (b.onclick = () => go(shown[+b.dataset.hit])));
  };
  const local = (q) => {
    const n = q.trim().toLowerCase();
    return rangeLocations()
      .filter((x) => x.name.toLowerCase().includes(n))
      .slice(0, 4)
      .map((x) => ({ ...x, detail: x.town ? `${RANGE_REGIONS[x.region].name} · dashboard place` : `${RANGE_REGIONS[x.region].name} · ski area on the dashboard` }));
  };
  const run = async (submit) => {
    const q = input.value.trim(),
      id = ++seq;
    if (q.length < 2) return draw([], "");
    const mine = local(q);
    draw(mine, '<div class="state">Searching ski areas and towns…</div>');
    const [ski, towns] = await Promise.all([/^\d/.test(q) ? [] : searchSki(q, { max: 6 }).catch(() => []), geocode(q, { world: true }).catch(() => [])]);
    if (id !== seq) return;
    // Leave out ski areas the dashboard already lists (within ~5 km of one of its mountains).
    const near = (a, b) => Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.06;
    const list = [...mine, ...ski.filter((sk) => !rangeLocations().some((m) => !m.town && near(m, sk))), ...towns.slice(0, 5)];
    if (submit && list.length === 1) return go(list[0]);
    draw(list, list.length ? "" : `<div class="state">No match for “${escapeHTML(q)}”. Try a ski area, a town (“Bend, OR”) or a US ZIP.</div>`);
  };
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(false), 350);
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    clearTimeout(timer);
    run(true);
  };
  input.onkeydown = (e) => {
    if (e.key === "Escape") {
      input.value = "";
      draw([], "");
    }
  };
}

let rangeResize = 0;
addEventListener("resize", () => {
  clearTimeout(rangeResize);
  rangeResize = setTimeout(() => {
    if (rangeState && document.querySelector("#range-root")) {
      drawRange();
      drawLevel();
    }
  }, 150);
});
