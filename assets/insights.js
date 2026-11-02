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
  const promise = Promise.allSettled([
    getJSON(det.toString()),
    getJSON(ens.toString()),
    mountainPoint(p),
    insAFD(p),
  ]).then(([d, e, n, a]) => ({
    det: d.status === "fulfilled" ? d.value : null,
    ens: e.status === "fulfilled" ? e.value : null,
    nws: n.status === "fulfilled" ? n.value : null,
    afd: a.status === "fulfilled" ? a.value : null,
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
  return storms
    .map((s) => ({ ...s, start: t[s.a], end: t[s.b] + H, total: pr.slice(s.a, s.b + 1).reduce((x, y) => x + (y || 0), 0) }))
    .filter((s) => s.total >= 0.05 && s.end > now)
    .slice(0, 2);
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

function analyzeStorm(s, data, section, elevFt) {
  const det = data.det,
    t = det.hourly.time.map(insT),
    now = Date.now();
  const current = s.start <= now;
  const a = current ? now : s.start - 6 * H,
    b = s.end + 6 * H;
  // Hourly snow fraction and ratio for this point (Utah: derived from liquid; New England: model snowfall).
  const t700h = meanSeries(det, "temperature_700hPa");
  const tIndex = new Map(t.map((x, i) => [x, i]));
  const derive = section === "utah" && elevFt != null;
  const factor = (ms) => {
    const i = tIndex.get(ms);
    const tf = i == null ? null : t700h[i];
    const lvl = snowLevelAt(data.nws?.grid, ms, tf);
    if (lvl == null) return 0;
    return lvl <= elevFt - 300 ? slrFor(tf) : lvl <= elevFt + 300 ? slrFor(tf) / 2 : 0;
  };
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
  if (x.section === "utah") {
    if (d >= 292 && d <= 345)
      return `700 mb flow from the ${from} at ${spd}: the classic orographic setup for the Wasatch. Northwest flow favors the Cottonwoods most, and Park City side resorts somewhat less.`;
    if (d >= 248 && d < 292)
      return `700 mb flow from the ${from} at ${spd}: westerly flow gives moderate upslope lift on the Wasatch; totals improve if winds turn northwest behind the front.`;
    if (d >= 190 && d < 248)
      return `700 mb flow from the ${from} at ${spd}: southwest flow is usually warmer and spreads snow more evenly, often with a higher snow level until the trough passes.`;
    return `700 mb flow from the ${from} at ${spd}: not a typical upslope direction for the Wasatch, so totals depend on the system's dynamics more than terrain.`;
  }
  const sfc = x.dir10 != null ? compass(x.dir10) : null;
  if (sfc && x.dir10 >= 20 && x.dir10 <= 110)
    return `Surface wind from the ${sfc} during the storm: an onshore, nor'easter-style setup with a low passing to the south and east.`;
  if (sfc && x.dir10 >= 150 && x.dir10 <= 250)
    return `Surface wind from the ${sfc}: the low tracks west of the area, which usually means warmer air and rain over snow near the coast.`;
  return `700 mb flow from the ${from} at ${spd}; surface wind from the ${sfc || "–"}.`;
}
function ptypeNote(x) {
  if (x.section === "utah") return null;
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
  const title = idx === 0 ? (current ? "Current storm · still to come" : "Next storm") : "Following storm";
  const timing = `${current ? "Under way, ends" : `${partOfDay(x.start, section)} → `}${current ? " " + partOfDay(x.end, section) : partOfDay(x.end, section)}`;
  const unit = x.snowy ? "Snow" : "Precipitation";
  const range = x.p10 != null ? `${fmtAmt(x.p10, x.snowy)}–${fmtAmt(x.p90, x.snowy)}` : "–";
  const likely = likelyText(x);
  const nwsAmt = x.nws ? (x.snowy ? x.nws.snow : x.nws.liquid) : null;
  const nwsPart =
    nwsAmt
      ? `${fmtAmt(nwsAmt.inches, x.snowy)}${nwsAmt.full ? "" : ` <small>through ${escapeHTML(insWhen(nwsAmt.through, section))} (NWS grid ends)</small>`}`
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
  if (x.nws?.level && x.section === "utah")
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
  return `<article class="card afd-card ins-storm"><div class="ins-head"><h3>${title}</h3><span class="ins-conf ins-conf-${(x.conf || "na").toLowerCase()}">${x.conf ? x.conf + " confidence" : "Confidence n/a"}</span></div><p class="ins-timing">${escapeHTML(timing)}</p><div class="ins-stats"><div><span>NWS forecast</span><strong>${nwsPart}</strong><small>${unit.toLowerCase()} · official</small></div><div><span>Model range</span><strong>${range}</strong><small>10th–90th percentile of ${x.members.length} ensemble runs</small></div><div><span>Middle outcome</span><strong>${fmtAmt(x.p50, x.snowy)}</strong><small>ensemble median${x.snowy ? ` · ${fmtAmt(x.liqRange[1], false)} liquid` : ""}</small></div></div>${likely ? `<p class="ins-likely"><b>Most likely:</b> ${escapeHTML(likely)}</p>` : ""}<div class="ins-bars" aria-label="Share of ensemble runs by total">${bars}</div><ul class="ins-notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>${table}</article>`;
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
    tUp = meanSeries(det, section === "utah" ? "temperature_700hPa" : "temperature_850hPa"),
    t2 = meanSeries(det, "temperature_2m");
  const dirUp = det.hourly.time.map((_, i) => circMean(series(det, "wind_direction_700hPa").map((s) => s.values[i])));
  const fut = t.map((x, i) => (x >= now - 3 * H ? i : -1)).filter((i) => i >= 0);
  const ft = fut.map((i) => t[i]),
    fz = fut.map((i) => z[i]),
    fp = fut.map((i) => p[i]);
  const items = [];

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
      return `${x.kind === "trough" ? "Trough axis" : "Ridge axis"} overhead ${partOfDay(x.t, section)} (500 mb height ${Math.round(x.v / 10)} dam).${
        spread >= 12 ? ` Models differ by ~${Math.round(spread)} h on timing; ${fastest.name} is fastest.` : " Models agree on timing."
      }`;
    });
  if (fz.length > 100) {
    const early = mean(fz.slice(0, 48)),
      late = mean(fz.slice(120, 192));
    const trend = late - early;
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
  if (section === "utah" && sfc.length)
    sfc.push("Sea-level pressure over Utah is reduced from high terrain, so use it for timing and trend more than exact values.");
  if (sfc.length) items.push(["Surface highs and lows", sfc]);

  // Fronts from temperature change aloft (no daily cycle at 700/850 mb).
  const fr = fronts(t, tUp, dirUp, section, now)
    .filter((f) => f.t < now + 8 * 24 * H)
    .slice(0, 4)
    .map((f) => {
      const lvl = section === "utah" ? "700 mb" : "850 mb";
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
  if (section === "utah") {
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
    items.push([
      "Temperatures",
      [
        `Model highs range from ${Math.round(coldest.hi)}° (${name(coldest)}) to ${Math.round(warmest.hi)}° (${name(warmest)}) over the next week; ${warmest.t > coldest.t ? "warming after the cold point" : "cooling into the colder stretch"}.`,
      ],
    ]);
  }
  if (!items.length) return "";
  return `<article class="card afd-card ins-pattern"><h3>Pattern · what the models show</h3>${items
    .map(([h, list]) => `<section><h4>${escapeHTML(h)}</h4><ul>${list.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul></section>`)
    .join("")}<p class="source">Mean of GFS, ECMWF, GEM and ICON at this point via <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo ↗</a>. Troughs and ridges come from 500 mb heights, fronts from 12-hour temperature change at ${section === "utah" ? "700" : "850"} mb.</p></article>`;
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
  return `<article class="card afd-card ins-afd"><h3>What NWS forecasters say</h3><p class="muted">Quoted word for word from the NWS Area Forecast Discussion. Nothing here is AI-written.</p>${parts
    .map(([h, s]) => `<section><h4>${h}</h4>${body(s)}</section>`)
    .join("")}${discHTML}<p class="source">${escapeHTML(a.code)} Area Forecast Discussion, issued ${escapeHTML(regionTime(a.afd.issuanceTime, section, { weekday: "short", hour: "numeric", minute: "2-digit" }))} · <button type="button" class="linkish" data-view="afd">Read the full discussion ›</button></p></article>`;
}

async function loadInsights(pt, section) {
  const el = document.querySelector("#ins");
  if (!el) return;
  el.innerHTML = '<article class="card afd-card"><div class="state">Loading storm totals, model ensembles and the NWS discussion…</div></article>';
  const data = await insFetch(pt.p);
  if (!el.isConnected || el.dataset.key !== pt.p.slice(0, 2).join(",")) return;
  let html = "";
  if (data.det?.hourly) {
    const elevFt = data.nws?.forecast?.elevation?.value != null ? data.nws.forecast.elevation.value * 3.28084 : null;
    const storms = findStorms(data.det)
      .map((s) => analyzeStorm(s, data, section, elevFt))
      .filter((x) => (x.liqRange[1] ?? 0) >= 0.03 || x.models.filter((m) => m.liquid >= 0.05).length >= 2);
    html += storms.length
      ? storms.map((s, i) => stormCard(s, section, i)).join("")
      : `<article class="card afd-card ins-storm"><h3>No storm in sight</h3><p>None of the GFS, ECMWF, GEM or ICON models show a meaningful precipitation event (0.05″ liquid or more) in the next 10 days.</p></article>`;
    html += patternCard(data, section, storms);
  } else {
    html += '<article class="card afd-card"><h3>Model guidance</h3><div class="error">Model data is temporarily unavailable.</div></article>';
  }
  html += afdCard(data.afd, section);
  el.innerHTML = html;
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
