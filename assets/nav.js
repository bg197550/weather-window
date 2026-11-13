/* One navigation for every Weather Window page, in two sections that match the app bar's Weather · Surf · Snow.
   Weather (any town or mountain): Forecast · Insights · Radar · Maps ▾ (storm map, precip models, long range).
   Snow (one mountain at a time): Snow forecast · Cams · All mountains · Snowpack.
   Phones get the same items in a bottom bar (Weather's maps sit under More).
   The current place and the current mountain are shared by every page through localStorage; picking a mountain
   in either section carries over to the other. */
window.WW = (function () {
  const REGION_KEY = "ww:region";
  const PLACE_KEY = "ww:current";
  const MOUNTAIN_KEY = "ww:mountain";
  const REGIONS = { utah: "Utah", ne: "New England" };
  const DEFAULTS = {
    utah: { section: "utah", slug: "snyderville", name: "Snyderville", cam: "" },
    ne: { section: "ne", slug: "boston", name: "Boston", cam: "" },
  };
  /* Dashboard ski areas (slug → name, region, cams id). Towns open their nearest one in the Snow section. */
  const MOUNTAINS = {
    "park-city-mountain": ["Park City Mountain", "utah", "park-city"],
    "deer-valley": ["Deer Valley", "utah", "deer-valley"],
    "canyons-resort": ["Canyons Resort", "utah", "canyons-resort"],
    alta: ["Alta", "utah", "alta"],
    snowbird: ["Snowbird", "utah", "snowbird"],
    solitude: ["Solitude", "utah", "solitude"],
    brighton: ["Brighton", "utah", "brighton"],
    snowbasin: ["Snowbasin", "utah", "snowbasin"],
    "stratton-mountain": ["Stratton Mountain", "ne", "stratton"],
    killington: ["Killington", "ne", "killington"],
    stowe: ["Stowe", "ne", "stowe"],
    gunstock: ["Gunstock", "ne", "gunstock"],
  };
  const NEAR = { snyderville: "canyons-resort", "park-city": "park-city-mountain", utah: "alta", ne: "killington" };
  /* Searched places anywhere (section "world") use the current region for region-wide pages. */
  const regionOf = (m, c) => (REGIONS[m.section] ? m.section : c.section);
  const mountainFrom = (id) => (MOUNTAINS[id] ? { section: MOUNTAINS[id][1], slug: id, name: MOUNTAINS[id][0], cam: MOUNTAINS[id][2], mtn: true } : null);
  const SECTIONS = {
    weather: [
      { key: "forecast", label: "Forecast", icon: "☀", href: (b, c) => `${b}#${c.section}/${c.slug}/forecast` },
      { key: "insights", label: "Insights", icon: "◆", href: (b, c) => `${b}#${c.section}/${c.slug}/insights` },
      { key: "radar", label: "Radar", icon: "◎", href: (b, c) => `${b}#radar/${c.section === "ne" ? "sne" : "wasatch"}` },
      { key: "storm", label: "Storm map", icon: "◍", href: (b, c) => `${b}${c.section === "ne" ? "weather-map-northeast.html" : "weather-map-west.html"}`, menu: true },
      { key: "precip", label: "Precip models", icon: "☂", href: (b, c) => `${b}#precip/${c.section}`, menu: true },
      { key: "long", label: "Long range", icon: "≋", href: (b) => `${b}#long`, menu: true },
    ],
    snow: [
      { key: "mountain", label: "Snow forecast", short: "Forecast", icon: "❄", href: (b, c, m) => `${b}snow/#mountain/${m.section}/${m.slug}` },
      { key: "cams", label: "Cams", icon: "▣", href: (b, c, m) => `${b}webcams/#${m.cam || regionOf(m, c)}` },
      { key: "snowreport", label: "All mountains", short: "Mountains", icon: "▤", href: (b, c, m) => `${b}snow/#forecast/${regionOf(m, c)}` },
      { key: "snowmap", label: "Snow map", short: "Map", icon: "◈", href: (b, c, m) => `${b}snow/#map/${regionOf(m, c)}` },
      { key: "snowpack", label: "Snowpack", icon: "≈", href: (b, c, m) => `${b}snow/#snowpack/${regionOf(m, c)}` },
    ],
  };
  let base = "",
    group = "weather",
    active = "forecast";

  function get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  function put(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  }
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  /* The place the Weather links point at: the last one shown on any page. */
  function place() {
    try {
      const c = JSON.parse(get(PLACE_KEY) || "null");
      if (c && REGIONS[c.section] && typeof c.slug === "string" && c.slug) return { ...DEFAULTS[c.section], ...c };
    } catch {}
    return DEFAULTS[get(REGION_KEY) === "ne" ? "ne" : "utah"];
  }
  /* The mountain the Snow links point at: the current place if it is a ski area, else the last mountain shown,
     else the one nearest the current town, else the region's main mountain. */
  function mountain() {
    const c = place();
    let saved = null;
    try {
      saved = JSON.parse(get(MOUNTAIN_KEY) || "null");
    } catch {}
    // A place searched in the Snow section wins while it is the most recent choice.
    if (saved?.section === "world" && saved.slug && (saved.t || 0) > (c.t || 0)) return saved;
    if (c.mtn || MOUNTAINS[c.slug]) return mountainFrom(c.slug) || c;
    try {
      const m = saved;
      if (m && m.slug && (m.section === c.section || m.section === "world")) return m;
    } catch {}
    return mountainFrom(NEAR[c.slug]) || mountainFrom(NEAR[c.section]);
  }
  function setPlace(c) {
    if (!c || !REGIONS[c.section] || !c.slug) return;
    const mtn = !!(c.mtn || MOUNTAINS[c.slug]);
    const next = { section: c.section, slug: c.slug, name: c.name || c.slug, cam: c.cam || MOUNTAINS[c.slug]?.[2] || "", t: Date.now(), ...(mtn ? { mtn: true } : {}) },
      cur = place();
    put(PLACE_KEY, JSON.stringify(next));
    put(REGION_KEY, next.section);
    if (mtn) put(MOUNTAIN_KEY, JSON.stringify(next));
    if (cur.section !== next.section || cur.slug !== next.slug || cur.cam !== next.cam || cur.name !== next.name) paint();
  }
  /* Snow section: show a mountain. A dashboard region's mountain also becomes the current place, so Weather
     follows; a place searched in the Snow section (anywhere) is only remembered as the current mountain. */
  function setMountain(m) {
    if (REGIONS[m.section]) return setPlace({ ...m, mtn: true });
    const cur = mountain();
    put(MOUNTAIN_KEY, JSON.stringify({ section: m.section, slug: m.slug, name: m.name || m.slug, cam: "", mtn: true, t: Date.now() }));
    if (cur.slug !== m.slug) paint();
  }
  function region() {
    return place().section;
  }
  /* Pages with a region of their own (radar, long range) remember it as the default for the next visit. */
  function setRegion(r) {
    if (REGIONS[r]) put(REGION_KEY, r);
  }
  function setActive(key, g) {
    if (key === active && (!g || g === group)) return;
    active = key;
    if (g) group = g;
    paint();
  }
  function link(s, c, m, cls) {
    const tab = s.key === "forecast" ? ` data-tab="${c.section}"` : "";
    return `<a class="${cls}" href="${s.href(base, c, m)}" data-ww="${s.key}"${tab}${s.key === active ? ' aria-current="page"' : ""}><span class="ww-ico" aria-hidden="true">${s.icon}</span><span class="ww-lbl">${s.short ? `<span class="ww-lg">${esc(s.label)}</span><span class="ww-sm">${esc(s.short)}</span>` : esc(s.label)}</span></a>`;
  }
  function paint() {
    const c = place(),
      m = mountain(),
      items = SECTIONS[group];
    const main = items.filter((s) => !s.menu),
      menu = items.filter((s) => s.menu);
    const top = document.querySelector(".suite-nav-inner");
    if (top) {
      const menuOn = menu.some((s) => s.key === active);
      top.setAttribute("aria-label", group === "snow" ? "Snow sections" : "Weather sections");
      top.innerHTML = `<div class="ww-links">${main.map((s) => link(s, c, m, "suite-tab ww-top")).join("")}${
        menu.length
          ? `<div class="ww-menu"><button type="button" class="suite-tab ww-top ww-menu-btn" aria-expanded="false" aria-haspopup="true"${menuOn ? ' aria-current="page"' : ""}><span class="ww-ico" aria-hidden="true">◍</span><span class="ww-lbl">Maps</span><span class="ww-caret" aria-hidden="true">▾</span></button><div class="ww-menu-list" hidden>${menu.map((s) => link(s, c, m, "ww-menu-link")).join("")}</div></div>`
          : ""
      }</div><span class="ww-place">${group === "snow" ? "⛷" : "📍"} ${esc(group === "snow" ? m.name : c.name)}</span>`;
    }
    let bar = document.querySelector(".ww-tabbar");
    if (!bar) {
      bar = document.createElement("nav");
      bar.className = "ww-tabbar";
      bar.setAttribute("aria-label", "Weather Window sections");
      document.body.appendChild(bar);
    }
    const menuOn = menu.some((s) => s.key === active);
    bar.innerHTML = `${main.map((s) => link(s, c, m, "ww-tab")).join("")}${
      menu.length ? `<button type="button" class="ww-tab ww-more-btn" aria-expanded="false" aria-controls="ww-sheet"${menuOn ? ' aria-current="page"' : ""}><span class="ww-ico" aria-hidden="true">⋯</span><span class="ww-lbl">Maps</span></button>` : ""
    }`;
    let sheet = document.querySelector("#ww-sheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "ww-sheet";
      sheet.className = "ww-sheet";
      sheet.hidden = true;
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = `<div class="ww-sheet-panel" role="dialog" aria-label="Maps"><div class="ww-sheet-head"><b>Maps</b><button type="button" class="ww-sheet-close" aria-label="Close">✕</button></div><div class="ww-sheet-links">${menu.map((s) => link(s, c, m, "ww-sheet-link")).join("")}</div></div>`;
    wire();
  }
  function openSheet(open) {
    const sheet = document.querySelector("#ww-sheet"),
      btn = document.querySelector(".ww-more-btn");
    if (!sheet) return;
    sheet.hidden = !open;
    btn?.setAttribute("aria-expanded", String(open));
    if (open) sheet.querySelector("button,a")?.focus();
  }
  function openMenu(open) {
    const btn = document.querySelector(".ww-menu-btn"),
      list = document.querySelector(".ww-menu-list");
    if (!btn || !list) return;
    list.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) {
      const r = btn.getBoundingClientRect();
      list.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 230))}px`;
      list.style.top = `${r.bottom + 4}px`;
    }
  }
  function wire() {
    const more = document.querySelector(".ww-more-btn");
    if (more) more.onclick = () => openSheet(more.getAttribute("aria-expanded") !== "true");
    const sheet = document.querySelector("#ww-sheet");
    if (sheet)
      sheet.onclick = (e) => {
        if (e.target === sheet || e.target.closest(".ww-sheet-close") || e.target.closest("a")) openSheet(false);
      };
    const menu = document.querySelector(".ww-menu-btn");
    if (menu)
      menu.onclick = (e) => {
        e.stopPropagation();
        openMenu(menu.getAttribute("aria-expanded") !== "true");
      };
    document.querySelectorAll(".ww-menu-link").forEach((a) => (a.onclick = () => openMenu(false)));
  }
  /* The shared app bar (from Surf Window) links to the live site; inside the preview, point it at the preview. */
  /* The app bar draws itself after this script runs, so links are fixed when it appears and again on click. */
  const PREVIEW = location.pathname.match(/^(.*\/preview\/)/);
  const LIVE = /^https?:\/\/bg197550\.github\.io\/weather-window\/(?!preview\/)/;
  const LIVE_SURF = /^https?:\/\/bg197550\.github\.io\/surf-window\/(?!preview\/)/;
  function toPreview(a) {
    if (!PREVIEW || !a?.href) return;
    if (LIVE.test(a.href)) a.href = a.href.replace(LIVE, location.origin + PREVIEW[1]);
    else if (LIVE_SURF.test(a.href)) a.href = a.href.replace(LIVE_SURF, "https://bg197550.github.io/surf-window/preview/");
  }
  function localizeSuite() {
    if (!PREVIEW) return;
    const fix = () => document.querySelectorAll("a[href]").forEach(toPreview);
    fix();
    document.addEventListener("DOMContentLoaded", fix);
    new MutationObserver(fix).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", (e) => toPreview(e.target.closest?.("a")), true);
  }
  function offline() {
    let el = document.querySelector(".ww-offline");
    if (navigator.onLine) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "ww-offline";
      el.setAttribute("role", "status");
      el.textContent = "You're offline. Showing the last saved forecasts; times on each card show their age.";
      document.querySelector(".suite-nav")?.after(el);
    }
  }
  function init(opts) {
    base = opts.base || "";
    group = opts.group === "snow" ? "snow" : "weather";
    active = opts.active || (group === "snow" ? "mountain" : "forecast");
    document.documentElement.classList.add("ww-has-tabbar");
    paint();
    localizeSuite();
    addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        openSheet(false);
        openMenu(false);
      }
    });
    addEventListener("click", (e) => {
      if (!e.target.closest(".ww-menu")) openMenu(false);
    });
    addEventListener("scroll", () => openMenu(false), { passive: true });
    addEventListener("online", offline);
    addEventListener("offline", offline);
    offline();
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register(base + "sw.js").catch(() => {});
    }
  }
  return { init, region, setRegion, setActive, setPlace, place, mountain, setMountain, MOUNTAINS, REGIONS };
})();
