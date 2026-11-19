import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../assets/story.js");
const sn = require("./fixtures/snotel-2026-11-18.json");
const at = (s) => Date.parse(s);

test("recap names yesterday's storm, range, top site and the closest site", () => {
  const t = F.recap(sn, { slug: "deer-valley", now: at("2026-11-18T18:10:00-07:00") });
  assert.match(t, /^Yesterday's storm added \d+–\d+″ of snow depth/);
  assert.match(t, /the most at Snowbird \(\+1[5-9]″\)/);
  assert.match(t, /closest site, Thaynes Canyon/);
});
test("recap says snow is still falling mid-storm", () => {
  assert.match(F.recap(sn, { slug: "alta", now: at("2026-11-17T21:00:00-07:00") }), /^Snow is still falling/);
});
test("recap stays quiet with stale data or nothing new", () => {
  assert.equal(F.recap(sn, { slug: "alta", now: at("2026-11-22T09:00:00-07:00") }), null);
  assert.equal(F.recap(null), null);
});
