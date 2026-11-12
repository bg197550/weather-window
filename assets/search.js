/* Location search for the Weather page: find a US ZIP code or town, save it, and forecast it like a built-in place.
   Saved searches live in this browser (localStorage) and are appended to the utah (West) or ne (East) lists,
   so every forecast view works unchanged. Classic script: loaded after common.js, before app.js. */

const SEARCH_KEY = "ww:searched";
const SEARCH_MAX = 10;
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
  return { name: x.name, p: [[x.lat, x.lon, x.label || "Searched location"]], zone: x.zone || null, searched: true, ...(x.ski ? { ski: x.ski } : {}) };
}
/* Built-in places stay first; saved searches follow in each list. */
function installSearched() {
  for (const list of [utah, ne]) for (let i = list.length - 1; i >= 0; i--) if (list[i].searched) list.splice(i, 1);
  for (const x of readSearched()) (sectionFor(x.lon) === "utah" ? utah : ne).push(searchedPlace(x));
}
installSearched();

/* Saves a search (most recent first) and returns where it sits in the place lists. */
function addSearched(x) {
  const entry = { name: x.name, lat: r4(x.lat), lon: r4(x.lon), label: x.label || "", zone: x.zone || null, ...(x.ski ? { ski: x.ski } : {}) };
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

/* ZIP, town and ski-area lookups live in common.js (shared with the Snow Report). */

/* ---------- place picker panel ---------- */
const placeEntries = () => [
  ...utah.map((p, i) => ({ p, section: "utah", i })),
  ...ne.map((p, i) => ({ p, section: "ne", i })),
];
function chip(x, cur) {
  const on = cur && cur.section === x.section && cur.index === x.i;
  return `<button type="button" data-sec="${x.section}" data-i="${x.i}" aria-current="${on}">${escapeHTML(x.p.name)}</button>`;
}
function groupsHTML(cur) {
  const all = placeEntries(),
    group = (title, list, extra = "") =>
      list.length ? `<section><h4>${title}</h4><div class="chips">${list.map((x) => chip(x, cur) + (extra ? extra(x) : "")).join("")}</div></section>` : "";
  const mine = all.filter((x) => x.p.searched);
  return `<div class="place-pick-groups">${group("Utah", all.filter((x) => x.section === "utah" && !x.p.searched))}${group(
    "New England",
    all.filter((x) => x.section === "ne" && !x.p.searched),
  )}${group("Your searches", mine, (x) => `<button type="button" class="chip-x" data-remove="${escapeHTML(x.p.name)}" aria-label="Remove ${escapeHTML(x.p.name)}">✕</button>`)}</div>`;
}

/* onOpen(section, index) shows a place; onChange() redraws after a saved search is removed.
   cur = { section, index } marks the place on screen. */
function openPlaceSearch(host, onOpen, onChange, cur) {
  if (!host) return;
  if (!host.hidden && host.innerHTML) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  host.innerHTML = `<form class="place-search-form" role="search"><label class="sr-only" for="place-search-input">Find a place</label><input id="place-search-input" type="search" inputmode="search" autocomplete="off" enterkeyhint="search" placeholder="Filter, or search a US ZIP, town or ski area" /><button type="submit">Search</button><button type="button" class="place-search-close" aria-label="Close">✕</button></form><div class="place-search-results" aria-live="polite"></div><div class="place-search-groups">${groupsHTML(cur)}</div><p class="muted place-search-note">Searches cover US towns, ZIP codes and ski areas (NWS forecasts) and are saved in this browser. Ski areas: OpenSkiMap.</p>`;
  const input = host.querySelector("#place-search-input"),
    out = host.querySelector(".place-search-results"),
    groups = host.querySelector(".place-search-groups");
  let seq = 0,
    timer = 0,
    shown = [];
  const close = () => {
    host.hidden = true;
    host.innerHTML = "";
    document.querySelector("#place-switch")?.setAttribute("aria-expanded", "false");
  };
  const wireChips = (root) => {
    root.querySelectorAll("[data-sec]").forEach((b) => (b.onclick = () => onOpen(b.dataset.sec, +b.dataset.i)));
    root.querySelectorAll("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          removeSearched(b.dataset.remove);
          onChange();
        }),
    );
  };
  wireChips(groups);
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
  // Typing filters the built-in places at once; a ZIP or town lookup follows for anything else.
  const filter = (q) => {
    const n = q.trim().toLowerCase();
    if (!n) {
      groups.hidden = false;
      return [];
    }
    groups.hidden = true;
    return placeEntries().filter((x) => x.p.name.toLowerCase().includes(n));
  };
  const render = (local, remote, note) => {
    out.innerHTML = `${local.length ? `<div class="place-pick-groups"><section><h4>Your places</h4><div class="chips">${local.map((x) => chip(x, cur)).join("")}</div></section></div>` : ""}${
      remote.length
        ? `<ul>${remote
            .map((x, i) => `<li><button type="button" data-r="${i}"><b>${escapeHTML(x.name)}</b><small>${escapeHTML(x.detail || "")}</small></button></li>`)
            .join("")}</ul>`
        : ""
    }${note || ""}`;
    wireChips(out);
    out.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => pick(shown[+b.dataset.r])));
  };
  const run = async (submit) => {
    const q = input.value,
      id = ++seq,
      local = filter(q);
    if (!q.trim()) {
      out.innerHTML = "";
      return;
    }
    if (/^\d{1,4}$/.test(q.trim())) return render(local, [], "");
    render(local, [], '<div class="state">Searching ZIP codes, towns and ski areas…</div>');
    try {
      // Ski areas first (the list loads once), then towns; a failed ski lookup never blocks towns.
      const [ski, towns] = await Promise.all([/^\d/.test(q.trim()) ? [] : searchSki(q, { usOnly: true, max: 5 }).catch(() => []), geocode(q)]);
      const res = [...ski, ...towns];
      if (id !== seq) return;
      shown = res;
      if (submit && !local.length && res.length === 1) return pick(res[0]);
      render(
        local,
        res,
        res.length || local.length ? "" : `<div class="state">No US match for “${escapeHTML(q.trim())}”. Try a 5-digit ZIP, “Town, ST” or a ski area name.</div>`,
      );
    } catch (e) {
      if (id === seq) render(local, [], `<div class="error">Town and ZIP search is unavailable right now (${escapeHTML(e.message)}).</div>`);
    }
  };
  input.oninput = () => {
    clearTimeout(timer);
    const v = input.value.trim();
    filter(v);
    if (!v) {
      seq++;
      out.innerHTML = "";
      return;
    }
    render(filter(v), [], "");
    timer = setTimeout(() => run(false), 400);
  };
  host.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    clearTimeout(timer);
    run(true);
  };
  host.querySelector(".place-search-close").onclick = close;
  if (matchMedia("(min-width: 761px)").matches) input.focus();
}
