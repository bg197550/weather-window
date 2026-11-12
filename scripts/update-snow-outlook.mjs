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
for (const [slug, [name, section]] of Object.entries(NAMES)) {
  const pl = SnowCore.placeFor({ name, slug }, section);
  let o = null;
  for (let attempt = 0; attempt < 3 && !o; attempt++) {
    try {
      o = await SnowCore.outlook(pl, { nwsUA: UA });
    } catch (e) {
      console.log(`${slug}: ${e.message}${attempt < 2 ? ", retrying in 65 s" : ""}`);
      if (attempt < 2) await sleep(65000);
    }
  }
  if (o) {
    const t = SnowCore.thin(o);
    writeFileSync(`${out}/outlook/${slug}.json`, JSON.stringify(t));
    const { members, dets, levels, mid, times, h, temp, ...meta } = t;
    summary.places[slug] = meta;
    ok++;
    console.log(`${slug}: 10-day ${o.totals[10].mid}″ (${o.totals[10].lo}–${o.totals[10].hi}), NWS ${o.nws ? "yes" : "no"}`);
  }
  await sleep(12000); // stay well under Open-Meteo's per-minute limit
}
if (!ok) throw Error("No mountain built; keeping the last files");
writeFileSync(`${out}/outlook/summary.json`, JSON.stringify(summary));
