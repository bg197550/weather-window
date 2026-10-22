/* Shared by the Weather, Snow Report and Webcams pages. Classic script: top-level names are global. */

const utah = [
  { name: "Snyderville", p: [[40.695, -111.536, "Town"]] },
  { name: "Park City", p: [[40.647, -111.498, "Town"]] },
  {
    name: "Deer Valley",
    p: [
      [40.62, -111.485, "Mid mountain · ~8,100 ft"],
      [40.60884, -111.48047, "Peak · Bald Mountain ~9,331 ft"],
    ],
  },
  {
    name: "Canyons Resort",
    p: [
      [40.687, -111.572, "Mid mountain · ~8,000 ft"],
      [40.65793, -111.59575, "Peak · 9990 ~9,990 ft"],
    ],
  },
  {
    name: "Alta",
    p: [
      [40.588, -111.631, "Mid mountain · ~9,500 ft"],
      [40.56784, -111.63826, "Peak · Mt Baldy ~11,068 ft"],
    ],
  },
  {
    name: "Snowbird",
    p: [
      [40.579, -111.657, "Mid mountain · ~9,000 ft"],
      [40.56106, -111.64522, "Peak · Hidden Peak ~10,992 ft"],
    ],
  },
  {
    name: "Solitude",
    p: [
      [40.622, -111.592, "Mid mountain · ~8,700 ft"],
      [40.60156, -111.61403, "Peak · Honeycomb ~10,488 ft"],
    ],
  },
  {
    name: "Brighton",
    p: [
      [40.6, -111.582, "Mid mountain · ~9,000 ft"],
      [40.59023, -111.59742, "Peak · Mt Millicent ~10,452 ft"],
    ],
  },
  {
    name: "Snowbasin",
    p: [
      [41.206, -111.858, "Mid mountain · ~7,800 ft"],
      [41.19994, -111.88244, "Peak · Mt Ogden ~9,501 ft"],
    ],
  },
];
const ne = [
  { name: "Boston", p: [[42.361, -71.057, "City"]] },
  { name: "Brookline, MA", p: [[42.331, -71.121, "Town"]] },
  { name: "Avon, CT", p: [[41.8096, -72.8307, "Town"]] },
  { name: "Portsmouth, NH", p: [[43.0718, -70.7626, "City"]] },
  { name: "Newport, RI", p: [[41.4901, -71.3128, "City"]] },
  { name: "Stratton Mountain", p: [[43.09585, -72.92142, "Summit · ~3,875 ft"]] },
  { name: "Stowe", p: [[44.5437, -72.8143, "Summit · Mt. Mansfield ~4,393 ft"]] },
  { name: "Gunstock", p: [[43.52563, -71.3784, "Summit · ~2,300 ft"]] },
  { name: "NH Seacoast", p: [[42.954, -70.784, "Coast · North Hampton"]] },
  { name: "Portland, ME", p: [[43.659, -70.257, "City"]] },
];
const UAC = { Snowbasin: "ogden" };
/* Observation stations to try for each point, best first ("lat,lon" of the point → station ids).
   NWS's own nearest-station list puts a Park City highway sensor first for most Wasatch resorts,
   so mountain points list on-mountain stations explicitly. Points not listed use the NWS list. */
const OBS_STATIONS = {
  "40.695,-111.536": ["KIJ", "UT224"], // Snyderville
  "40.647,-111.498": ["PACU1", "PC065", "DVE"], // Park City
  "40.62,-111.485": ["DVB", "DVE", "UTONM"], // Deer Valley mid
  "40.60884,-111.48047": ["MBY", "DVO", "DVP"], // Deer Valley peak
  "40.687,-111.572": ["PCM02", "PCM05", "WPKUT", "PC018"], // Canyons mid
  "40.65793,-111.59575": ["PCM04", "PCM06", "PCM01"], // Canyons peak
  "40.588,-111.631": ["CLN", "AGD", "ATH20", "PC064"], // Alta mid
  "40.56784,-111.63826": ["AMB", "CLN", "AGD"], // Alta peak
  "40.579,-111.657": ["SBDU1", "UTALC", "CLN"], // Snowbird mid
  "40.56106,-111.64522": ["AMB", "SBDU1"], // Snowbird peak (Hidden Peak has no NWS feed)
  "40.622,-111.592": ["PC056", "UTBTN", "SOLMB"], // Solitude mid
  "40.60156,-111.61403": ["BRC", "SOLSM", "SOL"], // Solitude peak
  "40.6,-111.582": ["BRIU1", "PC056", "UTBTN"], // Brighton mid
  "40.59023,-111.59742": ["BRC", "BRW"], // Brighton peak
  "41.206,-111.858": ["SNI", "SWI", "SBBWK"], // Snowbasin mid
  "41.19994,-111.88244": ["SBT15", "SBBWK", "UUSBP"], // Snowbasin peak
};
/* Forecast place → webcam page id (webcams/#id). */
const CAMS = {
  "Park City": "park-city",
  "Deer Valley": "deer-valley",
  "Canyons Resort": "canyons-resort",
  Alta: "alta",
  Snowbird: "snowbird",
  Solitude: "solitude",
  Brighton: "brighton",
  Snowbasin: "snowbasin",
  "Stratton Mountain": "stratton",
  Stowe: "stowe",
  Gunstock: "gunstock",
};
/* Relative path to the site root from the current page (the snow and webcams pages sit one folder down). */
function siteBase() {
  return /\/(snow|webcams)\//.test(location.pathname) ? "../" : "";
}
function uacURL(name) {
  return `https://utahavalanchecenter.org/forecast/${UAC[name] || "salt-lake"}`;
}
const SEV_RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
const SNOW_MODELS = [
  ["GFS", "gfs_seamless"],
  ["ECMWF", "ecmwf_ifs025"],
  ["AIFS", "ecmwf_aifs025_single"],
  ["GEM", "gem_global"],
];
let cache = new Map();
let mountainCache = new Map();
let alertCache = new Map();
let hourlyCache = new Map();
let snowModelResort = 0;
let snowModelCache = new Map();

async function getJSON(url) {
  let r = await fetch(url, {
    headers: {
      Accept: url.startsWith("https://api.weather.gov") ? "application/geo+json" : "application/json",
    },
  });
  if (!r.ok) throw Error(r.status);
  return r.json();
}

function escapeHTML(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function periodSnow(values, start, end) {
  if (!values) return null;
  let total = 0,
    found = false;
  for (const q of values) {
    const [stamp, duration] = q.validTime.split("/"),
      from = Date.parse(stamp),
      hours = +(duration.match(/PT(\d+)H/) || [])[1],
      to = from + hours * 3600000;
    if (!Number.isFinite(from) || !hours || !Number.isFinite(q.value)) continue;
    let overlap = Math.max(0, Math.min(to, end) - Math.max(from, start));
    if (overlap) {
      total += (q.value * overlap) / (to - from);
      found = true;
    }
  }
  return found ? total / 25.4 : null;
}

async function pointMeta(p) {
  const key = p.slice(0, 2).join(",");
  let d = cache.get(key);
  if (d?.point) return d.point;
  const point = (await getJSON(`https://api.weather.gov/points/${key}`)).properties;
  cache.set(key, { ...(cache.get(key) || {}), point });
  return point;
}

async function mountainPoint(p) {
  const key = p.slice(0, 2).join(",");
  let entry = mountainCache.get(key);
  if (entry && Date.now() - entry.time < 600000) return entry.promise;
  const promise = (async () => {
    let d = cache.get(key);
    if (!d?.forecast) {
      let point = await pointMeta(p),
        fc = (await getJSON(point.forecast)).properties;
      d = { ...(cache.get(key) || {}), point, forecast: fc };
      cache.set(key, d);
    }
    let grid = (await getJSON(d.point.forecastGridData)).properties;
    return { point: d.point, forecast: d.forecast, grid, label: p[2] };
  })();
  mountainCache.set(key, { time: Date.now(), promise });
  return promise;
}

function snowLevelLow(grid) {
  const v = grid.snowLevel?.values,
    snow = grid.snowfallAmount?.values;
  if (!v || !snow) return null;
  const now = Date.now(),
    end = now + 72 * 3600000;
  let best = null;
  for (const q of v) {
    const [stamp, duration] = q.validTime.split("/"),
      from = Date.parse(stamp),
      hours = +(duration?.match(/PT(\d+)H/) || [])[1] || 6,
      to = from + hours * 3600000;
    if (from >= end || to <= now || !Number.isFinite(q.value)) continue;
    const start = Math.max(from, now),
      stop = Math.min(to, end);
    if ((periodSnow(snow, start, stop) || 0) < 0.05) continue;
    const ft = q.value * 3.28084;
    if (best == null || ft < best.ft) best = { ft, time: start };
  }
  return best;
}

function windowSnow(values, hours) {
  const now = Date.now();
  return periodSnow(values, now, now + hours * 3600000);
}

async function loadResortSnow() {
  const el = document.querySelector("#resort-snow");
  if (!el) return;
  const resorts = utah.slice(2);
  const results = await Promise.all(
    resorts.map(async (r) => {
      const pts = await Promise.allSettled(r.p.map(mountainPoint));
      return { r, pts: pts.map((x) => (x.status === "fulfilled" ? x.value : null)) };
    }),
  );
  if (!el.isConnected) return;
  const rows = results.map(({ r, pts }) => ({
    name: r.name,
    pts: pts.map((d) =>
      d
        ? {
            s24: windowSnow(d.grid.snowfallAmount?.values, 24),
            s48: windowSnow(d.grid.snowfallAmount?.values, 48),
            s72: windowSnow(d.grid.snowfallAmount?.values, 72),
            level: snowLevelLow(d.grid),
            grid: d.point.forecastGridData,
            gridFt:
              d.forecast.elevation?.value != null ? Math.round(d.forecast.elevation.value * 3.28084) : null,
          }
        : null,
    ),
  }));
  const peak72 = Math.max(...rows.map((x) => Math.max(x.pts[0]?.s72 ?? 0, x.pts[1]?.s72 ?? 0)));
  const leaders = rows.filter((x) => Math.max(x.pts[0]?.s72 ?? 0, x.pts[1]?.s72 ?? 0) === peak72).length;
  const f = (v) => (v == null ? "–" : v < 0.05 ? "0" : v < 1 ? v.toFixed(1) : v.toFixed(v < 10 ? 1 : 0));
  el.innerHTML = `<h3>Resort snow · next 24 / 48 / 72 hours</h3><p class="afd-intro">NWS gridded snowfall forecast at each resort's mid-mountain and peak points, from now. Snow level is shown only during a period with forecast accumulating snow.</p><div class="model-table-wrap"><table class="model-table snow-table"><thead><tr><th>Resort</th><th>Mid mountain<small>24 / 48 / 72 h (in)</small></th><th>Peak<small>24 / 48 / 72 h (in)</small></th><th>Snow level<small>when snow is forecast</small></th><th>Avalanche</th></tr></thead><tbody>${rows
    .map((x) => {
      const top =
        peak72 >= 1 && leaders < rows.length && Math.max(x.pts[0]?.s72 ?? 0, x.pts[1]?.s72 ?? 0) === peak72;
      const lv = x.pts[1]?.level || x.pts[0]?.level,
        known = x.pts.some((p) => p?.s72 != null),
        snowing = x.pts.some((p) => (p?.s72 ?? 0) >= 0.05);
      const cell = (p) =>
        p
          ? `<span><b>${f(p.s24)}</b> / <b>${f(p.s48)}</b> / <b>${f(p.s72)}</b></span>`
          : "<span>unavailable</span>";
      return `<tr class="${top ? "flag" : ""}"><th>${escapeHTML(x.name)}${CAMS[x.name] ? `<a class="row-link" href="${siteBase()}webcams/#${CAMS[x.name]}" aria-label="${escapeHTML(x.name)} webcams">cams</a>` : ""}${top ? ' <span class="most">▲ most snow</span>' : ""}</th><td data-label="Mid 24/48/72h">${cell(x.pts[0])}</td><td data-label="Peak 24/48/72h">${x.pts[0] && x.pts[1] && x.pts[0].grid === x.pts[1].grid ? '<span class="same-grid">Same as mid<small>one NWS grid covers both</small></span>' : cell(x.pts[1])}</td><td data-label="Snow level"><span>${lv ? `${(Math.round(lv.ft / 100) * 100).toLocaleString()} ft<small>${new Date(lv.time).toLocaleString("en-US", { weekday: "short", hour: "numeric", timeZone: "America/Denver", timeZoneName: "short" })}</small>` : !known ? "Unavailable" : snowing ? "No snow-level data" : "No accumulating snow"}</span></td><td data-label="Avalanche"><a href="${uacURL(x.name)}" target="_blank" rel="noopener">UAC ${UAC[x.name] ? "Ogden" : "Salt Lake"} ↗</a></td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><p class="source">Snow totals under 0.05 in display as 0. Snow level is shown only with overlapping accumulating snow. NWS grid estimates (about 2.5 km) are not resort reports; closely spaced points can share a grid. Check the <a href="https://utahavalanchecenter.org/" target="_blank" rel="noopener">Utah Avalanche Center ↗</a> before heading into the backcountry.</p>`;
}

async function snowModelData(p) {
  const key = p.slice(0, 2).join(",");
  let e = snowModelCache.get(key);
  if (e && Date.now() - e.time < 30 * 60000) return e.promise;
  const promise = Promise.allSettled(
    SNOW_MODELS.map(async ([name, id]) => {
      const u = new URL("https://api.open-meteo.com/v1/forecast");
      Object.entries({
        latitude: p[0],
        longitude: p[1],
        daily: "snowfall_sum",
        precipitation_unit: "inch",
        timezone: "America/Denver",
        forecast_days: 16,
        models: id,
      }).forEach(([k, v]) => u.searchParams.set(k, v));
      const j = await getJSON(u.toString());
      const cm = j.daily_units?.snowfall_sum === "cm";
      return {
        name,
        time: j.daily.time,
        snow: j.daily.snowfall_sum.map((v) => (Number.isFinite(v) ? (cm ? v / 2.54 : v) : null)),
      };
    }),
  );
  snowModelCache.set(key, { time: Date.now(), promise });
  return promise;
}

async function loadSnowModels() {
  const el = document.querySelector("#snow-models");
  if (!el) return;
  const resorts = utah.slice(2),
    r = resorts[snowModelResort] || resorts[0],
    p = r.p[1] || r.p[0];
  try {
    const res = (await snowModelData(p))
      .filter((x) => x.status === "fulfilled" && x.value.snow.some(Number.isFinite))
      .map((x) => x.value);
    if (!el.isConnected) return;
    if (!res.length) throw Error("none");
    const days = res.reduce((a, b) => (b.time.length > a.length ? b.time : a), []);
    const series = res.map((m) => {
      let t = 0,
        end = -1;
      m.snow.forEach((v, i) => {
        if (Number.isFinite(v)) end = i;
      });
      return {
        name: m.name,
        values: days.map((d, i) => (i <= end && Number.isFinite(m.snow[i]) ? (t += m.snow[i]) : null)),
        end,
      };
    });
    const labels = days.map((d) =>
      new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
    );
    const tot = (sr, n) => (sr.end >= n - 1 ? sr.values[n - 1] : null),
      f = (v) => (v == null ? "–" : v < 0.05 ? "0" : v.toFixed(1));
    el.innerHTML = `<h3>Long-range snowfall models · ${escapeHTML(r.name)} peak</h3><p class="afd-intro">Accumulated snowfall from four global models at ${escapeHTML(p[2])}. GFS runs 16 days; ECMWF, AIFS (ECMWF's AI model) and GEM (Environment Canada) run about 10. Use for trend and agreement, not exact totals.</p><div class="day-pills" aria-label="Resort">${resorts.map((x, i) => `<button data-snow-resort="${i}" class="${i === snowModelResort ? "active" : ""}">${escapeHTML(x.name)}</button>`).join("")}</div>${makePlot(
      series.map((x) => ({ name: x.name, values: x.values })),
      labels,
      " in",
      "line",
      0,
    )}<div class="model-table-wrap"><table class="model-table"><thead><tr><th>Model</th><th>3 days</th><th>7 days</th><th>10 days</th><th>16 days</th></tr></thead><tbody>${series.map((x) => `<tr><th>${escapeHTML(x.name)}</th><td data-label="3 days">${f(tot(x, 3))} in</td><td data-label="7 days">${f(tot(x, 7))} in</td><td data-label="10 days">${f(tot(x, 10))} in</td><td data-label="16 days">${tot(x, 16) == null ? "–" : f(tot(x, 16)) + " in"}</td></tr>`).join("")}</tbody></table></div><p class="source">Model snowfall is estimated depth from Open-Meteo; models that don't reach a horizon show –. ${SNOW_MODELS.length - res.length ? `${SNOW_MODELS.length - res.length} model(s) unavailable right now. ` : ""}Data: <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo ↗</a>.</p>`;
    el.querySelectorAll("[data-snow-resort]").forEach(
      (b) =>
        (b.onclick = () => {
          snowModelResort = +b.dataset.snowResort;
          el.innerHTML = '<div class="state">Loading long-range snowfall models…</div>';
          loadSnowModels();
        }),
    );
  } catch {
    if (el.isConnected)
      el.innerHTML =
        '<h3>Long-range snowfall models</h3><div class="error">Model snowfall is temporarily unavailable.</div>';
  }
}

/* Hourly temperature line, precipitation-chance bars and wind labels.
   width: the space available in px. Without it the chart keeps its old fixed width (760 / 1500 px).
   On narrow screens the 48-hour view is twice the available width and scrolls sideways. */
function hourlyChart(periods, zone, hours, width) {
  const hrs = periods.filter((q) => Date.parse(q.endTime) > Date.now()).slice(0, hours);
  if (hrs.length < 6) return '<p class="muted">Hourly forecast unavailable.</p>';
  const avail = Math.max(280, Math.round((width || (hours === 48 ? 1500 : 760)) - 4));
  const w = hours === 48 && avail < 700 ? avail * 2 : avail,
    h = 236,
    left = 38,
    right = 38,
    top = 20,
    plotH = 120,
    n = hrs.length,
    step = (w - left - right) / n,
    x = (i) => left + step * (i + 0.5);
  const every = (px) => [1, 2, 3, 4, 6, 12].find((k) => k * step >= px) || 12;
  const tickEvery = every(42),
    windEvery = every(54);
  const temps = hrs.map((q) => q.temperature),
    lo = Math.floor(Math.min(...temps) - 3),
    hi = Math.ceil(Math.max(...temps) + 3),
    y = (v) => top + ((hi - v) / (hi - lo)) * plotH;
  const fmtH = (d) =>
    new Date(d).toLocaleString("en-US", { hour: "numeric", timeZone: zone }).replace(" ", "").toLowerCase();
  const day = (d) => new Date(d).toLocaleDateString("en-US", { weekday: "short", timeZone: zone });
  let bars = "",
    ticks = "",
    winds = "",
    snow = "",
    days = "",
    grid = "";
  [hi - 3, Math.round((hi + lo) / 2), lo + 3].forEach((v) => {
    grid += `<line x1="${left}" y1="${y(v).toFixed(1)}" x2="${w - right}" y2="${y(v).toFixed(1)}" class="grid-line"/><text x="${left - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="axis-label">${v}°</text>`;
  });
  grid += `<text x="${w - right + 4}" y="${top + 4}" class="axis-label">100%</text><text x="${w - right + 4}" y="${top + plotH}" class="axis-label">0%</text>`;
  hrs.forEach((q, i) => {
    const pop = q.probabilityOfPrecipitation?.value ?? 0,
      bh = (pop / 100) * plotH;
    bars += `<rect x="${(x(i) - step * 0.42).toFixed(1)}" y="${(top + plotH - bh).toFixed(1)}" width="${(step * 0.84).toFixed(1)}" height="${bh.toFixed(1)}" fill="url(#popfill)"><title>${escapeHTML(fmtH(q.startTime))}: ${q.temperature}° · ${pop}% · ${escapeHTML(q.shortForecast)}</title></rect>`;
    const hr = +new Date(q.startTime).toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: zone,
    });
    if (i % tickEvery === 0)
      ticks += `<text x="${x(i)}" y="${top + plotH + 16}" text-anchor="middle" class="axis-label">${fmtH(q.startTime)}</text>`;
    if (i % windEvery === 0)
      winds += `<text x="${x(i)}" y="${top + plotH + 34}" text-anchor="middle" class="axis-label wind-lbl">${escapeHTML(q.windDirection || "")} ${windNum(q.windSpeed) ?? ""}</text>`;
    if (/snow|flurr|sleet|freezing/i.test(q.shortForecast))
      snow += `<text x="${x(i)}" y="${top + plotH + 52}" text-anchor="middle" class="snow-lbl">❄</text>`;
    else if (/rain|shower|drizzle|thunder/i.test(q.shortForecast) && pop >= 30)
      snow += `<text x="${x(i)}" y="${top + plotH + 52}" text-anchor="middle" class="rain-lbl">•</text>`;
    if (hr === 0 || i === 0)
      days += `<text x="${x(i) - step * 0.4}" y="${top - 6}" class="axis-label day-lbl">${day(q.startTime)}</text>${i ? `<line x1="${x(i) - step / 2}" y1="${top}" x2="${x(i) - step / 2}" y2="${top + plotH}" stroke="#35586a" stroke-dasharray="3 3"/>` : ""}`;
  });
  const path = hrs
    .map((q, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(q.temperature).toFixed(1)}`)
    .join(" ");
  const maxI = temps.indexOf(Math.max(...temps)),
    minI = temps.indexOf(Math.min(...temps));
  return `<div class="chart-scroll"><svg class="forecast-chart hourly-svg" width="${w}" height="${h}" style="width:${w}px;max-width:none" viewBox="0 0 ${w} ${h}" role="img" aria-label="Hourly temperature, precipitation chance and wind for the next ${n} hours"><defs><pattern id="popfill" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#2f6f8c"/><line x1="0" y1="0" x2="0" y2="6" stroke="#7cc6da" stroke-width="3"/></pattern></defs>${grid}<line x1="${left}" y1="${top + plotH}" x2="${w - right}" y2="${top + plotH}" stroke="#3d6273"/>${days}${bars}<path d="${path}" fill="none" stroke="#eaf6f8" stroke-width="2.5"/><text x="${x(maxI)}" y="${y(temps[maxI]) - 7}" text-anchor="middle" class="temp-lbl">${temps[maxI]}°</text><text x="${x(minI)}" y="${y(temps[minI]) + 15}" text-anchor="middle" class="temp-lbl">${temps[minI]}°</text>${ticks}${winds}${snow}<text x="2" y="${top + plotH + 34}" class="axis-label">mph</text></svg></div><div class="chart-legend hourly-legend"><span><svg width="26" height="10"><line x1="0" y1="5" x2="26" y2="5" stroke="#eaf6f8" stroke-width="2.5"/></svg>Temperature (left scale)</span><span><svg width="14" height="12"><rect width="14" height="12" fill="url(#popfill)"/></svg>Chance of precipitation (right scale)</span><span>❄ snow or ice · • rain</span></div>`;
}

/* Width available for a chart inside a card, in px. */
function chartWidth(el) {
  const cs = getComputedStyle(el);
  return el.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
}
/* Re-run draw() when the element's width changes (rotation, window resize). */
function redrawOnResize(el, draw) {
  if (!("ResizeObserver" in window)) return;
  el._redrawObserver?.disconnect();
  let last = el.clientWidth,
    timer = 0;
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) return ro.disconnect();
    if (Math.abs(el.clientWidth - last) < 24) return;
    last = el.clientWidth;
    clearTimeout(timer);
    timer = setTimeout(draw, 150);
  });
  ro.observe(el);
  el._redrawObserver = ro;
}

function windNum(s) {
  const m = String(s || "").match(/\d+/g);
  return m ? Math.max(...m.map(Number)) : null;
}

function forecastIcon(q, size) {
  if (!q?.icon) return "";
  let u;
  try {
    u = new URL(q.icon);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" || u.hostname !== "api.weather.gov" || !u.pathname.startsWith("/icons/"))
    return "";
  return `<img class="weather-icon ${size}" src="${escapeHTML(u.href)}" alt="" loading="lazy" width="${size === "hero" ? 86 : 48}" height="${size === "hero" ? 86 : 48}">`;
}

async function alertsFor(p) {
  const key = p.slice(0, 2).join(",");
  let e = alertCache.get(key);
  if (e && Date.now() - e.time < 5 * 60000) return e.promise;
  const promise = getJSON(`https://api.weather.gov/alerts/active?point=${key}`).then((j) =>
    (j.features || []).map((f) => f.properties).filter((a) => a && a.status !== "Test"),
  );
  alertCache.set(key, { time: Date.now(), promise });
  promise.catch(() => alertCache.delete(key));
  return promise;
}

function alertKind(a) {
  const e = a.event || "";
  return /Warning/i.test(e) ? "warning" : /Watch/i.test(e) ? "watch" : "advisory";
}

function sortAlerts(list) {
  const seen = new Set();
  return list
    .filter((a) => {
      const k = a.id || a.event + a.onset;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort(
      (a, b) =>
        ({ warning: 0, watch: 1, advisory: 2 })[alertKind(a)] -
          { warning: 0, watch: 1, advisory: 2 }[alertKind(b)] ||
        (SEV_RANK[a.severity] ?? 4) - (SEV_RANK[b.severity] ?? 4),
    );
}

function alertTime(a, section) {
  const end = a.ends || a.expires;
  return end
    ? `until ${regionTime(end, section, { weekday: "short", hour: "numeric", minute: "2-digit" })}`
    : "";
}

function alertHTML(list, section) {
  if (!list.length) return "";
  return `<div class="alerts" role="region" aria-label="Active NWS alerts">${list.map((a) => `<details class="alert ${alertKind(a)}"><summary><span class="alert-icon" aria-hidden="true">${alertKind(a) === "warning" ? "▲" : alertKind(a) === "watch" ? "◆" : "●"}</span><b>${escapeHTML(a.event)}</b> <span class="alert-when">${escapeHTML(alertTime(a, section))}</span></summary><p><b>${escapeHTML(a.headline || "")}</b></p><pre class="alert-text">${escapeHTML((a.description || "").trim())}${a.instruction ? "\n\n" + escapeHTML(a.instruction.trim()) : ""}</pre><div class="source">${escapeHTML(a.senderName || "National Weather Service")}${a.areaDesc ? " · " + escapeHTML(a.areaDesc) : ""}</div></details>`).join("")}</div>`;
}

function cToF(c) {
  return Number.isFinite(c) ? Math.round((c * 9) / 5 + 32) : null;
}

function kmhToMph(v) {
  return Number.isFinite(v) ? Math.round(v * 0.621371) : null;
}

function compass(d) {
  return Number.isFinite(d)
    ? ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][
        Math.round(d / 22.5) % 16
      ]
    : "";
}

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function regionZone(section) {
  return section === "ne" ? "America/New_York" : "America/Denver";
}

function regionTime(value, section, options = {}) {
  return new Date(value).toLocaleString("en-US", {
    ...options,
    timeZone: regionZone(section),
    timeZoneName: "short",
  });
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
