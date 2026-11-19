// Season forecast scorecard: for each snow storm this season, what the SNOTEL precipitation gauges near the
// Wasatch resorts measured vs. the model forecast made about a day ahead (Open-Meteo previous-runs API, free).
// Recomputes the whole season each run, so a missed day fixes itself. Writes scorecard.json for the data branch.
import { writeFileSync, readFileSync, existsSync } from "node:fs";

export const SITES = [
  { triplet: "814:UT:SNTL", name: "Thaynes Canyon", lat: 40.62, lon: -111.53, elev: 2813 },
  { triplet: "684:UT:SNTL", name: "Parleys Summit", lat: 40.76, lon: -111.63, elev: 2312 },
  { triplet: "628:UT:SNTL", name: "Mill-D North", lat: 40.66, lon: -111.64, elev: 2731 },
  { triplet: "366:UT:SNTL", name: "Brighton", lat: 40.6, lon: -111.58, elev: 2667 },
  { triplet: "766:UT:SNTL", name: "Snowbird", lat: 40.57, lon: -111.66, elev: 2938 },
  { triplet: "332:UT:SNTL", name: "Ben Lomond Peak", lat: 41.38, lon: -111.94, elev: 2438 },
];
const BASE = "https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customSingleStationReport";
const UA = { "User-Agent": "Weather Window scorecard (github.com/bg197550/weather-window)" };
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

async function get(url, as = "text") {
  let last;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw Error(`${r.status} ${url.slice(0, 120)}`);
      return as === "json" ? await r.json() : await r.text();
    } catch (e) {
      last = e;
      await new Promise((z) => setTimeout(z, 5000 * (a + 1)));
    }
  }
  throw last;
}
function parseCsv(txt) {
  const body = txt.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  if (!body.length) return [];
  const head = body[0].split(",").map((h) => h.trim());
  const col = (re) => head.findIndex((h) => re.test(h));
  const [dt, sw, sd, pr] = [col(/^Date/i), col(/Snow Water Equivalent/i), col(/Snow Depth/i), col(/Precipitation Accumulation/i)];
  const n = (v) => (v == null || v === "" || !Number.isFinite(+v) ? null : +v);
  return body.slice(1).map((l) => {
    const v = l.split(",");
    return { date: v[dt], swe: n(v[sw]), depth: n(v[sd]), prec: n(v[pr]) };
  });
}

/* Pure scoring, exported for tests. daily: {triplet: [{date, depth, prec}]} (start-of-day readings);
   fc: {triplet: {date: inches forecast that local day}}. today: "YYYY-MM-DD". */
export function score(daily, fc, today) {
  const dates = [...new Set(Object.values(daily).flatMap((r) => r.map((x) => x.date)))].sort();
  const at = (t, d, k) => daily[t]?.find((x) => x.date === d)?.[k] ?? null;
  const next = (d) => iso(Date.parse(d + "T12:00:00Z") + DAY);
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  const fell = (t, d) => {
    const a = at(t, d, "prec"), b = at(t, next(d), "prec");
    return a == null || b == null ? null : Math.max(0, b - a);
  };
  const wet = dates.filter((d) => next(d) <= today && (med(SITES.map((s) => fell(s.triplet, d)).filter((v) => v != null)) ?? 0) >= 0.1);
  const groups = [];
  for (const d of wet) {
    const g = groups.at(-1);
    if (g && next(g.at(-1)) === d) g.push(d);
    else groups.push([d]);
  }
  const storms = [];
  for (const g of groups) {
    const d1 = g[0], end = next(g.at(-1));
    if (end >= today) continue; // still in progress (or ended too recently to have a full day's reading)
    const sites = [];
    for (const s of SITES) {
      const p0 = at(s.triplet, d1, "prec"), p1 = at(s.triplet, end, "prec");
      const f = g.map((d) => fc[s.triplet]?.[d]);
      if (p0 == null || p1 == null || f.some((v) => v == null)) continue;
      const depths = [d1, ...g.slice(1), end].map((d) => at(s.triplet, d, "depth")).filter((v) => v != null);
      const d0 = at(s.triplet, d1, "depth");
      sites.push({
        triplet: s.triplet,
        name: s.name,
        measured: Math.round(Math.max(0, p1 - p0) * 100) / 100,
        forecast: Math.round(f.reduce((t, v) => t + v, 0) * 100) / 100,
        snow: d0 != null && depths.length ? Math.max(0, Math.max(...depths) - d0) : null,
      });
    }
    if (sites.length < 3) continue;
    const snowMed = med(sites.map((x) => x.snow).filter((v) => v != null));
    if (snowMed == null || snowMed < 2) continue; // only storms that brought snow
    const measured = sites.reduce((t, x) => t + x.measured, 0) / sites.length;
    const forecast = sites.reduce((t, x) => t + x.forecast, 0) / sites.length;
    if (forecast < 0.05 && measured < 0.2) continue;
    storms.push({ start: d1, end: g.at(-1), measured: Math.round(measured * 100) / 100, forecast: Math.round(forecast * 100) / 100, sites });
  }
  return storms;
}

async function main() {
  const out = process.argv[2] || "scorecard.json", prevFile = process.argv[3];
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(now);
  const y = +local.slice(0, 4), m = +local.slice(5, 7);
  const seasonStart = `${m >= 9 ? y : y - 1}-10-01`;
  const days = Math.round((Date.parse(local) - Date.parse(seasonStart)) / DAY);
  const daily = {};
  for (const s of SITES) {
    try {
      daily[s.triplet] = parseCsv(await get(`${BASE}/daily/start_of_period/${s.triplet}%7Cid=%22%22%7Cname/-${days},0/WTEQ::value,SNWD::value,PREC::value`));
    } catch (e) {
      console.error(s.triplet, e.message);
    }
  }
  const om = `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${SITES.map((s) => s.lat).join(",")}&longitude=${SITES.map((s) => s.lon).join(",")}&elevation=${SITES.map((s) => s.elev).join(",")}&hourly=precipitation_previous_day1&start_date=${seasonStart}&end_date=${local}&precipitation_unit=inch&timezone=America%2FDenver`;
  let j;
  try {
    j = await get(om, "json");
  } catch (e) {
    console.warn("Open-Meteo unavailable; keeping the previous scorecard.", e.message);
    process.exit(0);
  }
  if (!Array.isArray(j)) j = [j];
  const fc = {};
  SITES.forEach((s, i) => {
    const h = j[i]?.hourly;
    if (!h?.time) return;
    const byDay = (fc[s.triplet] = {});
    h.time.forEach((t, k) => {
      const v = h.precipitation_previous_day1[k];
      if (v == null) return;
      const d = t.slice(0, 10);
      byDay[d] = (byDay[d] ?? 0) + v;
    });
  });
  const storms = score(daily, fc, local);
  if (!Object.keys(daily).length) {
    console.warn("NRCS unavailable; keeping the previous scorecard.");
    process.exit(0);
  }
  let prev = null;
  try {
    if (prevFile && existsSync(prevFile)) prev = JSON.parse(readFileSync(prevFile, "utf8"));
  } catch {}
  if (prev?.storms?.length > storms.length && prev.season === seasonStart) console.warn("Fewer storms than last run (data gap?)");
  writeFileSync(
    out,
    JSON.stringify(
      {
        generatedAt: now.toISOString(),
        season: seasonStart,
        basis: "SNOTEL precipitation gauges near the Wasatch resorts vs. the Open-Meteo best-match forecast made about 24 hours ahead",
        storms,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(storms.map((s) => `${s.start}..${s.end}: measured ${s.measured} vs forecast ${s.forecast}`).join("\n") || "No completed snow storms yet");
}
if (import.meta.url === `file://${process.argv[1]}`) main();
