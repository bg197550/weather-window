/* Builds the snow outlook for every dashboard ski area with assets/snowcore.js (the same code the pages run),
   so the Snow tab, the Snow report table and map, and Insights all show the same numbers.
   Usage: node scripts/update-snow-outlook.mjs <outDir> [previous summary.json]
   Writes <outDir>/outlook/summary.json (segments and totals for every mountain) and <outDir>/outlook/<slug>.json
   (3-hourly runs, snow levels and 6-hour blocks for the Snow tab charts). A mountain that fails keeps its last file. */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
const require = createRequire(import.meta.url);
const SnowCore = require("../assets/snowcore.js");

const UA = "WeatherWindow/1.0 (github.com/bg197550/weather-window)";
const out = process.argv[2] || "out";
const prevPath = process.argv[3];
const NAMES = {
  "park-city-mountain": ["Park City Mountain", "utah"],
  "deer-valley": ["Deer Valley", "utah"],
  "canyons-resort": ["Canyons Resort", "utah"],
  alta: ["Alta", "utah"],
  snowbird: ["Snowbird", "utah"],
  solitude: ["Solitude", "utah"],
  brighton: ["Brighton", "utah"],
  snowbasin: ["Snowbasin", "utah"],
  "stratton-mountain": ["Stratton Mountain", "ne"],
  killington: ["Killington", "ne"],
  stowe: ["Stowe", "ne"],
  gunstock: ["Gunstock", "ne"],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prev = prevPath && existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : { places: {} };
mkdirSync(`${out}/outlook`, { recursive: true });
const summary = { updated: new Date().toISOString(), places: { ...prev.places }, cells: { ...(prev.cells || {}) }, history: { ...(prev.history || {}) }, ratios: { ...(prev.ratios || {}) } };
/* Long-run terrain correction per mountain: NWS ÷ ensemble median over the NWS days, averaged (in logs) across
   runs, each run weighted by how much snow it rests on. Consecutive runs see the same storms, so each counts only a
   little; W (total weight) is capped so the average keeps following the season. w (0–1) is how far to trust it. */
const RATIO_STEP = 0.15,
  RATIO_CAP = 3,
  RATIO_FULL = 1.5;
function learnRatio(slug, nws) {
  if (!nws || !Number.isFinite(nws.nwsIn) || !Number.isFinite(nws.ensIn) || nws.ensIn < 1) return;
  const S = Math.max(nws.nwsIn, nws.ensIn),
    k = RATIO_STEP * (S / (S + 6));
  const L = Math.log(Math.min(3, Math.max(1 / 3, nws.nwsIn / nws.ensIn)));
  const old = summary.ratios[slug];
  const W0 = old?.W || 0,
    W = Math.min(RATIO_CAP, W0 + k),
    l = old ? Math.log(old.r) + (L - Math.log(old.r)) * (k / W) : L;
  summary.ratios[slug] = { r: Math.round(Math.exp(l) * 1000) / 1000, W: Math.round(W * 1000) / 1000, w: Math.round(Math.min(1, W / RATIO_FULL) * 100) / 100, updated: new Date().toISOString() };
}
// Summit NWS squares first: GitHub reaches NWS reliably, and browsers use these when they build an outlook themselves.
for (const [slug, [name, section]] of Object.entries(NAMES)) {
  try {
    const g = await SnowCore.nwsGrid(SnowCore.placeFor({ name, slug }, section), UA, 1);
    summary.cells[slug] = g.cell;
    console.log(`${slug}: summit NWS square ${g.cell} at ${Math.round(g.elevM * 3.28084)} ft`);
  } catch (e) {
    console.log(`${slug}: NWS square search failed (${e.message})`);
  }
}
writeFileSync(`${out}/outlook/summary.json`, JSON.stringify(summary));
let ok = 0;
const why = (e) => [e.message, e.cause?.code, e.cause?.message].filter(Boolean).join(" · ");
async function buildOne(slug, name, section, tries) {
  const pl = SnowCore.placeFor({ name, slug }, section);
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await SnowCore.outlook(pl, { nwsUA: UA, nwsCell: summary.cells[slug] || null, nwsSearch: summary.cells[slug] ? 0 : 1, ratio: summary.ratios[slug] || null });
    } catch (e) {
      const wait = 30000 * attempt;
      console.log(`${slug}: ${why(e)}${attempt < tries ? `, retrying in ${wait / 1000} s` : ""}`);
      if (attempt < tries) await sleep(wait);
    }
  }
  return null;
}
function save(slug, o) {
  const t = SnowCore.thin(o);
  writeFileSync(`${out}/outlook/${slug}.json`, JSON.stringify(t));
  const { members, dets, levels, mid, times, h, temp, ...meta } = t;
  // Keep the last three days of runs (half-day snow only) so the forecast story can say how the forecast changed.
  const old = prev.places?.[slug];
  if (old?.segments && old.built !== meta.built) {
    const hist = [{ built: old.built, segs: old.segments.map((x) => [x.date, x.half, x.mid]) }, ...(summary.history[slug] || [])];
    summary.history[slug] = hist.filter((x, i, a) => Date.now() - Date.parse(x.built) < 72 * 3600000 && a.findIndex((y) => y.built === x.built) === i).slice(0, 16);
  }
  summary.places[slug] = meta;
  learnRatio(slug, o.nws);
  ok++;
  console.log(`${slug}: 10-day ${o.totals[10].mid}″ (${o.totals[10].lo}–${o.totals[10].hi}), NWS ${o.nws ? `${o.nws.cell} at ${o.nws.elev} ft, scale ${o.nws.scale}` : "none"}, terrain correction ${o.carry} (long run ${summary.ratios[slug]?.r ?? "–"})`);
}
const failed = [];
let streak = 0;
for (const [slug, [name, section]] of Object.entries(NAMES)) {
  if (streak >= 3) {
    // Open-Meteo has timed out three times in a row: pause, then keep going rather than skipping the rest.
    console.log("Three failures in a row; pausing 2 minutes");
    await sleep(120000);
    streak = 0;
  }
  const o = await buildOne(slug, name, section, 2);
  if (o) {
    save(slug, o);
    streak = 0;
  } else {
    failed.push(slug);
    streak++;
  }
  await sleep(15000); // stay well under Open-Meteo's per-minute limit
}
// One more pass for any mountain that failed, after a longer pause.
if (failed.length) {
  console.log(`Second pass: ${failed.join(", ")}`);
  await sleep(90000);
  for (const slug of failed) {
    const [name, section] = NAMES[slug];
    const o = await buildOne(slug, name, section, failed.length > 6 ? 2 : 3); // keep a bad run inside the job's time limit
    if (o) save(slug, o);
    await sleep(20000);
  }
}
// Open-Meteo often refuses GitHub's shared addresses; then browsers build outlooks themselves, using the squares above.
if (!ok) console.log("No outlook built this run (Open-Meteo unreachable from here); publishing the NWS squares only.");
writeFileSync(`${out}/outlook/summary.json`, JSON.stringify(summary));
