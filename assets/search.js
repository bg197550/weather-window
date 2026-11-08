/* Location search for the Weather page: find a US ZIP code or town, save it, and forecast it like a built-in place.
   Saved searches live in this browser (localStorage) and are appended to the utah (West) or ne (East) lists,
   so every forecast view works unchanged. Classic script: loaded after common.js, before app.js. */

const SEARCH_KEY = "ww:searched";
const SEARCH_MAX = 10;
const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico",
};
const STATE_ABBR = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v.toLowerCase(), k]));

/* West of 100°W goes with Utah (Mountain/Pacific), east with New England. */
const sectionFor = (lon) => (lon < -100 ? "utah" : "ne");
const r4 = (x) => Math.round(x * 10000) / 10000;

function readSearched() {
  try {
    const list = JSON.parse(localStorage.getItem(SEARCH_KEY) || "[]");
    return Array.isArray(list)
      ? list.filter((x) => x && typeof x.name === "string" && Number.isFinite(x.lat) && Number.isFinite(x.lon)).slice(0, SEARCH_MAX)
      : [];
  } catch {
    return [];
  }
}
function writeSearched(list) {
  try {
    localStorage.setItem(SEARCH_KEY, JSON.stringify(list.slice(0, SEARCH_MAX)));
  } catch {}
}
function searchedPlace(x) {
  return { name: x.name, p: [[x.lat, x.lon, x.label || "Searched location"]], zone: x.zone || null, searched: true };
}
/* Built-in places stay first; saved searches follow in each list. */
function installSearched() {
  for (const list of [utah, ne]) for (let i = list.length - 1; i >= 0; i--) if (list[i].searched) list.splice(i, 1);
  for (const x of readSearched()) (sectionFor(x.lon) === "utah" ? utah : ne).push(searchedPlace(x));
}
installSearched();

/* Saves a search (most recent first) and returns where it sits in the place lists. */
function addSearched(x) {
  const entry = { name: x.name, lat: r4(x.lat), lon: r4(x.lon), label: x.label || "", zone: x.zone || null };
  const builtIn = [...utah, ...ne].find((p) => !p.searched && slug(p.name) === slug(entry.name));
  if (builtIn) entry.name += ` (${entry.lat.toFixed(2)}, ${entry.lon.toFixed(2)})`;
  const list = readSearched().filter((y) => slug(y.name) !== slug(entry.name));
  writeSearched([entry, ...list]);
  installSearched();
  const section = sectionFor(entry.lon),
    places = section === "utah" ? utah : ne;
  return { section, i: places.findIndex((p) => p.searched && p.name === entry.name) };
}
function removeSearched(name) {
  writeSearched(readSearched().filter((y) => y.name !== name));
  installSearched();
}
function setSearchedZone(name, zone) {
  const list = readSearched(),
    x = list.find((y) => y.name === name);
  if (!x || !zone || x.zone === zone) return;
  x.zone = zone;
  writeSearched(list);
  for (const p of [...utah, ...ne]) if (p.searched && p.name === name) p.zone = zone;
}

/* ---------- geocoding ---------- */
async function searchZip(zip) {
  const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (r.status === 404) return [];
  if (!r.ok) throw Error(`ZIP lookup ${r.status}`);
  const j = await r.json();
  return (j.places || []).map((p) => ({
    name: `${p["place name"]}, ${p["state abbreviation"]}`,
    detail: `ZIP ${zip} · ${p.state}`,
    label: `ZIP ${zip}`,
    lat: +p.latitude,
    lon: +p.longitude,
  }));
}
async function searchName(q) {
  // "Bend, OR" / "Bend Oregon": search the town, then keep matches in that state.
  let town = q,
    state = null;
  const m = q.match(/^(.*?)[,\s]+([A-Za-z .]+)$/);
  if (m) {
    const s = m[2].trim();
    const abbr = s.length === 2 ? s.toUpperCase() : STATE_ABBR[s.toLowerCase()];
    if (abbr && STATES[abbr] && m[1].trim()) {
      town = m[1].trim();
      state = STATES[abbr];
    }
  }
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  Object.entries({ name: town, count: 20, language: "en", format: "json", countryCode: "US" }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  if (!r.ok) throw Error(`Town lookup ${r.status}`);
  const j = await r.json();
  return (j.results || [])
    .filter((x) => !state || x.admin1 === state)
    .slice(0, 8)
    .map((x) => {
      const abbr = STATE_ABBR[(x.admin1 || "").toLowerCase()] || x.admin1 || "";
      return {
        name: `${x.name}${abbr ? ", " + abbr : ""}`,
        detail: [x.admin2, x.admin1, x.elevation != null ? `${Math.round(x.elevation * 3.28084).toLocaleString()} ft` : ""]
          .filter(Boolean)
          .join(" · "),
        label: x.elevation != null ? `Town · ~${Math.round(x.elevation * 3.28084).toLocaleString()} ft` : "Town",
        lat: x.latitude,
        lon: x.longitude,
        zone: x.timezone || null,
      };
    });
}
async function geocode(q) {
  q = q.trim();
  const zip = q.match(/^(\d{5})(?:-\d{4})?$/);
  if (zip) return searchZip(zip[1]);
  if (q.length < 2) return [];
  return searchName(q);
}

/* ---------- panel ---------- */
function searchPanelHTML() {
  const saved = readSearched();
  return `<form class="place-search-form" role="search"><label class="sr-only" for="place-search-input">ZIP code or town</label><input id="place-search-input" type="search" inputmode="search" autocomplete="off" enterkeyhint="search" placeholder="ZIP code or town, e.g. 84060 or Bend, OR" /><button type="submit">Search</button><button type="button" class="place-search-close" aria-label="Close search">✕</button></form><div class="place-search-results" aria-live="polite"></div>${
    saved.length
      ? `<div class="place-search-saved"><h4>Your searches</h4><ul>${saved
          .map(
            (x) =>
              `<li><button type="button" class="ps-open" data-name="${escapeHTML(x.name)}">${escapeHTML(x.name)}</button><button type="button" class="ps-remove" data-name="${escapeHTML(x.name)}" aria-label="Remove ${escapeHTML(x.name)}">✕</button></li>`,
          )
          .join("")}</ul></div>`
      : ""
  }<p class="muted place-search-note">US locations only (NWS forecasts). Saved searches stay in this browser and appear in the location menu.</p>`;
}

/* onOpen(section, index) shows a place; onChange() redraws after a saved search is removed. */
function openPlaceSearch(host, onOpen, onChange) {
  if (!host) return;
  if (!host.hidden && host.innerHTML) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  host.innerHTML = searchPanelHTML();
  const input = host.querySelector("#place-search-input"),
    out = host.querySelector(".place-search-results");
  let seq = 0,
    timer = 0,
    shown = [];
  // Confirms NWS covers the point (and learns its time zone) before saving it.
  const pick = async (x) => {
    out.innerHTML = `<div class="state">Loading ${escapeHTML(x.name)}…</div>`;
    try {
      const point = await pointMeta([r4(x.lat), r4(x.lon)]);
      if (!point?.forecast) throw Error("no forecast");
      x = { ...x, zone: point.timeZone || x.zone };
    } catch {
      out.innerHTML = `<div class="error">The National Weather Service has no forecast for ${escapeHTML(x.name)}.</div>`;
      return;
    }
    const at = addSearched(x);
    if (at.i >= 0) onOpen(at.section, at.i);
  };
  const run = async (submit) => {
    const q = input.value,
      id = ++seq;
    if (!q.trim()) {
      out.innerHTML = "";
      return;
    }
    out.innerHTML = '<div class="state">Searching…</div>';
    try {
      const res = await geocode(q);
      if (id !== seq) return;
      shown = res;
      if (!res.length) {
        out.innerHTML = `<div class="state">No US match for “${escapeHTML(q.trim())}”. Try a 5-digit ZIP or “Town, ST”.</div>`;
        return;
      }
      if (submit && res.length === 1) return pick(res[0]);
      out.innerHTML = `<ul>${res
        .map(
          (x, i) =>
            `<li><button type="button" data-i="${i}"><b>${escapeHTML(x.name)}</b><small>${escapeHTML(x.detail || "")}</small></button></li>`,
        )
        .join("")}</ul>`;
      out.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => pick(shown[+b.dataset.i])));
    } catch (e) {
      if (id === seq) out.innerHTML = `<div class="error">Search is unavailable right now (${escapeHTML(e.message)}). Try again shortly.</div>`;
    }
  };
  input.oninput = () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (/^\d{1,4}$/.test(v)) {
      seq++;
      out.innerHTML = "";
      return;
    }
    timer = setTimeout(() => run(false), 350);
  };
  host.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    clearTimeout(timer);
    run(true);
  };
  host.querySelector(".place-search-close").onclick = () => {
    host.hidden = true;
    host.innerHTML = "";
  };
  host.querySelectorAll(".ps-open").forEach(
    (b) =>
      (b.onclick = () => {
        const name = b.dataset.name;
        for (const [section, list] of [["utah", utah], ["ne", ne]]) {
          const i = list.findIndex((p) => p.searched && p.name === name);
          if (i >= 0) return onOpen(section, i);
        }
      }),
  );
  host.querySelectorAll(".ps-remove").forEach(
    (b) =>
      (b.onclick = () => {
        removeSearched(b.dataset.name);
        onChange();
      }),
  );
  input.focus();
}
