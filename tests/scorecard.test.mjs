import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { score, SITES } from "../scripts/update-scorecard.mjs";
const F = createRequire(import.meta.url)("../assets/story.js");

// Six sites, Nov 10–20. Storm Nov 14–15 (1.0″ measured per site), rain-only day Nov 12 (no depth gain), storm in progress Nov 19.
function fixture() {
  const days = Array.from({ length: 11 }, (_, i) => `2026-11-${String(10 + i).padStart(2, "0")}`);
  const daily = {}, fc = {};
  for (const s of SITES) {
    let prec = 5, depth = 0;
    daily[s.triplet] = days.map((d) => {
      const row = { date: d, prec: Math.round(prec * 100) / 100, depth };
      if (d === "2026-11-12") prec += 0.3;
      if (d === "2026-11-14" || d === "2026-11-15") (prec += 0.5), (depth += 5);
      if (d === "2026-11-19") (prec += 0.4), (depth += 3);
      return row;
    });
    fc[s.triplet] = Object.fromEntries(days.map((d) => [d, d === "2026-11-14" || d === "2026-11-15" ? 0.4 : d === "2026-11-19" ? 0.5 : 0]));
  }
  return { daily, fc };
}
test("scores completed snow storms only", () => {
  const { daily, fc } = fixture();
  const st = score(daily, fc, "2026-11-20");
  assert.equal(st.length, 1);
  assert.deepEqual([st[0].start, st[0].end, st[0].measured, st[0].forecast], ["2026-11-14", "2026-11-15", 1, 0.8]);
  assert.equal(st[0].sites.length, 6);
});
test("scorecard line", () => {
  const one = F.scorecard({ storms: [{ start: "2026-11-14", end: "2026-11-15", measured: 1, forecast: 0.8 }] });
  assert.match(one, /The one snow storm scored so far, Nov 14–15: 1\.0″ of precipitation measured vs\. 0\.8″/);
  const two = F.scorecard({ storms: [{ start: "2026-10-30", end: "2026-11-01", measured: 0.6, forecast: 0.8 }, { start: "2026-11-14", end: "2026-11-15", measured: 1, forecast: 0.8 }] });
  assert.match(two, /^2 snow storms so far this season\. Measured precipitation has come to 100% .*about on target; 1 of 2 landed within 25%\. Most recent, Nov 14–15/);
  assert.equal(F.scorecard(null), "");
});
