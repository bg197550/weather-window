import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const SnowCore = require("../assets/snowcore.js");

test("summit is the basis for ski areas; towns use ground level", () => {
  const alta = SnowCore.placeFor({ name: "Alta" }, "utah");
  assert.equal(alta.elev, 10550);
  assert.equal(alta.ski, true);
  const big = SnowCore.placeFor({ name: "Big Sky Resort", p: [[45.27, -111.42]], ski: { base: 6816, summit: 11162 } }, "utah");
  assert.equal(big.elev, 11162);
  const town = SnowCore.placeFor({ name: "Boston", p: [[42.36, -71.06, "City"]] }, "ne");
  assert.equal(town.town, true);
  assert.equal(town.elev, undefined);
});
test("snow counts only below the snow level, half within the mix band", () => {
  assert.equal(SnowCore.snowShare(9000, 10550), 1);
  assert.equal(SnowCore.snowShare(11000, 10550), 0);
  assert.equal(SnowCore.snowShare(10550, 10550), 0.5);
  assert.equal(SnowCore.snowShare(null, 10550, 30), 1);
  assert.equal(Math.round(SnowCore.snowRatio(32)), 8);
});
function inputs() {
  const time = Array.from({ length: 72 }, (_, i) => new Date(Date.UTC(2026, 10, 12, 0) + i * 3600000).toISOString().slice(0, 16));
  const hourly = { time };
  for (let m = 0; m < 10; m++) {
    const sfx = (m ? `_member${String(m).padStart(2, "0")}` : "") + "_ecmwf_ifs025_ensemble";
    hourly["precipitation" + sfx] = time.map((_, i) => (i > 30 && i < 40 ? 0.02 * (1 + m / 10) : 0));
    hourly["temperature_2m" + sfx] = time.map(() => 20);
    hourly["cloud_cover" + sfx] = time.map(() => 80);
    hourly["temperature_700hPa" + sfx] = time.map(() => 14);
    hourly["geopotential_height_700hPa" + sfx] = time.map(() => 10000);
  }
  return { ens: { timezone: "America/Denver", utc_offset_seconds: -25200, hourly_units: { "geopotential_height_700hPa_ecmwf_ifs025_ensemble": "ft" }, hourly }, g05: null, det: null };
}
test("NWS sets the middle while it lasts; runs are scaled to it", () => {
  const pl = SnowCore.placeFor({ name: "Alta" }, "utah");
  const inp = inputs();
  const start = Date.UTC(2026, 10, 12, 7); // midnight in Denver
  inp.nws = { elevM: 3100, snow: [{ validTime: new Date(start + 30 * 3600000).toISOString().replace(".000Z", "+00:00") + "/PT12H", value: 254 }, { validTime: new Date(start + 42 * 3600000).toISOString().replace(".000Z", "+00:00") + "/PT12H", value: 0 }] };
  const o = SnowCore.build(pl, inp, start + 3600000 * 2);
  assert.ok(o.nws && o.nws.endIndex > 30);
  assert.ok(Math.abs(o.mid[o.nws.endIndex] - 10) < 0.01, "NWS total is the middle");
  const w = o.totals[5];
  assert.ok(w.lo <= w.mid && w.mid <= w.hi);
  const ms = o.members.map((m) => m.cum[o.nws.endIndex]).sort((a, b) => a - b);
  assert.ok(Math.abs(SnowCore.quant(ms, 0.5) - 10) < 0.6, "scaled runs center on NWS");
});
test("without NWS the middle is the ensemble median", () => {
  const pl = SnowCore.placeFor({ name: "Alta" }, "utah");
  const o = SnowCore.build(pl, inputs(), Date.UTC(2026, 10, 12, 9));
  const ms = o.members.map((m) => m.cum[60]).sort((a, b) => a - b);
  assert.ok(Math.abs(o.mid[60] - SnowCore.quant(ms, 0.5)) < 0.02);
});
test("after the NWS days the ensemble median carries the mountain's terrain correction", () => {
  const pl = SnowCore.placeFor({ name: "Alta" }, "utah");
  const inp = inputs();
  // Two storms: one inside the NWS days (hours 8–18), one after (hours 31–39, from inputs()).
  for (const k of Object.keys(inp.ens.hourly)) if (k.startsWith("precipitation")) inp.ens.hourly[k] = inp.ens.hourly[k].map((v, i) => (i > 8 && i < 18 ? 0.05 : v));
  const start = Date.UTC(2026, 10, 12, 7);
  const iso = (h) => new Date(start + h * 3600000).toISOString().replace(".000Z", "+00:00");
  const plain = SnowCore.build(pl, { ...inp, nws: null }, start); // raw ensemble, no correction
  const ensFirst = plain.members.map((m) => m.cum[24]).sort((a, b) => a - b);
  const e1 = SnowCore.quant(ensFirst, 0.5); // ensemble median over the NWS day
  // NWS says twice the ensemble over its day.
  inp.nws = { elevM: 3100, snow: [{ validTime: `${iso(0)}/PT24H`, value: 2 * e1 * 25.4 }] };
  const o = SnowCore.build(pl, inp, start);
  const want = SnowCore.carryRatio(2 * e1, e1, null);
  assert.ok(want > 1.2 && want < 2, "this run's ratio counts, shrunk toward 1 by how little snow it rests on");
  assert.equal(o.carry, Math.round(want * 100) / 100);
  const after = (x) => x.mid[60] - x.mid[24];
  assert.ok(Math.abs(after(o) - after(plain) * want) < 0.05, "storm after the NWS days is scaled by the correction");
  // A trusted long-run ratio pulls the correction toward it.
  const long = SnowCore.build(pl, inp, start, { ratio: { r: 3, w: 1 } });
  assert.ok(long.carry > o.carry);
});
test("terrain correction: little snow means little correction; history alone works without NWS", () => {
  assert.equal(SnowCore.carryRatio(0.2, 0.1, null), 1);
  assert.equal(SnowCore.carryRatio(null, null, null), 1);
  assert.ok(Math.abs(SnowCore.carryRatio(null, null, { r: 2, w: 0.5 }) - Math.SQRT2) < 1e-9);
  assert.ok(SnowCore.carryRatio(3, 6.8, null) < 0.7 && SnowCore.carryRatio(9.2, 5.8, null) > 1.3);
});
