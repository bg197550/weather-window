/* Separate Weather and Snow navigation, shared across their pages.
   Desktop: section links with the region switch under the app bar.
   Phones: a fixed bottom tab bar for the current app.
   The chosen region is remembered in localStorage and shared by every page. */
window.WW = (function () {
  const REGION_KEY = "ww:region";
  const REGIONS = { utah: "Utah", ne: "New England" };
  const WEATHER_SECTIONS = [
    { key: "forecast", label: "Forecast", icon: "☀", href: (b, r) => `${b}#${r}` },
    {
      key: "radar",
      label: "Radar",
      icon: "◎",
      href: (b, r) => `${b}#radar/${r === "ne" ? "sne" : "wasatch"}`,
    },
    { key: "precip", label: "Precip models", icon: "☂", href: (b, r) => `${b}#precip/${r}`, more: true },
    { key: "long", label: "Long range", icon: "≋", href: (b) => `${b}#long`, more: true },
  ];
  const SNOW_SECTIONS = [
    { key: "cams", label: "Webcams", icon: "▣", href: (b, r) => `${b}webcams/#${r}` },
    { key: "resorts", label: "Resorts", icon: "❄", href: (b) => `${b}snow/#resorts` },
    { key: "snowpack", label: "Snowpack", icon: "▥", href: (b) => `${b}snow/#snowpack` },
    { key: "models", label: "Models", icon: "☂", href: (b) => `${b}snow/#models` },
    { key: "hourly", label: "Hourly", icon: "◷", href: (b) => `${b}snow/#hourly` },
  ];
  let SECTIONS = WEATHER_SECTIONS, sectionName = "Weather sections";
  let base = "",
    active = "forecast",
    regionLocked = null;

  function region() {
    if (regionLocked) return regionLocked;
    try {
      return localStorage.getItem(REGION_KEY) === "ne" ? "ne" : "utah";
    } catch {
      return "utah";
    }
  }
  /* silent: the page already switched itself, so only remember and repaint the nav. */
  function setRegion(r, silent) {
    if (!REGIONS[r]) return;
    const changed = r !== region();
    try {
      localStorage.setItem(REGION_KEY, r);
    } catch {}
    paint();
    if (changed && !silent) dispatchEvent(new CustomEvent("ww-region", { detail: r }));
  }
  function setActive(key) {
    active = key;
    paint();
  }
  function regionSwitch(cls) {
    if (regionLocked) return `<span class="ww-region-fixed ${cls}">${REGIONS[regionLocked]} only</span>`;
    const r = region();
    return `<div class="ww-region ${cls}" role="group" aria-label="Region">${Object.entries(REGIONS)
      .map(([k, n]) => `<button type="button" data-ww-region="${k}" aria-pressed="${k === r}">${n}</button>`)
      .join("")}</div>`;
  }
  function link(s, r, cls) {
    const cur = s.key === active;
    const tab = s.key === "forecast" ? ` data-tab="${r}"` : "";
    return `<a class="${cls}" href="${s.href(base, r)}" data-ww="${s.key}"${tab}${cur ? ' aria-current="page"' : ""}><span class="ww-ico" aria-hidden="true">${s.icon}</span><span class="ww-lbl">${s.short && cls === "ww-tab" ? s.short : s.label}</span></a>`;
  }
  function paint() {
    const r = region();
    const top = document.querySelector(".suite-nav-inner");
    if (top) {
      top.setAttribute("aria-label", sectionName);
      top.removeAttribute("role");
      top.innerHTML = `<div class="ww-links">${SECTIONS.map((s) => link(s, r, "suite-tab ww-top")).join("")}</div>${regionSwitch("ww-region-top")}`;
    }
    let bar = document.querySelector(".ww-tabbar");
    if (!bar) {
      bar = document.createElement("nav");
      bar.className = "ww-tabbar";
      bar.setAttribute("aria-label", sectionName);
      document.body.appendChild(bar);
    }
    const hasMore = SECTIONS.some((s) => s.more);
    bar.style.gridTemplateColumns = `repeat(${SECTIONS.filter((s) => !s.more).length + (hasMore ? 1 : 0)}, 1fr)`;
    const inMore = SECTIONS.some((s) => s.more && s.key === active);
    bar.innerHTML = `${SECTIONS.filter((s) => !s.more)
      .map((s) => link(s, r, "ww-tab"))
      .join(
        "",
      )}${hasMore ? `<button type="button" class="ww-tab ww-more-btn" aria-expanded="false" aria-controls="ww-sheet"${inMore ? ' aria-current="page"' : ""}><span class="ww-ico" aria-hidden="true">⋯</span><span class="ww-lbl">More</span></button>` : ""}`;
    let sheet = document.querySelector("#ww-sheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "ww-sheet";
      sheet.className = "ww-sheet";
      sheet.hidden = true;
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = `<div class="ww-sheet-panel" role="dialog" aria-label="More sections"><div class="ww-sheet-head"><b>Region</b><button type="button" class="ww-sheet-close" aria-label="Close">✕</button></div>${regionSwitch("ww-region-sheet")}<div class="ww-sheet-links">${SECTIONS.filter(
      (s) => s.more,
    )
      .map((s) => link(s, r, "ww-sheet-link"))
      .join(
        "",
      )}<a class="ww-sheet-link" href="https://bg197550.github.io/surf-window/"><span class="ww-ico" aria-hidden="true">≈</span><span class="ww-lbl">Surf</span></a></div></div>`;
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
  function wire() {
    document.querySelectorAll("[data-ww-region]").forEach(
      (b) =>
        (b.onclick = () => {
          setRegion(b.dataset.wwRegion);
          openSheet(false);
        }),
    );
    const more = document.querySelector(".ww-more-btn");
    if (more) more.onclick = () => openSheet(more.getAttribute("aria-expanded") !== "true");
    const sheet = document.querySelector("#ww-sheet");
    if (sheet) {
      sheet.onclick = (e) => {
        if (e.target === sheet || e.target.closest(".ww-sheet-close") || e.target.closest("a"))
          openSheet(false);
      };
    }
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
    SECTIONS = opts.section === "snow" ? SNOW_SECTIONS : WEATHER_SECTIONS;
    sectionName = opts.section === "snow" ? "Snow sections" : "Weather sections";
    base = opts.base || "";
    active = opts.active || "forecast";
    regionLocked = opts.lockRegion || null;
    document.documentElement.classList.add("ww-has-tabbar");
    paint();
    addEventListener("keydown", (e) => {
      if (e.key === "Escape") openSheet(false);
    });
    addEventListener("online", offline);
    addEventListener("offline", offline);
    offline();
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register(base + "sw.js").catch(() => {});
    }
  }
  return { init, region, setRegion, setActive, REGIONS };
})();
