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
