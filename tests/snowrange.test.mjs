import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../assets/snowrange.js", import.meta.url), "utf8");
function ctx() {
  const s = { Date, Intl, Math, Number, URL, Map, Object, Array, String, RegExp, Promise, addEventListener() {}, setTimeout, clearTimeout, getJSON: async () => ({}), escapeHTML: (x) => String(x), document: { querySelector: () => null } };
  vm.createContext(s);
  vm.runInContext(src + ";this.api={snowRatio,snowFraction,hourSnow,freezingFt,seriesOf,buildRange,RANGE_RESORTS};", s);
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
  assert.equal(Math.round(freezingFt(32, 3000)), Math.round(3000 * 3.28084));
  assert.ok(freezingFt(23, 3000) < 3000 * 3.28084);
  assert.equal(freezingFt(null, 3000), null);
});
test("member keys parse for multi-model and single-model responses", () => {
  const { seriesOf } = ctx();
  const a = seriesOf({ time: [], precipitation_ncep_gefs025: [1], precipitation_member07_ecmwf_ifs025_ensemble: [2], precipitation_probability_x: [3] }, "precipitation");
  assert.equal(JSON.stringify([...a.keys()].sort()), JSON.stringify(["ecmwf_ifs025_ensemble#07", "ncep_gefs025#00"]));
  const b = seriesOf({ temperature_700hPa: [1], temperature_700hPa_member03: [2] }, "temperature_700hPa");
  assert.equal(JSON.stringify([...b.keys()].sort()), JSON.stringify(["#00", "#03"]));
});
test("running totals skip null hours and start at the current hour", () => {
  const { buildRange, RANGE_RESORTS } = ctx();
  const time = Array.from({ length: 48 }, (_, i) => `2026-11-12T${String(i % 24).padStart(2, "0")}:00`.replace("12T", i < 24 ? "12T" : "13T"));
  const hourly = { time, precipitation_ncep_gefs025: time.map((_, i) => (i < 40 ? 0.1 : null)), temperature_2m_ncep_gefs025: time.map(() => 20) };
  const now = Date.parse("2026-11-12T17:00:00Z"); // 10:00 in Denver
  const st = buildRange(RANGE_RESORTS[0], { hourly }, null, null, now);
  assert.equal(st.times[0], "2026-11-12T10:00");
  const m = st.members[0];
  assert.equal(m.cum[0], 0);
  assert.ok(Math.abs(m.cum[5] - 5 * 0.1 * 14) < 1e-9);
  assert.equal(m.cum[35], null);
  assert.equal(m.last, 29);
});
