const CPC = "https://www.cpc.ncep.noaa.gov/products/predictions/";
/* Refreshed every 6 hours by .github/workflows/update-long-range.yml on the data branch. */
const LONG_RANGE_URL = "https://raw.githubusercontent.com/bg197550/weather-window/data/long-range.json";
const outlooks = [
  ["6–10 days", "610day/", "610temp.new.gif", "610prcp.new.gif", "Updated daily"],
  ["8–14 days", "814day/", "814temp.new.gif", "814prcp.new.gif", "Updated daily"],
  ["Weeks 3–4", "WK34/", "gifs/WK34temp.gif", "gifs/WK34prcp.gif", "Updated Fridays"],
];

let tab = "long",
  field = "temp",
  selection = { utah: 0, ne: 0 },
  view = { utah: "overview", ne: "overview" },
  afdCache = new Map(),
  modelCache = new Map(),
  modelElevation = { utah: 0, ne: 0 },
  longRegion = "utah",
  longPeriod = 0,
  longData = null,
  longDataTime = 0,
  modelMetric = { utah: "high", ne: "high" },
  modelDay = { utah: 0, ne: 0 },
  profileResort = 0,
  profileMetric = "temp",
  profileDay = 0,
  radarRegion = "utah",
  radarStation = { utah: "KMTX", ne: "KBOX" },
  radarMode = "loop",
  radarRefresh = Date.now();
const content = document.querySelector("#content");
document.querySelector("#today").textContent = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Denver",
}).format(new Date());
/* Region shown by the current view; kept in sync with the shared nav (assets/nav.js). */
function viewRegion() {
  if (tab === "utah" || tab === "ne") return tab;
  if (tab === "radar") return RADAR_PRESETS.utah.some((x) => x.id === radarPreset) ? "utah" : "ne";
  if (tab === "precip") return precipRegion;
  return longRegion;
}
function render() {
  WW.setRegion(viewRegion(), true);
  WW.setActive(tab === "utah" || tab === "ne" ? "forecast" : tab);
  rememberPlace();
  if (tab !== "radar") destroyRadar();
  if (tab !== "precip" && precipMap) {
    try {
      precipMap.remove();
    } catch {}
    precipMap = null;
    precipOverlay = null;
  }
  if (tab === "long") longView();
  else if (tab === "radar") radarView();
  else if (tab === "precip") precipView();
  else forecastView();
  syncHash();
  updateAlertBadges();
  addNearbyButton();
}
/* The last place viewed in each region, so Forecast links from other pages land there. */
function rememberPlace() {
  if (tab !== "utah" && tab !== "ne") return;
  try {
    localStorage.setItem("ww:place:" + tab, String(selection[tab]));
  } catch {}
}
function recallPlace(region) {
  try {
    const i = +localStorage.getItem("ww:place:" + region);
    const list = region === "utah" ? utah : ne;
    return Number.isInteger(i) && i >= 0 && i < list.length ? i : 0;
  } catch {
    return 0;
  }
}
addEventListener("ww-region", (e) => {
  const r = e.detail;
  if (tab === "utah" || tab === "ne") tab = r;
  else if (tab === "radar") {
    radarPreset = RADAR_PRESETS[r][0].id;
    radarStation[r] = r === "utah" ? "KMTX" : "KBOX";
  } else if (tab === "precip") precipRegion = r;
  else longRegion = r;
  render();
});
function longView() {
  content.innerHTML = `<div class="toolbar"><div><h2>Long range outlook</h2><p class="sub">NOAA Climate Prediction Center · probabilities relative to normal</p></div><div class="seg" aria-label="Outlook variable"><button data-field="temp" class="${field === "temp" ? "active" : ""}">Temperature</button><button data-field="prcp" class="${field === "prcp" ? "active" : ""}">Precipitation</button></div></div><div class="outlooks">${outlooks.map(([title, dir, temp, prcp, update]) => `<article class="card outlook"><div class="outlook-head"><h3>${title}</h3><span class="muted">${update}</span></div><a href="${CPC + dir}" target="_blank" rel="noopener"><img class="map" alt="NOAA ${title} ${field === "temp" ? "temperature" : "precipitation"} probability outlook" src="${CPC + dir + (field === "temp" ? temp : prcp)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="state" hidden>Map unavailable. Open NOAA outlook ↗</span></a><div class="outlook-foot"><span class="muted">${field === "temp" ? "Temperature" : "Precipitation"} probability</span><a href="${CPC + dir}" target="_blank" rel="noopener">NOAA outlook ↗</a></div></article>`).join("")}</div><p class="note">Outlook colors show which category is favored, not a specific temperature or snowfall amount. “Equal chances” means no category is clearly favored. The weeks 3–4 precipitation outlook is experimental.</p><section class="long-brief"><div class="toolbar"><div><h2>What matters in Utah and New England</h2><p class="sub">CPC regional guidance and independent ensemble model scenarios</p></div><div class="seg" aria-label="Long range region"><button data-long-region="utah" class="${longRegion === "utah" ? "active" : ""}">Utah</button><button data-long-region="ne" class="${longRegion === "ne" ? "active" : ""}">New England</button></div></div><div id="long-analysis" class="state">Loading long range analysis…</div></section>`;
  content.querySelectorAll("[data-field]").forEach(
    (b) =>
      (b.onclick = () => {
        field = b.dataset.field;
        longView();
      }),
  );
  content.querySelectorAll("[data-long-region]").forEach(
    (b) =>
      (b.onclick = () => {
        longRegion = b.dataset.longRegion;
        WW.setRegion(longRegion, true);
        longView();
      }),
  );
  loadLongRange();
}
async function loadLongRange() {
  const el = document.querySelector("#long-analysis");
  try {
    if (!longData || Date.now() - longDataTime > 600000) {
      let u = LONG_RANGE_URL + "?t=" + Math.floor(Date.now() / 600000);
      try {
        longData = await getJSON(u);
      } catch {
        longData = await getJSON("data/long-range.json?t=" + Math.floor(Date.now() / 600000));
      }
      longDataTime = Date.now();
    }
    if (!el || !el.isConnected) return;
    let d = longData;
    el.className = "";
    renderLongBrief(el, d);
  } catch (err) {
    if (el && el.isConnected) {
      el.className = "error";
      el.innerHTML =
        "The long range briefing is temporarily unavailable. The NOAA maps and source links above remain available.";
    }
  }
}
function longModelRead(m, period) {
  if (m.length < 2) return "There are not enough model forecasts to compare this period.";
  let warm = m.reduce((a, b) => (b.values.temp > a.values.temp ? b : a)),
    cool = m.reduce((a, b) => (b.values.temp < a.values.temp ? b : a)),
    wet = m.reduce((a, b) => (b.values.precip > a.values.precip ? b : a)),
    dry = m.reduce((a, b) => (b.values.precip < a.values.precip ? b : a)),
    t = warm.values.temp - cool.values.temp,
    p = wet.values.precip - dry.values.precip,
    threshold = period === "Weeks 3–4" ? 1 : 0.5;
  let parts = [];
  parts.push(
    t >= 3
      ? `${warm.name} is warmest and ${cool.name} coolest, ${t.toFixed(1)}°F apart in period-average temperature`
      : `Temperature means are fairly close (${t.toFixed(1)}°F spread)`,
  );
  parts.push(
    p >= threshold
      ? `${wet.name} is wettest and ${dry.name} driest, ${p.toFixed(2)} in apart in period-total precipitation`
      : `Precipitation totals differ by ${p.toFixed(2)} in`,
  );
  if (period === "Weeks 3–4")
    parts.push(
      "ECMWF ENS has no data for the full two-week window; compare GEFS and GEM with low confidence",
    );
  return parts.join(". ") + ".";
}
function signalKind(s, type) {
  if (!s) return "unknown";
  if (/equal chances|near normal/i.test(s)) return "neutral";
  if (type === "temp")
    return /above.normal|warmer/i.test(s) ? "warm" : /below.normal|cooler/i.test(s) ? "cool" : "neutral";
  return /above.normal|wetter|active pattern/i.test(s)
    ? "wet"
    : /below.normal|drier/i.test(s)
      ? "dry"
      : "neutral";
}
function signalName(k) {
  return {
    warm: "Warmer",
    cool: "Cooler",
    wet: "Wetter",
    dry: "Drier",
    neutral: "Near normal / mixed",
    unknown: "No clear signal",
  }[k];
}
function renderLongBrief(el, d) {
  const r = longRegion,
    p = d.periods[longPeriod],
    g = d.guidance[r][longPeriod],
    m = g.models.filter((x) => x.values),
    age = Date.now() - Date.parse(d.generatedAt),
    stale = age > 12 * 3600000;
  el.innerHTML = `${stale ? `<div class="stale-flag" role="status">▲ <b>Stale data:</b> the long range briefing was last updated ${escapeHTML(ago(Date.parse(d.generatedAt)))}. The automatic refresh may be failing; the NOAA maps above are always current.</div>` : ""}${d.warnings?.length ? `<div class="stale-flag" role="status">▲ Some parts could not be refreshed and show earlier data: ${escapeHTML(d.warnings.join("; "))}</div>` : ""}<p class="muted">CPC outlook categories and model means are different measures. Select a region and horizon for the supporting text. Data checked ${new Date(d.generatedAt).toLocaleString()}.</p><div class="signal-scroll"><div class="signal-matrix" role="group" aria-label="Long range signals"><div class="signal-head">Region</div>${d.periods.map((x) => `<div class="signal-head">${escapeHTML(x.name)}</div>`).join("")}${[
    "utah",
    "ne",
  ]
    .map(
      (region) =>
        `<div class="signal-region">${region === "utah" ? "Utah" : "New England"}</div>${d.periods
          .map((x, i) => {
            const t = signalKind(x[region].temperature, "temp"),
              pr = signalKind(x[region].precipitation, "precip");
            return `<button class="signal-cell ${r === region && longPeriod === i ? "selected" : ""}" data-signal-region="${region}" data-signal-period="${i}" aria-pressed="${r === region && longPeriod === i}"><span class="signal-chip ${t}">Temp: ${signalName(t)}</span><span class="signal-chip ${pr}">Precip: ${signalName(pr)}</span></button>`;
          })
          .join("")}`,
    )
    .join(
      "",
    )}</div></div><article class="card lr-focus"><div class="lr-focus-head"><div><h3>${r === "utah" ? "Utah · Park City" : "New England · Boston"} · ${escapeHTML(p.name)}</h3><p class="muted">CPC broad-area discussion · model means at the named point</p></div><a href="${p.source}" target="_blank" rel="noopener">Full CPC discussion ↗</a></div><div class="lr-focus-grid"><section><h4>CPC regional context</h4>${p[r].temperature ? `<p><b>Temperature:</b> ${escapeHTML(p[r].temperature)}</p>` : ""}${p[r].precipitation ? `<p><b>Precipitation:</b> ${escapeHTML(p[r].precipitation)}</p>` : ""}<p class="source">Signal chips are a qualitative reading of broad regional text. Check the official maps above for exact boundaries and probabilities.</p></section><section><h4>Where models differ</h4><p>${escapeHTML(longModelRead(m, p.name))}</p><div class="lr-models">${g.models.map((x) => `<div><b>${escapeHTML(x.name)}</b><span>${x.values ? `${x.values.temp.toFixed(1)}°F period mean · ${x.values.precip.toFixed(2)} in total precipitation` : "No data at this lead time"}</span></div>`).join("")}</div></section></div></article>${r === "ne" && longPeriod === 2 && d.modelNote ? `<p class="note"><strong>CPC model note:</strong> ${escapeHTML(d.modelNote)}</p>` : ""}<p class="source">Model windows approximately match CPC horizons. Means are not departures from normal or the official NOAA outlook. Week 3–4 differences are especially uncertain. Model data via <a href="https://open-meteo.com/en/docs/ensemble-mean-api" target="_blank" rel="noopener">Open-Meteo ↗</a>.</p>`;
  el.querySelectorAll("[data-signal-region]").forEach(
    (b) =>
      (b.onclick = () => {
        longRegion = b.dataset.signalRegion;
        WW.setRegion(longRegion, true);
        longPeriod = +b.dataset.signalPeriod;
        renderLongBrief(el, d);
      }),
  );
}
const SURF_BASE = "https://bg197550.github.io/surf-window/";
const SURF_LINK = {
  Boston: ["overview", "New England surf"],
  "NH Seacoast": ["hampton", "North Hampton surf cam"],
  "Portsmouth, NH": ["hampton", "Nearby North Hampton surf cam"],
  "Newport, RI": ["firstbeach", "First Beach surf cam"],
  "Portland, ME": ["kennebunk", "Kennebunk surf cam"],
};
function surfLink(name) {
  const x = SURF_LINK[name];
  return x ? `<a class="xlink" href="${SURF_BASE}#${x[0]}">≋ ${escapeHTML(x[1])} ›</a>` : "";
}
const FORECAST_VIEWS = [
  ["overview", "Overview"],
  ["discussion", "Detailed forecast"],
  ["afd", "Forecast discussion"],
  ["models", "Model comparison"],
  ["mountain", "Mountain profile", "utah"],
];
const VIEW_NOTES = {
  overview: "Now, next 24 hours and the 7-day forecast",
  discussion: "Every NWS forecast period in full; tap a period for its hours",
  afd: "The full discussion from the responsible NWS office",
  models: "GFS, ECMWF and GEM scenarios for the next 10 days",
  mountain: "Mid mountain and peak conditions side by side",
};
/* Links to the same place elsewhere on the site: webcams, snow report, avalanche forecast, surf. */
function placeLinks(place, section) {
  const lbl = (long, short) => `<span class="lg">${long}</span><span class="sm">${short}</span>`;
  const links = [];
  if (CAMS[place.name])
    links.push(`<a class="xlink" href="webcams/#${CAMS[place.name]}">▣ ${lbl("Webcams", "Cams")} ›</a>`);
  if (section === "utah" && place.p.length > 1) {
    links.push(`<a class="xlink" href="snow/">❄ ${lbl("Snow report", "Snow")} ›</a>`);
    links.push(
      `<a class="xlink" href="${uacURL(place.name)}" target="_blank" rel="noopener">${lbl("Avalanche forecast", "Avalanche")} ↗</a>`,
    );
  }
  if (section === "ne") links.push(surfLink(place.name));
  return links.filter(Boolean).join("");
}
function placeOptions(section, selected, mode) {
  const group = (sec, label, list, offset) =>
    `<optgroup label="${label}">${list
      .map(
        (p, i) =>
          `<option value="${sec}:${i + offset}" ${sec === section && i + offset === selected ? "selected" : ""}>${escapeHTML(p.name)}</option>`,
      )
      .join("")}</optgroup>`;
  if (mode === "mountain") return group("utah", "Utah resorts", utah.slice(2), 2);
  return group("utah", "Utah", utah, 0) + group("ne", "New England", ne, 0);
}
function forecastView() {
  const section = tab,
    mode = view[section],
    places = section === "utah" ? (mode === "mountain" ? utah.slice(2) : utah) : ne,
    selected = mode === "mountain" ? profileResort : selection[section],
    place = places[selected],
    absIndex = mode === "mountain" ? selected + 2 : selected,
    views = FORECAST_VIEWS.filter((v) => !v[2] || v[2] === section);
  const body =
    mode === "snow"
      ? '<article class="card afd-card" id="resort-snow"><div class="state">Loading NWS snow grids for all resorts…</div></article><article class="card afd-card" id="snow-models"><div class="state">Loading long-range snowfall models…</div></article>'
      : mode === "afd"
        ? '<article class="card afd-card" id="area-discussion"><div class="state">Loading full NWS Area Forecast Discussion…</div></article>'
        : mode === "models"
          ? '<article class="card afd-card" id="model-comparison"><div class="state">Loading model guidance…</div></article>'
          : mode === "mountain"
            ? '<article class="card afd-card" id="mountain-profile"><div class="state">Loading mountain forecast grids…</div></article>'
            : mode === "discussion"
              ? '<div class="elevations discussion-mode" id="discussion"><div class="state">Loading NWS forecast…</div></div>'
              : '<div class="ov" id="ov"><div class="state">Loading NWS forecast…</div></div>';
  content.innerHTML = `<nav class="place-pills" aria-label="${section === "utah" ? "Utah" : "New England"} locations">${places
    .map(
      (p, i) =>
        `<button type="button" class="location" data-place="${i}" aria-current="${i === selected ? "true" : "false"}">${escapeHTML(p.name)}</button>`,
    )
    .join(
      "",
    )}</nav><div class="fc-head"><div class="fc-title"><h2 class="fc-name">${escapeHTML(place.name)}</h2><label class="place-picker"><span class="sr-only">Forecast location</span><select id="place-select">${placeOptions(section, absIndex, mode)}</select></label><p class="fc-sub">${escapeHTML(VIEW_NOTES[mode] || "")}</p></div><div class="fc-actions"><button type="button" class="icon-btn nearby" id="locate" title="Closest forecast to you" aria-label="Show the closest forecast to you">⌖</button><button type="button" class="icon-btn" id="refresh" title="Refresh" aria-label="Refresh forecast">↻</button></div></div><div class="place-links">${placeLinks(place, section)}</div><div id="alert-banner"></div>${mode === "overview" ? "" : `<button type="button" class="back-overview" data-view="overview">‹ ${escapeHTML(place.name)} overview</button>`}<div class="forecast-tabs" role="tablist" aria-label="${escapeHTML(place.name)} forecast views">${views
    .map(
      ([k, n]) =>
        `<button type="button" role="tab" data-view="${k}" aria-selected="${mode === k}">${n}</button>`,
    )
    .join("")}</div>${body}${
    mode === "overview"
      ? `<nav class="more-views" aria-label="More for ${escapeHTML(place.name)}"><h3>More for ${escapeHTML(place.name)}</h3>${views
          .slice(1)
          .map(
            ([k, n]) =>
              `<button type="button" data-view="${k}"><span><b>${n}</b><small>${escapeHTML(VIEW_NOTES[k])}</small></span><i aria-hidden="true">›</i></button>`,
          )
          .join("")}</nav>`
      : ""
  }${mode === "overview" || mode === "discussion" ? `<p class="source">NWS forecasts use a grid of roughly 2.5 km. When two points fall in the same grid square they share one forecast and are shown once. Point elevations are approximate; each card shows the NWS grid elevation.</p>` : ""}`;
  content.querySelectorAll("[data-place]").forEach(
    (b) =>
      (b.onclick = () => {
        if (mode === "mountain") profileResort = +b.dataset.place;
        else {
          selection[section] = +b.dataset.place;
          if (mode === "snow") view[section] = "overview";
        }
        forecastView();
        rememberPlace();
      }),
  );
  content.querySelector("#place-select").onchange = (e) => {
    const [sec, i] = e.target.value.split(":");
    if (mode === "mountain") profileResort = +i - 2;
    else {
      selection[sec] = +i;
      if (sec !== section && (view[sec] === "mountain" || view[sec] === "snow")) view[sec] = "overview";
      tab = sec;
    }
    render();
  };
  content.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        const v = b.dataset.view;
        if (v === "mountain" && mode !== "mountain") {
          if (selection.utah < 2) selection.utah = 2;
          profileResort = selection.utah - 2;
        }
        if (mode === "mountain" && v !== "mountain") selection.utah = profileResort + 2;
        view[section] = v;
        forecastView();
        if (!b.closest(".forecast-tabs")) content.scrollIntoView({ block: "start" });
      }),
  );
  content.querySelector("#locate").onclick = () => showClosestForecast(false);
  if (!navigator.geolocation) content.querySelector("#locate").hidden = true;
  content.querySelector("#refresh").onclick = () => {
    clearCaches();
    lastLoad = Date.now();
    stampHeader();
    refreshAllAlerts();
    forecastView();
  };
  syncHash();
  updateAlertBadges();
  if (mode !== "snow") loadAlertBanner(place);
  if (mode === "snow") {
    loadResortSnow();
    loadSnowModels();
  } else if (mode === "afd") loadAFD(place.p[0]);
  else if (mode === "models") loadModels(place, section);
  else if (mode === "mountain") loadMountain(place);
  else if (mode === "discussion") loadDiscussion(place, section);
  else loadOverview(place, section);
}

/* A place's points, peak first, with points that share an NWS grid square merged into one. */
async function uniquePoints(place) {
  const order = place.p.map((p, i) => ({ p, i })).reverse();
  const metas = await Promise.all(order.map((x) => pointMeta(x.p).catch(() => null)));
  const out = [];
  order.forEach((x, k) => {
    const m = metas[k],
      key = m ? `${m.gridId}/${m.gridX},${m.gridY}` : "p" + k,
      role = x.p[2].split(" · ")[0];
    const dup = out.find((o) => o.key === key);
    if (dup) {
      dup.merged.push(x);
      dup.label = `${dup.role} & ${role.toLowerCase()}`;
      return;
    }
    out.push({ ...x, key, role, label: role, merged: [x] });
  });
  return out;
}
function pointElevFt(p) {
  const m = p[2].match(/~([\d,]+)\s*ft/);
  return m ? +m[1].replace(/,/g, "") : null;
}
function pointDetail(pt, gridFt) {
  const where = (p) => (p[2].includes(" · ") ? p[2].split(" · ")[1] : "");
  const note = (ft) => {
    const diff = ft != null && gridFt != null ? ft - gridFt : 0;
    return Math.abs(diff) >= 500
      ? `<div class="grid-note">The NWS grid here averages about ${(Math.round(Math.abs(diff) / 100) * 100).toLocaleString()} ft ${diff > 0 ? "below" : "above"} ${pt.merged.length > 1 ? "the peak" : "this point"}, so ${diff > 0 ? "expect it colder and windier up top than shown" : "conditions at the point may be milder than shown"}.</div>`
      : "";
  };
  if (pt.merged.length > 1) {
    const parts = pt.merged.map((x, k) => {
      const role = x.p[2].split(" · ")[0];
      return `${k ? role.toLowerCase() : role} (${escapeHTML(where(x.p))})`;
    });
    return `<div class="muted">${parts.join(" and ")} fall in one NWS grid square${gridFt != null ? ` averaging ${gridFt.toLocaleString()} ft` : ""}, so they share one forecast.</div>${note(Math.max(...pt.merged.map((x) => pointElevFt(x.p) ?? -1)))}`;
  }
  return `<div class="muted">Selected point${where(pt.p) ? " · " + escapeHTML(where(pt.p)) : ""}${gridFt != null ? ` · NWS grid ${gridFt.toLocaleString()} ft` : ""}</div>${note(pointElevFt(pt.p))}`;
}
async function pointForecast(p) {
  const key = p.slice(0, 2).join(",");
  let data = cache.get(key);
  if (!data?.forecast) {
    const point = await pointMeta(p);
    const fc = await getJSON(point.forecast);
    data = { ...(cache.get(key) || {}), point, forecast: fc.properties, url: point.forecast };
    cache.set(key, data);
  }
  return data;
}
function gridFeet(data) {
  return data.forecast.elevation?.value != null ? Math.round(data.forecast.elevation.value * 3.28084) : null;
}
function nwsLink(p) {
  return `https://forecast.weather.gov/MapClick.php?lat=${p[0]}&lon=${p[1]}`;
}
function issuedLine(data, p, section) {
  return `<div class="source">NWS forecast issued ${regionTime(data.forecast.updateTime, section, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · <a href="${nwsLink(p)}" target="_blank" rel="noopener">Full NWS forecast ↗</a></div>`;
}
function pointError(label, p) {
  return `<h3>${escapeHTML(label)}</h3><div class="error">NWS forecast is temporarily unavailable.</div><a href="${nwsLink(p)}" target="_blank" rel="noopener">Open forecast at weather.gov ↗</a>`;
}

let daysPick = 0;
/* NWS periods alternate day and night; group them into one tile per day with its high and low. */
function forecastDays(periods) {
  const out = [];
  for (const q of periods) {
    const last = out[out.length - 1];
    if (!q.isDaytime && last && last.day && !last.night) last.night = q;
    else out.push(q.isDaytime ? { day: q, night: null } : { day: null, night: q });
  }
  return out.slice(0, 7);
}
/* "Today" / "Tonight" for the first tile, then the weekday (NWS sometimes names days after holidays). */
function dayName(q, first) {
  if (first) return q.isDaytime ? "Today" : "Tonight";
  return new Date(q.startTime).toLocaleDateString("en-US", { weekday: "short", timeZone: regionZone(tab) });
}
function daysStrip(periods) {
  return `<div class="days-strip">${forecastDays(periods)
    .map((d, i) => {
      const lead = d.day || d.night,
        pops = [d.day, d.night].map((q) => q?.probabilityOfPrecipitation?.value || 0),
        pop = Math.max(...pops),
        text =
          lead.shortForecast +
          (d.day && d.night && d.night.shortForecast !== d.day.shortForecast
            ? `, then ${d.night.shortForecast.toLowerCase()} at night`
            : "");
      return `<div class="day-tile" title="${escapeHTML(text)}"><b class="day-name">${escapeHTML(dayName(lead, i === 0))}</b>${forecastIcon(lead, "small")}<span class="day-text">${escapeHTML(lead.shortForecast)}</span><span class="day-temps">${d.day ? `<strong>${d.day.temperature}°</strong>` : ""}${d.night ? `<span class="lo">${d.night.temperature}°</span>` : ""}</span><span class="day-pop">${pop ? `${pop}% precip` : ""}</span></div>`;
    })
    .join("")}</div>`;
}
async function loadOverview(place, section) {
  const el = document.querySelector("#ov");
  let pts;
  try {
    pts = await uniquePoints(place);
  } catch {
    pts = place.p
      .map((p, i) => ({ p, i }))
      .reverse()
      .map((x, k) => ({
        ...x,
        key: "p" + k,
        role: x.p[2].split(" · ")[0],
        label: x.p[2].split(" · ")[0],
        merged: [x],
      }));
  }
  if (!el?.isConnected) return;
  const n = pts.length;
  if (daysPick >= n) daysPick = 0;
  hourlyPoint[section] = daysPick;
  el.dataset.n = n;
  el.innerHTML = `${
    n > 1
      ? `<div class="seg elev-toggle" role="group" aria-label="Elevation">${pts
          .map(
            (x, k) =>
              `<button type="button" data-elev="${k}" class="${k === daysPick ? "active" : ""}" aria-pressed="${k === daysPick}">${escapeHTML(x.label)}</button>`,
          )
          .join("")}</div>`
      : ""
  }<div class="ov-now">${pts
    .map(
      (x, k) =>
        `<article class="card forecast fc-now${k === daysPick ? "" : " alt"}" id="now-${k}"><h3>${escapeHTML(x.label)}</h3><div class="state">Loading NWS forecast…</div></article>`,
    )
    .join(
      "",
    )}</div><article class="card afd-card hourly-card ov-hourly" id="hourly"><div class="state">Loading hourly forecast…</div></article><div class="ov-days">${pts
    .map(
      (x, k) =>
        `<article class="card forecast fc-days${k === daysPick ? "" : " alt"}" id="days-${k}"><h3>${n > 1 ? escapeHTML(x.label) + " · " : ""}7-day forecast</h3><div class="state">Loading…</div></article>`,
    )
    .join("")}</div>`;
  el.querySelectorAll("[data-elev]").forEach(
    (b) =>
      (b.onclick = () => {
        daysPick = +b.dataset.elev;
        hourlyPoint[section] = daysPick;
        el.querySelectorAll("[data-elev]").forEach((x) => {
          const on = x === b;
          x.classList.toggle("active", on);
          x.setAttribute("aria-pressed", String(on));
        });
        el.querySelectorAll(".fc-now, .fc-days").forEach((c) =>
          c.classList.toggle("alt", +c.id.split("-")[1] !== daysPick),
        );
        loadHourly(place, section, pts);
      }),
  );
  pts.forEach((x, k) => loadPointOverview(x, k, section));
  loadHourly(place, section, pts);
}
async function loadPointOverview(pt, k, section) {
  const now = document.querySelector("#now-" + k),
    days = document.querySelector("#days-" + k),
    p = pt.p;
  try {
    const data = await pointForecast(p);
    if (!now?.isConnected) return;
    const periods = data.forecast.periods || [],
      first = periods[0],
      showObs = !p[2].startsWith("Summit");
    now.innerHTML = `<h3>${escapeHTML(pt.label)}</h3>${pointDetail(pt, gridFeet(data))}${showObs ? '<div class="obs-slot"></div>' : ""}<div class="forecast-hero">${forecastIcon(first, "hero")}<div><div class="forecast-period-label">${escapeHTML(first?.name || "Current period")} forecast ${first?.isDaytime ? "high" : "low"}</div><div class="current">${first?.temperature ?? "–"}°${first?.temperatureUnit ?? "F"}</div><div class="condition">${escapeHTML(first?.shortForecast || "Forecast unavailable")}</div></div></div><div class="metrics"><div class="metric"><span>Wind</span><strong>${escapeHTML(first?.windSpeed || "–")}</strong></div><div class="metric"><span>Direction</span><strong>${escapeHTML(first?.windDirection || "–")}</strong></div><div class="metric"><span>Precip.</span><strong>${first?.probabilityOfPrecipitation?.value != null ? first.probabilityOfPrecipitation.value + "%" : "–"}</strong></div></div>`;
    if (days?.isConnected)
      days.innerHTML = `<h3>${days.querySelector("h3")?.innerHTML || "7-day forecast"}</h3>${daysStrip(periods)}${issuedLine(data, p, section)}`;
    if (showObs) loadObs(p, now.querySelector(".obs-slot"));
  } catch {
    if (now?.isConnected) now.innerHTML = pointError(pt.label, p);
    if (days?.isConnected)
      days.innerHTML = `<h3>7-day forecast</h3><div class="error">Unavailable right now.</div>`;
  }
}
async function loadDiscussion(place, section) {
  const wrap = document.querySelector("#discussion");
  let pts;
  try {
    pts = await uniquePoints(place);
  } catch {
    pts = place.p
      .map((p, i) => ({ p, i, role: p[2].split(" · ")[0], label: p[2].split(" · ")[0], merged: [{ p, i }] }))
      .reverse();
  }
  if (!wrap?.isConnected) return;
  wrap.innerHTML = pts
    .map(
      (x, k) =>
        `<article class="card forecast" id="forecast-${k}"><h3>${escapeHTML(x.label)}</h3><div class="state">Loading NWS forecast…</div></article>`,
    )
    .join("");
  pts.forEach(async (pt, k) => {
    const el = wrap.querySelector("#forecast-" + k),
      p = pt.p;
    try {
      const data = await pointForecast(p);
      if (!el?.isConnected) return;
      const periods = data.forecast.periods || [];
      el.innerHTML =
        `<h3>${escapeHTML(pt.label)}</h3>${pointDetail(pt, gridFeet(data))}` +
        (periods.length
          ? periods
              .map(
                (q, j) =>
                  `<section class="discussion-period"><h4><button type="button" class="period-day-toggle discussion-heading" data-period-hourly="${j}" aria-expanded="false" aria-controls="period-hours-${k}-${j}" title="Show NOAA hourly forecast">${forecastIcon(q, "detail")}<span>${escapeHTML(q.name)} · ${q.temperature}°${escapeHTML(q.temperatureUnit)}</span><span class="period-day-chevron" aria-hidden="true">›</span></button></h4><p>${escapeHTML(q.detailedForecast || q.shortForecast || "No description available.")}</p><div class="period-hourly-body" id="period-hours-${k}-${j}" hidden><div class="state">Loading NOAA hourly forecast…</div></div></section>`,
              )
              .join("")
          : "<p>No forecast periods available.</p>") +
        issuedLine(data, p, section);
      el.querySelectorAll("[data-period-hourly]").forEach(
        (button) =>
          (button.onclick = () => {
            const body = el.querySelector("#" + button.getAttribute("aria-controls")),
              open = button.getAttribute("aria-expanded") !== "true";
            button.setAttribute("aria-expanded", String(open));
            body.hidden = !open;
            if (open && !button.dataset.loaded) {
              button.dataset.loaded = "true";
              loadPeriodHourly(p, periods[+button.dataset.periodHourly], section, body);
            }
          }),
      );
    } catch {
      if (el?.isConnected) el.innerHTML = pointError(pt.label, p);
    }
  });
}

async function loadAFD(p) {
  const el = document.querySelector("#area-discussion");
  try {
    const key = p.slice(0, 2).join(",");
    let point = cache.get(key)?.point || (await getJSON(`https://api.weather.gov/points/${key}`)).properties;
    const code = point.cwa || point.gridId;
    if (!/^[A-Z]{3}$/.test(code)) throw Error("Forecast office unavailable");
    let entry = afdCache.get(code);
    if (!entry || Date.now() - entry.time > 600000) {
      entry = {
        time: Date.now(),
        promise: (async () => {
          const list = await getJSON(`https://api.weather.gov/products/types/AFD/locations/${code}`);
          const latest = [...(list["@graph"] || [])].sort(
            (a, b) => Date.parse(b.issuanceTime) - Date.parse(a.issuanceTime),
          )[0];
          if (!latest?.["@id"]?.startsWith("https://api.weather.gov/products/"))
            throw Error("No discussion found");
          return getJSON(latest["@id"]);
        })(),
      };
      afdCache.set(code, entry);
    }
    const afd = await entry.promise;
    if (!el || !el.isConnected) return;
    const names = { SLC: "Salt Lake City", BOX: "Boston/Norton", GYX: "Gray/Portland", ALY: "Albany" };
    const link = `https://forecast.weather.gov/product.php?site=${code}&issuedby=${code}&product=AFD&format=CI&version=1&glossary=1&highlight=off`;
    el.innerHTML = `<h3>Area Forecast Discussion · ${escapeHTML(names[code] || code)}</h3><p class="afd-intro">Complete NWS regional discussion. Sections may describe areas beyond this location.</p><div class="muted">Issued ${regionTime(afd.issuanceTime, tab, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div><pre class="afd-text">${escapeHTML(afd.productText || "Discussion text unavailable.")}</pre><div class="source"><a href="${link}" target="_blank" rel="noopener">Open original NWS discussion ↗</a></div>`;
  } catch (err) {
    if (el && el.isConnected)
      el.innerHTML = `<h3>Area Forecast Discussion</h3><div class="error">The NWS discussion is temporarily unavailable.</div><a href="https://www.weather.gov/" target="_blank" rel="noopener">Open weather.gov ↗</a>`;
  }
}
const MODELS = [
  ["GFS", "gfs_global"],
  ["ECMWF", "ecmwf_ifs025"],
  ["GEM", "gem_global"],
];
function modelURL(p, section, id) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  const params = {
    latitude: p[0],
    longitude: p[1],
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum",
    temperature_unit: "fahrenheit",
    precipitation_unit: "inch",
    timezone: section === "utah" ? "America/Denver" : "America/New_York",
    forecast_days: "10",
    models: id,
  };
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}
function modelRows(data, section) {
  const ds = data.map((x) => x.data.daily);
  const dates = ds[0].time;
  return dates
    .map((date, i) => ({
      date,
      values: ds.map((d, n) => ({
        name: data[n].name,
        high: d.temperature_2m_max?.[i],
        low: d.temperature_2m_min?.[i],
        rain: d.precipitation_sum?.[i],
        snow: Number.isFinite(d.snowfall_sum?.[i])
          ? data[n].data.daily_units?.snowfall_sum === "cm"
            ? d.snowfall_sum[i] / 2.54
            : d.snowfall_sum[i]
          : null,
      })),
    }))
    .filter((x) =>
      x.values.every((v) => Number.isFinite(v.high) && Number.isFinite(v.low) && Number.isFinite(v.rain)),
    );
}
function modelFlags(row, section) {
  const vals = row.values,
    highs = vals.map((x) => x.high),
    lows = vals.map((x) => x.low),
    rains = vals.map((x) => x.rain),
    snows = vals.map((x) => x.snow).filter(Number.isFinite);
  let out = [];
  if (Math.max(...rains) - Math.min(...rains) >= 0.35) {
    let wet = vals.reduce((a, b) => (b.rain > a.rain ? b : a)),
      dry = vals.reduce((a, b) => (b.rain < a.rain ? b : a));
    out.push(
      `${wet.name} is wettest (${wet.rain.toFixed(2)} in) versus ${dry.name} (${dry.rain.toFixed(2)} in)`,
    );
  }
  if (Math.max(...highs) - Math.min(...highs) >= 8)
    out.push(`high temperatures differ by ${Math.round(Math.max(...highs) - Math.min(...highs))}°F`);
  if (Math.max(...lows) - Math.min(...lows) >= 8)
    out.push(`low temperatures differ by ${Math.round(Math.max(...lows) - Math.min(...lows))}°F`);
  if (section === "utah" && snows.length === vals.length && Math.max(...snows) - Math.min(...snows) >= 3)
    out.push(`snowfall estimates range ${Math.min(...snows).toFixed(1)}–${Math.max(...snows).toFixed(1)} in`);
  return out;
}
async function loadModels(place, section) {
  const el = document.querySelector("#model-comparison"),
    idx = modelElevation[section] && place.p[1] ? 1 : 0,
    p = place.p[idx],
    key = `${p[0]},${p[1]}`;
  try {
    let entry = modelCache.get(key);
    if (!entry || Date.now() - entry.time > 600000) {
      entry = {
        time: Date.now(),
        promise: Promise.allSettled(
          MODELS.map(async ([name, id]) => ({ name, id, data: await getJSON(modelURL(p, section, id)) })),
        ),
      };
      modelCache.set(key, entry);
    }
    const results = await entry.promise;
    if (!el || !el.isConnected) return;
    const data = results
      .filter((x) => x.status === "fulfilled" && x.value.data.daily?.time)
      .map((x) => x.value);
    if (data.length < 2) throw Error("Insufficient model data");
    const rows = modelRows(data, section),
      flagged = rows
        .map((r) => ({ row: r, notes: modelFlags(r, section) }))
        .filter((x) => x.notes.length)
        .slice(0, 4);
    el.innerHTML = `<h3>Model comparison · ${escapeHTML(place.name)}</h3><p class="afd-intro">Daily model guidance at the selected coordinate. These are independent scenarios, not the official NWS forecast.</p>${place.p.length > 1 ? `<div class="model-switch" aria-label="Model point"><button data-model-point="0" class="${idx === 0 ? "active" : ""}">Mid mountain</button><button data-model-point="1" class="${idx === 1 ? "active" : ""}">Peak</button></div>` : ""}<div class="muted">${escapeHTML(p[2])} · next ${rows.length} days · ${data.map((x) => x.name).join(", ")}${data.length < 3 ? " (one model unavailable)" : ""}</div><div id="model-visual"></div><h3 style="margin-top:24px">Differences to watch</h3><div class="model-highlights">${flagged.length ? flagged.map(({ row, notes }) => `<div class="model-highlight"><strong>${escapeHTML(dateLabel(row.date))}</strong> · ${escapeHTML(notes.join("; "))}</div>`).join("") : "<p>No large day-by-day differences cross the comparison thresholds right now.</p>"}</div><div class="model-table-wrap"><table class="model-table"><thead><tr><th>Day</th>${data.map((x) => `<th>${escapeHTML(x.name)}<small>High / low / precip.${section === "utah" ? " / snow" : ""}</small></th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr class="${modelFlags(r, section).length ? "flag" : ""}"><th>${escapeHTML(dateLabel(r.date))}</th>${r.values.map((v) => `<td data-label="${escapeHTML(v.name)}"><span class="model-values"><b>${Math.round(v.high)}°F <small>high</small></b><b>${Math.round(v.low)}°F <small>low</small></b><span>${v.rain.toFixed(2)} in <small>precip</small></span>${section === "utah" && Number.isFinite(v.snow) ? `<span>${v.snow.toFixed(1)} in <small>snow</small></span>` : ""}</span></td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="source">Precipitation is liquid equivalent; snow is model-estimated depth. Terrain and model grid elevation can differ from the selected mountain elevation. Highlight thresholds: 8°F high- or low-temperature spread, 0.35 in daily precipitation spread, or 3 in snow spread. Compare timing and trend; avoid treating one model as certain. Data: <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo model API ↗</a>. Official baseline: <a href="https://forecast.weather.gov/MapClick.php?lat=${p[0]}&lon=${p[1]}" target="_blank" rel="noopener">NWS point forecast ↗</a>.</p>`;
    el.querySelectorAll("[data-model-point]").forEach(
      (b) =>
        (b.onclick = () => {
          modelElevation[section] = +b.dataset.modelPoint;
          forecastView();
        }),
    );
    renderModelChart(el, rows, section);
  } catch (err) {
    if (el && el.isConnected)
      el.innerHTML = `<h3>Model comparison</h3><div class="error">Live model guidance is temporarily unavailable. The official NWS forecast remains in Overview.</div><a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open model source ↗</a>`;
  }
}
function dateLabel(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function makePlot(series, labels, unit, type, selected, annotate = false) {
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
    inchLine = type === "line" && unit === " in",
    lo = type === "bar" || inchLine ? 0 : Math.floor(Math.min(...values) - 2),
    hi = Math.max(...values, lo + 1);
  if (type === "bar") hi = Math.max(hi * 1.15, 0.1);
  else if (inchLine) hi = Math.max(0.1, Math.ceil(Math.max(...values, 0) * 1.15 * 10) / 10);
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
  if (annotate) {
    ends.forEach((e, i) => {
      e.y = Math.max(top + 12, Math.min(top + plotH - 10, e.y));
      if (i) e.y = Math.max(e.y, ends[i - 1].y + 17);
    });
    for (let i = ends.length - 1; i >= 0; i--)
      ends[i].y = Math.min(ends[i].y, i === ends.length - 1 ? top + plotH - 10 : ends[i + 1].y - 17);
  } else
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const formatValue = (v) => (unit === " in" ? `${v.toFixed(2)} in` : `${Math.round(v)}${unit}`);
  const endLbls = ends
    .map(
      (e) => `<text x="${e.x}" y="${e.y}" class="end-lbl" fill="${colors[e.j]}">${escapeHTML(e.name)}</text>`,
    )
    .join("");
  const selectedLabels = annotate
    ? series
        .map((item, j) => ({ j, v: item.values[selected] }))
        .filter((e) => Number.isFinite(e.v))
        .map((e) => ({ ...e, y: y(e.v) }))
        .sort((a, b) => a.y - b.y)
    : [];
  selectedLabels.forEach((e, i) => {
    e.ly = Math.max(top + 12, Math.min(top + plotH - 10, e.y));
    if (i) e.ly = Math.max(e.ly, selectedLabels[i - 1].ly + 17);
  });
  for (let i = selectedLabels.length - 1; i >= 0; i--)
    selectedLabels[i].ly = Math.min(
      selectedLabels[i].ly,
      i === selectedLabels.length - 1 ? top + plotH - 10 : selectedLabels[i + 1].ly - 17,
    );
  const pointLbls = selectedLabels
    .map(
      (e) =>
        `<text x="${x(selected) + (selected >= n / 2 ? -12 : 12)}" y="${e.ly}" text-anchor="${selected >= n / 2 ? "end" : "start"}" class="point-value selected-value" fill="${colors[e.j]}">${formatValue(e.v)}</text>`,
    )
    .join("");
  const turning = [];
  if (annotate && n > 2)
    series.forEach((item, j) => {
      for (let i = 1; i < n - 1; i++) {
        let v = item.values[i],
          a = item.values[i - 1],
          b = item.values[i + 1];
        if (![v, a, b].every(Number.isFinite)) continue;
        let peak = v >= a && v >= b && (v > a || v > b),
          dip = v <= a && v <= b && (v < a || v < b);
        if (peak && (unit !== " in" || v >= 0.05)) turning.push({ j, i, v, kind: "peak" });
        if (dip && unit !== " in") turning.push({ j, i, v, kind: "dip" });
      }
    });
  let picks = [];
  if (annotate) {
    let peaks = turning.filter((t) => t.kind === "peak").sort((a, b) => b.v - a.v),
      dips = turning.filter((t) => t.kind === "dip").sort((a, b) => a.v - b.v);
    for (const list of unit === " in" ? [peaks, peaks] : [peaks, dips]) {
      let choice = list.find(
        (t) => Math.abs(t.i - selected) > 1 && !picks.some((p) => Math.abs(p.i - t.i) < 2),
      );
      if (choice) picks.push(choice);
    }
  }
  const keyLbls = picks
    .map(
      (t) =>
        `<text x="${x(t.i) + (t.i >= n / 2 ? -10 : 10)}" y="${Math.max(top + 12, Math.min(top + plotH - 8, y(t.v) + (t.kind === "peak" ? -11 : 18)))}" text-anchor="${t.i >= n / 2 ? "end" : "start"}" class="point-value key-value" fill="${colors[t.j]}">${escapeHTML(series[t.j].name)} ${formatValue(t.v)}</text>`,
    )
    .join("");
  const hitDots = annotate
    ? series
        .map((item, j) =>
          item.values
            .map((v, i) =>
              Number.isFinite(v)
                ? `<circle class="chart-hit" cx="${x(i)}" cy="${y(v)}" r="20" fill="transparent" stroke="transparent" tabindex="0" role="button" aria-label="${escapeHTML(labels[i])}, ${escapeHTML(item.name)} ${formatValue(v)}; select day" data-chart-day="${i}" data-model="${escapeHTML(item.name)}" data-value="${formatValue(v)}"/>`
                : "",
            )
            .join(""),
        )
        .join("")
    : "";
  const defs = `<defs>${series.map((z, j) => `<pattern id="bar-hatch-${j}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#102c3b"/><line x1="0" y1="0" x2="0" y2="5" stroke="${colors[j]}" stroke-width="3"/></pattern><pattern id="bar-dots-${j}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#102c3b"/><circle cx="2.5" cy="2.5" r="1.6" fill="${colors[j]}"/></pattern>`).join("")}</defs>`;
  return `<div class="chart-scroll"><svg class="forecast-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(series.map((x) => x.name).join(", "))} ${type === "bar" ? "bar" : "line"} chart">${defs}<line x1="${left}" y1="${top + plotH}" x2="${w - right}" y2="${top + plotH}" stroke="#3d6273"/><text x="4" y="${top + 7}" class="axis-label">${hi.toFixed(type === "bar" || inchLine ? 1 : 0)}${unit}</text><text x="4" y="${top + plotH}" class="axis-label">${lo.toFixed(type === "bar" || inchLine ? 1 : 0)}${unit}</text><rect x="${x(selected) - Math.min(25, plotW / n / 3)}" y="${top}" width="${Math.min(50, ((plotW / n) * 2) / 3)}" height="${plotH}" fill="#58b6d0" opacity=".12" pointer-events="none"/>${marks}${hitDots}${endLbls}${keyLbls}${pointLbls}${labels.map((q, i) => `<text x="${x(i)}" y="${h - 16}" text-anchor="middle" class="axis-label">${escapeHTML(q)}</text>`).join("")}${annotate ? '<g class="chart-tooltip" visibility="hidden" aria-hidden="true" pointer-events="none"><rect width="146" height="28" rx="6"/><text x="9" y="19"/></g>' : ""}</svg></div><div class="chart-legend">${series.map((z, i) => `<span><svg width="30" height="14" aria-hidden="true">${type === "bar" ? `<rect x="8" y="1" width="14" height="12" rx="2" fill="${pat(i) === "none" ? colors[i] : `url(#bar-${pat(i)}-${i})`}" stroke="${colors[i]}"/>` : `<line x1="0" y1="7" x2="30" y2="7" stroke="${colors[i]}" stroke-width="3" stroke-dasharray="${dashes[i]}"/>${mark(i, 15, 7, 4.5, "")}`}</svg>${escapeHTML(z.name)}</span>`).join("")}</div>`;
}
function renderModelChart(el, rows, section) {
  const target = el.querySelector("#model-visual");
  if (!target || !rows.length) return;
  const metric = modelMetric[section],
    day = Math.min(modelDay[section], rows.length - 1);
  modelDay[section] = day;
  const names = rows[0].values.map((v) => v.name),
    series = names.map((name) => ({
      name,
      values: rows.map((r) => r.values.find((v) => v.name === name)?.[metric]),
    }));
  const labels = rows.map((r) =>
    new Date(`${r.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
  );
  target.innerHTML = `<div class="model-visual-layout"><div class="chart-controls"><h3>Daily model paths</h3><div class="seg"><button data-chart-metric="high" class="${metric === "high" ? "active" : ""}">High temperature</button><button data-chart-metric="low" class="${metric === "low" ? "active" : ""}">Low temperature</button><button data-chart-metric="rain" class="${metric === "rain" ? "active" : ""}">Precipitation</button></div></div><div class="model-chart-area"><p class="model-scroll-hint">Swipe chart sideways to see all forecast days. Tap a dot for values.</p>${makePlot(series, labels, metric === "rain" ? " in" : "°F", "line", day, true)}</div><div class="day-pills" aria-label="Select forecast day">${rows.map((r, i) => `<button data-chart-day="${i}" class="${i === day ? "active" : ""}">${escapeHTML(labels[i])}</button>`).join("")}</div><div class="chart-details"><strong>${escapeHTML(dateLabel(rows[day].date))}</strong><div>${rows[day].values.map((v) => `<span><b>${escapeHTML(v.name)}</b> ${Math.round(v.high)}°F high · ${Math.round(v.low)}°F low · ${v.rain.toFixed(2)} in precipitation${section === "utah" && Number.isFinite(v.snow) ? ` · ${v.snow.toFixed(1)} in snow` : ""}</span>`).join("")}</div></div></div>`;
  target.querySelectorAll("[data-chart-metric]").forEach(
    (b) =>
      (b.onclick = () => {
        modelMetric[section] = b.dataset.chartMetric;
        renderModelChart(el, rows, section);
      }),
  );
  target.querySelectorAll("[data-chart-day]").forEach((b) => {
    const choose = () => {
      const i = +b.dataset.chartDay;
      if (!Number.isInteger(i) || i < 0 || i >= rows.length) return;
      modelDay[section] = i;
      renderModelChart(el, rows, section);
    };
    b.onclick = choose;
    if (b.classList.contains("chart-hit")) {
      const tip = target.querySelector(".chart-tooltip"),
        tipText = tip?.querySelector("text");
      const show = () => {
        if (!tip || !tipText) return;
        tipText.textContent = `${b.dataset.model} · ${b.dataset.value}`;
        const cx = +b.getAttribute("cx"),
          cy = +b.getAttribute("cy");
        tip.setAttribute(
          "transform",
          `translate(${Math.max(2, Math.min(612, cx - 73))} ${cy < 63 ? cy + 12 : cy - 40})`,
        );
        tip.setAttribute("visibility", "visible");
      };
      const hide = () => tip?.setAttribute("visibility", "hidden");
      b.onpointerenter = show;
      b.onpointerleave = hide;
      b.onfocus = show;
      b.onblur = hide;
      b.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose();
        }
      };
    }
  });
}

async function loadMountain(place) {
  const el = document.querySelector("#mountain-profile");
  try {
    const result = await Promise.all(place.p.map(mountainPoint));
    if (!el || !el.isConnected) return;
    renderMountain(el, place, result);
  } catch (err) {
    if (el && el.isConnected)
      el.innerHTML =
        '<h3>Mountain profile</h3><div class="error">NWS mountain grid data is temporarily unavailable. Select Overview for the point forecast.</div>';
  }
}
function renderMountain(el, place, result) {
  const rows = result.map((d, j) => ({
    name: j ? "Peak" : "Mid mountain",
    gridFt: d.forecast.elevation?.value != null ? Math.round(d.forecast.elevation.value * 3.28084) : null,
    periods: d.forecast.periods.slice(0, 6).map((q) => ({
      name: q.name,
      temp: q.temperature,
      wind: parseInt(q.windSpeed, 10) || 0,
      snow: periodSnow(d.grid.snowfallAmount?.values, Date.parse(q.startTime), Date.parse(q.endTime)),
    })),
    gridId: d.point.forecastGridData,
  }));
  const metric = profileMetric,
    day = Math.min(profileDay, ...rows.map((x) => x.periods.length - 1));
  profileDay = day;
  const n = Math.min(...rows.map((x) => x.periods.length));
  const labels = rows[0].periods
    .slice(0, n)
    .map((x) => (x.name.length > 10 ? x.name.slice(0, 9) + "…" : x.name));
  let series = rows.map((x) => ({ name: x.name, values: x.periods.slice(0, n).map((q) => q[metric]) }));
  const noSnow = metric === "snow" && series.some((x) => x.values.some((v) => v == null));
  el.innerHTML = `<h3>${escapeHTML(place.name)} · mid mountain and peak</h3><p class="afd-intro">Pick a resort above, then tap a metric or forecast period. NWS gridded snowfall is summed over each day/night period.</p><div class="chart-controls"><div class="seg">${[
    ["temp", "Temperature"],
    ["wind", "Wind"],
    ["snow", "Snow"],
  ]
    .map(
      ([id, label]) =>
        `<button data-mountain-metric="${id}" class="${metric === id ? "active" : ""}">${label}</button>`,
    )
    .join(
      "",
    )}</div></div>${!noSnow && n ? makePlot(series, labels, metric === "temp" ? "°F" : metric === "wind" ? " mph" : " in", metric === "snow" ? "bar" : "line", day) : '<div class="note">Snow grid values are unavailable for one of these points.</div>'}<div class="day-pills" aria-label="Select forecast period">${labels.map((label, i) => `<button data-mountain-day="${i}" class="${i === day ? "active" : ""}">${escapeHTML(label)}</button>`).join("")}</div><div class="mountain-cards">${rows.map((x) => `<div><h4>${escapeHTML(x.name)} · ${escapeHTML(x.gridFt ? x.gridFt.toLocaleString() + " ft NWS grid" : "grid elevation unavailable")}</h4><p>${escapeHTML(x.periods[day]?.name || "")} · <b>${x.periods[day]?.temp ?? "–"}°F</b> · wind ${x.periods[day]?.wind ?? "–"} mph · grid snow ${x.periods[day]?.snow != null ? x.periods[day].snow.toFixed(1) + " in" : "unavailable"}</p><small>Selected point: ${escapeHTML(x.name === "Peak" ? place.p[1][2] : place.p[0][2])}</small></div>`).join("")}</div><p class="source">${rows[0].gridId === rows[1].gridId ? "Both selected points share the same NWS forecast grid, so their gridded forecast may be identical. " : ""}Grid elevation can differ from actual mountain elevation. Snow values are NWS gridded snow amount estimates, not resort measurements. <a href="https://www.weather.gov/documentation/services-web-api" target="_blank" rel="noopener">NWS API ↗</a></p>`;
  el.querySelectorAll("[data-mountain-metric]").forEach(
    (b) =>
      (b.onclick = () => {
        profileMetric = b.dataset.mountainMetric;
        renderMountain(el, place, result);
      }),
  );
  el.querySelectorAll("[data-mountain-day]").forEach(
    (b) =>
      (b.onclick = () => {
        profileDay = +b.dataset.mountainDay;
        renderMountain(el, place, result);
      }),
  );
}
// ===================== Additions: alerts, observations, hourly, resort snow, at-a-glance, radar, URL state, auto-refresh =====================
const REFRESH_MIN = 15;
let lastLoad = Date.now(),
  obsCache = new Map(),
  snowTable = null,
  radarState = null,
  leafletLoader = null;

function allPlaces() {
  return [
    ...utah.map((p, i) => ({ section: "utah", i, place: p })),
    ...ne.map((p, i) => ({ section: "ne", i, place: p })),
  ];
}

// ---------- #1 NWS alerts ----------

let regionAlerts = { utah: [], ne: [] },
  placeAlerts = new Map();
async function refreshAllAlerts() {
  const res = await Promise.allSettled(
    allPlaces().map(async (x) => ({ x, list: await alertsFor(x.place.p[0]) })),
  );
  regionAlerts = { utah: [], ne: [] };
  placeAlerts = new Map();
  for (const r of res) {
    if (r.status !== "fulfilled") continue;
    const { x, list } = r.value;
    placeAlerts.set(x.section + ":" + x.i, list);
    regionAlerts[x.section].push(...list);
  }
  regionAlerts.utah = sortAlerts(regionAlerts.utah);
  regionAlerts.ne = sortAlerts(regionAlerts.ne);
  updateAlertBadges();
}
function alertRegionForView() {
  if (tab === "utah" || tab === "ne") return tab;
  if (tab === "precip") return precipRegion;
  if (tab === "radar") return RADAR_PRESETS.utah.some((x) => x.id === radarPreset) ? "utah" : "ne";
  return null;
}
function alertsBar() {
  const el = document.querySelector("#alerts-bar");
  if (!el) return;
  const rows = [],
    only = alertRegionForView();
  [
    ["utah", utah],
    ["ne", ne],
  ]
    .filter(([sec]) => sec === only)
    .forEach(([sec, list]) =>
      regionAlerts[sec].forEach((a) => {
        const where = [];
        placeAlerts.forEach((v, k) => {
          if (k.startsWith(sec + ":") && v.some((z) => z.id === a.id)) where.push(list[+k.split(":")[1]]);
        });
        rows.push({ a, sec, where });
      }),
    );
  el.hidden = !rows.length;
  el.innerHTML = rows.length
    ? `<div class="alerts-bar-inner"><span class="alert-icon" aria-hidden="true">▲</span>${rows
        .map(
          (r) =>
            `<span class="ab-item"><b>${escapeHTML(r.a.event)}</b> ${r.where
              .slice(0, 4)
              .map((pl) => `<a href="#${r.sec}/${slug(pl.name)}/overview">${escapeHTML(pl.name)}</a>`)
              .join(
                ", ",
              )}${r.where.length > 4 ? ` +${r.where.length - 4}` : ""} <span class="muted">${escapeHTML(alertTime(r.a, r.sec))}</span></span>`,
        )
        .join("")}</div>`
    : "";
}
function updateAlertBadges() {
  alertsBar();
  document.querySelectorAll("nav [data-tab]").forEach((b) => {
    const n = regionAlerts[b.dataset.tab]?.length || 0;
    let s = b.querySelector(".tab-alerts");
    if (!n) {
      s?.remove();
      return;
    }
    if (!s) {
      s = document.createElement("span");
      s.className = "tab-alerts";
      b.appendChild(s);
    }
    s.textContent = `▲ ${n}`;
    s.title = `${n} active NWS alert${n > 1 ? "s" : ""}`;
  });
  document.querySelectorAll(".place-pills [data-place]").forEach((b) => {
    const sec = tab,
      idx = view[sec] === "mountain" ? +b.dataset.place + 2 : +b.dataset.place,
      n = (placeAlerts.get(sec + ":" + idx) || []).length;
    b.classList.toggle("has-alert", n > 0);
    b.title = n ? `${n} active alert${n > 1 ? "s" : ""}` : "";
  });
}
async function loadAlertBanner(place) {
  const el = document.querySelector("#alert-banner");
  try {
    const list = sortAlerts((await Promise.all(place.p.map(alertsFor))).flat());
    if (el?.isConnected) el.innerHTML = alertHTML(list, tab);
  } catch {
    if (el?.isConnected) el.innerHTML = "";
  }
}

// ---------- #4 current observations ----------
/* Latest observation near a point: resort stations from OBS_STATIONS first, then the NWS list.
   Readings older than OBS_MAX_AGE are not shown, because a stale reading looks like current conditions. */
const OBS_MAX_AGE = 2 * 3600000;
async function latestObs(id, name, elevM) {
  const o = (await getJSON(`https://api.weather.gov/stations/${id}/observations/latest?require_qc=false`))
    .properties;
  const t = cToF(o.temperature?.value);
  if (t == null) return null;
  return {
    station: name || o.stationName || id,
    id,
    elevFt: Number.isFinite(elevM)
      ? Math.round(elevM * 3.28084)
      : Number.isFinite(o.elevation?.value)
        ? Math.round(o.elevation.value * 3.28084)
        : null,
    time: Date.parse(o.timestamp),
    temp: t,
    text: o.textDescription,
    wind: kmhToMph(o.windSpeed?.value),
    gust: kmhToMph(o.windGust?.value),
    dir: o.windDirection?.value,
  };
}
async function observation(p) {
  const key = p.slice(0, 2).join(",");
  let e = obsCache.get(key);
  if (e && Date.now() - e.time < 10 * 60000) return e.promise;
  const promise = (async () => {
    const preferred = (OBS_STATIONS[key] || []).map((id) => ({ id }));
    let nws = [];
    try {
      const point = await pointMeta(p);
      nws = ((await getJSON(point.observationStations)).features || []).slice(0, 3).map((f) => ({
        id: f.properties.stationIdentifier,
        name: f.properties.name,
        elev: f.properties.elevation?.value,
      }));
    } catch {}
    const list = [...preferred, ...nws.filter((x) => !preferred.some((y) => y.id === x.id))];
    const found = await Promise.all(list.map((s) => latestObs(s.id, s.name, s.elev).catch(() => null)));
    const fresh = found.find((o) => o && Date.now() - o.time <= OBS_MAX_AGE);
    if (fresh) return fresh;
    const newest = found.filter(Boolean).sort((a, b) => b.time - a.time)[0];
    if (newest) return { ...newest, stale: true };
    throw Error("No observations");
  })();
  obsCache.set(key, { time: Date.now(), promise });
  promise.catch(() => obsCache.delete(key));
  return promise;
}
function obsLine(o) {
  if (o.stale)
    return `<div class="obs stale"><span class="obs-label">Observed</span> No report in the last 2 hours<div class="muted">Newest: ${escapeHTML(o.station)}, ${ago(o.time)} (NWS feeds are sometimes delayed)</div></div>`;
  return `<div class="obs"><span class="obs-label">Observed</span> <b>${o.temp}°F</b>${o.text ? " · " + escapeHTML(o.text) : ""}${o.wind != null ? ` · wind ${o.wind === 0 ? "calm" : compass(o.dir) + " " + o.wind + " mph"}${o.gust ? `, gusts ${o.gust}` : ""}` : ""}<div class="muted">${escapeHTML(o.station)} (${escapeHTML(o.id)}${o.elevFt ? `, ${o.elevFt.toLocaleString()} ft` : ""}) · ${ago(o.time)}</div></div>`;
}
async function loadObs(p, target) {
  try {
    const o = await observation(p);
    if (target?.isConnected) target.innerHTML = obsLine(o);
  } catch {
    if (target?.isConnected)
      target.innerHTML = '<div class="obs muted">Current observation unavailable</div>';
  }
}

// ---------- #3 hourly timeline (next 48 h) ----------
async function hourly(p) {
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

async function loadPeriodHourly(p, period, section, el) {
  const link = `https://forecast.weather.gov/MapClick.php?lat=${p[0]}&lon=${p[1]}`;
  try {
    const d = await hourly(p);
    if (!el?.isConnected) return;
    const start = Date.parse(period.startTime),
      end = Date.parse(period.endTime),
      rows = (d.periods || []).filter((q) => Date.parse(q.startTime) < end && Date.parse(q.endTime) > start),
      fmt = (t) =>
        regionTime(t, section, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          timeZoneName: "short",
        });
    el.innerHTML = `<p class="hourly-period-caption">${escapeHTML(p[2])} · ${escapeHTML(fmt(period.startTime))}–${escapeHTML(regionTime(period.endTime, section, { hour: "numeric", timeZoneName: "short" }))}</p>${rows.length ? `<table class="period-hourly-table"><caption class="sr-only">NOAA hourly forecast for ${escapeHTML(period.name)} at ${escapeHTML(p[2])}</caption><thead><tr><th scope="col">Hour</th><th scope="col">Weather</th><th scope="col">Temp</th><th scope="col">Precip. chance</th><th scope="col">Wind</th></tr></thead><tbody>${rows.map((q) => `<tr><th scope="row">${escapeHTML(regionTime(q.startTime, section, { weekday: "short", hour: "numeric", timeZoneName: "short" }))}</th><td data-label="Weather">${forecastIcon(q, "small")}${escapeHTML(q.shortForecast || "–")}</td><td data-label="Temp">${q.temperature ?? "–"}°${escapeHTML(q.temperatureUnit || "F")}</td><td data-label="Precip. chance">${q.probabilityOfPrecipitation?.value != null ? q.probabilityOfPrecipitation.value + "%" : "–"}</td><td data-label="Wind">${escapeHTML(q.windDirection || "")} ${escapeHTML(q.windSpeed || "–")}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">NOAA has not provided hourly data for this period yet.</p>'}<p class="source">NOAA / National Weather Service · issued ${escapeHTML(regionTime(d.updateTime, section, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))} · <a href="${link}" target="_blank" rel="noopener">Open NWS point forecast ↗</a></p>`;
  } catch {
    if (el?.isConnected)
      el.innerHTML = `<p class="error">NOAA hourly data is temporarily unavailable.</p><a href="${link}" target="_blank" rel="noopener">Open NWS point forecast ↗</a>`;
    const button = el?.closest(".discussion-period")?.querySelector("[data-period-hourly]");
    if (button) delete button.dataset.loaded;
  }
}

/* pts: the place's distinct points from uniquePoints(), peak first, matching the cards above. */
async function loadHourly(place, section, pts) {
  const el = document.querySelector("#hourly");
  pts = pts || place.p.map((p, i) => ({ p, label: p[2].split(" · ")[0] })).reverse();
  try {
    const idx = Math.min(hourlyPoint[section] || 0, pts.length - 1),
      p = pts[idx].p,
      hours = hourlyHours[section];
    const d = await hourly(p);
    if (!el?.isConnected) return;
    el.innerHTML = `<div class="chart-controls"><h3>Next ${hours} hours${pts.length > 1 ? ` · ${escapeHTML(pts[idx].label)}` : ""}</h3><div class="hourly-options"><div class="seg" aria-label="Hourly range"><button data-hourly-hours="24" class="${hours === 24 ? "active" : ""}" aria-pressed="${hours === 24}">24 h</button><button data-hourly-hours="48" class="${hours === 48 ? "active" : ""}" aria-pressed="${hours === 48}">48 h</button></div>${
      pts.length > 1
        ? `<div class="seg" aria-label="Elevation">${pts
            .map(
              (x, k) =>
                `<button data-hourly-point="${k}" class="${idx === k ? "active" : ""}" aria-pressed="${idx === k}">${escapeHTML(x.label)}</button>`,
            )
            .join("")}</div>`
        : ""
    }</div></div><div class="hourly-chart"></div><p class="source">NWS hourly forecast issued ${regionTime(d.updateTime, section, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>`;
    const box = el.querySelector(".hourly-chart"),
      draw = () => {
        if (box.isConnected)
          box.innerHTML = hourlyChart(d.periods || [], regionZone(section), hours, chartWidth(el));
      };
    draw();
    redrawOnResize(el, draw);
    el.querySelectorAll("[data-hourly-hours]").forEach(
      (b) =>
        (b.onclick = () => {
          hourlyHours[section] = +b.dataset.hourlyHours;
          loadHourly(place, section, pts);
        }),
    );
    el.querySelectorAll("[data-hourly-point]").forEach(
      (b) =>
        (b.onclick = () => {
          hourlyPoint[section] = +b.dataset.hourlyPoint;
          loadHourly(place, section, pts);
        }),
    );
  } catch {
    if (el?.isConnected)
      el.innerHTML =
        '<h3>Hourly forecast</h3><div class="error">NWS hourly forecast is temporarily unavailable.</div>';
  }
}
let hourlyPoint = { utah: 0, ne: 0 },
  hourlyHours = { utah: 24, ne: 24 };

// ---------- #2 resort snow table ----------

// ---------- #6 at a glance ----------
// ---------- Radar (replaces the NWS RIDGE GIF tab) ----------
const RADAR_PRESETS = {
  utah: [
    { id: "wasatch", name: "Park City & Cottonwoods", c: [40.63, -111.6], z: 9 },
    { id: "nutah", name: "Northern Utah", c: [40.95, -111.8], z: 7 },
  ],
  ne: [
    { id: "boston", name: "Boston & South Shore", c: [42.3, -70.95], z: 8 },
    { id: "sne", name: "Southern New England", c: [41.8, -71.7], z: 7 },
    { id: "nne", name: "Northern New England", c: [43.9, -70.7], z: 7 },
  ],
};
const RADAR_NWS = {
  utah: [["KMTX", "Salt Lake (Promontory Pt)"]],
  ne: [
    ["KBOX", "Boston"],
    ["KOKX", "Upton NY"],
    ["KGYX", "Gray ME"],
  ],
};
let radarPreset = "wasatch",
  radarDisplay = "map";
const RADAR_FRAMES = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
function loadLeaflet() {
  return (
    leafletLoader ||
    (leafletLoader = new Promise((ok, no) => {
      const c = document.createElement("link");
      c.rel = "stylesheet";
      c.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(c);
      const j = document.createElement("script");
      j.src = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
      j.onload = ok;
      j.onerror = no;
      document.head.appendChild(j);
    }))
  );
}
function windyURL(p) {
  return `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=%C2%B0F&metricWind=mph&zoom=${Math.min(p.z, 10)}&overlay=radar&product=radar&level=surface&lat=${p.c[0]}&lon=${p.c[1]}&message=true`;
}
/* Dots for the forecast places with always-visible name labels. Labels that would overlap a label
   already shown are hidden (phones have no hover), and reappear as you zoom in. */
function placeLabels(map, places, radius) {
  const items = places.map((pl) => {
    const m = L.circleMarker([pl.p[0][0], pl.p[0][1]], {
      radius,
      color: "#fff",
      weight: 2,
      fillColor: "#10283a",
      fillOpacity: 1,
    })
      .bindTooltip(pl.name.replace(/, (MA|CT|NH|RI|ME|VT)$/, ""), {
        permanent: true,
        direction: "right",
        offset: [6, 0],
        className: "map-label",
      })
      .addTo(map);
    return m;
  });
  const layout = () => {
    const shown = [];
    items.forEach((m) => {
      const el = m.getTooltip()?.getElement();
      if (!el) return;
      el.style.visibility = "visible";
      const r = el.getBoundingClientRect(),
        box = { l: r.left - 3, r: r.right + 3, t: r.top - 2, b: r.bottom + 2 };
      const hit = shown.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
      if (hit) el.style.visibility = "hidden";
      else shown.push(box);
    });
  };
  map.on("zoomend moveend", layout);
  setTimeout(layout, 80);
}
function radarURL(m, stamp) {
  return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913${m ? `-m${String(m).padStart(2, "0")}m` : ""}/{z}/{x}/{y}.png?_=${stamp}`;
}
function destroyRadar() {
  if (!radarState) return;
  clearInterval(radarState.timer);
  clearInterval(radarState.refresh);
  try {
    radarState.map.remove();
  } catch {}
  radarState = null;
}
async function radarScanTime(region, state, update) {
  try {
    const end = new Date(),
      start = new Date(end.getTime() - 90 * 60000),
      fmt = (d) => d.toISOString().slice(0, 16) + "Z";
    const url = `https://mesonet.agron.iastate.edu/json/radar.py?operation=list&radar=USCOMP&product=N0Q&start=${fmt(start)}&end=${fmt(end)}`;
    const r = await getJSON(url),
      latest = Date.parse(r.scans?.at(-1)?.ts);
    if (!Number.isFinite(latest)) throw Error("No recent scan metadata");
    state.scanTime = latest;
    state.scanStale = Date.now() - latest > 20 * 60000;
    update();
  } catch {
    state.scanTime = null;
    state.scanStale = true;
    update();
  }
}
function radarView() {
  const region = RADAR_PRESETS.utah.some((x) => x.id === radarPreset) ? "utah" : "ne",
    preset = RADAR_PRESETS[region].find((x) => x.id === radarPreset);
  radarRegion = region;
  destroyRadar();
  const nws = RADAR_NWS[region],
    defaultStation =
      region === "utah" ? "KMTX" : preset.id === "nne" ? "KGYX" : preset.id === "sne" ? "KOKX" : "KBOX";
  if (!nws.some((x) => x[0] === radarStation[region])) radarStation[region] = defaultStation;
  const station = nws.find((x) => x[0] === radarStation[region]) || nws[0],
    gif = `https://radar.weather.gov/ridge/standard/${station[0]}_loop.gif?t=${Math.floor(Date.now() / 300000)}`;
  content.innerHTML = `<div class="toolbar"><div><h2>Radar</h2><p class="sub">Recent NOAA NEXRAD base reflectivity</p></div><div class="seg" aria-label="Radar region"><button data-radar-region="utah" class="${region === "utah" ? "active" : ""}" aria-pressed="${region === "utah"}">Utah</button><button data-radar-region="ne" class="${region === "ne" ? "active" : ""}" aria-pressed="${region === "ne"}">New England</button></div></div><div class="radar-stations" aria-label="Radar view">${RADAR_PRESETS[region].map((x) => `<button data-radar-preset="${x.id}" class="${x.id === preset.id ? "active" : ""}" aria-pressed="${x.id === preset.id}">${x.name}</button>`).join("")}</div><div class="radar-controls"><div class="seg" aria-label="Radar source"><button data-radar-display="map" class="${radarDisplay === "map" ? "active" : ""}" aria-pressed="${radarDisplay === "map"}">Map loop</button><button data-radar-display="station" class="${radarDisplay === "station" ? "active" : ""}" aria-pressed="${radarDisplay === "station"}">NWS station loop</button><button data-radar-display="windy" class="${radarDisplay === "windy" ? "active" : ""}" aria-pressed="${radarDisplay === "windy"}">Windy</button></div></div><section class="card radar-panel">${radarDisplay === "windy" ? `<div class="radar-map-wrap"><iframe class="radar-windy" src="${windyURL(preset)}" title="Windy weather radar · ${preset.name}" allow="fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p class="radar-status">Windy weather radar centered on ${preset.name}. Press play on the timeline to animate recent radar; switch layers or open the full map from the Windy menu.</p>` : radarDisplay === "map" ? `<div class="radar-map-wrap"><div id="radar-map"></div><div class="radar-bar"><button type="button" class="radar-play" aria-label="Pause radar loop">❚❚</button><span class="radar-time">Checking radar time…</span></div><div class="radar-legend" aria-label="Reflectivity scale"><span>Light</span><i></i><span>Heavy</span></div></div><p class="radar-status" role="status">Checking the latest mosaic time…</p>` : `<div class="radar-stations radar-fallback-stations" aria-label="NWS radar station">${nws.map(([id, name]) => `<button data-radar-station="${id}" class="${id === station[0] ? "active" : ""}" aria-pressed="${id === station[0]}">${name}</button>`).join("")}</div><div class="radar-frame"><img class="radar-image" src="${gif}" alt="Animated NWS radar loop from ${station[1]}" width="600" height="550"><div class="state radar-error" hidden>NWS radar loop is temporarily unavailable. Open the NWS radar site below.</div></div><p class="radar-status">NWS station loop · the scan time is printed on the image. <button class="refresh radar-reload" type="button">Reload loop</button></p>`}<div class="radar-actions"><span class="radar-note">${region === "utah" ? "Wasatch terrain can block low-level radar coverage over Park City. " : ""}Radar shows precipitation aloft and can differ from what reaches the ground. ${radarDisplay === "map" ? "If the map looks blank during rain or snow, check the NWS station loop." : ""}</span><span class="radar-links">${radarDisplay === "windy" ? `<a href="https://www.windy.com/-Weather-radar-radar?radar,${preset.c[0]},${preset.c[1]},${preset.z}" target="_blank" rel="noopener">Open on Windy.com ↗</a> · ` : ""}<a href="https://radar.weather.gov/" target="_blank" rel="noopener">Open interactive NWS radar ↗</a></span></div><p class="source">${radarDisplay === "windy" ? 'Radar map embedded from <a href="https://www.windy.com/" target="_blank" rel="noopener">Windy.com</a>.' : radarDisplay === "map" ? 'Mosaic via <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">Iowa Environmental Mesonet</a> · map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.' : "Station loop from the National Weather Service."}</p></section>`;
  content.querySelectorAll("[data-radar-region]").forEach(
    (b) =>
      (b.onclick = () => {
        radarPreset = RADAR_PRESETS[b.dataset.radarRegion][0].id;
        radarStation[b.dataset.radarRegion] = b.dataset.radarRegion === "utah" ? "KMTX" : "KBOX";
        WW.setRegion(b.dataset.radarRegion, true);
        radarView();
        syncHash();
      }),
  );
  content.querySelectorAll("[data-radar-preset]").forEach(
    (b) =>
      (b.onclick = () => {
        radarPreset = b.dataset.radarPreset;
        radarStation[region] =
          radarPreset === "nne"
            ? "KGYX"
            : radarPreset === "sne"
              ? "KOKX"
              : region === "utah"
                ? "KMTX"
                : "KBOX";
        radarView();
        syncHash();
      }),
  );
  content.querySelectorAll("[data-radar-display]").forEach(
    (b) =>
      (b.onclick = () => {
        radarDisplay = b.dataset.radarDisplay;
        radarView();
      }),
  );
  if (radarDisplay === "windy") return;
  if (radarDisplay === "station") {
    content.querySelectorAll("[data-radar-station]").forEach(
      (b) =>
        (b.onclick = () => {
          radarStation[region] = b.dataset.radarStation;
          radarView();
        }),
    );
    content.querySelector(".radar-reload").onclick = () => {
      radarRefresh = Date.now();
      const img = content.querySelector(".radar-image");
      img.src = `https://radar.weather.gov/ridge/standard/${radarStation[region]}_loop.gif?t=${radarRefresh}`;
    };
    const img = content.querySelector(".radar-image");
    img.onerror = () => {
      img.hidden = true;
      content.querySelector(".radar-error").hidden = false;
    };
    return;
  }
  loadLeaflet()
    .then(() => {
      const box = document.querySelector("#radar-map");
      if (!box || !window.L || radarDisplay !== "map") return;
      const map = L.map(box, { scrollWheelZoom: false }).setView(preset.c, preset.z);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 12,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      let stamp = Math.floor(Date.now() / 300000);
      const layers = RADAR_FRAMES.map((m) =>
        L.tileLayer(radarURL(m, stamp), { opacity: 0, maxZoom: 12 }).addTo(map),
      );
      placeLabels(map, region === "utah" ? utah : ne, 5);
      const label = document.querySelector(".radar-time"),
        status = document.querySelector(".radar-status"),
        btn = document.querySelector(".radar-play");
      const st = {
        map,
        layers,
        i: RADAR_FRAMES.length - 1,
        hold: 0,
        playing: true,
        scanTime: null,
        scanStale: false,
      };
      radarState = st;
      const show = () => {
        layers.forEach((l, k) => l.setOpacity(k === st.i ? 0.75 : 0));
        const m = RADAR_FRAMES[st.i];
        label.textContent = st.scanTime
          ? `${m ? "~" : ""}${regionTime(st.scanTime - m * 60000, region, { hour: "numeric", minute: "2-digit" })}${m ? " frame" : ""}`
          : `${m ? m + " min before latest" : "Latest"} · time unavailable`;
        status.textContent = st.scanTime
          ? `${st.scanStale ? "Radar mosaic may be delayed. " : ""}Latest available mosaic: ${regionTime(st.scanTime, region, { weekday: "short", hour: "numeric", minute: "2-digit" })}. Frames are approximately 5 minutes apart; check the NWS station loop if echoes are missing.`
          : "Mosaic scan time unavailable. Check the NWS station loop to verify conditions.";
      };
      show();
      radarScanTime(region, st, show);
      let errors = 0;
      layers.forEach((l) =>
        l.on("tileerror", () => {
          if (++errors === 3 && radarState === st) {
            radarDisplay = "station";
            radarView();
          }
        }),
      );
      st.timer = setInterval(() => {
        if (!st.playing) return;
        if (st.i === RADAR_FRAMES.length - 1 && st.hold < 4) {
          st.hold++;
          return;
        }
        st.hold = 0;
        st.i = (st.i + 1) % RADAR_FRAMES.length;
        show();
      }, 600);
      btn.onclick = () => {
        st.playing = !st.playing;
        btn.textContent = st.playing ? "❚❚" : "▶";
        btn.setAttribute("aria-label", st.playing ? "Pause radar loop" : "Play radar loop");
        if (!st.playing) {
          st.i = RADAR_FRAMES.length - 1;
          show();
        }
      };
      st.refresh = setInterval(() => {
        stamp = Math.floor(Date.now() / 300000);
        layers.forEach((l, k) => l.setUrl(radarURL(RADAR_FRAMES[k], stamp)));
        radarScanTime(region, st, show);
      }, 300000);
      setTimeout(() => map.invalidateSize(), 50);
    })
    .catch(() => {
      if (radarDisplay === "map") {
        radarDisplay = "station";
        radarView();
      }
    });
}

// ---------- URL state ----------
function syncHash() {
  let h;
  if (tab === "long") h = tab;
  else if (tab === "radar") h = `radar/${radarPreset}`;
  else if (tab === "precip") h = `precip/${precipRegion}/${precipModel}`;
  else {
    const mode = view[tab],
      list = tab === "utah" ? utah : ne,
      idx = mode === "mountain" ? profileResort + 2 : selection[tab];
    h = `${tab}/${slug(list[idx]?.name || "")}/${mode}`;
  }
  if (location.hash.slice(1) !== h) history.replaceState(null, "", "#" + h);
}
function nearestForecast(lat, lon) {
  const rad = Math.PI / 180,
    places = [
      ...utah.map((place, i) => ({ section: "utah", place, i })),
      ...ne.map((place, i) => ({ section: "ne", place, i })),
    ];
  return places.reduce((best, x) => {
    const [a, b] = x.place.p[0],
      dLat = (a - lat) * rad,
      dLon = (b - lon) * rad,
      h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(a * rad) * Math.sin(dLon / 2) ** 2,
      d = 2 * 3959 * Math.asin(Math.min(1, Math.sqrt(h)));
    return !best || d < best.miles ? { ...x, miles: d } : best;
  }, null);
}
let locationRequest = 0;
function showClosestForecast(auto = false) {
  if (!navigator.geolocation) return;
  const request = ++locationRequest,
    initialHash = location.hash,
    button = document.querySelector(".nearby");
  const icon = button?.classList.contains("icon-btn");
  if (button && !auto) {
    button.disabled = true;
    if (icon) button.classList.add("busy");
    else button.textContent = "Finding nearby forecast…";
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (request !== locationRequest) return;
      if (auto && location.hash !== initialHash) return;
      const match = nearestForecast(pos.coords.latitude, pos.coords.longitude);
      if (!match) return;
      tab = match.section;
      selection[tab] = match.i;
      view[tab] = "overview";
      render();
      try {
        sessionStorage.setItem("weather:autoForecast", location.hash.slice(1));
      } catch {}
    },
    () => {
      if (button?.isConnected && !auto) {
        button.disabled = false;
        button.classList.remove("busy");
        if (!icon) button.textContent = "⌖ Closest forecast";
        button.title = "Allow location access in your browser to use this feature";
      }
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
  );
}
function addNearbyButton() {
  if (tab !== "long") return;
  const bar = content.querySelector(".toolbar");
  if (!bar) return;
  const button = document.createElement("button");
  button.className = "nearby";
  button.type = "button";
  button.textContent = "⌖ Closest forecast";
  button.title = "Use your device location to select the nearest listed forecast";
  button.onclick = () => showClosestForecast(false);
  bar.appendChild(button);
}
function readHash() {
  const [t, a, b] = location.hash.slice(1).split("/");
  if (t === "utah" && b === "snow") {
    location.replace("snow/#resorts");
    return;
  }
  if (t === "long" || t === "glance") {
    tab = "long";
    return;
  }
  if (t === "precip") {
    tab = "precip";
    if (a === "utah" || a === "ne") precipRegion = a;
    if (b && PM.some((m) => m[0] === b)) precipModel = b;
    return;
  }
  if (t === "radar") {
    tab = "radar";
    if ([...RADAR_PRESETS.utah, ...RADAR_PRESETS.ne].some((x) => x.id === a)) radarPreset = a;
    return;
  }
  if (t === "utah" || t === "ne") {
    tab = t;
    const list = t === "utah" ? utah : ne,
      i = list.findIndex((x) => slug(x.name) === a),
      modes = ["overview", "discussion", "afd", "models", ...(t === "utah" ? ["mountain", "snow"] : [])];
    let mode = modes.includes(b) ? b : "overview";
    if (i >= 0) {
      if (mode === "mountain" && i < 2) mode = "overview";
      if (mode === "mountain") profileResort = i - 2;
      else selection[t] = i;
    }
    view[t] = mode;
    return;
  }
  tab = WW.region();
}
window.addEventListener("hashchange", () => {
  const before = tab;
  readHash();
  render();
  if (tab !== before) scrollTo(0, 0);
});

// ---------- Auto refresh ----------
function clearCaches() {
  snowModelCache.clear();
  cache.clear();
  afdCache.clear();
  modelCache.clear();
  mountainCache.clear();
  alertCache.clear();
  obsCache.clear();
  hourlyCache.clear();
  longData = null;
}
function stampHeader() {
  const el = document.querySelector("#today");
  if (el)
    el.textContent = `${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Denver" }).format(new Date())} · page checked ${ago(lastLoad)}`;
}
function autoRefresh(force) {
  if (!force && Date.now() - lastLoad < REFRESH_MIN * 60000) return;
  if (document.visibilityState !== "visible") return;
  const y = scrollY;
  clearCaches();
  lastLoad = Date.now();
  refreshAllAlerts();
  if (tab !== "radar") render();
  scrollTo(0, y);
  stampHeader();
}
setInterval(() => {
  autoRefresh(false);
  stampHeader();
}, 60000);
document.addEventListener("visibilitychange", () => autoRefresh(false));
// ---------- Long-range snowfall models (carried over from snow-intel) ----------

// Context for the shared "Ask AI" panel (suite.js): what's on screen, as text.
function aiPlaceMatches(question) {
  const q = String(question || "").toLowerCase(),
    all = [
      ...utah.map((place) => ({ place, section: "utah" })),
      ...ne.map((place) => ({ place, section: "ne" })),
    ];
  const aliases = {
    "NH Seacoast": ["nh coast", "new hampshire coast", "north hampton"],
    "Park City": ["park city town"],
    "Canyons Resort": ["canyons"],
    "Newport, RI": ["newport"],
  };
  let found = all.filter((x) =>
    [x.place.name.toLowerCase(), ...(aliases[x.place.name] || [])].some((n) => q.includes(n)),
  );
  if (found.length) return found;
  const broad =
    /\b(entire|whole|all (?:the )?(?:site|dashboard|locations)|across (?:the )?(?:site|dashboard)|overall (?:site|dashboard))\b/i.test(
      q,
    );
  if (broad) return all;
  if (/new england|\bne forecasts\b/i.test(q)) return all.filter((x) => x.section === "ne");
  if (/\butah\b/i.test(q)) return all.filter((x) => x.section === "utah");
  if (tab === "utah" || tab === "ne")
    return [{ place: (tab === "utah" ? utah : ne)[selection[tab]], section: tab }];
  return [];
}
async function aiPlaceContext(x, question, compact) {
  const { place, section } = x,
    p = place.p[0],
    key = p.slice(0, 2).join(",");
  try {
    let d = cache.get(key),
      point = d?.point || (await pointMeta(p));
    if (!d?.forecast) {
      const forecast = (await getJSON(point.forecast)).properties;
      d = { ...(cache.get(key) || {}), point, forecast };
      cache.set(key, d);
    }
    const fc = d.forecast;
    let out =
      "NWS point forecast for " +
      place.name +
      " (" +
      p[2] +
      "), issued " +
      regionTime(fc.updateTime, section, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }) +
      ":\n" +
      (fc.periods || [])
        .slice(0, compact ? 8 : 14)
        .map(
          (v) =>
            regionTime(v.startTime, section, { weekday: "short", hour: "numeric" }) +
            " " +
            v.name +
            ": " +
            v.temperature +
            "°" +
            v.temperatureUnit +
            ", " +
            v.shortForecast +
            ", precip chance " +
            (v.probabilityOfPrecipitation?.value ?? "unknown") +
            "%; " +
            String(v.detailedForecast || "").slice(0, compact ? 90 : 180),
        )
        .join("\n");
    if (!compact) {
      try {
        const h = await hourly(p);
        out +=
          "\nNWS hourly forecast, next 48 hours (time in " +
          (section === "utah" ? "Mountain" : "Eastern") +
          "):\n" +
          (h.periods || [])
            .filter((v) => Date.parse(v.endTime) > Date.now())
            .slice(0, 48)
            .map(
              (v) =>
                regionTime(v.startTime, section, { weekday: "short", hour: "numeric" }) +
                ": " +
                v.temperature +
                "°F, precip " +
                (v.probabilityOfPrecipitation?.value ?? "unknown") +
                "%, " +
                v.shortForecast,
            )
            .join(" | ");
      } catch {
        out += "\nHourly data unavailable.";
      }
      if (/model|\bgfs\b|ecmwf|\bgem\b|guidance/i.test(question)) {
        try {
          const results = await Promise.allSettled(
            MODELS.map(async ([name, id]) => ({ name, id, data: await getJSON(modelURL(p, section, id)) })),
          );
          const data = results
            .filter((r) => r.status === "fulfilled" && r.value.data.daily?.time)
            .map((r) => r.value);
          if (data.length >= 2)
            out +=
              "\nIndependent model daily guidance (not official NWS):\n" +
              modelRows(data, section)
                .slice(0, 10)
                .map(
                  (r) =>
                    r.date +
                    ": " +
                    r.values
                      .map(
                        (v) =>
                          v.name +
                          " " +
                          Math.round(v.high) +
                          "°F, " +
                          v.rain.toFixed(2) +
                          " in liquid precip" +
                          (Number.isFinite(v.snow) ? ", " + v.snow.toFixed(1) + " in modeled snow" : ""),
                      )
                      .join("; "),
                )
                .join("\n");
        } catch {
          out += "\nModel guidance unavailable.";
        }
      }
      if (/discussion|\bafd\b/i.test(question)) {
        try {
          const code = point.cwa || point.gridId,
            list = await getJSON("https://api.weather.gov/products/types/AFD/locations/" + code),
            latest = [...(list["@graph"] || [])].sort(
              (a, b) => Date.parse(b.issuanceTime) - Date.parse(a.issuanceTime),
            )[0];
          if (latest?.["@id"]) {
            const afd = await getJSON(latest["@id"]);
            out +=
              "\nNWS Area Forecast Discussion " +
              code +
              " issued " +
              afd.issuanceTime +
              ":\n" +
              String(afd.productText || "").slice(0, 9000);
          }
        } catch {
          out += "\nArea discussion unavailable.";
        }
      }
    }
    return out;
  } catch {
    return "NWS forecast for " + place.name + " unavailable right now.";
  }
}
window.suiteContext = function (question) {
  const names = {
    utah: "Utah forecasts",
    ne: "New England forecasts",
    radar: "Radar",
    long: "Long range outlook",
    precip: "Precip models",
  };
  let label = names[tab] || tab;
  if (tab === "utah" || tab === "ne") {
    const list = tab === "utah" ? utah : ne,
      mode = view[tab],
      idx = mode === "mountain" ? profileResort + 2 : selection[tab];
    label += " · " + (mode === "snow" ? "all resorts" : list[idx]?.name || "") + " · " + mode;
  }
  const directory =
    "Weather dashboard sections: Long range (CPC 6–10 day, 8–14 day and weeks 3–4), Utah forecasts, New England forecasts, Precip models, Radar. Each forecast location has Overview (NWS 7-day and hourly), Detailed forecast, full Area Forecast Discussion, and model comparison. Separate linked Surf and Snow dashboards are outside this Weather context. Utah locations: " +
    utah.map((x) => x.name).join(", ") +
    ". New England locations: " +
    ne.map((x) => x.name).join(", ") +
    ".";
  const notes =
    "Forecasts are from the National Weather Service unless labeled as model guidance. The NWS hourly and daily values below were fetched for the question, regardless of the visible tab. Long-range CPC outlooks are regional probabilities and do not give the next local rain hour. Answer from the supplied data, cite the source and issuance time where useful, and state when a requested value is unavailable. Utah times are Mountain, New England times are Eastern.";
  const base = {
    app: "Weather Window",
    view: label,
    text: directory + "\n\nCurrent visible view:\n" + content.innerText.trim().slice(0, 6500),
    note: notes,
  };
  if (!question) return base;
  return (async () => {
    const matches = aiPlaceMatches(question),
      compact = matches.length > 3,
      forecast = matches.length
        ? await Promise.all(matches.map((x) => aiPlaceContext(x, question, compact)))
        : [];
    let long = longData;
    if (!long) {
      try {
        long = await getJSON(LONG_RANGE_URL + "?t=" + Math.floor(Date.now() / 600000));
      } catch {}
    }
    const outlook = long
      ? "Long-range CPC outlooks and ensemble means, generated " +
        (long.generatedAt || "unknown") +
        ":\n" +
        JSON.stringify({ periods: long.periods, guidance: long.guidance, modelNote: long.modelNote }).slice(
          0,
          9500,
        )
      : "Long-range dataset unavailable.";
    const alerts = ["utah", "ne"]
      .map(
        (sec) =>
          sec.toUpperCase() +
          " active NWS alerts: " +
          (regionAlerts[sec] || [])
            .map((a) => a.event + " (" + (a.areaDesc || "") + ") " + alertTime(a, sec))
            .join("; "),
      )
      .join("\n");
    return {
      ...base,
      text: [
        directory,
        forecast.join("\n\n"),
        outlook,
        alerts,
        "Current visible view:\n" + content.innerText.trim().slice(0, 4500),
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  })();
};
// ---------- Precip models: our own model maps from Open-Meteo grids (free, on demand) + Windy ----------
let precipRegion = "utah",
  precipModel = "ecmwf_ifs025",
  precipLayer = "rainAccu",
  precipWindyModel = "ecmwf",
  precipProduct = "precip",
  precipHours = 72,
  precipPeriod = "total",
  precipDay = 0,
  precipSlot = -1,
  precipView2 = "grid";
const PRECIP_REGIONS = {
  utah: {
    name: "Utah",
    lat: 40.62,
    lon: -111.6,
    zoom: 7,
    box: [38.9, -113.3, 42.1, -109.5],
    n: 12,
    tz: "America/Denver",
  },
  ne: {
    name: "New England",
    lat: 42.6,
    lon: -71.4,
    zoom: 7,
    box: [40.4, -75.2, 47.5, -66.8],
    n: 13,
    tz: "America/New_York",
  },
};
const PM = [
  // [open-meteo id, label, group, forecast hours available, note]
  ["ncep_hrrr_conus", "HRRR", "US short range", 48, "3 km, hourly updates; best for the next 1–2 days"],
  [
    "ncep_nam_conus",
    "NAM 3 km",
    "US short range",
    60,
    "3 km; good at mountain and coastal detail to 2.5 days",
  ],
  [
    "gem_regional",
    "GEM regional",
    "Short–medium range",
    84,
    "Canada's 10 km model; strong on northeast storms",
  ],
  [
    "ncep_nbm_conus",
    "NBM (NOAA blend)",
    "Blend",
    264,
    "NOAA's calibrated blend of many models; the NWS starting point",
  ],
  ["ecmwf_ifs025", "ECMWF IFS", "Global", 336, "Usually the most skillful global model"],
  ["ecmwf_aifs025_single", "ECMWF AIFS (AI)", "Global", 336, "ECMWF's AI model; strong on storm tracks"],
  ["gfs_seamless", "GFS", "Global", 336, "NOAA global model (runs 16 days; shown to 14)"],
  ["icon_seamless", "ICON (DWD)", "Global", 180, "German global model; a good independent check"],
  ["ukmo_seamless", "UK Met Office", "Global", 168, "Top-tier global model to 7 days"],
  ["gem_global", "GEM global", "Global", 240, "Canada's global model to 10 days"],
];
const PRODUCTS = [
  ["precip", "Total precip (liquid)"],
  ["snow", "Snowfall"],
  ["rain", "Rain only"],
];
const WINDOWS = [
  [3, "3 h"],
  [6, "6 h"],
  [12, "12 h"],
  [24, "24 h"],
  [48, "48 h"],
  [72, "72 h"],
  [120, "5 days"],
  [168, "7 days"],
  [240, "10 days"],
  [336, "14 days"],
];
function modelStep(model) {
  return model === "ncep_hrrr_conus" ? 3 : model === "ncep_nam_conus" ? 6 : model === "gem_regional" ? 12 : 0;
}
function hrsLabel(h) {
  return h <= 72 ? h + " h" : (h % 24 ? (h / 24).toFixed(1).replace(".0", "") : h / 24) + " days";
}
function modelWindows(max, model) {
  const step = modelStep(model),
    w = WINDOWS.filter(([h]) => h <= max && (step ? h >= step : h >= 24));
  if (!w.some(([h]) => h === max)) w.push([max, "Full run · " + hrsLabel(max)]);
  return w;
}
function localParts(at, tz, withHour = false) {
  const opts = { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" };
  if (withHour) {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
    opts.hourCycle = "h23";
  }
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", opts)
      .formatToParts(new Date(at))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, +p.value]),
  );
}
function zonedMidnight(dateUTC, tz) {
  const target = dateUTC.getTime();
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(guess, tz, true),
      local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += target - local;
  }
  return guess;
}
function calendarDay(offset, tz, now = Date.now()) {
  const p = localParts(now, tz),
    date = new Date(Date.UTC(p.year, p.month - 1, p.day + offset)),
    next = new Date(Date.UTC(p.year, p.month - 1, p.day + offset + 1));
  const start = offset ? zonedMidnight(date, tz) : now,
    end = zonedMidnight(next, tz);
  return {
    startMs: start,
    endMs: end,
    label: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date),
  };
}
function modelDayOptions(maxH, tz, now = Date.now()) {
  const out = [];
  for (let i = 0; i < 17; i++) {
    const day = calendarDay(i, tz, now);
    if (i && day.endMs > now + maxH * 3600000) break;
    out.push(day);
  }
  return out;
}
function fitHours() {
  const m = PM.find((x) => x[0] === precipModel);
  if (m) {
    if (precipHours > m[3]) precipHours = modelWindows(m[3], precipModel).at(-1)[0];
    precipDay = Math.min(precipDay, modelDayOptions(m[3], PRECIP_REGIONS[precipRegion].tz).length - 1);
    precipSlot = -1;
  }
}
function modelSlots(day, step, tz, now = Date.now()) {
  if (!step) return [];
  const slots = [],
    span = step * 3600000,
    p = localParts(day.startMs, tz),
    midnight = zonedMidnight(new Date(Date.UTC(p.year, p.month - 1, p.day)), tz);
  for (let start = midnight; start < day.endMs; start += span) {
    const end = Math.min(start + span, day.endMs);
    if (end <= now || end > now + PM.find((x) => x[0] === precipModel)[3] * 3600000) continue;
    const a = Math.max(start, now),
      fmt = (t) =>
        new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(
          new Date(t),
        );
    slots.push({
      startMs: a,
      endMs: end,
      label: day.label + " · " + fmt(a) + "–" + fmt(end),
      shortLabel: fmt(a) + "–" + fmt(end),
    });
  }
  return slots;
}
function precipRange() {
  if (precipPeriod === "day") {
    const day = modelDayOptions(PM.find((x) => x[0] === precipModel)[3], PRECIP_REGIONS[precipRegion].tz)[
      precipDay
    ];
    return precipSlot < 0
      ? day
      : modelSlots(day, modelStep(precipModel), PRECIP_REGIONS[precipRegion].tz)[precipSlot] || day;
  }
  const start = Date.now();
  return {
    startMs: start,
    endMs: start + precipHours * 3600000,
    label: `Total · next ${hrsLabel(precipHours)}`,
  };
}
const gridCache = new Map();
// How often each model gets a new run on Open-Meteo, and roughly how many hours after the run time it appears (UTC).
const MODEL_RUNS = {
  ncep_hrrr_conus: [1, 2],
  ncep_nam_conus: [6, 4],
  gem_regional: [6, 5],
  ncep_nbm_conus: [3, 2],
  ecmwf_ifs025: [6, 7],
  ecmwf_aifs025_single: [6, 7],
  gfs_seamless: [6, 5],
  icon_seamless: [6, 4],
  ukmo_seamless: [6, 6],
  gem_global: [12, 6],
};
function nextRunAvailable(model, from = Date.now()) {
  const [every, delay] = MODEL_RUNS[model] || [3, 0],
    h = 3600000;
  let t = Math.floor((from - delay * h) / (every * h)) * every * h + delay * h;
  while (t <= from) t += every * h;
  return t;
}
function pmStoreGet(k) {
  try {
    const x = JSON.parse(localStorage.getItem("pm:" + k) || "null");
    if (x && Date.now() < (x.expires || 0)) return x.g;
  } catch {}
  return null;
}
function pmStoreSet(k, g) {
  try {
    const keys = Object.keys(localStorage)
      .filter((x) => x.startsWith("pm:"))
      .sort(
        (a, b) =>
          (JSON.parse(localStorage.getItem(a)).saved || 0) - (JSON.parse(localStorage.getItem(b)).saved || 0),
      );
    while (keys.length >= 14) localStorage.removeItem(keys.shift());
    localStorage.setItem(
      "pm:" + k,
      JSON.stringify({ saved: Date.now(), expires: nextRunAvailable(k.split("|")[0]), g }),
    );
  } catch {}
}
function blocks6(time, arr) {
  const t = [],
    v = [];
  for (let i = 0; i < time.length; i += 6) {
    t.push(time[i]);
    let s = 0,
      n = 0;
    for (let k = i; k < Math.min(i + 6, time.length); k++) {
      const a = arr ? arr[k] : null;
      if (Number.isFinite(a)) {
        s += a;
        n++;
      }
    }
    v.push(n ? Math.round(s * 100) / 100 : null);
  }
  return { t, v };
}
let precipMap = null,
  precipOverlay = null;
function gridPoints(R) {
  const [la0, lo0, la1, lo1] = R.box,
    pts = [];
  for (let i = 0; i < R.n; i++)
    for (let j = 0; j < R.n; j++)
      pts.push([la1 - ((la1 - la0) * i) / (R.n - 1), lo0 + ((lo1 - lo0) * j) / (R.n - 1)]);
  return pts;
}
async function modelGrid(model, regionKey) {
  const key = model + "|" + regionKey + "|hourly-v2";
  const c = gridCache.get(key);
  if (c && Date.now() < c.expires) return c.promise;
  const stored = pmStoreGet(key);
  if (stored) {
    const pr = Promise.resolve(stored);
    gridCache.set(key, { expires: nextRunAvailable(model), promise: pr });
    return pr;
  }
  const R = PRECIP_REGIONS[regionKey],
    pts = gridPoints(R);
  const promise = (async () => {
    const chunks = [];
    for (let i = 0; i < pts.length; i += 64) chunks.push(pts.slice(i, i + 64));
    const parts = [];
    for (const ch of chunks) {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${ch.map((p) => p[0].toFixed(3)).join(",")}&longitude=${ch.map((p) => p[1].toFixed(3)).join(",")}&hourly=precipitation,snowfall,rain&models=${model}&forecast_days=${Math.min(14, Math.ceil((PM.find((x) => x[0] === model)?.[3] || 168) / 24) + 1)}&precipitation_unit=inch&timezone=GMT`;
      const r = await fetch(u);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new Error(j.reason || "HTTP " + r.status);
        e.status = r.status;
        throw e;
      }
      parts.push(Array.isArray(j) ? j : [j]);
    }
    const locs = parts.flat();
    if (!locs.length || !locs[0].hourly) throw Error("no data");
    const snowCm = (locs[0].hourly_units?.snowfall || "").includes("cm");
    const tm = locs[0].hourly.time.map((t) => Date.parse(t + "Z")),
      short = modelStep(model) > 0;
    const compact = (a) => (short ? a : blocks6(tm, a).v);
    const g = {
      pts,
      time: short
        ? tm
        : blocks6(
            tm,
            tm.map(() => 0),
          ).t,
      vals: locs.map((l) => ({
        p: compact(l.hourly.precipitation),
        s: compact(l.hourly.snowfall.map((v) => (v == null ? null : snowCm ? v / 2.54 : v))),
        r: compact(l.hourly.rain),
      })),
      block: short ? 1 : 6,
    };
    pmStoreSet(key, g);
    return g;
  })();
  gridCache.set(key, { expires: nextRunAvailable(model), promise });
  promise.catch(() => gridCache.delete(key));
  return promise;
}
function windowSums(g, range, product) {
  const block = (g.block || 1) * 3600000,
    start = range.startMs,
    end = range.endMs;
  const idx = g.time
    .map((t, i) => ({ i, weight: Math.max(0, Math.min(t + block, end) - Math.max(t, start)) / block }))
    .filter((x) => x.weight > 0);
  return {
    values: g.vals.map((v) => {
      const a = product === "snow" ? v.s : product === "rain" ? v.r : v.p;
      if (!a) return null;
      let total = 0,
        n = 0;
      for (const { i, weight } of idx) {
        if (Number.isFinite(a[i])) {
          total += a[i] * weight;
          n++;
        }
      }
      return n ? total : null;
    }),
    covered: idx.length,
  };
}
// Single-hue-order viridis ramp: increasing brightness and saturation makes amounts readable without red/green cues.
const VIRIDIS = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"];
const SCALES = {
  precip: [0.01, 0.1, 0.25, 0.5, 1, 2, 4, 8].map((t, i) => [t, VIRIDIS[i]]),
  snow: [0.1, 1, 3, 6, 12, 18, 24, 36].map((t, i) => [t, VIRIDIS[i]]),
};
function colorFor(v, scale) {
  if (v == null || v < scale[0][0]) return null;
  let c = scale[0][1];
  for (const [t, col] of scale) if (v >= t) c = col;
  return c;
}
function hexRGB(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function drawGrid(values, R, scale) {
  const n = R.n,
    W = 320,
    H = 320,
    cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d"),
    img = ctx.createImageData(W, H);
  const at = (i, j) => values[i * n + j];
  for (let y = 0; y < H; y++) {
    const fy = (y / (H - 1)) * (n - 1),
      i0 = Math.floor(fy),
      i1 = Math.min(n - 1, i0 + 1),
      ty = fy - i0;
    for (let x = 0; x < W; x++) {
      const fx = (x / (W - 1)) * (n - 1),
        j0 = Math.floor(fx),
        j1 = Math.min(n - 1, j0 + 1),
        tx = fx - j0;
      const q = [at(i0, j0), at(i0, j1), at(i1, j0), at(i1, j1)];
      if (q.some((v) => v == null)) continue;
      const v = (q[0] * (1 - tx) + q[1] * tx) * (1 - ty) + (q[2] * (1 - tx) + q[3] * tx) * ty;
      const c = colorFor(v, scale);
      if (!c) continue;
      const [r, g, b] = hexRGB(c),
        k = (y * W + x) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = 210;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}
function legendHTML(scale) {
  return `<div class="pm-legend" aria-label="Precipitation intensity in inches, increasing from dark purple to yellow"><span>Less</span>${scale.map(([t, c]) => `<span><i style="background:${c}"></i>${t}″</span>`).join("")}<span>More</span></div>`;
}
function nearestIdx(g, lat, lon) {
  let b = 0,
    d = 1e9;
  g.pts.forEach((p, i) => {
    const e = (p[0] - lat) ** 2 + (p[1] - lon) ** 2;
    if (e < d) {
      d = e;
      b = i;
    }
  });
  return b;
}
async function compareAt(lat, lon, el) {
  el.innerHTML = '<div class="state">Checking every model at this spot…</div>';
  const R = PRECIP_REGIONS[precipRegion];
  const range = precipRange();
  const rows = await Promise.all(
    PM.map(async ([id, name, , maxH]) => {
      try {
        const j = await (
          await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=precipitation,snowfall,rain&models=${id}&forecast_days=${Math.min(14, Math.ceil(maxH / 24) + 1)}&precipitation_unit=inch&timezone=GMT`,
          )
        ).json();
        const g = {
          time: j.hourly.time.map((t) => Date.parse(t + "Z")),
          vals: [
            {
              p: j.hourly.precipitation,
              s: j.hourly.snowfall.map((v) =>
                v == null ? null : (j.hourly_units?.snowfall || "").includes("cm") ? v / 2.54 : v,
              ),
              r: j.hourly.rain,
            },
          ],
        };
        const short = range.endMs > Date.now() + maxH * 3600000,
          w = short && precipPeriod === "day" ? null : windowSums(g, range, precipProduct);
        return { name, v: w?.values[0] ?? null, short, maxH };
      } catch {
        return { name, v: null };
      }
    }),
  );
  const f = (v) => (v == null ? "–" : v < 0.05 ? "0" : v.toFixed(v < 10 ? 1 : 0) + "″");
  const max = Math.max(...rows.map((r) => r.v || 0));
  el.innerHTML = `<h4>All models at ${lat.toFixed(2)}, ${lon.toFixed(2)} · ${PRODUCTS.find((p) => p[0] === precipProduct)[1]} · ${range.label}</h4><div class="pm-compare">${rows.map((r) => `<div class="pm-bar"><span>${escapeHTML(r.name)}${r.short ? ` <small>(only ${hrsLabel(r.maxH)})</small>` : ""}</span><i style="width:${max ? Math.max(1, ((r.v || 0) / max) * 100) : 0}%"></i><b>${f(r.v)}</b></div>`).join("")}</div>`;
}

/* Model totals at each forecast location (town or mid-mountain point), one request per model. */
const placeGridCache = new Map();
function placeGrid(model, regionKey) {
  const key = model + "|" + regionKey;
  const c = placeGridCache.get(key);
  if (c && Date.now() < c.expires) return c.promise;
  const pts = (regionKey === "utah" ? utah : ne).map((pl) => pl.p[0]);
  const maxH = PM.find((x) => x[0] === model)?.[3] || 168;
  const promise = (async () => {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map((p) => p[0].toFixed(3)).join(",")}&longitude=${pts.map((p) => p[1].toFixed(3)).join(",")}&hourly=precipitation,snowfall,rain&models=${model}&forecast_days=${Math.min(14, Math.ceil(maxH / 24) + 1)}&precipitation_unit=inch&timezone=GMT`;
    const r = await fetch(u);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j.reason || "HTTP " + r.status);
      e.status = r.status;
      throw e;
    }
    const locs = Array.isArray(j) ? j : [j];
    const snowCm = (locs[0].hourly_units?.snowfall || "").includes("cm");
    return {
      time: locs[0].hourly.time.map((t) => Date.parse(t + "Z")),
      block: 1,
      vals: locs.map((l) => ({
        p: l.hourly.precipitation,
        s: l.hourly.snowfall.map((v) => (v == null ? null : snowCm ? v / 2.54 : v)),
        r: l.hourly.rain,
      })),
    };
  })();
  placeGridCache.set(key, { expires: nextRunAvailable(model), promise });
  promise.catch(() => placeGridCache.delete(key));
  return promise;
}
let precipTableRun = 0;
async function drawPrecipTable() {
  const table = document.querySelector("#pm-table");
  if (!table) return;
  const run = ++precipTableRun,
    region = precipRegion,
    places = region === "utah" ? utah : ne,
    range = precipRange(),
    product = precipProduct;
  const label = document.querySelector("#pm-table-label");
  if (label) label.textContent = `${PRODUCTS.find((p) => p[0] === product)[1]} · ${range.label}`;
  const cols = await Promise.all(
    PM.map(async (m) => {
      try {
        const g = await placeGrid(m[0], region),
          short = range.endMs > Date.now() + m[3] * 3600000;
        if (short && precipPeriod === "day") return { m, short, vals: null };
        return { m, short, vals: windowSums(g, range, product).values };
      } catch (e) {
        return { m, err: e };
      }
    }),
  );
  if (run !== precipTableRun || !table.isConnected) return;
  const f = (v) => (v == null ? "–" : v < 0.05 ? "0" : v.toFixed(v < 10 ? 1 : 0) + "″");
  const anyShort = cols.some((c) => c.short && c.vals);
  table.innerHTML = `<thead><tr><th scope="col">Location</th>${cols
    .map(
      (c) =>
        `<th scope="col" class="${c.m[0] === precipModel ? "sel" : ""}"><button type="button" data-pm-col="${c.m[0]}" title="Show ${escapeHTML(c.m[1])} on the map">${escapeHTML(c.m[1])}</button></th>`,
    )
    .join("")}</tr></thead><tbody>${places
    .map((pl, i) => {
      const row = cols.map((c) => (c.vals ? c.vals[i] : null)),
        max = Math.max(...row.filter((v) => v != null && v >= 0.05));
      return `<tr><th scope="row">${escapeHTML(pl.name)}</th>${cols
        .map((c, k) => {
          const v = row[k];
          return `<td class="${c.m[0] === precipModel ? "sel" : ""}${v != null && v === max ? " top" : ""}">${c.err ? '<span class="muted">n/a</span>' : f(v) + (c.short && c.vals ? "<sup>*</sup>" : "")}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("")}</tbody>`;
  const note = document.querySelector("#pm-table-note");
  if (note)
    note.innerHTML = `Bold marks the highest model at each location.${anyShort ? " <sup>*</sup>The model's forecast ends before this window, so its total covers less time." : ""}${cols.some((c) => c.err) ? " n/a: that model didn't load (Open-Meteo's free limit may be used up)." : ""} Utah resorts use their mid-mountain point.`;
  table.querySelectorAll("[data-pm-col]").forEach(
    (b) =>
      (b.onclick = () => {
        precipModel = b.dataset.pmCol;
        fitHours();
        render();
      }),
  );
}
async function drawPrecipModel() {
  drawPrecipTable();
  const R = PRECIP_REGIONS[precipRegion],
    st = document.querySelector("#pm-status");
  if (!precipMap) return;
  st.textContent = "Loading model grid…";
  try {
    const g = await modelGrid(precipModel, precipRegion);
    const range = precipRange(),
      w = windowSums(g, range, precipProduct);
    const scale = precipProduct === "snow" ? SCALES.snow : SCALES.precip;
    if (precipOverlay) precipMap.removeLayer(precipOverlay);
    const [la0, lo0, la1, lo1] = R.box;
    precipOverlay = L.imageOverlay(
      drawGrid(w.values, R, scale),
      [
        [la0, lo0],
        [la1, lo1],
      ],
      { opacity: 0.9, interactive: false },
    ).addTo(precipMap);
    const vals = w.values.filter((v) => v != null),
      mx = vals.length ? Math.max(...vals) : 0,
      m = PM.find((x) => x[0] === precipModel);
    const nx = new Date(nextRunAvailable(precipModel)).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: R.tz,
    });
    st.innerHTML = `${escapeHTML(m[1])} · next run ~${nx} · ${range.label} · max in view ${mx < 0.05 ? "0" : mx.toFixed(mx < 10 ? 1 : 0)}″${range.endMs > Date.now() + m[3] * 3600000 ? ` · <b>this model only runs ${m[3]} h</b>` : ""}`;
    document.querySelector("#pm-legend").innerHTML = legendHTML(scale);
    precipMap._pmGrid = g;
  } catch (e) {
    const nm = PM.find((x) => x[0] === precipModel)[1];
    st.textContent =
      e.status === 429
        ? `Open-Meteo's free limit is used up for now (${e.message}). Maps come back within the minute or hour; the daily limit resets at midnight UTC.`
        : `${nm} couldn't load: ${e.message}`;
    if (precipOverlay) {
      precipMap.removeLayer(precipOverlay);
      precipOverlay = null;
    }
  }
}
function precipView() {
  fitHours();
  const R = PRECIP_REGIONS[precipRegion];
  if (precipMap) {
    try {
      precipMap.remove();
    } catch {}
    precipMap = null;
    precipOverlay = null;
  }
  const windy = `https://embed.windy.com/embed2.html?lat=${R.lat}&lon=${R.lon}&detailLat=${R.lat}&detailLon=${R.lon}&zoom=${R.zoom}&level=surface&overlay=${precipLayer}&product=${precipWindyModel}&menu=&message=true&marker=&calendar=now&type=map&location=coordinates&metricRain=in&metricSnow=in&metricTemp=%C2%B0F&metricWind=mph`;
  const groups = [...new Set(PM.map((m) => m[2]))];
  content.innerHTML = `<div class="toolbar"><div><h2>Precip models</h2><p class="sub">Rain and snow from 10 forecast models, mapped for your regions</p></div><div class="seg" aria-label="Region">${Object.entries(
    PRECIP_REGIONS,
  )
    .map(
      ([k, r]) =>
        `<button data-pr="${k}" class="${k === precipRegion ? "active" : ""}" aria-pressed="${k === precipRegion}">${r.name}</button>`,
    )
    .join("")}</div></div>
 <div class="seg pm-viewtabs" aria-label="View"><button data-pv="grid" class="${precipView2 === "grid" ? "active" : ""}">All models map</button><button data-pv="windy" class="${precipView2 === "windy" ? "active" : ""}">Windy animation</button></div>
 ${
   precipView2 === "grid"
     ? `<section class="card afd-card"><div class="pm-controls"><label>Model <select id="pm-model">${groups
         .map(
           (gr) =>
             `<optgroup label="${gr}">${PM.filter((m) => m[2] === gr)
               .map(
                 (m) => `<option value="${m[0]}" ${m[0] === precipModel ? "selected" : ""}>${m[1]}</option>`,
               )
               .join("")}</optgroup>`,
         )
         .join(
           "",
         )}</select></label><div class="seg" aria-label="Product">${PRODUCTS.map(([k, n]) => `<button data-pp="${k}" class="${k === precipProduct ? "active" : ""}">${n}</button>`).join("")}</div><div class="seg" aria-label="Period"><button data-pt="total" class="${precipPeriod === "total" ? "active" : ""}">Total from now</button><button data-pt="day" class="${precipPeriod === "day" ? "active" : ""}">Individual day</button></div>${
         precipPeriod === "total"
           ? `<div class="seg" aria-label="Window">${modelWindows(
               PM.find((x) => x[0] === precipModel)[3],
               precipModel,
             )
               .map(
                 ([h, n]) =>
                   `<button data-ph="${h}" class="${h === precipHours ? "active" : ""}">${n}</button>`,
               )
               .join("")}</div>`
           : `<div class="pm-day-nav" aria-label="Forecast date"><button type="button" data-day-step="-1" aria-label="Previous day" ${precipDay === 0 ? "disabled" : ""}>‹</button><span id="pm-day-label" aria-live="polite">${modelDayOptions(PM.find((x) => x[0] === precipModel)[3], R.tz)[precipDay].label}</span><button type="button" data-day-step="1" aria-label="Next day" ${precipDay === modelDayOptions(PM.find((x) => x[0] === precipModel)[3], R.tz).length - 1 ? "disabled" : ""}>›</button></div>`
       }</div>${precipPeriod === "day" && modelStep(precipModel) ? `<div id="pm-slots" class="pm-slots" aria-label="Short range forecast periods"></div>` : ""}<div class="pm-table-wrap"><h3>All models by location <span class="muted" id="pm-table-label"></span></h3><div class="model-table-wrap pm-scroll"><table class="pm-table" id="pm-table"><tbody><tr><td class="state">Loading every model…</td></tr></tbody></table></div><p class="source" id="pm-table-note"></p></div><h3 class="pm-map-title">Map · ${escapeHTML(PM.find((x) => x[0] === precipModel)[1])}</h3><p class="pm-note">${escapeHTML(PM.find((x) => x[0] === precipModel)[4])} · data to ${hrsLabel(PM.find((x) => x[0] === precipModel)[3])}</p>
 <div class="pm-meta"><span id="pm-status">Loading…</span><span id="pm-legend"></span></div><div class="pm-mapwrap" style="--pm-ar:${(((R.box[3] - R.box[1]) * Math.cos((((R.box[0] + R.box[2]) / 2) * Math.PI) / 180)) / (R.box[2] - R.box[0])).toFixed(3)}"><div id="pm-map"></div></div><p class="pm-hint">Tap anywhere on the map to compare all 10 models at that spot.</p><div id="pm-compare"></div><p class="source">Model data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo ↗</a> (NOAA, ECMWF, Environment Canada, DWD, UK Met Office), sampled on a ${R.n}×${R.n} grid (about ${Math.round(((R.box[3] - R.box[1]) / (R.n - 1)) * 85)} km apart) and smoothed, so small terrain features are approximate. Snowfall is each model's own estimate. Total mode accumulates from now. Individual day uses local calendar dates: today covers the remaining hours, and later dates cover midnight to midnight. Short-range maps use hourly model values; longer-range maps use six-hour blocks apportioned at period boundaries. Amounts remain approximate because the map samples a coarse grid.</p></section>`
     : `<section class="card afd-card"><div class="chart-controls"><h3>Windy · ${R.name}</h3><div class="seg" aria-label="Model">${[
         ["ecmwf", "ECMWF"],
         ["gfs", "GFS"],
         ["icon", "ICON"],
       ]
         .map(
           ([k, n]) =>
             `<button data-pw="${k}" class="${k === precipWindyModel ? "active" : ""}">${n}</button>`,
         )
         .join("")}</div></div><div class="radar-stations">${[
         ["rainAccu", "Precip accumulation"],
         ["snowAccu", "Snow accumulation"],
         ["ptype", "Precip type"],
       ]
         .map(([k, n]) => `<button data-pl="${k}" class="${k === precipLayer ? "active" : ""}">${n}</button>`)
         .join(
           "",
         )}</div><iframe class="precip-frame" title="Windy precipitation map" src="${windy}" loading="lazy"></iframe><p class="source">Animated map by <a href="https://www.windy.com/" target="_blank" rel="noopener">Windy.com ↗</a>; use its timeline to step through the forecast.</p></section>`
 }`;
  const re = () => render();
  content.querySelectorAll("[data-pr]").forEach(
    (b) =>
      (b.onclick = () => {
        precipRegion = b.dataset.pr;
        re();
      }),
  );
  content.querySelectorAll("[data-pv]").forEach(
    (b) =>
      (b.onclick = () => {
        precipView2 = b.dataset.pv;
        re();
      }),
  );
  content.querySelectorAll("[data-pw]").forEach(
    (b) =>
      (b.onclick = () => {
        precipWindyModel = b.dataset.pw;
        re();
      }),
  );
  content.querySelectorAll("[data-pl]").forEach(
    (b) =>
      (b.onclick = () => {
        precipLayer = b.dataset.pl;
        re();
      }),
  );
  if (precipView2 !== "grid") return;
  const sel = document.querySelector("#pm-model");
  sel.onchange = () => {
    precipModel = sel.value;
    fitHours();
    render();
  };
  content.querySelectorAll("[data-pp]").forEach(
    (b) =>
      (b.onclick = () => {
        precipProduct = b.dataset.pp;
        content.querySelectorAll("[data-pp]").forEach((x) => x.classList.toggle("active", x === b));
        drawPrecipModel();
      }),
  );
  content.querySelectorAll("[data-pt]").forEach(
    (b) =>
      (b.onclick = () => {
        precipPeriod = b.dataset.pt;
        render();
      }),
  );
  function updatePrecipSlots() {
    const box = content.querySelector("#pm-slots");
    if (!box) return;
    const day = modelDayOptions(PM.find((x) => x[0] === precipModel)[3], R.tz)[precipDay],
      step = modelStep(precipModel),
      slots = modelSlots(day, step, R.tz);
    if (precipSlot >= slots.length) precipSlot = -1;
    box.innerHTML = `<span class="pm-slot-caption">${step}-hour periods</span><button type="button" data-slot="-1" class="${precipSlot < 0 ? "active" : ""}" aria-pressed="${precipSlot < 0}">Full day</button>${slots.map((slot, i) => `<button type="button" data-slot="${i}" class="${i === precipSlot ? "active" : ""}" aria-pressed="${i === precipSlot}">${escapeHTML(slot.shortLabel)}</button>`).join("")}`;
    box.querySelectorAll("[data-slot]").forEach(
      (b) =>
        (b.onclick = () => {
          precipSlot = +b.dataset.slot;
          updatePrecipSlots();
          content.querySelector("#pm-compare").innerHTML = "";
          precipMap?.closePopup();
          drawPrecipModel();
        }),
    );
  }
  updatePrecipSlots();
  content.querySelectorAll("[data-day-step]").forEach(
    (b) =>
      (b.onclick = () => {
        const days = modelDayOptions(PM.find((x) => x[0] === precipModel)[3], R.tz);
        precipDay = Math.max(0, Math.min(days.length - 1, precipDay + +b.dataset.dayStep));
        precipSlot = -1;
        content.querySelector("#pm-day-label").textContent = days[precipDay].label;
        content.querySelector('[data-day-step="-1"]').disabled = precipDay === 0;
        content.querySelector('[data-day-step="1"]').disabled = precipDay === days.length - 1;
        updatePrecipSlots();
        document.querySelector("#pm-compare").innerHTML = "";
        precipMap?.closePopup();
        drawPrecipModel();
      }),
  );
  content.querySelectorAll("[data-ph]").forEach(
    (b) =>
      (b.onclick = () => {
        precipHours = +b.dataset.ph;
        content.querySelectorAll("[data-ph]").forEach((x) => x.classList.toggle("active", x === b));
        document.querySelector("#pm-compare").innerHTML = "";
        precipMap?.closePopup();
        drawPrecipModel();
      }),
  );
  drawPrecipTable();
  loadLeaflet()
    .then(() => {
      const box = document.querySelector("#pm-map");
      if (!box || !window.L) return;
      const [la0, lo0, la1, lo1] = R.box;
      const bounds = L.latLngBounds([
        [la0, lo0],
        [la1, lo1],
      ]);
      precipMap = L.map(box, { scrollWheelZoom: false, zoomSnap: 0.25, zoomDelta: 0.5 }).fitBounds(bounds, {
        padding: [2, 2],
      });
      precipMap.setMinZoom(precipMap.getZoom());
      precipMap.setMaxBounds(bounds.pad(0.1));
      L.polygon(
        [
          [
            [85, -179],
            [85, 179],
            [-85, 179],
            [-85, -179],
          ],
          [
            [la0, lo0],
            [la1, lo0],
            [la1, lo1],
            [la0, lo1],
          ],
        ],
        { stroke: false, fillColor: "#071d2b", fillOpacity: 0.6, interactive: false },
      ).addTo(precipMap);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 12,
        attribution: "© OpenStreetMap",
      }).addTo(precipMap);
      placeLabels(precipMap, precipRegion === "utah" ? utah : ne, 4);
      precipMap.on("click", (e) => {
        const g = precipMap._pmGrid;
        const c = document.querySelector("#pm-compare");
        if (g) {
          const range = precipRange(),
            w = windowSums(g, range, precipProduct),
            v = w.values[nearestIdx(g, e.latlng.lat, e.latlng.lng)];
          L.popup()
            .setLatLng(e.latlng)
            .setContent(
              `${escapeHTML(PM.find((x) => x[0] === precipModel)[1])} · ${range.label}: <b>${v == null ? "–" : v.toFixed(1)}″</b>`,
            )
            .openOn(precipMap);
        }
        if (c) compareAt(e.latlng.lat, e.latlng.lng, c);
      });
      setTimeout(() => {
        precipMap.invalidateSize();
        precipMap.fitBounds(bounds, { padding: [2, 2] });
        precipMap.setMinZoom(precipMap.getZoom());
      }, 60);
      drawPrecipModel();
    })
    .catch(() => {
      const st = document.querySelector("#pm-status");
      if (st) st.textContent = "Map library unavailable right now.";
    });
}

WW.init({ base: "", active: "forecast" });
selection.utah = recallPlace("utah");
selection.ne = recallPlace("ne");
let lastAutoForecast = "";
try {
  lastAutoForecast = sessionStorage.getItem("weather:autoForecast") || "";
} catch {}
const openedWithoutForecastLink =
  !location.hash || (!!lastAutoForecast && location.hash.slice(1) === lastAutoForecast);
readHash();
render();
if (openedWithoutForecastLink) showClosestForecast(true);
refreshAllAlerts();
if (!longData) {
  getJSON(LONG_RANGE_URL + "?t=" + Math.floor(Date.now() / 600000))
    .then((d) => {
      if (!longData) {
        longData = d;
        longDataTime = Date.now();
      }
    })
    .catch(() => {});
}
stampHeader();
