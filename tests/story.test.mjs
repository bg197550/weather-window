import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Story = require("../assets/story.js");

/* A two-storm outlook: hour offsets from a build time of Tue 6am in Denver. */
function outlook() {
  const built = "2026-11-17T13:00:00.000Z";
  const n = 15 * 24 + 1;
  const h = Array.from({ length: n }, (_, k) => k);
  const wet = (k) => (k >= 5 && k < 23) || (k >= 72 && k < 102);
  const mid = [];
  let tot = 0;
  for (let k = 0; k < n; k++) mid.push((tot += k && wet(k) ? 0.6 : 0));
  const members = Array.from({ length: 20 }, (_, m) => ({ cum: mid.map((v) => v * (0.6 + m * 0.04)) }));
  const blocks = [];
  for (let a = 0; a < n - 6; a += 6) blocks.push({ a, b: a + 6, chance: wet(a + 1) ? 0.9 : 0.1, liq: wet(a + 1) ? 0.25 : 0, med: a < 12 ? 8500 : 5000, type: "snow" });
  return { name: "Alta", ski: true, base: 8530, summit: 10550, elev: 10550, tz: "America/Denver", built, times: h.map(() => "2026-11-17T06:00"), h, mid, members, temp: h.map((k) => (k < 12 ? 31 : 18)), blocks, segments: [] };
}
test("story tells timing, falling snow levels, water and snow, and the next storm", () => {
  const st = Story.build(outlook(), { section: "utah", now: Date.parse("2026-11-17T13:30:00Z") });
  assert.match(st.summary, /^Our next storm arrives today \(Tuesday\)/);
  assert.match(st.summary, /Snow levels start around 8,500 ft but drop to 5,000 ft/);
  assert.match(st.summary, /The next storm arrives Friday/);
  assert.equal(st.short.length, 2);
  assert.doesNotMatch(st.short[0].text, /rain or mix/); // 8,500 ft snow level vs an 8,530 ft base: snow
  assert.doesNotMatch(st.short[0].text, /around midday, heaviest around midday/);
  assert.match(st.short[0].text, /wet and dense/);
  assert.match(st.short[0].text, /likely \d+–\d+″/);
});
test("no storms: says so", () => {
  const o = outlook();
  o.blocks.forEach((b) => (b.chance = 0));
  const st = Story.build(o, { section: "utah", now: Date.parse("2026-11-17T13:30:00Z") });
  assert.match(st.summary, /No significant storms/);
  assert.equal(st.short.length, 0);
});
