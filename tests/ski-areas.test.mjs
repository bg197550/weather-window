import test from "node:test";
import assert from "node:assert/strict";
import { compact, center, placeLabel } from "../scripts/update-ski-areas.mjs";

const area = (name, extra = {}) => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[-72.8, 43.6], [-72.7, 43.6], [-72.7, 43.7], [-72.8, 43.7], [-72.8, 43.6]]] },
  properties: { name, status: "operating", activities: ["downhill"], places: [{ iso3166_1Alpha2: "US", iso3166_2: "US-VT", localized: { en: { region: "Vermont" } } }], statistics: { minElevation: 354.4, maxElevation: 1261.5 }, ...extra },
});
test("keeps operating downhill areas with elevations, in feet, centered", () => {
  const out = compact({ features: [area("Killington Resort"), area("Closed", { status: "abandoned" }), area("XC", { activities: ["nordic"] }), area("Flat", { statistics: {} })] });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], ["Killington Resort", "VT, US", 43.65, -72.75, 1163, 4139]);
});
test("labels and centers", () => {
  assert.equal(placeLabel([{ iso3166_1Alpha2: "FR", iso3166_2: "FR-ARA", localized: { en: { region: "Auvergne-Rhône-Alpes" } } }]), "Auvergne-Rhône-Alpes, FR");
  assert.deepEqual(center({ type: "Point", coordinates: [1, 2] }), [1, 2]);
});
