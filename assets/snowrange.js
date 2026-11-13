/* The Snow tab for one place (Weather page, #<region>/<place>/snow): day-by-day snow, the forecast range
   (every ensemble run) and the snow level. All numbers come from SnowCore (assets/snowcore.js), the same
   calculation behind the Snow report table, the Powder map and Insights. Classic script; needs common.js. */
const RNG_FT = (v) => (v == null ? "–" : `${(Math.round(v / 100) * 100).toLocaleString()} ft`);
const RNG_IN = (v) => (v == null ? "–" : `${v < 10 ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v)}″`);
const rngLocal = (s, o) => new Date(s + ":00Z").toLocaleString("en-US", { ...o, timeZone: "UTC" });
let rngDays = 10,
  rngLevelDays = 10,
  rngState = null;

function rngBox(el, tall) {
  const width = Math.max(300, Math.round(el.clientWidth || 700));
  const phone = width < 560;
  return { width, phone, L: phone ? 38 : 50, T: 14, h: tall ? (phone ? 270 : 330) : phone ? 92 : 104 };
}
function rngStep(span, target) {
  const raw = span / target,
    p = 10 ** Math.floor(Math.log10(raw)),
    f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function rngSpread(items, top, bottom, gap) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + gap);
  const over = items.length ? items[items.length - 1].y - bottom : 0;
  if (over > 0) items.forEach((it) => (it.y -= over));
  for (let i = items.length - 2; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - gap);
  items.forEach((it) => (it.y = Math.max(top, it.y)));
  return items;
}
const rngLine = (pts, attrs) => (pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" ${attrs}/>` : "");
function rngTicks(o, idx, x, y, minGap) {
  let out = "",
    last = -1e9;
  for (const i of idx) {
    if (!o.times[i].endsWith("T00:00")) continue;
    const px = x(o.h[i]);
    out += `<line x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="14" y2="${y}" stroke="#294858"/>`;
    if (px - last < minGap) continue;
    last = px;
    out += `<text x="${(px + 3).toFixed(1)}" y="${y + 16}" fill="#9fb1bc" font-size="12">${rngLocal(o.times[i], { weekday: "short", day: "numeric" })}</text>`;
  }
  return out;
}
function rngSeg(which, sel) {
  return `<div class="seg rng-days" role="group" aria-label="Forecast window">${[5, 10, 15]
    .map((d) => `<button type="button" data-${which}-days="${d}" class="${d === sel ? "active" : ""}" aria-pressed="${d === sel}">${d} days</button>`)
    .join("")}</div>`;
}
/* Indexes of an outlook within the first `hours`. */
const rngIdx = (o, hours) => o.h.map((_, i) => i).filter((i) => o.h[i] <= hours);
function basisText(o) {
  return o.ski
    ? `Summit ${o.summit.toLocaleString()} ft · base ${o.base.toLocaleString()} ft · forecast for the summit`
    : `Forecast at ground level · ${o.elev.toLocaleString()} ft`;
}

/* ---------- day by day ---------- */
function drawDays(el, o) {
  const segs = o.segments.filter((s) => s.date >= o.times[0].slice(0, 10)).slice(0, 21);
  const days = [];
  for (const s of segs) {
    let d = days.find((x) => x.date === s.date);
    if (!d) days.push((d = { date: s.date }));
    d[s.half] = s;
  }
  const shown = days.slice(0, 10);
  const top = Math.max(4, ...segs.map((s) => s.mid || 0));
  const bar = (s, half) => {
    if (!s) return `<div class="ps-seg is-empty"></div>`;
    const h = Math.max(s.mid > 0.05 ? 6 : 2, Math.round(((s.mid || 0) / top) * 64));
    const rng = s.hi > 0.05 ? `${s.lo < 1 ? Math.round(s.lo * 10) / 10 : Math.round(s.lo)}–${Math.round(s.hi)}″` : "0″";
    return `<div class="ps-seg${s.src === "model" ? " is-model" : ""}" title="${half === "day" ? "Day" : "Night"}: ${RNG_IN(s.mid)} (likely ${rng})${s.temp != null ? `, ${half === "day" ? "high" : "low"} ${s.temp}°F` : ""}"><span class="ps-amt">${s.mid >= 0.1 ? RNG_IN(s.mid) : ""}</span><i style="height:${h}px"></i><small>${half === "day" ? "D" : "N"}</small></div>`;
  };
  el.innerHTML = `<div class="ins-stats ps-totals">${[5, 10, 15]
    .map((d) => {
      const t = o.totals[d];
      return `<div><span>Next ${d} days</span><strong>${RNG_IN(t.mid)}</strong><small>likely ${RNG_IN(t.lo)}–${RNG_IN(t.hi)}</small></div>`;
    })
    .join("")}</div><div class="ps-days" role="list">${shown
    .map(
      (d) =>
        `<div class="ps-day" role="listitem"><b>${rngLocal(d.date + "T12:00", { weekday: "short" })}</b><small>${rngLocal(d.date + "T12:00", { month: "numeric", day: "numeric" })}</small><div class="ps-bars">${bar(d.day, "day")}${bar(d.night, "night")}</div></div>`,
    )
    .join("")}</div><p class="ins-legend rng-legend"><span class="ps-key"></span>NWS forecast <span class="ps-key is-model"></span>Models (after the NWS forecast ends) · D = 6am–6pm, N = 6pm–6am · numbers are the middle outcome; hover or tap a bar for its range</p>`;
}

/* ---------- forecast range ---------- */
function drawRange() {
  const body = document.querySelector("#rng-range .rng-body");
  if (!body || !rngState) return;
  const o = rngState;
  const hours = Math.min(rngDays * 24, o.h[o.h.length - 1]);
  const idx = rngIdx(o, hours);
  const { width, phone, L, T, h } = rngBox(body, true);
  const R = phone ? 94 : 132,
    B = 30,
    pw = width - L - R,
    ph = h - T - B;
  const at = (i) =>
    o.members
      .map((m) => m.cum[i])
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
  const stats = idx.map((i) => {
    const v = at(i);
    return { i, c: v.length, p10: SnowCore.quant(v, 0.1), p90: SnowCore.quant(v, 0.9), max: v[v.length - 1] };
  });
  const detMax = o.dets.map((d) => Math.max(0, ...idx.map((i) => d.cum[i]).filter(Number.isFinite)));
  const top = Math.max(4, ...stats.map((s) => s.max ?? 0), ...detMax, ...idx.map((i) => o.mid[i] ?? 0)) * 1.08;
  const x = (hh) => L + (hh / hours) * pw,
    y = (v) => T + ph - (v / top) * ph;
  const xy = (i, v) => `${x(o.h[i]).toFixed(1)},${y(v).toFixed(1)}`;
  const yStep = rngStep(top, phone ? 4 : 6);
  let grid = "";
  for (let v = 0; v <= top; v += yStep)
    grid += `<line x1="${L}" x2="${L + pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#294858"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" fill="#9fb1bc" font-size="12">${v}″</text>`;
  // Where the NWS forecast ends: shade its days lightly and label both parts.
  let nwsZone = "";
  if (o.nws) {
    const end = Math.min(hours, o.nws.endIndex);
    nwsZone = `<rect x="${L}" y="${T}" width="${(x(end) - L).toFixed(1)}" height="${ph}" fill="#ffffff" fill-opacity="0.035"/><line x1="${x(end).toFixed(1)}" x2="${x(end).toFixed(1)}" y1="${T}" y2="${T + ph}" stroke="#9fb1bc" stroke-dasharray="2 3"/><text x="${L + 6}" y="${T + 12}" fill="#9fb1bc" font-size="11">NWS forecast</text>${end < hours - 30 ? `<text x="${(x(end) + 6).toFixed(1)}" y="${T + 12}" fill="#9fb1bc" font-size="11">Models</text>` : ""}`;
  }
  const runs = o.members.map((m) => rngLine(idx.filter((i) => m.cum[i] != null).map((i) => xy(i, m.cum[i])), 'stroke="#8fb3c4" stroke-opacity="0.3" stroke-width="1"')).join("");
  const ok = stats.filter((s) => s.c >= 10);
  const band = ok.length > 1 ? `<polygon points="${[...ok.map((s) => xy(s.i, s.p90)), ...ok.map((s) => xy(s.i, s.p10)).reverse()].join(" ")}" fill="#79d7e5" fill-opacity="0.2" stroke="#79d7e5" stroke-opacity="0.7" stroke-dasharray="3 3"/>` : "";
  const midPts = idx.filter((i) => o.mid[i] != null).map((i) => xy(i, o.mid[i]));
  const mid = rngLine(midPts, 'stroke="#0b2130" stroke-width="7" stroke-linejoin="round"') + rngLine(midPts, 'stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"');
  const labels = [];
  const detLines = o.dets
    .map((d) => {
      const pts = idx.filter((i) => d.cum[i] != null);
      if (pts.length < 2) return "";
      const li = pts[pts.length - 1];
      const ends = o.h[li] < hours - 3 && !phone ? ` · to ${rngLocal(o.times[li], { weekday: "short" })}` : "";
      labels.push({ y: y(d.cum[li]), text: `${d.label} ${RNG_IN(d.cum[li])}${ends}`, color: d.color, dash: d.dash, w: 2.2 });
      return rngLine(pts.map((i) => xy(i, d.cum[i])), `stroke="${d.color}" stroke-width="2.2" stroke-dasharray="${d.dash}" stroke-linejoin="round"`);
    })
    .join("");
  const li = idx[idx.length - 1];
  labels.push({ y: y(o.mid[li] ?? 0), text: `${phone ? "Fcst" : "Forecast"} ${RNG_IN(o.mid[li])}`, color: "#ffffff", dash: "", w: 3.5, bold: true });
  const lab = rngSpread(labels, T + 6, T + ph, phone ? 14 : 15)
    .map(
      (l) =>
        `<line x1="${L + pw + 6}" x2="${L + pw + 22}" y1="${l.y.toFixed(1)}" y2="${l.y.toFixed(1)}" stroke="${l.color}" stroke-width="${l.w}" stroke-dasharray="${l.dash}"/><text x="${L + pw + 26}" y="${(l.y + 4).toFixed(1)}" fill="#e6f3f8" font-size="${phone ? 11 : 12}"${l.bold ? ' font-weight="700"' : ""}>${escapeHTML(l.text)}</text>`,
    )
    .join("");
  const t = o.totals[rngDays] || o.totals[10];
  const svg = `<svg class="rng-svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Running snow total at ${escapeHTML(o.name)} over the next ${rngDays} days: forecast ${RNG_IN(t.mid)}, likely ${RNG_IN(t.lo)} to ${RNG_IN(t.hi)}.">${nwsZone}${grid}${rngTicks(o, idx, x, T + ph, phone ? 44 : 52)}${runs}${band}${detLines}${mid}${lab}<line class="rng-rule" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#ffffff" visibility="hidden"/><rect class="rng-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
  const fams = {};
  o.members.forEach((m) => (fams[m.fam] = (fams[m.fam] || 0) + 1));
  body.innerHTML = `<div class="rng-chips"><span class="rng-chip"><b>${rngDays}-day total</b> ${RNG_IN(t.mid)} <small>likely ${RNG_IN(t.lo)}–${RNG_IN(t.hi)}</small></span><span class="rng-chip rng-chip-soft">${t.runs} ensemble runs</span></div><div class="rng-wrap">${svg}<div class="rng-tip" hidden></div></div><p class="ins-legend rng-legend"><span class="ins-key ins-key-line rng-key-med"></span>Forecast (NWS, then the ensemble median) <span class="ins-key ins-key-band"></span>Likely range (10th–90th percentile) <span class="ins-key rng-key-runs"></span>Each run (${Object.entries(fams)
    .map(([f, c]) => `${c} ${f}`)
    .join(", ")}) · Labeled lines: single models, each with its own dash pattern</p>`;
  rngHover(body, { L, pw, hours }, (hh) => {
    const i = idx.reduce((b, j) => (Math.abs(o.h[j] - hh) < Math.abs(o.h[b] - hh) ? j : b), idx[0]);
    const v = at(i);
    const tF = o.temp[i],
      ratio = SnowCore.snowRatio(tF);
    const ratioLine = tF == null ? "" : tF >= 38 ? `Too warm for snow (${tF}°F)` : `Snow ratio ~${Math.round(ratio)}:1 at ${tF}°F`;
    const dl = o.dets.filter((d) => d.cum[i] != null).map((d) => `${d.label} ${RNG_IN(d.cum[i])}`);
    return {
      at: o.h[i],
      html: `<b>${rngLocal(o.times[i], { weekday: "short", month: "short", day: "numeric", hour: "numeric" })}</b><br>Forecast ${RNG_IN(o.mid[i])} · likely ${RNG_IN(SnowCore.quant(v, 0.1))}–${RNG_IN(SnowCore.quant(v, 0.9))}${dl.length ? `<br>${escapeHTML(dl.join(" · "))}` : ""}${ratioLine ? `<br>${ratioLine}` : ""}`,
    };
  });
}

/* ---------- snow level ---------- */
const RNG_PART = (h) => (h < 6 ? "Overnight" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Night");
function drawLevel() {
  const body = document.querySelector("#rng-level .rng-body");
  if (!body || !rngState) return;
  const o = rngState;
  const hours = Math.min(rngLevelDays * 24, o.h[o.h.length - 1]);
  const idx = rngIdx(o, hours);
  const { width, phone, L, T, h } = rngBox(body, true);
  const R = phone ? 94 : 132,
    B = 30,
    pw = width - L - R,
    ph = h - T - B;
  const stats = idx.map((i) => {
    const v = o.levels
      .map((s) => s.level[i])
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    return { i, c: v.length, min: v[0], med: SnowCore.quant(v, 0.5), max: v[v.length - 1] };
  });
  const ok = stats.filter((s) => s.c >= 3);
  if (ok.length < 2) {
    body.innerHTML = '<div class="error">Snow-level data is unavailable for this window.</div>';
    return;
  }
  const elev = o.elev;
  let lo = Math.min((o.base ?? elev) - 1500, ...ok.map((s) => s.min)),
    hi = Math.max((o.summit ?? elev) + 1500, ...ok.map((s) => s.max));
  lo = Math.max(!o.ski && elev < 1500 ? -500 : 0, Math.floor(lo / 1000) * 1000);
  hi = Math.min(16000, Math.ceil(hi / 1000) * 1000);
  const x = (hh) => L + (hh / hours) * pw,
    y = (v) => T + ph - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * ph;
  const xy = (i, v) => `${x(o.h[i]).toFixed(1)},${y(v).toFixed(1)}`;
  const yStep = rngStep(hi - lo, phone ? 4 : 6);
  let grid = "";
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep)
    grid += `<line x1="${L}" x2="${L + pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#294858"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" fill="#9fb1bc" font-size="12">${phone ? `${v / 1000}k` : v.toLocaleString()}</text>`;
  const MIX = 250;
  const upper = ok.map((s) => xy(s.i, s.med + MIX)),
    lower = ok.map((s) => xy(s.i, s.med - MIX));
  const x0 = x(o.h[ok[0].i]).toFixed(1),
    x1 = x(o.h[ok[ok.length - 1].i]).toFixed(1);
  const zones = `<polygon points="${x0},${T} ${x1},${T} ${[...upper].reverse().join(" ")}" fill="url(#rng-pat-snow)"/><polygon points="${[...upper, ...[...lower].reverse()].join(" ")}" fill="url(#rng-pat-mix)"/><polygon points="${lower.join(" ")} ${x1},${T + ph} ${x0},${T + ph}" fill="url(#rng-pat-rain)"/>`;
  const firstMed = ok[0].med;
  const halo = 'paint-order="stroke" stroke="#0b2130" stroke-width="4" stroke-linejoin="round"';
  const zoneText =
    (y(firstMed + MIX) - T > 22 ? `<text x="${L + 8}" y="${T + 16}" fill="#e6f3f8" font-size="12" font-weight="700" ${halo}>SNOW ↑</text>` : "") +
    `<text x="${L + 8}" y="${(y(firstMed) + 4).toFixed(1)}" fill="#e6f3f8" font-size="11" font-weight="700" ${halo}>MIX</text>` +
    (T + ph - y(firstMed - MIX) > 22 ? `<text x="${L + 8}" y="${T + ph - 8}" fill="#e6f3f8" font-size="12" font-weight="700" ${halo}>RAIN ↓</text>` : "");
  const runs = o.levels.map((s) => rngLine(idx.filter((i) => Number.isFinite(s.level[i])).map((i) => xy(i, s.level[i])), `stroke="#8fb3c4" stroke-opacity="${s.det ? 0.6 : 0.28}" stroke-width="1"`)).join("");
  const band = `<polygon points="${[...ok.map((s) => xy(s.i, s.max)), ...ok.map((s) => xy(s.i, s.min)).reverse()].join(" ")}" fill="#79d7e5" fill-opacity="0.16" stroke="#79d7e5" stroke-opacity="0.7" stroke-dasharray="3 3"/>`;
  const median = rngLine(ok.map((s) => xy(s.i, s.med)), 'stroke="#0b2130" stroke-width="7" stroke-linejoin="round"') + rngLine(ok.map((s) => xy(s.i, s.med)), 'stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"');
  const kft = (v) => (phone ? `${(v / 1000).toFixed(1)}k` : `${v.toLocaleString()}′`);
  const refs = o.ski
    ? [
        { v: o.summit, text: `Summit ${kft(o.summit)}`, dash: "", w: 2 },
        { v: o.base, text: `Base ${kft(o.base)}`, dash: "", w: 2 },
      ]
    : [{ v: elev, text: `${phone ? "Elev" : "Elevation"} ${kft(elev)}`, dash: "", w: 2 }];
  const refLines = refs.map((q) => `<line x1="${L}" x2="${L + pw}" y1="${y(q.v).toFixed(1)}" y2="${y(q.v).toFixed(1)}" stroke="#ffd27a" stroke-width="${q.w}" stroke-dasharray="${q.dash}"/>`).join("");
  const lastMed = ok[ok.length - 1].med;
  const refLabels = rngSpread(
    [...refs.map((q) => ({ y: y(q.v), text: q.text, color: "#ffd27a", dash: q.dash, w: q.w })), { y: y(lastMed), text: phone ? `Med ${kft(Math.round(lastMed / 100) * 100)}` : `Median ${RNG_FT(lastMed)}`, color: "#ffffff", dash: "", w: 3.5, bold: true }],
    T + 6,
    T + ph,
    14,
  )
    .map((l) => `<line x1="${L + pw + 4}" x2="${L + pw + 16}" y1="${l.y.toFixed(1)}" y2="${l.y.toFixed(1)}" stroke="${l.color}" stroke-width="${l.w}" stroke-dasharray="${l.dash}"/><text x="${L + pw + 20}" y="${(l.y + 4).toFixed(1)}" fill="#e6f3f8" font-size="${phone ? 11 : 12}"${l.bold ? ' font-weight="700"' : ""}>${escapeHTML(l.text)}</text>`)
    .join("");
  const pats = (p) =>
    `<defs><pattern id="${p}-snow" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#cfe9f5" fill-opacity="0.07"/></pattern><pattern id="${p}-mix" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#cfe9f5" fill-opacity="0.05"/><line x1="0" y1="0" x2="0" y2="7" stroke="#e6f3f8" stroke-opacity="0.45" stroke-width="2"/></pattern><pattern id="${p}-rain" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.1" fill="#e6f3f8" fill-opacity="0.35"/></pattern><pattern id="${p}-bmix" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#7f9aab"/><line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" stroke-width="2.2"/></pattern><pattern id="${p}-brain" width="4" height="6" patternUnits="userSpaceOnUse"><rect width="4" height="6" fill="#244a5e"/><line x1="2" y1="0" x2="2" y2="6" stroke="#9fd0ea" stroke-width="1.6"/></pattern></defs>`;
  const svg = `<svg class="rng-svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Snow level at ${escapeHTML(o.name)} over the next ${rngLevelDays} days, median ${RNG_FT(firstMed)} now and ${RNG_FT(lastMed)} at the end.">${pats("rng-pat")}${zones}${grid}${rngTicks(o, idx, x, T + ph, phone ? 44 : 52)}${runs}${band}${refLines}${median}${zoneText}${refLabels}<line class="rng-rule" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#ffffff" visibility="hidden"/><rect class="rng-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
  // 6-hour strip: bar height = chance of precipitation; fill and letter = snow, mix or rain at the forecast elevation.
  const blocks = o.blocks.filter((b) => b.b <= hours);
  const sh = phone ? 96 : 110,
    sT = 8,
    sB = 20,
    sph = sh - sT - sB;
  const sy = (f) => sT + sph - f * sph;
  const cloudPts = blocks.filter((b) => b.cloud != null).map((b) => `${((x(b.a) + x(b.b)) / 2).toFixed(1)},${sy(b.cloud / 100).toFixed(1)}`);
  const cloud = cloudPts.length > 1 ? `<polygon points="${x(blocks[0].a).toFixed(1)},${sy(0)} ${cloudPts.join(" ")} ${x(blocks[blocks.length - 1].b).toFixed(1)},${sy(0)}" fill="#c5d3dc" fill-opacity="0.16"/>` : "";
  const FILL = { snow: "#eaf7fd", mix: "url(#rng-bar-bmix)", rain: "url(#rng-bar-brain)" },
    LETTER = { snow: "S", mix: "M", rain: "R" };
  const bars = blocks
    .map((b) => {
      if (!b.chance || !b.type) return "";
      const bx = x(b.a) + 1,
        bw = Math.max(1.5, x(b.b) - x(b.a) - 2),
        by = sy(b.chance);
      const letter = bw >= 13 && b.chance >= 0.2 ? `<text x="${(bx + bw / 2).toFixed(1)}" y="${(by - 3).toFixed(1)}" text-anchor="middle" fill="#e6f3f8" font-size="10" font-weight="700">${LETTER[b.type]}</text>` : "";
      return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${(sy(0) - by).toFixed(1)}" fill="${FILL[b.type]}" stroke="#0b2130" stroke-width="0.5"/>${letter}`;
    })
    .join("");
  const strip = `<svg class="rng-svg rng-strip" width="${width}" height="${sh}" viewBox="0 0 ${width} ${sh}" role="img" aria-label="Chance of precipitation in 6-hour blocks, labeled snow, mix or rain.">${pats("rng-bar")}${[0, 0.5, 1]
    .map((f) => `<line x1="${L}" x2="${L + pw}" y1="${sy(f).toFixed(1)}" y2="${sy(f).toFixed(1)}" stroke="#294858"/><text x="${L - 6}" y="${(sy(f) + 4).toFixed(1)}" text-anchor="end" fill="#9fb1bc" font-size="11">${f * 100}%</text>`)
    .join("")}${cloud}${bars}<text x="${L + pw + 6}" y="${sT + 12}" fill="#9fb1bc" font-size="11">Precip</text><text x="${L + pw + 6}" y="${sT + 26}" fill="#9fb1bc" font-size="11">chance</text><line class="rng-rule" x1="0" x2="0" y1="${sT}" y2="${sy(0)}" stroke="#ffffff" visibility="hidden"/><rect class="rng-hit" x="${L}" y="${sT}" width="${pw}" height="${sph}" fill="transparent"/></svg>`;
  const swatch = (fill) => `<svg class="rng-swatch" width="18" height="12" aria-hidden="true"><rect width="18" height="12" fill="${fill}" stroke="#9fb1bc" stroke-width="0.6"/></svg>`;
  const where = o.ski ? "the summit" : "ground level";
  body.innerHTML = `<div class="rng-chips"><span class="rng-chip"><b>Snow level now</b> ${RNG_FT(firstMed)} <small>(range ${RNG_FT(ok[0].min)}–${RNG_FT(ok[0].max)})</small></span><span class="rng-chip rng-chip-soft">${o.levels.length} model runs</span></div><div class="rng-wrap">${svg}${strip}<div class="rng-tip" hidden></div></div><p class="ins-legend rng-legend"><span class="ins-key rng-key-runs"></span>Model runs <span class="ins-key ins-key-line rng-key-med"></span>Median <span class="ins-key ins-key-band"></span>Lowest–highest <span class="ins-key rng-key-ref"></span>${o.ski ? "Summit and base" : "Ground elevation"} · Zones: snow above, mix (hatched, ~500 ft), rain below (dotted)</p><p class="ins-legend rng-legend">Bars: ${swatch(FILL.snow)} S = snow ${swatch(FILL.mix)} M = mix ${swatch(FILL.rain)} R = rain at ${where} · bar height = chance of precipitation · light shading behind = cloud cover</p>`;
  rngHover(body, { L, pw, hours }, (hh) => {
    const b = blocks.find((q) => hh > q.a && hh <= q.b) || blocks.find((q) => hh >= q.a && hh <= q.b);
    if (!b) return null;
    const head = `${rngLocal(b.date + "T12:00", { weekday: "short", month: "short", day: "numeric" })} – ${RNG_PART(b.start)}`;
    const type = b.type ? { snow: "Snow", mix: "Rain/snow mix", rain: "Rain" }[b.type] : "";
    const precip =
      b.chance == null
        ? ""
        : `<br>Precip chance ${Math.round(b.chance * 100)}%${b.liq >= 0.01 ? ` · median ${b.liq.toFixed(2)}″ liquid` : ""}${b.chance >= 0.1 && type ? ` · ${type} at ${where}` : ""}${b.cloud != null ? ` · Clouds ${b.cloud}%` : ""}`;
    return { at: (b.a + b.b) / 2, html: `<b>${escapeHTML(head)}</b> · Max ${RNG_FT(b.max)} · Median ${RNG_FT(b.med)} · Min ${RNG_FT(b.min)}${precip}` };
  });
}

/* Pointer and touch tooltip: a vertical rule in every chart of the card and one text box. text(hours) → {at, html}. */
function rngHover(body, { L, pw, hours }, text) {
  const wrap = body.querySelector(".rng-wrap"),
    tip = wrap?.querySelector(".rng-tip");
  if (!wrap || !tip) return;
  const hide = () => {
    tip.hidden = true;
    wrap.querySelectorAll(".rng-rule").forEach((l) => l.setAttribute("visibility", "hidden"));
  };
  const show = (e) => {
    const svg = e.target.closest("svg");
    const rect = svg.getBoundingClientRect(),
      scale = rect.width / svg.viewBox.baseVal.width;
    const hh = Math.max(0, Math.min(hours, (((e.clientX - rect.left) / scale - L) / pw) * hours));
    const r = text(hh);
    if (!r) return hide();
    const lx = (L + (r.at / hours) * pw).toFixed(1);
    wrap.querySelectorAll(".rng-rule").forEach((l) => {
      l.setAttribute("x1", lx);
      l.setAttribute("x2", lx);
      l.setAttribute("visibility", "visible");
    });
    tip.innerHTML = r.html;
    tip.hidden = false;
    const wr = wrap.getBoundingClientRect(),
      cx = e.clientX - wr.left,
      cy = e.clientY - wr.top,
      tw = tip.offsetWidth;
    tip.style.left = `${Math.max(4, Math.min(wr.width - tw - 4, cx > wr.width / 2 ? cx - tw - 12 : cx + 12))}px`;
    tip.style.top = `${Math.max(4, cy - tip.offsetHeight - 10)}px`;
  };
  wrap.querySelectorAll(".rng-hit").forEach((h) => {
    h.addEventListener("pointermove", show);
    h.addEventListener("pointerdown", show);
    h.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && hide());
  });
}

/* Snow forecast for one place. place: a dashboard place or saved search; section: "utah" | "ne".
   links: where the Weather and Snow pages are relative to this page. */
async function loadPlaceSnow(place, section, links = { weather: "", snow: "snow/" }) {
  const root = document.querySelector("#place-snow");
  if (!root) return;
  rngState = null;
  const key = `${section}/${place.name}`;
  root.dataset.key = key;
  const pl = SnowCore.placeFor(place, section);
  const region = section === "utah" ? "Utah" : "New England";
  const id = slug(place.name);
  const profile = section === "utah" && place.p.length > 1 && !place.searched ? `<a class="xlink" href="${links.weather}#utah/${id}/mountain">Mountain profile ›</a>` : "";
  const forecast = `<a class="xlink" href="${links.weather}#${section}/${id}/forecast">Weather forecast ›</a>`;
  root.innerHTML = `<article class="card afd-card rng-card" id="ps-days"><div class="rng-head"><div><h3>Snow forecast · next 10 days</h3><p class="sub">${pl.ski ? `Forecast for the summit (${pl.summit.toLocaleString()} ft)` : "Forecast at ground level"}</p></div><div class="ps-links">${forecast}${profile}<a class="xlink" href="${links.snow}#forecast/${section}">Compare all ${region} mountains ›</a></div></div><div class="ps-body"><div class="state">Loading the snow forecast…</div></div></article><article class="card afd-card rng-card" id="rng-range"><div class="rng-head"><div><h3>Forecast range</h3><p class="sub">Every ensemble run, and how far apart they are</p></div>${rngSeg("range", rngDays)}</div><div class="rng-body"><div class="state">Loading ensemble runs…</div></div></article><article class="card afd-card rng-card" id="rng-level"><div class="rng-head"><div><h3>Snow level</h3><p class="sub">Elevation where rain turns to snow</p></div>${rngSeg("level", rngLevelDays)}</div><div class="rng-body"><div class="state">Loading snow levels…</div></div></article><p class="source ps-source"></p>`;
  root.querySelectorAll("[data-range-days]").forEach(
    (b) =>
      (b.onclick = () => {
        rngDays = +b.dataset.rangeDays;
        root.querySelectorAll("[data-range-days]").forEach((q) => {
          q.classList.toggle("active", q === b);
          q.setAttribute("aria-pressed", String(q === b));
        });
        drawRange();
      }),
  );
  root.querySelectorAll("[data-level-days]").forEach(
    (b) =>
      (b.onclick = () => {
        rngLevelDays = +b.dataset.levelDays;
        root.querySelectorAll("[data-level-days]").forEach((q) => {
          q.classList.toggle("active", q === b);
          q.setAttribute("aria-pressed", String(q === b));
        });
        drawLevel();
      }),
  );
  let o;
  try {
    o = await SnowCore.forPlace(place, section);
  } catch (e) {
    if (root.dataset.key === key)
      root.querySelectorAll(".ps-body, .rng-body").forEach((el) => (el.innerHTML = `<div class="error">The snow forecast is temporarily unavailable${String(e?.message) === "429" ? " (the free model service is busy; try again in a minute)" : ""}.</div>`));
    return;
  }
  if (!root.isConnected || root.dataset.key !== key) return;
  rngState = o;
  root.querySelector("#ps-days .sub").textContent = basisText(o);
  drawDays(root.querySelector(".ps-body"), o);
  drawRange();
  drawLevel();
  const age = Math.max(0, Math.round((Date.now() - Date.parse(o.built)) / 60000));
  root.querySelector(".ps-source").innerHTML = `How this is worked out: the NWS gridded forecast${o.nws?.elev ? ` (its grid square sits at ${o.nws.elev.toLocaleString()} ft)` : ""} sets the forecast for its first ~7 days; after that, the median of ${o.members.length} GEFS and ECMWF ensemble runs is added. The likely range comes from those runs${o.nws ? `, scaled ×${o.nws.scale} to match NWS over its days` : ""}. Each run's rain counts as snow when its snow level is below ${o.ski ? "the summit" : "ground level"}, using a snow ratio from its temperature (about 8:1 near 32°F, 16:1 in the teens). The All mountains list and map, and Insights, use these same numbers. Updated ${age < 60 ? `${age} min` : `${Math.round(age / 60)} h`} ago · Data: NWS, Open-Meteo.`;
}
let rngResize = 0;
addEventListener("resize", () => {
  clearTimeout(rngResize);
  rngResize = setTimeout(() => {
    if (rngState && document.querySelector("#place-snow")) {
      drawRange();
      drawLevel();
    }
  }, 150);
});
