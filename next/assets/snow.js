const RESORTS = utah.slice(2);

const SNOTEL_URL = "https://raw.githubusercontent.com/bg197550/weather-window/data/snotel.json";
let snotel = null;
const content = document.querySelector("#content");
let tab = "resorts",
  hourlyResort = 0,
  hourlyPoint = 1,
  lastLoad = Date.now();
const TABS = { resorts: "Resorts", models: "Models", snowpack: "Snowpack", hourly: "Hourly" };

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
        if (box.isConnected) box.innerHTML = hourlyChart(h.periods || [], "America/Denver", 48, chartWidth(el));
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
function render() {
  const head = `<div class="toolbar"><div><h2>Snow Report</h2><p class="sub">Wasatch resorts · NWS forecasts, global models and measured snowpack</p></div><div class="detail-actions"><a class="xlink" href="https://utahavalanchecenter.org/" target="_blank" rel="noopener">Avalanche forecast ↗</a><a class="xlink" href="../webcams/#utah">▣ Webcams ›</a></div></div><div class="forecast-tabs snow-tabs" role="tablist" aria-label="Snow report sections">${Object.entries(
    TABS,
  )
    .map(
      ([k, n]) =>
        `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}</button>`,
    )
    .join("")}</div><div id="alert-banner"></div>`;
  if (tab === "resorts") {
    content.innerHTML =
      head +
      `<article class="card afd-card" id="resort-snow"><div class="state">Loading NWS snow grids for all resorts…</div></article>`;
    loadResortSnow();
  } else if (tab === "models") {
    content.innerHTML =
      head +
      `<article class="card afd-card" id="snow-models"><div class="state">Loading long-range snowfall models…</div></article>`;
    loadSnowModels();
  } else if (tab === "snowpack") {
    content.innerHTML =
      head +
      `<article class="card afd-card"><h3>Measured snowpack · SNOTEL</h3><p class="afd-intro">Automated snow depth and snow-water measurements near the resorts.</p><div id="snowpack">${snowpackHTML(snotel)}</div></article>`;
    loadSnotel().then((d) => {
      const el = document.querySelector("#snowpack");
      if (el) el.innerHTML = snowpackHTML(d);
    });
  } else {
    content.innerHTML =
      head +
      `<article class="card afd-card">${resortPills(hourlyResort, "data-hr")}<div id="hourly-view"><div class="state">Loading hourly forecast…</div></div></article>`;
    content.querySelectorAll("[data-hr]").forEach(
      (b) =>
        (b.onclick = () => {
          hourlyResort = +b.dataset.hr;
          render();
        }),
    );
    loadHourlyView();
  }
  content.querySelectorAll(".snow-tabs [data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        render();
      }),
  );
  loadMountainAlerts();
  const h = tab + (tab === "hourly" ? "/" + slug(RESORTS[hourlyResort].name) : "");
  if (location.hash.slice(1) !== h) history.replaceState(null, "", "#" + h);
}
function readHash() {
  const [t, a] = location.hash.slice(1).split("/");
  if (TABS[t]) tab = t;
  if (t === "hourly" && a) {
    const i = RESORTS.findIndex((r) => slug(r.name) === a);
    if (i >= 0) hourlyResort = i;
  }
}
window.addEventListener("hashchange", () => {
  readHash();
  render();
});
WW.init({ base: "../", active: "snow", lockRegion: "utah" });
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
    note: "Resort snow totals are NWS gridded forecasts; the model tab is independent global model guidance (GFS, ECMWF, AIFS, GraphCast); SNOTEL values are measured. Times are Mountain.",
  };
};
readHash();
render();
loadSnotel();
stamp();
