import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../assets/story.js");
const sn = require("./fixtures/snotel-2026-11-18.json");
const at = (s) => Date.parse(s);

test("recap names yesterday's storm, range, top site and the closest site", () => {
  const t = F.recap(sn, { slug: "deer-valley", now: at("2026-11-18T18:10:00-07:00") }).text;
  assert.match(t, /^Yesterday's storm added \d+–\d+″ of snow depth/);
  assert.match(t, /the most at Snowbird \(\+1[5-9]″\)/);
  assert.match(t, /closest site, Thaynes Canyon/);
});
test("recap says snow is still falling mid-storm", () => {
  assert.match(F.recap(sn, { slug: "alta", now: at("2026-11-17T21:00:00-07:00") }).text, /^Snow is still falling/);
});
test("recap stays quiet with stale data or nothing new", () => {
  assert.equal(F.recap(sn, { slug: "alta", now: at("2026-11-22T09:00:00-07:00") }), null);
  assert.equal(F.recap(null), null);
});

test("verify compares measured water with the earlier forecast and quotes the NWS reason", () => {
  const r = F.recap(sn, { slug: "alta", now: at("2026-11-18T18:10:00-07:00") });
  const fc = Object.fromEntries(r.gains.map((g) => [g.triplet, g.triplet === "766:UT:SNTL" ? 0.9 : g.water * 0.95]));
  const afd = "Snow ended this morning. Totals in the Cottonwoods were higher than expected as a band of heavy snow stalled over the area. More snow Thursday.";
  const v = F.verify(r, fc, afd);
  assert.match(v, /though Snowbird \(2\.0″ vs\. 0\.9″\) got more/);
  const wet = F.verify(r, Object.fromEntries(r.gains.map((g) => [g.triplet, g.water / 2])), "");
  assert.match(wet, /wetter than forecast/);
  assert.match(v, /NWS forecasters: “Totals in the Cottonwoods were higher than expected/);
  const close = F.verify(r, Object.fromEntries(r.gains.map((g) => [g.triplet, g.water])), afd);
  assert.match(close, /close to the model forecast/);
  assert.doesNotMatch(close, /NWS/);
});

test("verify mentions the closest site when it missed", () => {
  const r = F.recap(sn, { slug: "deer-valley", now: at("2026-11-18T18:10:00-07:00") });
  const fc = Object.fromEntries(r.gains.map((g) => [g.triplet, g.triplet === "814:UT:SNTL" ? 1.8 : g.triplet === "684:UT:SNTL" ? 0.5 : g.water]));
  assert.match(F.verify(r, fc, ""), /though Thaynes Canyon \(0\.7″ vs\. 1\.8″\) fell short/);
});
