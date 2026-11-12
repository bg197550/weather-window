/* Insights: storm totals with model ranges, likely outcomes, and the synoptic pattern
   (troughs, ridges, surface highs and lows, fronts) for one forecast point.
   Sources: NWS gridded forecast (official totals), Open-Meteo deterministic models (GFS, ECMWF, GEM, ICON)
   and ensembles (GEFS, ECMWF ENS, GEM ENS), and the NWS Area Forecast Discussion. Classic script: globals. */

(() => {
const INS_MODELS = [
  ["GFS", "gfs_seamless"],
  ["ECMWF", "ecmwf_ifs025"],
  ["GEM", "gem_seamless"],
  ["ICON", "icon_seamless"],
];
const INS_ENS = ["ncep_gefs025", "ecmwf_ifs025_ensemble", "gem_global_ensemble"];
const INS_ENS_NAMES = { ncep_gefs025: "GEFS", ecmwf_ifs025_ensemble: "ECMWF ENS", gem_global_ensemble: "GEM ENS" };
const insCache = new Map();
/* What kind of place Insights is describing: "utah" (Wasatch), "ne" (New England) or "other" (a searched place). */
let insKind = "utah",
  insHigh = true,
  insEvents = [],
  insTrend = null,
  insTemps = null;
const H = 3600000;

function insFetch(p) {
  const key = `${p[0]},${p[1]}`;
  const hit = insCache.get(key);
  if (hit && Date.now() - hit.time < 10 * 60000) return hit.promise;
  const det = new URL("https://api.open-meteo.com/v1/forecast");
  Object.entries({
    latitude: p[0],
    longitude: p[1],
    hourly:
      "precipitation,snowfall,temperature_2m,pressure_msl,wind_direction_10m,wind_speed_10m,wind_direction_700hPa,wind_speed_700hPa,temperature_700hPa,temperature_850hPa,geopotential_height_500hPa",
    models: INS_MODELS.map((m) => m[1]).join(","),
    forecast_hours: 240,
    past_hours: 6,
    timezone: "UTC",
    precipitation_unit: "inch",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
  }).forEach(([k, v]) => det.searchParams.set(k, v));
  const ens = new URL("https://ensemble-api.open-meteo.com/v1/ensemble");
  Object.entries({
    latitude: p[0],
    longitude: p[1],
    hourly: "precipitation,snowfall",
    models: INS_ENS.join(","),
    forecast_hours: 240,
    past_hours: 6,
    timezone: "UTC",
    precipitation_unit: "inch",
  }).forEach(([k, v]) => ens.searchParams.set(k, v));
  // Yesterday's runs for the same hours, to say whether totals are trending up or down.
  const prev = new URL("https://previous-runs-api.open-meteo.com/v1/forecast");
  Object.entries({
    latitude: p[0],
    longitude: p[1],
    hourly: "precipitation_previous_day1",
    models: INS_MODELS.map((m) => m[1]).join(","),
    forecast_days: 10,
    past_days: 1,
    timezone: "UTC",
    precipitation_unit: "inch",
  }).forEach(([k, v]) => prev.searchParams.set(k, v));
  // Steering winds and moisture, for where a storm comes from and what kind it is.
  const air = new URL("https://api.open-meteo.com/v1/forecast");
  Object.entries({
    latitude: p[0],
    longitude: p[1],
    hourly: "wind_direction_500hPa,wind_speed_500hPa,total_column_integrated_water_vapour",
    models: "gfs_seamless,ecmwf_ifs025",
    forecast_hours: 240,
    past_hours: 6,
    timezone: "UTC",
    wind_speed_unit: "mph",
  }).forEach(([k, v]) => air.searchParams.set(k, v));
  const promise = Promise.allSettled([
    getJSON(det.toString()),
    getJSON(ens.toString()),
    mountainPoint(p),
    insAFD(p),
    getJSON(prev.toString()),
    getJSON(air.toString()),
  ]).then(([d, e, n, a, pr, ai]) => ({
    air: ai.status === "fulfilled" ? ai.value : null,
    det: d.status === "fulfilled" ? d.value : null,
    ens: e.status === "fulfilled" ? e.value : null,
    nws: n.status === "fulfilled" ? n.value : null,
    afd: a.status === "fulfilled" ? a.value : null,
    prev: pr.status === "fulfilled" ? pr.value : null,
  }));
  insCache.set(key, { time: Date.now(), promise });
  return promise;
}

async function insAFD(p) {
  const point = await pointMeta(p);
  const code = point.cwa || point.gridId;
  if (!/^[A-Z]{3}$/.test(code)) throw Error("No office");
  let entry = afdCache.get(code);
  if (!entry || Date.now() - entry.time > 600000) {
    entry = {
      time: Date.now(),
      promise: (async () => {
        const list = await getJSON(`https://api.weather.gov/products/types/AFD/locations/${code}`);
        const latest = [...(list["@graph"] || [])].sort((a, b) => Date.parse(b.issuanceTime) - Date.parse(a.issuanceTime))[0];
        if (!latest?.["@id"]?.startsWith("https://api.weather.gov/products/")) throw Error("No discussion");
        return getJSON(latest["@id"]);
      })(),
    };
    afdCache.set(code, entry);
  }
  return { code, afd: await entry.promise };
}

/* ---------- series helpers ---------- */
const insT = (s) => Date.parse(s + "Z");
const mean = (a) => {
  const v = a.filter(Number.isFinite);
  return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
};
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function series(det, v) {
  return INS_MODELS.map(([name, id]) => ({ name, values: det.hourly[`${v}_${id}`] || [] })).filter((s) =>
    s.values.some(Number.isFinite),
  );
}
function meanSeries(det, v) {
  const ss = series(det, v);
  return det.hourly.time.map((_, i) => mean(ss.map((s) => s.values[i])));
}
function circMean(dirs) {
  const v = dirs.filter(Number.isFinite);
  if (!v.length) return null;
  const x = mean(v.map((d) => Math.cos((d * Math.PI) / 180))),
    y = mean(v.map((d) => Math.sin((d * Math.PI) / 180)));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (d) => (d == null ? "–" : COMPASS[Math.round(d / 22.5) % 16]);
const fToC = (f) => ((f - 32) * 5) / 9;

function insWhen(ms, section, withDay = true) {
  const d = new Date(ms);
  const zone = regionZone(section);
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: zone });
  const hr = d.toLocaleTimeString("en-US", { hour: "numeric", timeZone: zone }).replace(" ", "").toLowerCase();
  return withDay ? `${day} ${hr}` : hr;
}
function partOfDay(ms, section) {
  const zone = regionZone(section);
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: zone });
  const h = +d.toLocaleTimeString("en-US", { hour: "numeric", hour12: false, timeZone: zone }) % 24;
  const part = h < 5 ? "early" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  const key = (x) => new Date(x).toLocaleDateString("en-CA", { timeZone: zone });
  const days = Math.round((Date.parse(key(ms)) - Date.parse(key(Date.now()))) / 86400000);
  if (days === 0) return part === "night" ? "tonight" : part === "early" ? "early today" : `this ${part}`;
  const label = days >= 7 ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: zone }) : day;
  return part === "early" ? `early ${label}` : `${label} ${part}`;
}

/* ---------- storms ---------- */
function findStorms(det) {
  const t = det.hourly.time.map(insT),
    pr = meanSeries(det, "precipitation"),
    now = Date.now();
  const wet = pr.map((v) => (v || 0) >= 0.004);
  const storms = [];
  let cur = null,
    dry = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] < now - 6 * H) continue;
    if (wet[i]) {
      if (!cur) cur = { a: i, b: i };
      cur.b = i;
      dry = 0;
    } else if (cur && ++dry > 12) {
      storms.push(cur);
      cur = null;
      dry = 0;
    }
  }
  if (cur) storms.push(cur);
  // Split back-to-back storms at a lull: 6+ hours of light or no precipitation (under 0.01″/h) with at
  // least 0.10″ of liquid on each side. Without this, a trickle between two systems merges them into one.
  const sum = (x, y) => pr.slice(x, y).reduce((p, q) => p + (q || 0), 0);
  const split = [];
  for (const s of storms) {
    let from = s.a,
      i = s.a;
    while (i <= s.b) {
      if ((pr[i] || 0) >= 0.01) {
        i++;
        continue;
      }
      let j = i;
      while (j <= s.b && (pr[j] || 0) < 0.01) j++;
      if (j - i >= 6 && i > from && sum(from, i) >= 0.1 && sum(j, s.b + 1) >= 0.1) {
        split.push({ a: from, b: i - 1 });
        from = j;
      }
      i = j;
    }
    split.push({ a: from, b: s.b });
  }
  return split
    .map((s) => ({ ...s, start: t[s.a], end: t[s.b] + H, total: pr.slice(s.a, s.b + 1).reduce((x, y) => x + (y || 0), 0) }))
    .filter((s) => s.total >= 0.05 && s.end > now)
    .slice(0, 4);
}
function sumWindow(times, values, a, b) {
  let tot = 0,
    any = false;
  for (let i = 0; i < times.length; i++)
    if (times[i] >= a && times[i] < b && Number.isFinite(values[i])) {
      tot += values[i];
      any = true;
    }
  return any ? tot : null;
}
function nwsWindow(grid, prop, a, b) {
  const vals = grid?.[prop]?.values;
  if (!vals?.length) return null;
  let tot = 0,
    covered = 0,
    lastEnd = 0;
  for (const q of vals) {
    const [stamp, dur] = q.validTime.split("/");
    const from = Date.parse(stamp),
      m = dur.match(/P(?:(\d+)D)?T?(?:(\d+)H)?/),
      to = from + ((+(m?.[1] || 0)) * 24 + +(m?.[2] || 0)) * H;
    lastEnd = Math.max(lastEnd, to);
    const o = Math.max(0, Math.min(to, b) - Math.max(from, a));
    if (o && Number.isFinite(q.value)) {
      tot += (q.value * o) / (to - from);
      covered += o;
    }
  }
  return { inches: tot / 25.4, through: Math.min(lastEnd, b), full: lastEnd >= b - H };
}
function nwsSnowLevel(grid, a, b) {
  const vals = grid?.snowLevel?.values;
  if (!vals) return null;
  const v = vals
    .filter((q) => {
      const from = Date.parse(q.validTime.split("/")[0]);
      return from < b && from >= a - 6 * H && Number.isFinite(q.value);
    })
    .map((q) => q.value * 3.28084);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

const SNOW_BINS = [
  [0, 1, "under 1″"],
  [1, 3, "1–3″"],
  [3, 6, "3–6″"],
  [6, 12, "6–12″"],
  [12, 18, "12–18″"],
  [18, 24, "18–24″"],
  [24, Infinity, "24″+"],
];
const RAIN_BINS = [
  [0, 0.1, "under 0.10″"],
  [0.1, 0.25, "0.10–0.25″"],
  [0.25, 0.5, "0.25–0.50″"],
  [0.5, 1, "0.50–1.00″"],
  [1, 2, "1–2″"],
  [2, Infinity, "2″+"],
];

/* Snow level (ft) at a time: NWS grid where it covers, else estimated from the model 700 mb temperature
   (700 mb is about 10,000 ft; freezing level ≈ 10,000 ft + 500 ft per °C, snow level ≈ 1,000 ft below that). */
function snowLevelAt(grid, ms, t700F) {
  for (const q of grid?.snowLevel?.values || []) {
    const [stamp, dur] = q.validTime.split("/");
    const from = Date.parse(stamp),
      m = dur.match(/P(?:(\d+)D)?T?(?:(\d+)H)?/),
      to = from + ((+(m?.[1] || 0)) * 24 + +(m?.[2] || 0)) * H;
    if (ms >= from && ms < to && Number.isFinite(q.value)) return q.value * 3.28084;
  }
  return Number.isFinite(t700F) ? 9000 + fToC(t700F) * 500 : null;
}
function slrFor(t700F) {
  if (!Number.isFinite(t700F)) return 10;
  const c = fToC(t700F);
  return c > -4 ? 9 : c > -9 ? 12 : c > -16 ? 16 : 13;
}

/* Inches of snow per inch of liquid at this point for a given hour: full ratio when the snow level is
   300 ft or more below the point, half when within 300 ft, none above. */
function snowFactor(data, elevFt) {
  const det = data.det,
    t = det.hourly.time.map(insT),
    t700h = meanSeries(det, "temperature_700hPa"),
    tIndex = new Map(t.map((x, i) => [x, i]));
  return (ms) => {
    const i = tIndex.get(ms);
    const tf = i == null ? null : t700h[i];
    const lvl = snowLevelAt(data.nws?.grid, ms, tf);
    if (lvl == null || elevFt == null) return 0;
    return lvl <= elevFt - 300 ? slrFor(tf) : lvl <= elevFt + 300 ? slrFor(tf) / 2 : 0;
  };
}

function analyzeStorm(s, data, section, elevFt) {
  const det = data.det,
    t = det.hourly.time.map(insT),
    now = Date.now();
  const current = s.start <= now;
  const a = current ? now : s.start - 6 * H,
    b = s.end + 6 * H;
  // Hourly snow fraction and ratio for this point (Utah: derived from liquid; New England: model snowfall).
  const derive = insKind === "utah" && elevFt != null;
  const factor = snowFactor(data, elevFt);
  const snowSum = (times, liq, raw) => {
    if (!derive) return sumWindow(times, raw, a, b);
    let tot = 0;
    for (let i = 0; i < times.length; i++)
      if (times[i] >= a && times[i] < b && Number.isFinite(liq[i])) tot += liq[i] * factor(times[i]);
    return tot;
  };
  const models = INS_MODELS.map(([name, id]) => {
    const pr = det.hourly[`precipitation_${id}`] || [],
      sn = det.hourly[`snowfall_${id}`] || [];
    let onset = null,
      end = null;
    for (let i = 0; i < t.length; i++)
      if (t[i] >= a && t[i] < b && (pr[i] || 0) >= 0.01) {
        if (onset == null) onset = t[i];
        end = t[i] + H;
      }
    return {
      end, name, liquid: sumWindow(t, pr, a, b), snow: snowSum(t, pr, sn), onset };
  }).filter((m) => m.liquid != null);

  const members = [];
  if (data.ens?.hourly) {
    const et = data.ens.hourly.time.map(insT);
    for (const k of Object.keys(data.ens.hourly)) {
      const m = k.match(/^precipitation_(?:member\d+_)?(.+)$/);
      if (!m || !INS_ENS.includes(m[1])) continue;
      const liquid = sumWindow(et, data.ens.hourly[k], a, b);
      const snow = snowSum(et, data.ens.hourly[k], data.ens.hourly[k.replace("precipitation_", "snowfall_")] || []);
      if (liquid != null) members.push({ model: m[1], liquid, snow: snow ?? 0 });
    }
  }
  const liq = members.map((m) => m.liquid).sort((x, y) => x - y),
    snw = members.map((m) => m.snow).sort((x, y) => x - y);
  const medSnow = quantile(snw, 0.5) ?? mean(models.map((m) => m.snow)) ?? 0;
  const medLiq = quantile(liq, 0.5) ?? mean(models.map((m) => m.liquid)) ?? 0;
  const snowy = medSnow >= 1 || medSnow / Math.max(medLiq, 0.01) >= 5;
  const vals = snowy ? snw : liq,
    bins = snowy ? SNOW_BINS : RAIN_BINS;
  const dist = bins
    .map(([lo, hi, label]) => ({ label, lo, hi, pct: vals.length ? (100 * vals.filter((v) => v >= lo && v < hi).length) / vals.length : 0 }))
    .filter((x, i, arr) => x.pct >= 1 || (i > 0 && i < arr.length - 1 && arr.slice(0, i).some((y) => y.pct) && arr.slice(i + 1).some((y) => y.pct)));

  const nws = data.nws?.grid
    ? {
        liquid: nwsWindow(data.nws.grid, "quantitativePrecipitation", current ? now : s.start, s.end + 3 * H),
        snow: nwsWindow(data.nws.grid, "snowfallAmount", current ? now : s.start, s.end + 3 * H),
        level: nwsSnowLevel(data.nws.grid, s.start, s.end),
      }
    : null;

  // Upper-air character during the storm: 700 mb flow and temperature drive snow quality and orographic lift.
  const idx = t.map((x, i) => (x >= s.start && x < s.end ? i : -1)).filter((i) => i >= 0);
  const pick = (v) => idx.map((i) => mean(series(det, v).map((q) => q.values[i])));
  const dir700 = circMean(idx.map((i) => circMean(series(det, "wind_direction_700hPa").map((q) => q.values[i])))),
    spd700 = mean(pick("wind_speed_700hPa")),
    t700 = pick("temperature_700hPa").filter(Number.isFinite),
    t850 = pick("temperature_850hPa").filter(Number.isFinite),
    dir10 = circMean(idx.map((i) => circMean(series(det, "wind_direction_10m").map((q) => q.values[i])))),
    gust = Math.max(...pick("wind_speed_10m").filter(Number.isFinite), 0);

  const spread = vals.length ? quantile(vals, 0.9) - quantile(vals, 0.1) : null,
    mid = quantile(vals, 0.5);
  const conf =
    spread == null ? null : spread / Math.max(mid, snowy ? 2 : 0.15) < 0.9 ? "High" : spread / Math.max(mid, snowy ? 2 : 0.15) < 1.7 ? "Moderate" : "Low";
  const onsets = current ? [] : models.map((m) => m.onset).filter(Number.isFinite);
  return {
    ...s,
    current,
    derive,
    snowy,
    models,
    members,
    p10: quantile(vals, 0.1),
    p50: mid,
    p90: quantile(vals, 0.9),
    liqRange: [quantile(liq, 0.1), quantile(liq, 0.5), quantile(liq, 0.9)],
    snowRange: [quantile(snw, 0.1), quantile(snw, 0.5), quantile(snw, 0.9)],
    dist,
    conf,
    nws,
    dir700,
    spd700,
    t700min: t700.length ? Math.min(...t700) : null,
    t700mean: mean(t700),
    t850mean: mean(t850),
    dir10,
    gust,
    onsetSpread: onsets.length > 1 ? (Math.max(...onsets) - Math.min(...onsets)) / H : 0,
    elevFt,
    section,
  };
}

function likelyText(x) {
  const top = [...x.dist].sort((a, b) => b.pct - a.pct);
  if (!top.length) return null;
  const first = top[0],
    second = top[1];
  if (first.pct < 35)
    return `no clear favorite. Ensemble runs spread from ${fmtAmt(x.p10, x.snowy)} to ${fmtAmt(x.p90, x.snowy)} with a median of ${fmtAmt(x.p50, x.snowy)}, so track or timing is still uncertain`;
  if (second && second.pct >= 0.6 * first.pct && second.pct >= 20 && Math.abs(x.dist.indexOf(first) - x.dist.indexOf(second)) > 1)
    return `two camps: ${first.label} (${Math.round(first.pct)}%) or ${second.label} (${Math.round(second.pct)}% of ensemble runs)`;
  if (second && second.pct >= 0.6 * first.pct && second.pct >= 20)
    return `${first.label} or ${second.label} (${Math.round(first.pct)}% / ${Math.round(second.pct)}% of ensemble members)`;
  return `${first.label} (${Math.round(first.pct)}% of ensemble members)`;
}
function fmtAmt(v, snowy) {
  if (v == null) return "–";
  return snowy ? (v < 1 ? v.toFixed(1) : Math.round(v)) + "″" : v.toFixed(2) + "″";
}
function snowQuality(t700F) {
  if (t700F == null) return null;
  const c = fToC(t700F);
  if (c > -4) return { label: "Wet, dense snow", ratio: "about 8–10:1", c };
  if (c > -9) return { label: "Average density", ratio: "about 10–13:1", c };
  if (c > -16) return { label: "Light, dry snow", ratio: "about 14–18:1", c };
  return { label: "Very cold, small flakes", ratio: "about 12–15:1", c };
}
function flowNote(x) {
  if (x.dir700 == null) return null;
  const d = x.dir700,
    from = compass(d),
    spd = x.spd700 != null ? `${Math.round(x.spd700)} mph` : "";
  if (insKind === "utah") {
    if (d >= 292 && d <= 345)
      return `700 mb flow from the ${from} at ${spd}: the classic orographic setup for the Wasatch. Northwest flow favors the Cottonwoods most, and Park City side resorts somewhat less.`;
    if (d >= 248 && d < 292)
      return `700 mb flow from the ${from} at ${spd}: westerly flow gives moderate upslope lift on the Wasatch; totals improve if winds turn northwest behind the front.`;
    if (d >= 190 && d < 248)
      return `700 mb flow from the ${from} at ${spd}: southwest flow is usually warmer and spreads snow more evenly, often with a higher snow level until the trough passes.`;
    return `700 mb flow from the ${from} at ${spd}: not a typical upslope direction for the Wasatch, so totals depend on the system's dynamics more than terrain.`;
  }
  const sfc = x.dir10 != null ? compass(x.dir10) : null;
  if (insKind !== "ne") return `700 mb flow from the ${from} at ${spd}; surface wind from the ${sfc || "–"} during the storm.`;
  if (sfc && x.dir10 >= 20 && x.dir10 <= 110)
    return `Surface wind from the ${sfc} during the storm: an onshore, nor'easter-style setup with a low passing to the south and east.`;
  if (sfc && x.dir10 >= 150 && x.dir10 <= 250)
    return `Surface wind from the ${sfc}: the low tracks west of the area, which usually means warmer air and rain over snow near the coast.`;
  return `700 mb flow from the ${from} at ${spd}; surface wind from the ${sfc || "–"}.`;
}
function ptypeNote(x) {
  if (insKind === "utah" || insHigh) return null;
  if (x.t850mean == null) return null;
  const c = fToC(x.t850mean);
  const sfc = x.snowRange[1] ?? 0;
  if (c <= -3 && sfc >= 1) return `850 mb temperatures average ${Math.round(c)}°C: cold enough for snow through the column.`;
  if (c <= 1) return `850 mb temperatures near ${Math.round(c)}°C: right on the rain/snow line, so small track shifts change precipitation type.`;
  return `850 mb temperatures around ${Math.round(c)}°C: too warm aloft for snow; expect rain.`;
}

function stormCard(x, section, idx) {
  const now = Date.now();
  const current = x.current;
  const title = idx === 0 ? (current ? "Current storm · still to come" : "Next storm") : `Storm ${idx + 1}`;
  const timing = `${current ? "Under way, ends" : `${partOfDay(x.start, section)} → `}${current ? " " + partOfDay(x.end, section) : partOfDay(x.end, section)}`;
  const unit = x.snowy ? "Snow" : "Precipitation";
  const range = x.p10 != null ? `${fmtAmt(x.p10, x.snowy)}–${fmtAmt(x.p90, x.snowy)}` : "–";
  const likely = likelyText(x);
  const nwsAmt = x.nws ? (x.snowy ? x.nws.snow : x.nws.liquid) : null;
  const nwsPart =
    nwsAmt
      ? nwsAmt.through < x.end - H && nwsAmt.inches < 0.05
        ? "–"
        : `${fmtAmt(nwsAmt.inches, x.snowy)}${nwsAmt.full ? "" : ` <small>through ${escapeHTML(insWhen(nwsAmt.through, section))} (NWS grid ends)</small>`}`
      : "–";
  const maxPct = Math.max(...x.dist.map((d) => d.pct), 1);
  const bars = x.dist
    .map(
      (d) =>
        `<div class="ins-bar"><span class="ins-bar-label">${escapeHTML(d.label)}</span><span class="ins-bar-track"><i style="width:${((d.pct / maxPct) * 100).toFixed(1)}%"></i></span><b>${Math.round(d.pct)}%</b></div>`,
    )
    .join("");
  const wettest = [...x.models].sort((a, b) => (x.snowy ? b.snow - a.snow : b.liquid - a.liquid));
  const q = x.snowy ? snowQuality(x.t700mean) : null;
  const notes = [];
  if (x.snowy && q)
    notes.push(
      `<b>Snow quality:</b> ${q.label}. 700 mb temperature averages ${Math.round(q.c)}°C during the storm, which suggests snow-to-liquid ratios ${q.ratio}.`,
    );
  if (x.nws?.level && insKind !== "ne")
    notes.push(
      `<b>Snow level (NWS):</b> ${Math.round(x.nws.level.max / 100) * 100 === Math.round(x.nws.level.min / 100) * 100 ? Math.round(x.nws.level.min / 100) * 100 + " ft" : `${(Math.round(x.nws.level.max / 100) * 100).toLocaleString()} ft falling to ${(Math.round(x.nws.level.min / 100) * 100).toLocaleString()} ft`}${x.elevFt ? ` (this point ≈ ${Math.round(x.elevFt).toLocaleString()} ft)` : ""}.`,
    );
  const flow = flowNote(x);
  if (flow) notes.push(`<b>Flow:</b> ${escapeHTML(flow)}`);
  const pt = ptypeNote(x);
  if (pt) notes.push(`<b>Precip type:</b> ${escapeHTML(pt)}`);
  if (x.gust >= 25) notes.push(`<b>Wind:</b> models show sustained surface winds up to about ${Math.round(x.gust)} mph.`);
  if (wettest.length > 1) {
    const hi = wettest[0],
      lo = wettest[wettest.length - 1];
    const v = (m) => fmtAmt(x.snowy ? m.snow : m.liquid, x.snowy);
    notes.push(
      `<b>Models:</b> ${hi.name} is wettest (${v(hi)}), ${lo.name} driest (${v(lo)}). ${x.onsetSpread >= 6 ? `Onset timing differs by about ${Math.round(x.onsetSpread)} hours between models.` : "Models agree on timing within a few hours."}`,
    );
  }
  if (x.snowy && x.derive)
    notes.push(
      `<b>How model snow is figured:</b> each model's liquid at this point × a snow ratio from its 700 mb temperature, counted only when the NWS snow level is below this point. Global models (9–25 km) smooth the Wasatch, so liquid amounts in the mountains often land in the upper half of the range.`,
    );
  const table = `<div class="model-table-wrap"><table class="model-table ins-models"><thead><tr><th>Model</th><th>Liquid</th><th>Snow</th><th>${x.current ? "Ends" : "Starts"}</th></tr></thead><tbody>${x.models
    .map(
      (m) =>
        `<tr><th>${escapeHTML(m.name)}</th><td data-label="Liquid">${fmtAmt(m.liquid, false)}</td><td data-label="Snow">${fmtAmt(m.snow, true)}</td><td data-label="${x.current ? "Ends" : "Starts"}">${x.current ? (m.end ? escapeHTML(insWhen(m.end, section)) : "–") : m.onset ? escapeHTML(insWhen(m.onset, section)) : "–"}</td></tr>`,
    )
    .join("")}${
    x.nws?.liquid
      ? `<tr class="flag"><th>NWS</th><td data-label="Liquid">${fmtAmt(x.nws.liquid.inches, false)}</td><td data-label="Snow">${x.nws.snow ? fmtAmt(x.nws.snow.inches, true) : "–"}</td><td data-label="${x.current ? "Ends" : "Starts"}">official</td></tr>`
      : ""
  }</tbody></table></div>`;
  return `<article class="card afd-card ins-storm"><div class="ins-head"><h3>${title}</h3><span class="ins-conf ins-conf-${(x.conf || "na").toLowerCase()}">${x.conf ? x.conf + " confidence" : "Confidence n/a"}</span></div><p class="ins-timing">${escapeHTML(timing)}</p><div class="ins-stats"><div><span>NWS forecast</span><strong>${nwsPart}</strong><small>${unit.toLowerCase()} · official</small></div><div><span>Model range</span><strong>${range}</strong><small>10th–90th percentile of ${x.members.length} ensemble runs</small></div><div><span>Middle outcome</span><strong>${fmtAmt(x.p50, x.snowy)}</strong><small>ensemble median${x.snowy ? ` · ${fmtAmt(x.liqRange[1], false)} liquid` : ""}</small></div></div>${likely ? `<p class="ins-likely"><b>Most likely:</b> ${escapeHTML(likely)}</p>` : ""}<div class="ins-bars" aria-label="Share of ensemble runs by total">${bars}</div><details class="ins-more"><summary>Technical details</summary><ul class="ins-notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>${table}</details></article>`;
}

/* ---------- pattern ---------- */
function extrema(times, vals, minDepth, win, kind) {
  const out = [];
  for (let i = win; i < vals.length - 2; i++) {
    const v = vals[i];
    if (!Number.isFinite(v)) continue;
    const lo = Math.max(0, i - win),
      hi = Math.min(vals.length - 1, i + win);
    const seg = vals.slice(lo, hi + 1).filter(Number.isFinite);
    if (kind === "min" ? v !== Math.min(...seg) : v !== Math.max(...seg)) continue;
    const left = vals.slice(lo, i + 1).filter(Number.isFinite),
      right = vals.slice(i, hi + 1).filter(Number.isFinite);
    const depth =
      kind === "min"
        ? Math.min(Math.max(...left) - v, Math.max(...right) - v)
        : Math.min(v - Math.min(...left), v - Math.min(...right));
    if (depth >= minDepth && (!out.length || times[i] - out[out.length - 1].t > win * H)) out.push({ t: times[i], v, i });
  }
  return out;
}
function fronts(times, temp, dir, section, now) {
  const scan = (step, lim, gradual) => {
    const out = [];
    for (let i = 0; i + step < temp.length; i++) {
      if (times[i] < now - 6 * H) continue;
      const a = temp[i],
        b = temp[i + step];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const dC = fToC(b) - fToC(a);
      const kind = dC <= -lim ? "cold" : dC >= lim ? "warm" : null;
      if (!kind) continue;
      const mid = times[i + step / 2];
      const last = out[out.length - 1];
      if (last && last.kind === kind && mid - last.t < 30 * H) {
        if (Math.abs(dC) > Math.abs(last.dC)) Object.assign(last, { t: mid, dC, before: dir[i], after: dir[i + step] });
        continue;
      }
      out.push({ kind, t: mid, dC, before: dir[i], after: dir[i + step], gradual, hours: step });
    }
    return out;
  };
  const sharp = scan(12, 4, false);
  const slow = scan(24, 4, true).filter((g) => !sharp.some((s) => s.kind === g.kind && Math.abs(s.t - g.t) < 30 * H));
  return [...sharp, ...slow].sort((a, b) => a.t - b.t);
}

function patternCard(data, section, storms) {
  const det = data.det,
    t = det.hourly.time.map(insT),
    now = Date.now();
  const ftToM = det.hourly_units?.[`geopotential_height_500hPa_${INS_MODELS[0][1]}`] === "ft" || meanSeries(det, "geopotential_height_500hPa").some((v) => v > 8000);
  const z = meanSeries(det, "geopotential_height_500hPa").map((v) => (v != null && ftToM ? v / 3.28084 : v)),
    p = meanSeries(det, "pressure_msl"),
    tUp = meanSeries(det, insHigh ? "temperature_700hPa" : "temperature_850hPa"),
    t2 = meanSeries(det, "temperature_2m");
  const dirUp = det.hourly.time.map((_, i) => circMean(series(det, "wind_direction_700hPa").map((s) => s.values[i])));
  const fut = t.map((x, i) => (x >= now - 3 * H ? i : -1)).filter((i) => i >= 0);
  const ft = fut.map((i) => t[i]),
    fz = fut.map((i) => z[i]),
    fp = fut.map((i) => p[i]);
  const items = [];
  insEvents = [];

  // Upper air: troughs and ridges at 500 mb.
  const troughs = extrema(ft, fz, 50, 30, "min"),
    ridges = extrema(ft, fz, 50, 30, "max");
  const zs = series(det, "geopotential_height_500hPa").map((q) => ({ ...q, values: q.values.map((v) => (v != null && ftToM ? v / 3.28084 : v)) }));
  const upper = [...troughs.map((x) => ({ ...x, kind: "trough" })), ...ridges.map((x) => ({ ...x, kind: "ridge" }))]
    .sort((a, b) => a.t - b.t)
    .slice(0, 4)
    .map((x) => {
      const gi = fut[x.i];
      const times = zs
        .map((s) => {
          let best = null;
          for (let k = Math.max(0, gi - 30); k <= Math.min(t.length - 1, gi + 30); k++)
            if (Number.isFinite(s.values[k]) && (best == null || (x.kind === "trough" ? s.values[k] < s.values[best] : s.values[k] > s.values[best]))) best = k;
          return best == null ? null : { name: s.name, t: t[best] };
        })
        .filter(Boolean);
      const spread = times.length > 1 ? (Math.max(...times.map((q) => q.t)) - Math.min(...times.map((q) => q.t))) / H : 0;
      const fastest = [...times].sort((a, b) => a.t - b.t)[0];
      insEvents.push({ t: x.t, kind: x.kind, spread, fastest: fastest?.name });
      return `${x.kind === "trough" ? "Trough axis" : "Ridge axis"} overhead ${partOfDay(x.t, section)} (500 mb height ${Math.round(x.v / 10)} dam).${
        spread >= 12 ? ` Models differ by ~${Math.round(spread)} h on timing; ${fastest.name} is fastest.` : " Models agree on timing."
      }`;
    });
  if (fz.length > 100) {
    const early = mean(fz.slice(0, 48)),
      late = mean(fz.slice(120, 192));
    const trend = late - early;
    insTrend = trend <= -60 ? "colder" : trend >= 60 ? "warmer" : "steady";
    const head =
      trend <= -60
        ? `Heights fall about ${Math.round(-trend / 10)} dam from the next two days to days 5–8: the pattern trends colder and more active.`
        : trend >= 60
          ? `Heights rise about ${Math.round(trend / 10)} dam from the next two days to days 5–8: ridging, warmer and drier.`
          : "No large change in mean 500 mb heights over the next week: a fairly steady pattern.";
    items.push(["Upper levels", [head, ...upper]]);
  } else if (upper.length) items.push(["Upper levels", upper]);

  // Surface: highs and lows from sea-level pressure.
  const lows = extrema(ft, fp, 4, 18, "min"),
    highs = extrema(ft, fp, 4, 18, "max");
  const sfc = [...lows.map((x) => ({ ...x, k: "low" })), ...highs.map((x) => ({ ...x, k: "high" }))]
    .sort((a, b) => a.t - b.t)
    .slice(0, 5)
    .map((x) =>
      x.k === "low"
        ? `Low pressure / surface trough passes ${partOfDay(x.t, section)} (≈${Math.round(x.v)} mb at the minimum).`
        : `High pressure builds ${partOfDay(x.t, section)} (≈${Math.round(x.v)} mb).`,
    );
  if (insHigh && sfc.length)
    sfc.push("Sea-level pressure over Utah is reduced from high terrain, so use it for timing and trend more than exact values.");
  if (sfc.length) items.push(["Surface highs and lows", sfc]);

  // Fronts from temperature change aloft (no daily cycle at 700/850 mb).
  const fr = fronts(t, tUp, dirUp, section, now)
    .filter((f) => f.t < now + 8 * 24 * H)
    .slice(0, 4)
    .map((f) => {
      insEvents.push({ t: f.t, kind: f.kind === "cold" ? "cold" : "warm", dF: Math.round(Math.abs(f.dC) * 1.8), gradual: f.gradual });
      const lvl = insHigh ? "700 mb" : "850 mb";
      const shift = f.before != null && f.after != null && compass(f.before) !== compass(f.after) ? `, winds aloft shift ${compass(f.before)} → ${compass(f.after)}` : "";
      if (f.gradual)
        return f.kind === "cold"
          ? `Colder air filters in ${partOfDay(f.t, section)}: ${lvl} temperature falls about ${Math.round(-f.dC)}°C over 24 hours, a gradual post-frontal cooldown rather than a sharp front.`
          : `Warming aloft ${partOfDay(f.t, section)}: ${lvl} temperature rises about ${Math.round(f.dC)}°C over 24 hours.`;
      return f.kind === "cold"
        ? `Cold front ${partOfDay(f.t, section)}: ${lvl} temperature drops about ${Math.round(-f.dC)}°C in 12 hours${shift}.`
        : `Warm advection ${partOfDay(f.t, section)}: ${lvl} temperature rises about ${Math.round(f.dC)}°C in 12 hours${shift}.`;
    });
  if (fr.length) items.push(["Fronts", fr]);

  // Best snow pattern windows.
  if (insKind === "utah") {
    const pr = meanSeries(det, "precipitation");
    const good = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] < now) continue;
      const d = dirUp[i],
        c = Number.isFinite(tUp[i]) ? fToC(tUp[i]) : null;
      if (d != null && d >= 280 && d <= 340 && c != null && c <= -8 && (pr[i] || 0) >= 0.01) good.push(t[i]);
    }
    if (good.length) {
      const runs = [];
      for (const x of good) {
        const r = runs[runs.length - 1];
        if (r && x - r[1] <= 3 * H) r[1] = x;
        else runs.push([x, x]);
      }
      const best = runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
      insEvents.push({ t: best[0], kind: "powder", end: best[1] + H });
      items.push([
        "Best snow pattern",
        [
          `Cold northwest flow with precipitation ${partOfDay(best[0], section)} to ${partOfDay(best[1] + H, section)}: the post-frontal setup that typically produces the Wasatch's best and lightest snow.`,
        ],
      ]);
    } else if (storms.some((s) => s.snowy))
      items.push(["Best snow pattern", ["No cold northwest-flow window with precipitation in the next 10 days; snow comes mainly with the frontal band."]]);
  }

  // Temperature trend.
  const days = [];
  const zone = regionZone(section);
  t.forEach((x, i) => {
    if (x < now - 3 * H || !Number.isFinite(t2[i])) return;
    const key = new Date(x).toLocaleDateString("en-CA", { timeZone: zone });
    let d = days.find((q) => q.key === key);
    if (!d) days.push((d = { key, t: x, hi: -999, lo: 999 }));
    d.hi = Math.max(d.hi, t2[i]);
    d.lo = Math.min(d.lo, t2[i]);
  });
  const full = days.slice(1, 9);
  if (full.length >= 4) {
    const coldest = full.reduce((a, b) => (b.hi < a.hi ? b : a)),
      warmest = full.reduce((a, b) => (b.hi > a.hi ? b : a));
    const ambiguous = coldest.key !== warmest.key && new Date(coldest.t).getUTCDay() === new Date(warmest.t).getUTCDay();
    const name = (d) => new Date(d.t).toLocaleDateString("en-US", ambiguous ? { weekday: "short", month: "short", day: "numeric", timeZone: zone } : { weekday: "short", timeZone: zone });
    insTemps = { coldest, warmest, name };
    items.push([
      "Temperatures",
      [
        `Model highs range from ${Math.round(coldest.hi)}° (${name(coldest)}) to ${Math.round(warmest.hi)}° (${name(warmest)}) over the next week; ${warmest.t > coldest.t ? "warming after the cold point" : "cooling into the colder stretch"}.`,
      ],
    ]);
  }
  if (!items.length) return "";
  return `<details class="card afd-card ins-pattern ins-tech"><summary><h3>Pattern details</h3><span class="muted">troughs, ridges, fronts, pressure</span></summary>${items
    .map(([h, list]) => `<section><h4>${escapeHTML(h)}</h4><ul>${list.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul></section>`)
    .join("")}<p class="source">Mean of GFS, ECMWF, GEM and ICON at this point via <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo ↗</a>. Troughs and ridges come from 500 mb heights, fronts from 12-hour temperature change at ${insHigh ? "700" : "850"} mb.</p></details>`;
}

/* Forecaster sentences about confidence and the models, for the plain-English summary. */
function afdNotes(a) {
  if (!a?.afd?.productText) return null;
  const txt = a.afd.productText.replace(/\r/g, "");
  const grab = (name) => {
    const m = txt.match(new RegExp(`\\n\\.${name}[^\\n]*?\\.\\.\\.([\\s\\S]*?)(?=\\n&&|\\n\\s*\\n\\.[A-Z])`, "i"));
    return m ? m[1].trim() : "";
  };
  const flat = (s) => s.replace(/\s+/g, " ").trim();
  const keys = grab("KEY MESSAGES?")
    .split(/\n\s*[-*]\s+/)
    .map((x) => flat(x.replace(/^\s*[-*]\s+/, "")))
    .filter((x) => x.length > 20);
  const body = flat([grab("DISCUSSION"), grab("SHORT TERM"), grab("LONG TERM")].join(" ")).replace(/KEY MESSAGE \d+\.\.\./gi, " ");
  const sentences = body.match(/[^.!?]+[.!?]+/g) || [];
  const CONF = /\b(confiden\w*|uncertain\w*|spread|ensemble\w*|guidance|models?|agree\w*|disagree\w*|trend\w*|timing)\b/i;
  const conf = sentences
    .map((x) => flat(x))
    .filter((x) => CONF.test(x) && x.length > 40 && x.length < 320)
    .slice(0, 2);
  const all = (keys.join(" ") + " " + conf.join(" ")).toLowerCase();
  const tone = /low confidence|uncertain|lots of spread|large spread|disagree|difficult|tricky|wide range/.test(all)
    ? "unsure"
    : /high confidence|good agreement|good consensus|confident|well agreed|in agreement/.test(all)
      ? "sure"
      : null;
  return { keys, conf, tone, code: a.code, issued: a.afd.issuanceTime };
}

function afdCard(a, section) {
  if (!a?.afd?.productText) return "";
  const txt = a.afd.productText.replace(/\r/g, "");
  const grab = (re) => {
    const m = txt.match(re);
    return m ? m[1].replace(/&&[\s\S]*$/, "").trim() : null;
  };
  // Section headers look like ".KEY MESSAGES, Issued 906 PM...\n" or ".DISCUSSION...text starts here".
  const sec = (name) => grab(new RegExp(`\\n\\.${name}[^\\n]*?\\.\\.\\.([\\s\\S]*?)(?=\\n&&|\\n\\s*\\n\\.[A-Z])`, "i"));
  const key = sec("KEY MESSAGES?");
  const syn = sec("SYNOPSIS");
  const what = sec("WHAT HAS CHANGED");
  const disc = [sec("DISCUSSION"), sec("SHORT TERM"), sec("LONG TERM")].filter(Boolean).join("\n\n");
  const paras = disc
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^KEY MESSAGE/i.test(p) && !/^\.[A-Z ]+\.\.\.$/.test(p));
  const parts = [
    ["Key messages", key],
    ["Synopsis", syn],
    ["What changed", what],
  ].filter((x) => x[1]);
  const clean = (s) =>
    s
      .replace(/\n(?!\s*[-*]|\s*\d\))/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  const short = (s) => s;
  const body = (s) => {
    const items = s.split(/\n\s*[-*]\s+/).map((x) => x.replace(/^\s*[-*]\s+/, ""));
    if (/^\s*[-*]\s/.test(s) && items.length > 1)
      return `<ul>${items.filter((x) => x.trim()).map((x) => `<li>${escapeHTML(short(clean(x)))}</li>`).join("")}</ul>`;
    return `<p>${escapeHTML(short(clean(s)))}</p>`;
  };
  const discHTML = paras.length
    ? `<section class="ins-disc"><h4>Forecaster discussion</h4><p>${escapeHTML(clean(paras[0]))}</p>${
        paras.length > 1
          ? `<details><summary>Rest of the discussion (${paras.length - 1} more paragraph${paras.length > 2 ? "s" : ""})</summary>${paras
              .slice(1)
              .map((p) => `<p>${escapeHTML(clean(p))}</p>`)
              .join("")}</details>`
          : ""
      }</section>`
    : "";
  const keyHTML = key ? body(key) : syn ? body(syn) : paras.length ? `<p>${escapeHTML(clean(paras[0]))}</p>` : "";
  return `<article class="card afd-card ins-afd"><h3>NWS key messages</h3>${keyHTML}<p class="source">${escapeHTML(a.code)} Area Forecast Discussion, issued ${escapeHTML(regionTime(a.afd.issuanceTime, section, { weekday: "short", hour: "numeric", minute: "2-digit" }))} · <button type="button" class="linkish" data-view="afd">Read the full discussion ›</button></p></article>`;
}


/* ---------- plain-English summary ---------- */
function prevTotal(prev, a, b) {
  if (!prev?.hourly) return null;
  const t = prev.hourly.time.map(insT);
  const vals = INS_MODELS.map(([, id]) => sumWindow(t, prev.hourly[`precipitation_previous_day1_${id}`] || [], a, b)).filter((v) => v != null);
  return vals.length ? mean(vals) : null;
}
/* What kind of storm, where it comes from and where its moisture comes from, in plain words.
   Uses the steering wind at 500 mb (storms ride it), temperatures aloft, total water vapour,
   and the NWS discussion's own words when it names the setup. */
function airMean(air, v, a, b) {
  if (!air?.hourly) return null;
  const t = air.hourly.time.map(insT);
  const out = [];
  for (const id of ["gfs_seamless", "ecmwf_ifs025"]) {
    const vals = air.hourly[`${v}_${id}`] || [];
    t.forEach((x, i) => {
      if (x >= a && x < b && Number.isFinite(vals[i])) out.push(vals[i]);
    });
  }
  return out;
}
function stormStory(x, data, section) {
  const a = x.start - 12 * H,
    b = x.end;
  const dirs = airMean(data.air, "wind_direction_500hPa", a, b),
    iwv = airMean(data.air, "total_column_integrated_water_vapour", x.start, x.end);
  const steer = dirs?.length ? circMean(dirs) : x.dir700;
  const water = iwv?.length ? Math.max(...iwv) : null; // kg/m² = mm of water
  const afd = (data.afd?.afd?.productText || "").toLowerCase();
  const says = (re) => re.test(afd);
  const ne = insKind === "ne";
  // Temperature of the storm.
  const c = ne ? (x.t850mean != null ? fToC(x.t850mean) : null) : x.t700mean != null ? fToC(x.t700mean) : null;
  const temp = c == null ? "" : ne ? (c <= -6 ? "cold" : c >= 3 ? "mild" : "") : c <= -11 ? "cold" : c >= -4 ? "warm" : "";
  let kind = "",
    from = "",
    moisture = "",
    learn = "";
  const d = steer;
  if (!ne) {
    if (d == null) from = "";
    else if (d >= 290 || d < 20) from = "dropping in from the Gulf of Alaska and the Pacific Northwest";
    else if (d >= 245) from = "coming straight in off the Pacific";
    else if (d >= 195) from = "coming up from the southwest, off California";
    else from = "coming up from the south, out of Baja and Arizona";
    if (water != null && water >= 18 && d != null && d >= 195 && d < 270) moisture = "a long plume of subtropical Pacific moisture — a wet one";
    else if (d != null && d >= 290) moisture = "the cold north Pacific, so it is fairly dry";
    else if (d != null && d < 195) moisture = "the subtropics to the south";
    else moisture = "the Pacific";
    if (says(/atmospheric river/) || (water != null && water >= 20 && d != null && d >= 195 && d < 270)) kind = "an atmospheric river";
    else if (says(/cut-?off low|closed low/)) kind = "a slow-moving cutoff low";
    else if (d != null && d >= 290 && temp !== "warm") kind = "a cold storm";
    else kind = `a ${temp ? temp + " " : ""}Pacific storm`;
    learn =
      kind === "an atmospheric river"
        ? "Atmospheric rivers carry the most water but run warm: heavy, wet snow up high and rain lower down."
        : kind.includes("cutoff")
          ? "Cutoff lows are cut off from the jet stream, drift slowly and are hard to time, so forecasts often shift."
          : kind.includes("northwest")
            ? "Cold northwest storms bring light, dry snow and favor the Cottonwoods; totals depend on how long the northwest flow lasts."
            : d != null && d >= 195 && d < 245
              ? "Southwest storms carry more moisture but run warmer, with higher snow levels until the cold front passes."
              : "Westerly storms are middle of the road: moderate amounts and steady snow levels.";
  } else {
    const sfc = x.dir10;
    const coastal = says(/nor'?easter|coastal (low|storm)/) || (sfc != null && sfc >= 20 && sfc <= 110);
    if (coastal) {
      kind = "a nor'easter (coastal storm)";
      from = "forming off the Southeast coast and tracking up the Atlantic";
      moisture = "the Atlantic, with a boost from the Gulf of Mexico";
      learn = "Nor'easters strengthen over the ocean; the exact track decides rain versus snow, and a 50-mile shift changes everything.";
    } else if (says(/clipper/) || (d != null && d >= 285 && (x.liqRange?.[1] ?? 0) < 0.3)) {
      kind = "an Alberta clipper";
      from = "dropping in fast from western Canada";
      moisture = "very little — clippers run dry";
      learn = "Clippers move fast with little moisture: cold air and usually light snow.";
    } else if (d != null && d >= 160 && d < 235) {
      kind = `a ${temp || ""} storm from the south`.replace("  ", " ");
      from = "coming up from the Gulf Coast and Ohio Valley";
      moisture = "the Gulf of Mexico and the Atlantic";
      learn = "When the low passes west of you, warm air wins: mostly rain. When it passes to the south and east, it's colder and snowier.";
    } else {
      kind = `a ${temp ? temp + " " : ""}system from the west`;
      from = "arriving across the Great Lakes";
      moisture = "limited, mostly off the Great Lakes";
      learn = "Lows that come over the Great Lakes usually bring a front with a burst of rain or snow, then colder, breezy weather.";
    }
  }
  const line = `<b>What kind:</b> ${cap(kind)}${from ? `, ${from}` : ""}.${moisture ? ` Moisture: ${moisture}.` : ""}`;
  return { line, learn };
}

function shortStorm(x, data, section, idx) {
  let nwsAmt = x.nws ? (x.snowy ? x.nws.snow : x.nws.liquid) : null;
  if (nwsAmt && nwsAmt.through < x.end - H) nwsAmt = null;
  const what = x.snowy ? "snow" : "rain";
  const when = x.current ? `Now through ${partOfDay(x.end, section)}` : `${cap(partOfDay(x.start, section))} to ${partOfDay(x.end, section)}`;
  const amount = nwsAmt
    ? `<b>${fmtAmt(nwsAmt.inches, x.snowy)}</b> of ${what}${x.p10 != null ? ` (models ${fmtAmt(x.p10, x.snowy)}–${fmtAmt(x.p90, x.snowy)})` : ""}`
    : x.p10 != null
      ? `<b>${fmtAmt(x.p10, x.snowy)}–${fmtAmt(x.p90, x.snowy)}</b> of ${what}`
      : what;
  return `${idx === 0 ? (x.current ? "Storm under way" : "Next storm") : idx === 1 ? "After that" : "Then"}: ${when}, ${amount}.`;
}
function confidenceLine(x, data) {
  const ms = x.models.filter((m) => (x.snowy ? m.snow : m.liquid) != null);
  const v = (m) => (x.snowy ? m.snow : m.liquid);
  const sorted = [...ms].sort((a, b) => v(b) - v(a));
  const ratio = sorted.length > 1 ? v(sorted[0]) / Math.max(v(sorted[sorted.length - 1]), x.snowy ? 0.5 : 0.02) : 1;
  let s =
    ratio < 1.6
      ? "<b>Confidence: good.</b> The major models agree on amounts"
      : ratio < 3
        ? `<b>Confidence: fair.</b> ${sorted[0].name} is wettest, ${sorted[sorted.length - 1].name} driest`
        : `<b>Confidence: low.</b> ${sorted[0].name} (${fmtAmt(v(sorted[0]), x.snowy)}) and ${sorted[sorted.length - 1].name} (${fmtAmt(v(sorted[sorted.length - 1]), x.snowy)}) are far apart`;
  if (x.onsetSpread >= 6 && !x.current) s += `, and they differ by ~${Math.round(x.onsetSpread)} h on timing`;
  const a = x.current ? Date.now() : x.start - 6 * H,
    before = prevTotal(data.prev, a, x.end + 6 * H),
    now = mean(x.models.map((m) => m.liquid));
  if (before != null && now != null && Math.max(before, now) >= 0.05) {
    const ch = (now - before) / Math.max(before, 0.05);
    s += ch >= 0.25 ? ". Trending wetter since yesterday" : ch <= -0.25 ? ". Trending drier since yesterday" : ". Steady since yesterday";
  }
  return s + ".";
}
function eventText(e, section) {
  const when = cap(partOfDay(e.t, section));
  if (e.kind === "trough") return `${when}: storm system passes`;
  if (e.kind === "ridge") return `${when}: high pressure — dry and milder`;
  if (e.kind === "cold") return `${when}: ${e.gradual ? "cooling" : "cold front"} (~${e.dF}°F colder)`;
  if (e.kind === "warm") return `${when}: warming (~${e.dF}°F warmer)`;
  if (e.kind === "powder") return `${when}: cold northwest flow (best snow quality)`;
  return "";
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function summaryCard(storms, data, section) {
  const items = [];
  let learn = "";
  if (storms.length) {
    const x = storms[0],
      story = stormStory(x, data, section);
    items.push(shortStorm(x, data, section, 0));
    items.push(story.line);
    items.push(confidenceLine(x, data));
    learn = story.learn;
    storms.slice(1).forEach((s, i) => items.push(shortStorm(s, data, section, i + 1)));
  } else items.push("<b>No storms</b> in the next 10 days in any of the major models.");
  // One quote from the forecasters.
  const n = afdNotes(data.afd);
  if (n?.keys?.length) {
    const k = n.keys[0];
    items.push(`<b>NWS forecasters:</b> “${escapeHTML(k.length > 180 ? k.slice(0, 175).replace(/\s\S*$/, "") + "…" : k)}”`);
  }
  // Pattern in one line.
  const ev = insEvents
    .filter((e) => e.t > Date.now() - 6 * H && e.kind !== "trough")
    .sort((a, b) => a.t - b.t)
    .map((e) => eventText(e, section))
    .filter(Boolean)
    .reduce((acc, t) => {
      const [when, what] = t.split(": ");
      const last = acc[acc.length - 1];
      if (last && last.when === when) last.what += ` and ${what}`;
      else acc.push({ when, what });
      return acc;
    }, [])
    .map((x) => `${x.when}: ${x.what}`)
    .slice(0, 3);
  if (insTrend === "colder") ev.push("late next week turns colder and stormier");
  if (insTrend === "warmer") ev.push("late next week turns warmer and drier");
  if (ev.length) items.push(`<b>Pattern:</b> ${ev.join(" → ")}.`);
  const link = `<button type="button" class="linkish" data-view="afd">NWS forecast discussion ›</button>`;
  return `<article class="card afd-card ins-summary"><div class="ins-head"><h3>The short version</h3>${link}</div><ul>${items
    .map((t) => `<li>${t}</li>`)
    .join("")}</ul>${learn ? `<p class="ins-learn"><b>Good to know:</b> ${escapeHTML(learn)}</p>` : ""}</article>`;
}

/* ---------- Wasatch storm cycle (Utah): every storm in the next 10 days, the 10-day total at this
   point with its ensemble range, and each resort's mid/peak snow per storm. ---------- */
const cycleResorts = () => utah.filter((r) => r.p.length > 1);
const elevOf = (label) => {
  const m = String(label || "").match(/~([\d,]+)\s*ft/);
  return m ? +m[1].replace(/,/g, "") : null;
};
let cycleCache = null;

function cycleFetch() {
  if (cycleCache && Date.now() - cycleCache.time < 10 * 60000) return cycleCache.promise;
  const pts = cycleResorts().flatMap((r) => r.p);
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  Object.entries({
    latitude: pts.map((q) => q[0]).join(","),
    longitude: pts.map((q) => q[1]).join(","),
    hourly: "precipitation,temperature_700hPa",
    models: INS_MODELS.map((m) => m[1]).join(","),
    forecast_hours: 240,
    past_hours: 6,
    timezone: "UTC",
    precipitation_unit: "inch",
    temperature_unit: "fahrenheit",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const promise = getJSON(u.toString()).then((j) => (Array.isArray(j) ? j : [j]));
  cycleCache = { time: Date.now(), promise };
  promise.catch(() => (cycleCache = null));
  return promise;
}

/* Model-average snow (in) at one point between a and b: each model's hourly liquid × a snow ratio from its own
   700 mb temperature, counted only when the snow level estimated from that temperature is below the point. */
function pointSnow(j, elevFt, a, b) {
  if (!j?.hourly?.time || elevFt == null) return null;
  const t = j.hourly.time.map(insT);
  const per = INS_MODELS.map(([, id]) => {
    const pr = j.hourly[`precipitation_${id}`] || [],
      tf = j.hourly[`temperature_700hPa_${id}`] || [];
    let tot = 0,
      any = false;
    for (let i = 0; i < t.length; i++) {
      if (t[i] < a || t[i] >= b || !Number.isFinite(pr[i])) continue;
      any = true;
      const lvl = snowLevelAt(null, t[i], tf[i]);
      if (lvl == null) continue;
      tot += pr[i] * (lvl <= elevFt - 300 ? slrFor(tf[i]) : lvl <= elevFt + 300 ? slrFor(tf[i]) / 2 : 0);
    }
    return any ? tot : null;
  }).filter((v) => v != null);
  return mean(per);
}

/* Ensemble totals at this point between a and b, one per run, using the same snow rule as the resort table
   (snow level and ratio from the model 700 mb temperature, no NWS grid). Runs that end early are left out. */
function memberTotals(data, elevFt, a, b) {
  if (!data.ens?.hourly || elevFt == null) return [];
  const et = data.ens.hourly.time.map(insT),
    factor = snowFactor({ det: data.det, nws: null }, elevFt),
    out = [];
  for (const k of Object.keys(data.ens.hourly)) {
    const m = k.match(/^precipitation_(?:member\d+_)?(.+)$/);
    if (!m || !INS_ENS.includes(m[1])) continue;
    const v = data.ens.hourly[k];
    let tot = 0,
      last = 0;
    for (let i = 0; i < et.length; i++) {
      if (et[i] < a || et[i] >= b || !Number.isFinite(v[i])) continue;
      last = et[i] + H;
      tot += v[i] * factor(et[i]);
    }
    if (last >= b - H) out.push(tot);
  }
  return out.sort((x, y) => x - y);
}

/* Snow between a and b at this point: the middle is the GFS/ECMWF/GEM/ICON average (identical to this point's cell
   in the resort table); the low and high ends are the ensemble 10th/90th percentiles, rescaled so the ensemble
   median lands on that average. The coarser ensembles run dry over the Wasatch, so their raw amounts sit low. */
function cycleRange(data, elevFt, a, b) {
  const mid = pointSnow(data.det, elevFt, a, b),
    tots = memberTotals(data, elevFt, a, b),
    med = quantile(tots, 0.5);
  if (mid == null) return null;
  const k = med != null && med >= 0.3 ? mid / med : null;
  return {
    lo: k != null ? quantile(tots, 0.1) * k : null,
    mid,
    hi: k != null ? quantile(tots, 0.9) * k : null,
    n: tots.length,
  };
}

/* Running 10-day total at this point: model average for the middle line, rescaled ensemble range for the band. */
function cycleBand(data, elevFt) {
  if (!data.det?.hourly || elevFt == null) return null;
  const now = Date.now();
  const steps = Array.from({ length: 11 }, (_, d) => now + d * 24 * H);
  const r = steps.map((t, d) => (d ? cycleRange(data, elevFt, now, t) : { lo: 0, mid: 0, hi: 0, n: 0 }));
  if (!r[10]) return null;
  return {
    steps,
    p10: r.map((x) => x?.lo ?? null),
    p50: r.map((x) => x?.mid ?? null),
    p90: r.map((x) => x?.hi ?? null),
    n: r[10].n,
  };
}

function bandChart(band, storms, section) {
  const w = 560,
    h = 240,
    L = 40,
    R = 14,
    T = 16,
    B = 34,
    pw = w - L - R,
    ph = h - T - B;
  const t0 = band.steps[0],
    t1 = band.steps[band.steps.length - 1];
  const x = (ms) => L + ((ms - t0) / (t1 - t0)) * pw;
  const top = Math.max(4, ...band.p90.filter(Number.isFinite), ...band.p50.filter(Number.isFinite)) * 1.1;
  const y = (v) => T + ph - (v / top) * ph;
  const stepIn = top > 60 ? 20 : top > 30 ? 10 : top > 12 ? 5 : top > 6 ? 2 : 1;
  let grid = "";
  for (let v = 0; v <= top; v += stepIn)
    grid += `<line x1="${L}" x2="${w - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#294858" stroke-width="1"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" fill="#9fb1bc" font-size="14">${v}″</text>`;
  const shades = storms
    .map((s, i) => {
      const a = Math.max(s.start, t0),
        b = Math.min(s.end, t1);
      if (b <= a) return "";
      return `<rect x="${x(a).toFixed(1)}" y="${T}" width="${Math.max(2, x(b) - x(a)).toFixed(1)}" height="${ph}" fill="#79d7e5" opacity="0.08"/><text x="${((x(a) + x(b)) / 2).toFixed(1)}" y="${T + 12}" text-anchor="middle" fill="#cfe2e8" font-size="14" font-weight="600">${i + 1}</text>`;
    })
    .join("");
  const idx = band.steps.map((_, d) => d).filter((d) => Number.isFinite(band.p50[d]));
  const pts = (arr) => idx.map((d) => `${x(band.steps[d]).toFixed(1)},${y(arr[d]).toFixed(1)}`);
  const hasBand = idx.every((d) => Number.isFinite(band.p10[d]) && Number.isFinite(band.p90[d]));
  const area = hasBand ? `<polygon points="${[...pts(band.p90), ...pts(band.p10).reverse()].join(" ")}" fill="#79d7e5" opacity="0.22"/>` : "";
  const line = (arr, extra) => `<polyline points="${pts(arr).join(" ")}" fill="none" stroke="#79d7e5" ${extra}/>`;
  const zone = regionZone(section);
  const labels = band.steps
    .map((ms, d) =>
      d % 2 ? "" : `<text x="${x(ms).toFixed(1)}" y="${h - 12}" text-anchor="middle" fill="#9fb1bc" font-size="14">${d === 0 ? "Now" : new Date(ms).toLocaleDateString("en-US", { weekday: "short", timeZone: zone })}</text>`,
    )
    .join("");
  const last = idx[idx.length - 1];
  const label = `Running snow total over the next 10 days: model average ${fmtAmt(band.p50[last], true)}${hasBand ? `, likely range ${fmtAmt(band.p10[last], true)} to ${fmtAmt(band.p90[last], true)}` : ""}.`;
  return `<svg class="ins-plume" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(label)}">${grid}${shades}${area}${hasBand ? line(band.p10, 'stroke-width="1.5" stroke-dasharray="4 4"') + line(band.p90, 'stroke-width="1.5" stroke-dasharray="4 4"') : ""}${line(band.p50, 'stroke-width="3"')}${labels}</svg><p class="ins-legend"><span class="ins-key ins-key-line"></span>Model average ${hasBand ? `<span class="ins-key ins-key-band"></span>Likely range (spread of ${band.n} ensemble runs) ` : ""}<span class="ins-key ins-key-storm"></span>Storm windows</p>`;
}

const stormWindow = (x) => [x.current ? Date.now() : x.start - 6 * H, x.end + 6 * H];
const dayRange = (x, section) => {
  const zone = regionZone(section),
    d = (ms) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", timeZone: zone }),
    a = d(x.current ? Date.now() : x.start),
    b = d(x.end);
  return a === b ? a : `${a}–${b}`;
};

function cycleCard(storms, data, section, elevFt, placeName) {
  const list = storms
    .map((x, i) => {
      const lvl = x.nws?.level
        ? `Snow level ${(Math.round(x.nws.level.max / 100) * 100).toLocaleString()}${Math.round(x.nws.level.max / 100) !== Math.round(x.nws.level.min / 100) ? ` → ${(Math.round(x.nws.level.min / 100) * 100).toLocaleString()}` : ""} ft (NWS)`
        : x.t700mean != null
          ? `Snow level about ${(Math.round(snowLevelAt(null, 0, x.t700mean) / 100) * 100).toLocaleString()} ft (models)`
          : "";
      const q = snowQuality(x.t700mean);
      const r = cycleRange(data, elevFt, ...stormWindow(x));
      const amt = !r ? "–" : r.lo != null ? `${fmtAmt(r.mid, true)} <small class="rng">(${fmtAmt(r.lo, true)}–${fmtAmt(r.hi, true)})</small>` : fmtAmt(r.mid, true);
      return `<li><b>Storm ${i + 1}</b><span>${escapeHTML(x.current ? `Now → ${partOfDay(x.end, section)}` : `${cap(partOfDay(x.start, section))} → ${partOfDay(x.end, section)}`)}</span><span class="amt">${amt} here</span><span class="ins-conf ins-conf-${(x.conf || "na").toLowerCase()}">${x.conf ? x.conf + " confidence" : "Confidence n/a"}</span><small>${[lvl, q?.label].filter(Boolean).map(escapeHTML).join(" · ")}</small></li>`;
    })
    .join("");
  const band = cycleBand(data, elevFt);
  const last = band ? band.steps.map((_, d) => d).filter((d) => Number.isFinite(band.p50[d])).pop() : null;
  const totals =
    band && last != null
      ? `<h4>10-day total${placeName ? ` · ${escapeHTML(placeName)}` : ""}</h4><div class="ins-stats"><div><span>Low end</span><strong>${fmtAmt(band.p10[last], true)}</strong><small>ensemble spread, 10th percentile</small></div><div><span>Middle</span><strong>${fmtAmt(band.p50[last], true)}</strong><small>model average · matches the table</small></div><div><span>High end</span><strong>${fmtAmt(band.p90[last], true)}</strong><small>ensemble spread, 90th percentile</small></div></div>${bandChart(band, storms, section)}`
      : "";
  return `<article class="card afd-card ins-cycle"><div class="ins-head"><h3>Wasatch storm cycle · next 10 days</h3><span class="ins-conf">${storms.length} storm${storms.length === 1 ? "" : "s"}</span></div><ol class="ins-cycle-list">${list}</ol>${totals}<h4>By mountain</h4><div id="ins-cycle-table"><div class="state">Loading resort totals…</div></div><p class="source">All amounts on this card use one method: the GFS, ECMWF, GEM and ICON average, with snow level and snow ratio from each model's 700 mb temperature, so “here” matches this resort's row in the table. Ranges come from the GEFS, ECMWF ENS and GEM ENS spread, rescaled to that average because the coarser ensembles run dry over the Wasatch. The storm cards below use the ensembles directly and the NWS snow level, so they can read lower.</p></article>`;
}

async function fillCycleTable(el, key, storms, section, pt) {
  const box = el.querySelector("#ins-cycle-table");
  if (!box) return;
  let res;
  try {
    res = await cycleFetch();
  } catch {
    if (box.isConnected) box.innerHTML = '<div class="error">Resort totals are temporarily unavailable.</div>';
    return;
  }
  if (!box.isConnected || el.dataset.key !== key) return;
  const resorts = cycleResorts();
  const now = Date.now(),
    ten = [now, now + 240 * H];
  let k = 0;
  const rows = resorts.map((r) => {
    const pts = r.p.map((q) => ({ q, j: res[k++], elev: elevOf(q[2]) }));
    const mid = pts[0],
      peak = pts[pts.length - 1];
    const cell = ([a, b]) => [pointSnow(mid.j, mid.elev, a, b), pointSnow(peak.j, peak.elev, a, b)];
    return {
      name: r.name,
      here: r.p.some((q) => q[0] === pt.p[0] && q[1] === pt.p[1]),
      storms: storms.map((x) => cell(stormWindow(x))),
      total: cell(ten),
    };
  });
  rows.sort((a, b) => (b.total[1] ?? -1) - (a.total[1] ?? -1));
  const r0 = (v) => (v == null ? "–" : `${v < 0.5 ? 0 : Math.round(v)}″`);
  const pair = ([m, p]) => (m == null && p == null ? "–" : `${r0(m)} <small>/ ${r0(p)}</small>`);
  const heads = storms.map((x, i) => `Storm ${i + 1}`),
    days = storms.map((x) => dayRange(x, section));
  box.innerHTML = `<div class="model-table-wrap"><table class="model-table ins-cycle-table"><thead><tr><th>Resort</th>${heads
    .map((h, i) => `<th>${escapeHTML(h)}<small>${escapeHTML(days[i])}</small></th>`)
    .join("")}<th>10 days</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr${r.here ? ' class="flag"' : ""}><th>${escapeHTML(r.name)}</th>${r.storms
          .map((c, i) => `<td data-label="${escapeHTML(heads[i])}">${pair(c)}</td>`)
          .join("")}<td data-label="10 days"><b>${pair(r.total)}</b></td></tr>`,
    )
    .join("")}</tbody></table></div><p class="ins-legend">Each cell: mid mountain / peak, model average. Sorted by 10-day peak total.</p>`;
}

async function loadInsights(pt, section) {
  const el = document.querySelector("#ins");
  if (!el) return;
  el.innerHTML = '<article class="card afd-card"><div class="state">Loading storm totals, model ensembles and the NWS discussion…</div></article>';
  const data = await insFetch(pt.p);
  if (!el.isConnected || el.dataset.key !== pt.p.slice(0, 2).join(",")) return;
  let html = "",
    cycle = null;
  if (data.det?.hourly) {
    const elevFt = data.nws?.forecast?.elevation?.value != null ? data.nws.forecast.elevation.value * 3.28084 : elevOf(pt.p[2]);
    const [lat, lon] = pt.p;
    const wasatch = lat > 40.1 && lat < 41.5 && lon > -112.2 && lon < -111.1;
    const place = (section === "utah" ? utah : ne).find((x) => x.p.some((q) => q[0] === lat && q[1] === lon));
    insKind = place?.searched ? (wasatch ? "utah" : "other") : section;
    insHigh = insKind === "utah" || (elevFt ?? 0) > 4500;
    const storms = findStorms(data.det)
      .map((s) => analyzeStorm(s, data, section, elevFt))
      .filter((x) => (x.liqRange[1] ?? 0) >= 0.03 || x.models.filter((m) => m.liquid >= 0.05).length >= 2);
    const pattern = patternCard(data, section, storms);
    if (insKind === "utah" && storms.length) {
      const which = place && !place.searched ? `${place.name}${place.p.length > 1 ? ` ${pt.p[2]?.split(" · ")[0]?.toLowerCase() || ""}` : ""}` : "";
      html += cycleCard(storms, data, section, elevOf(pt.p[2]) ?? elevFt, which.trim());
      cycle = storms;
    }
    html += summaryCard(storms, data, section);
    html += storms.length
      ? storms.map((s, i) => stormCard(s, section, i)).join("")
      : `<article class="card afd-card ins-storm"><h3>No storm in sight</h3><p>None of the GFS, ECMWF, GEM or ICON models show a meaningful precipitation event (0.05″ liquid or more) in the next 10 days.</p></article>`;
    html += pattern;
  } else {
    html += '<article class="card afd-card"><h3>Model guidance</h3><div class="error">Model data is temporarily unavailable.</div></article>';
  }
  html += afdCard(data.afd, section);
  el.innerHTML = html;
  if (cycle) fillCycleTable(el, el.dataset.key, cycle, section, pt);
  el.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view[section] = b.dataset.view;
        forecastView();
        content.scrollIntoView({ block: "start" });
      }),
  );
}

window.loadInsights = loadInsights;
window.insCache = insCache;
})();
