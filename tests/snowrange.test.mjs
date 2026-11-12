import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../assets/snowrange.js", import.meta.url), "utf8");
function ctx() {
  const s = { Date, Intl, Math, Number, URL, Map, Object, Array, String, RegExp, Promise, addEventListener() {}, localStorage: { getItem: () => null, setItem() {} }, setTimeout, clearTimeout, getJSON: async () => ({}), escapeHTML: (x) => String(x), slug: (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    utah: [{ name: "Snyderville", p: [[40.69, -111.54, "Town"]] }, { name: "Park City", p: [[40.647, -111.498, "Town"]] }, { name: "Alta", p: [[40.588, -111.631, "Mid"]] }, { name: "Somewhere", searched: true, p: [[1, 2]] }],
    ne: [{ name: "Boston", p: [[42.36, -71.06, "City"]] }, { name: "Killington", p: [[43.6, -72.8, "Summit"]] }], document: { querySelector: () => null } };
  vm.createContext(s);
  vm.runInContext(src + ";this.api={snowRatio,snowFraction,hourSnow,freezingFt,seriesOf,buildRange,heightToFt,rangeLocations,customKey,parseCustom,rangeKeyFromHash};", s);
  return s.api;
}
test("snow ratio rises from ~8:1 at 32°F to 16–17:1 in the teens", () => {
  const { snowRatio, snowFraction, hourSnow } = ctx();
  assert.equal(Math.round(snowRatio(32)), 8);
  assert.ok(snowRatio(15) >= 15 && snowRatio(15) <= 17);
  assert.equal(snowRatio(0), 17);
  assert.equal(snowFraction(40), 0);
  assert.equal(snowFraction(30), 1);
  assert.equal(hourSnow(0.1, 20), 0.1 * 14);
  assert.equal(hourSnow(0.1, 45), 0);
});
test("freezing level from 700 mb temperature and height", () => {
  const { freezingFt } = ctx();
  assert.equal(Math.round(freezingFt(32, 10000)), 10000);
  assert.ok(Math.abs(freezingFt(23, 10000) - (10000 - (5 / 0.0065) * 3.28084)) < 1);
  assert.equal(freezingFt(null, 3000), null);
});
test("heights follow the unit Open-Meteo reports", () => {
  const { heightToFt } = ctx();
  assert.equal(heightToFt({ hourly_units: { geopotential_height_700hPa: "ft" } }, "geopotential"), 1);
  assert.equal(heightToFt({ hourly_units: { freezing_level_height_ecmwf_ifs025: "undefined", freezing_level_height_gfs_seamless: "ft" } }, "freezing_level"), 1);
  assert.ok(Math.abs(heightToFt({ hourly_units: { geopotential_height_700hPa: "m" } }, "geopotential") - 3.28084) < 1e-9);
});
test("member keys parse for multi-model and single-model responses", () => {
  const { seriesOf } = ctx();
  const a = seriesOf({ time: [], precipitation_ncep_gefs025: [1], precipitation_member07_ecmwf_ifs025_ensemble: [2], precipitation_probability_x: [3] }, "precipitation");
  assert.equal(JSON.stringify([...a.keys()].sort()), JSON.stringify(["ecmwf_ifs025_ensemble#07", "ncep_gefs025#00"]));
  const b = seriesOf({ temperature_700hPa: [1], temperature_700hPa_member03: [2] }, "temperature_700hPa");
  assert.equal(JSON.stringify([...b.keys()].sort()), JSON.stringify(["#00", "#03"]));
});
test("running totals skip null hours and start at the current hour", () => {
  const { buildRange } = ctx();
  const time = Array.from({ length: 48 }, (_, i) => `2026-11-12T${String(i % 24).padStart(2, "0")}:00`.replace("12T", i < 24 ? "12T" : "13T"));
  const hourly = { time, precipitation_ncep_gefs025: time.map((_, i) => (i < 40 ? 0.1 : null)), temperature_2m_ncep_gefs025: time.map(() => 20) };
  const now = Date.parse("2026-11-12T17:00:00Z"); // 10:00 in Denver
  const st = buildRange({ slug: "alta", region: "utah", point: 9895 }, { hourly }, null, null, now);
  assert.equal(st.times[0], "2026-11-12T10:00");
  const m = st.members[0];
  assert.equal(m.cum[0], 0);
  assert.ok(Math.abs(m.cum[5] - 5 * 0.1 * 14) < 1e-9);
  assert.equal(m.cum[35], null);
  assert.equal(m.last, 29);
});
test("every dashboard place is a location; mountains get elevations, towns use ground level", () => {
  const all = ctx().rangeLocations();
  assert.equal(all.map((x) => x.slug).join(","), "snyderville,park-city,park-city-mountain,alta,boston,killington");
  const by = Object.fromEntries(all.map((x) => [x.slug, x]));
  assert.equal(by.alta.point, 9895);
  assert.equal(by["park-city-mountain"].region, "utah");
  assert.equal(by.boston.town, true);
  assert.equal(by.killington.region, "ne");
  assert.ok(by.killington.base < by.killington.point && by.killington.point < by.killington.summit);
});
test("towns take their elevation from Open-Meteo and New England runs on Eastern time", () => {
  const { buildRange } = ctx();
  const time = ["2026-11-12T15:00", "2026-11-12T16:00", "2026-11-12T17:00"];
  const st = buildRange({ slug: "boston", region: "ne", town: true }, { elevation: 12, hourly: { time, precipitation: [0, 0.1, 0.1], temperature_2m: [30, 30, 30] } }, null, null, Date.parse("2026-11-12T21:00:00Z"));
  assert.equal(st.point, 40);
  assert.equal(st.times[0], "2026-11-12T16:00");
});
test("searched places round-trip through the link", () => {
  const { customKey, parseCustom, rangeKeyFromHash } = ctx();
  const key = customKey({ name: "Jackson Hole Mountain Resort", lat: 43.58712, lon: -110.82731, ski: { base: 6328, summit: 10398 } });
  assert.equal(key, "at/43.5871,-110.8273/Jackson%20Hole%20Mountain%20Resort/6328-10398");
  const r = parseCustom(key);
  assert.equal(r.name, "Jackson Hole Mountain Resort");
  assert.equal(r.point, 8400);
  assert.equal(r.town, undefined);
  assert.equal(parseCustom(customKey({ name: "Bend, OR", lat: 44.06, lon: -121.31 })).town, true);
  assert.equal(rangeKeyFromHash(key.split("/")), key);
  assert.equal(rangeKeyFromHash(["alta"]), "alta");
  assert.equal(rangeKeyFromHash(["nowhere"]), "");
  assert.equal(parseCustom("at/999,1/x"), null);
});
