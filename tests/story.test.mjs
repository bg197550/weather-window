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
  assert.match(st.summary, /^Next up: \w+ mountain snow today \(Tuesday\) into tomorrow \(Wednesday\), about \d+″ at the summit/);
  assert.match(st.short[0].text, /Snow levels start around 8,500 ft and fall to 5,000 ft/);
  assert.match(st.summary, /After that: Friday into Saturday \(about \d+″/);
  assert.equal(st.short.length, 2); // every storm in the coming week gets its own paragraph
  assert.match(st.short[1].title, /^Storm 2 · Friday → Saturday/);
  assert.match(st.short[1].text, /^Thursday looks mostly dry between storms\./);
  assert.match(st.extended, /^After the Friday–Saturday storm clears Saturday/); // the quiet stretch names the storm it follows
  assert.doesNotMatch(st.short[0].text, /rain or mix/); // 8,500 ft snow level vs an 8,530 ft base: snow
  assert.doesNotMatch(st.short[0].text, /around midday, heaviest around midday/);
  assert.match(st.short[0].text, /heavy and wet/);
  assert.match(st.short[0].text, /likely \d+–\d+″/);
});
test("no storms: says so", () => {
  const o = outlook();
  o.blocks.forEach((b) => (b.chance = 0));
  const st = Story.build(o, { section: "utah", now: Date.parse("2026-11-17T13:30:00Z") });
  assert.match(st.summary, /No significant storms/);
  assert.equal(st.short.length, 0);
});
test("notes a meaningful change from about a day earlier, and stays quiet about small ones", () => {
  const o = outlook();
  const t0 = Date.parse(o.built);
  // Half days for this run: the first storm (hours 5–23) falls in Tuesday's day and night halves.
  o.segments = [
    { date: "2026-11-17", half: "day", a: 0, b: 12, mid: 6 },
    { date: "2026-11-17", half: "night", a: 12, b: 24, mid: 5 },
  ];
  const prevBuilt = new Date(t0 - 22 * 3600000).toISOString();
  const big = Story.build(o, { section: "utah", now: t0 + 1800000, history: [{ built: prevBuilt, segs: [["2026-11-17", "day", 2], ["2026-11-17", "night", 2]] }] });
  assert.match(big.short[0].text, /That's up from about 4″ in yesterday morning's forecast/);
  const small = Story.build(o, { section: "utah", now: t0 + 1800000, history: [{ built: prevBuilt, segs: [["2026-11-17", "day", 6], ["2026-11-17", "night", 4]] }] });
  assert.doesNotMatch(small.short[0].text, /from about/);
});

test("uses the storm list's windows and shares its numbers", () => {
  const o = outlook();
  const t0 = Date.parse(o.built);
  const win = [t0 - 6 * 3600000, t0 + 30 * 3600000];
  const st = Story.build(o, { section: "utah", now: t0 + 1800000, kinds: [{ start: t0, end: t0 + 24 * 3600000, win, kind: "a Pacific storm" }] });
  const f = Story.facts(o, ...win);
  assert.match(st.short[0].text, new RegExp(`about ${Math.round(f.snow.mid)}″ at the summit, likely ${Math.round(f.snow.lo)}–${Math.round(f.snow.hi)}″`));
  assert.ok(f.quality && f.ratio);
});
test("a rain storm's summary gives the rain, not 'little or nothing'", () => {
  const o = outlook();
  Object.assign(o, { ski: false, elev: 200, base: 200, tz: "America/New_York", mid: o.mid.map(() => 0), members: o.members.map((m) => ({ cum: m.cum.map(() => 0) })) });
  o.blocks.forEach((b) => (b.med = 9900));
  const st = Story.build(o, { section: "ne", now: Date.parse("2026-11-17T13:30:00Z") });
  assert.match(st.summary, /about 0\.75″ of rain here/);
  assert.match(st.summary, /After that: Friday into Saturday \(about 1\.25″ of rain\)/);
  assert.doesNotMatch(st.summary, /little or nothing/);
});
test("rain storms use the NWS water total the storm list passes", () => {
  const o = outlook();
  Object.assign(o, { ski: false, elev: 200, base: 200, tz: "America/New_York", mid: o.mid.map(() => 0), members: o.members.map((m) => ({ cum: m.cum.map(() => 0) })) });
  o.blocks.forEach((b) => (b.med = 9900));
  const t0 = Date.parse(o.built), H = 3600e3;
  const kinds = [
    { start: t0 + 5 * H, end: t0 + 23 * H, win: [t0 + 5 * H, t0 + 23 * H], nwsLiq: 1.69 },
    { start: t0 + 72 * H, end: t0 + 102 * H, win: [t0 + 72 * H, t0 + 102 * H] },
  ];
  const st = Story.build(o, { section: "ne", kinds, now: Date.parse("2026-11-17T13:30:00Z") });
  assert.match(st.summary, /about 1\.7″ of rain here/);
  assert.match(st.short[0].text, /About 1\.7″ of rain in the NWS forecast\./);
  assert.match(st.short[1].text, /About 1\.25″ of rain\./); // no NWS figure: outlook water
});
