/* Builds data/ski-areas.json for the location searches: every operating downhill ski area in OpenSkiMap
   (OpenStreetMap data, ODbL) with a name, a center point and its lowest/highest lift-or-run elevation.
   Usage: node scripts/update-ski-areas.mjs <out.json> */
import { writeFileSync } from "node:fs";

const SOURCE = "https://tiles.openskimap.org/geojson/ski_areas.geojson";
const FT = 3.28084;
const r4 = (x) => Math.round(x * 10000) / 10000;

/* Center of a point, polygon or multipolygon (the largest ring's vertex average). */
export function center(g) {
  if (!g) return null;
  if (g.type === "Point") return g.coordinates;
  const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
  const ring = rings.sort((a, b) => b.length - a.length)[0];
  if (!ring?.length) return null;
  const pts = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/* "Vermont, US" style label from OpenSkiMap's places. */
export function placeLabel(places) {
  const p = places?.[0];
  if (!p) return "";
  const cc = p.iso3166_1Alpha2 || "";
  const sub = p.iso3166_2?.split("-")[1];
  const region = (cc === "US" || cc === "CA") && sub ? sub : p.localized?.en?.region || "";
  return [region, cc].filter(Boolean).join(", ");
}

/* [name, place, lat, lon, base ft, summit ft] for every operating downhill area with elevations. */
export function compact(geojson) {
  const out = [];
  for (const f of geojson.features || []) {
    const p = f.properties || {};
    if (!p.name || p.status !== "operating" || !p.activities?.includes("downhill")) continue;
    const s = p.statistics || {};
    const lo = s.minElevation ?? s.lifts?.minElevation ?? null,
      hi = s.maxElevation ?? s.lifts?.maxElevation ?? null;
    if (lo == null || hi == null || hi - lo < 15) continue;
    const c = center(f.geometry);
    if (!c) continue;
    out.push([p.name.trim(), placeLabel(p.places), r4(c[1]), r4(c[0]), Math.round(lo * FT), Math.round(hi * FT)]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || "ski-areas.json";
  const res = await fetch(SOURCE);
  if (!res.ok) throw Error(`OpenSkiMap ${res.status}`);
  const areas = compact(await res.json());
  if (areas.length < 1000) throw Error(`Only ${areas.length} ski areas; keeping the last good file`);
  writeFileSync(out, JSON.stringify({ updated: new Date().toISOString(), source: "OpenSkiMap.org · © OpenStreetMap contributors (ODbL)", fields: ["name", "place", "lat", "lon", "baseFt", "summitFt"], areas }));
  console.log(`${areas.length} ski areas → ${out}`);
}
