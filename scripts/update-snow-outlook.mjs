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
const summary = { updated: new Date().toISOString(), places: { ...prev.places } };
let ok = 0;
const why = (e) => [e.message, e.cause?.code, e.cause?.message].filter(Boolean).join(" · ");
async function buildOne(slug, name, section, tries) {
  const pl = SnowCore.placeFor({ name, slug }, section);
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await SnowCore.outlook(pl, { nwsUA: UA });
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
  console.log(`${slug}: 10-day ${o.totals[10].mid}″ (${o.totals[10].lo}–${o.totals[10].hi}), NWS ${o.nws ? "yes" : "no"}`);
}
const failed = [];
for (const [slug, [name, section]] of Object.entries(NAMES)) {
  const o = await buildOne(slug, name, section, 3);
  if (o) save(slug, o);
  else failed.push(slug);
  await sleep(15000); // stay well under Open-Meteo's per-minute limit
}
// One more pass for any mountain that failed, after a longer pause.
if (failed.length) {
  console.log(`Second pass: ${failed.join(", ")}`);
  await sleep(90000);
  for (const slug of failed) {
    const [name, section] = NAMES[slug];
    const o = await buildOne(slug, name, section, 3);
    if (o) save(slug, o);
    await sleep(20000);
  }
}
if (!ok) throw Error("No mountain built; keeping the last files");
writeFileSync(`${out}/outlook/summary.json`, JSON.stringify(summary));
