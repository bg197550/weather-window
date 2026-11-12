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
const summary = { updated: new Date().toISOString(), places: { ...prev.places }, cells: { ...(prev.cells || {}) } };
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
      return await SnowCore.outlook(pl, { nwsUA: UA, nwsCell: summary.cells[slug] || null, nwsSearch: summary.cells[slug] ? 0 : 1 });
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
  summary.places[slug] = meta;
  ok++;
  console.log(`${slug}: 10-day ${o.totals[10].mid}″ (${o.totals[10].lo}–${o.totals[10].hi}), NWS ${o.nws ? `${o.nws.cell} at ${o.nws.elev} ft, scale ${o.nws.scale}` : "none"}`);
}
const failed = [];
let streak = 0;
for (const [slug, [name, section]] of Object.entries(NAMES)) {
  if (streak >= 3) {
    failed.push(slug); // Open-Meteo is refusing this runner; browsers build these themselves.
    continue;
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
if (failed.length && ok && streak < 3) {
  console.log(`Second pass: ${failed.join(", ")}`);
  await sleep(90000);
  for (const slug of failed) {
    const [name, section] = NAMES[slug];
    const o = await buildOne(slug, name, section, 3);
    if (o) save(slug, o);
    await sleep(20000);
  }
}
// Open-Meteo often refuses GitHub's shared addresses; then browsers build outlooks themselves, using the squares above.
if (!ok) console.log("No outlook built this run (Open-Meteo unreachable from here); publishing the NWS squares only.");
writeFileSync(`${out}/outlook/summary.json`, JSON.stringify(summary));
