/* Offline support for Weather Window.
   Pages, scripts and styles: network first, falling back to the last saved copy.
   Forecast data (NWS, Open-Meteo, the long-range and SNOTEL files): network first with a saved fallback,
   so the last forecast still shows without signal. Map tiles, radar, webcams and videos are never cached. */
const CACHE = "ww-v1";
const DATA_HOSTS = [
  "api.weather.gov",
  "api.open-meteo.com",
  "ensemble-api.open-meteo.com",
  "raw.githubusercontent.com",
];
const NEVER = /\.(m3u8|ts|mp4|png|jpe?g|gif|webp)(\?|$)|\/tile|tile\.|\/cache\/tile\.py|\/icons\/land\//i;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

function cacheable(url) {
  if (NEVER.test(url.pathname)) return false;
  if (url.origin === self.location.origin) return true;
  return DATA_HOSTS.includes(url.hostname);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;
  // Data files are requested with a cache-busting ?t=; store them under one key so the fallback still matches.
  const key = url.hostname === "raw.githubusercontent.com" ? url.origin + url.pathname : req;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(key, copy))
            .catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(key, { ignoreVary: true }).then((hit) => {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match(new URL("./", self.location).href);
          return Response.error();
        }),
      ),
  );
});
