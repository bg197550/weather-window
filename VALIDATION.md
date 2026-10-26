# Forecast + Insights validation

Based on main commit 0088956cfdb89a0f3d2398b96fef748a577e4fa6.

Run: `node --test tests/forecast-insights.test.mjs`

- Seven repeatable regression tests passed: default/legacy/regional routes, all 14 full periods and hourly indices, escaped source text, stale-summary suppression, chart gaps and freezing units, local-date grouping across daylight-saving changes, hourly expansion/collapse, and observations during forecast failure.
- JavaScript syntax check passed.
- Expanded hourly charts now redraw when the containing card resizes.
- Forecast sources and the shared Snow hourly chart remain unchanged.
- Browser visual testing remains incomplete. The connected browser cannot reach the local preview; installed browser control was interrupted by user activity. Desktop/mobile visual review and live-source integration remain required before merging.
- This branch does not change the published website until merged/deployed.
