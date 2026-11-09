/* One navigation for every Weather Window page (Weather, Webcams, Snow report).
   Desktop: Forecast · Insights · Cams · Snow report · Maps & outlooks ▾ under the app bar.
   Phones: a fixed bottom bar with Forecast · Insights · Cams · Radar · More (Precip models, Long range).
   The Snow report and Surf are reached from the app bar at the top.
   Forecast, Insights and Cams follow the current place, which every page shares through localStorage. */
window.WW = (function () {
  const REGION_KEY = "ww:region";
  const PLACE_KEY = "ww:current";
  const REGIONS = { utah: "Utah", ne: "New England" };
  const DEFAULTS = {
    utah: { section: "utah", slug: "snyderville", name: "Snyderville", cam: "" },
    ne: { section: "ne", slug: "boston", name: "Boston", cam: "" },
  };
  const SECTIONS = [
    { key: "forecast", label: "Forecast", icon: "☀", href: (b, c) => `${b}#${c.section}/${c.slug}/forecast` },
    { key: "insights", label: "Insights", icon: "◆", href: (b, c) => `${b}#${c.section}/${c.slug}/insights` },
    { key: "cams", label: "Cams", icon: "▣", href: (b, c) => `${b}webcams/#${c.cam || c.section}` },
    { key: "snow", label: "Snow report", icon: "❄", href: (b) => `${b}snow/#resorts` },
    { key: "radar", label: "Radar", icon: "◎", href: (b, c) => `${b}#radar/${c.section === "ne" ? "sne" : "wasatch"}`, maps: true },
    { key: "precip", label: "Precip models", icon: "☂", href: (b, c) => `${b}#precip/${c.section}`, maps: true },
    { key: "long", label: "Long range", icon: "≋", href: (b) => `${b}#long`, maps: true },
  ];
  const BAR = ["forecast", "insights", "cams", "radar"];
  let base = "",
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

  /* The place the shared links point at: the last one shown on any page. */
  function place() {
    try {
      const c = JSON.parse(get(PLACE_KEY) || "null");
      if (c && REGIONS[c.section] && typeof c.slug === "string" && c.slug) return { ...DEFAULTS[c.section], ...c };
    } catch {}
    return DEFAULTS[get(REGION_KEY) === "ne" ? "ne" : "utah"];
  }
  function setPlace(c) {
    if (!c || !REGIONS[c.section] || !c.slug) return;
    const next = { section: c.section, slug: c.slug, name: c.name || c.slug, cam: c.cam || "" },
      cur = place();
    put(PLACE_KEY, JSON.stringify(next));
    put(REGION_KEY, next.section);
    if (cur.section !== next.section || cur.slug !== next.slug || cur.cam !== next.cam || cur.name !== next.name) paint();
  }
  function region() {
    return place().section;
  }
  /* Pages with a region of their own (radar, long range) remember it as the default for the next visit. */
  function setRegion(r) {
    if (REGIONS[r]) put(REGION_KEY, r);
  }
  function setActive(key) {
    if (key === active) return;
    active = key;
    paint();
  }
  function link(s, c, cls) {
    const tab = s.key === "forecast" ? ` data-tab="${c.section}"` : "";
    return `<a class="${cls}" href="${s.href(base, c)}" data-ww="${s.key}"${tab}${s.key === active ? ' aria-current="page"' : ""}><span class="ww-ico" aria-hidden="true">${s.icon}</span><span class="ww-lbl">${s.label}</span></a>`;
  }
  function paint() {
    const c = place();
    const top = document.querySelector(".suite-nav-inner");
    if (top) {
      const mapsOn = SECTIONS.some((s) => s.maps && s.key === active);
      top.setAttribute("aria-label", "Weather Window sections");
      top.innerHTML = `<div class="ww-links">${SECTIONS.filter((s) => !s.maps)
        .map((s) => link(s, c, "suite-tab ww-top"))
        .join(
          "",
        )}<div class="ww-menu"><button type="button" class="suite-tab ww-top ww-menu-btn" aria-expanded="false" aria-haspopup="true"${mapsOn ? ' aria-current="page"' : ""}><span class="ww-ico" aria-hidden="true">◎</span><span class="ww-lbl">Maps &amp; outlooks</span><span class="ww-caret" aria-hidden="true">▾</span></button><div class="ww-menu-list" hidden>${SECTIONS.filter((s) => s.maps)
        .map((s) => link(s, c, "ww-menu-link"))
        .join("")}</div></div></div><span class="ww-place">📍 ${esc(c.name)}</span>`;
    }
    let bar = document.querySelector(".ww-tabbar");
    if (!bar) {
      bar = document.createElement("nav");
      bar.className = "ww-tabbar";
      bar.setAttribute("aria-label", "Weather Window sections");
      document.body.appendChild(bar);
    }
    const inMore = SECTIONS.some((s) => s.maps && !BAR.includes(s.key) && s.key === active);
    bar.innerHTML = `${BAR.map((k) => link(SECTIONS.find((s) => s.key === k), c, "ww-tab")).join("")}<button type="button" class="ww-tab ww-more-btn" aria-expanded="false" aria-controls="ww-sheet"${inMore ? ' aria-current="page"' : ""}><span class="ww-ico" aria-hidden="true">⋯</span><span class="ww-lbl">More</span></button>`;
    let sheet = document.querySelector("#ww-sheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "ww-sheet";
      sheet.className = "ww-sheet";
      sheet.hidden = true;
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = `<div class="ww-sheet-panel" role="dialog" aria-label="More sections"><div class="ww-sheet-head"><b>More</b><button type="button" class="ww-sheet-close" aria-label="Close">✕</button></div><div class="ww-sheet-links">${SECTIONS.filter((s) => s.maps && !BAR.includes(s.key))
      .map((s) => link(s, c, "ww-sheet-link"))
      .join("")}</div></div>`;
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
    active = opts.active || "forecast";
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
  return { init, region, setRegion, setActive, setPlace, place, REGIONS };
})();
