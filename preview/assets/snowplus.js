/* Snow Report · Resort detail: past and future snow strip, 12-hour snow table (snowfall ranges,
   snow-to-liquid ratio, snow level), snow level chart against the mountain's elevations, and nearby stations.
   Sources: NWS gridded forecast, Open-Meteo (past model snowfall, GEFS + ECMWF ensembles), NWS station
   observations and USDA NRCS SNOTEL (via the data branch). Classic script: uses common.js and plus.js. */

(() => {
const U = () => window.plus.util;
const H = 3600000;
const ZONE = "America/Denver";
const fin = (v) => Number.isFinite(v);
/* Approximate base-area elevations (ft) for the snow level chart. */
const BASE_FT = {
  "Deer Valley": 6570,
  "Canyons Resort": 6800,
  Alta: 8530,
  Snowbird: 7760,
  Solitude: 7988,
  Brighton: 8755,
  Snowbasin: 6391,
};
const ftOf = (p) => {
  const m = String(p[2]).match(/~([\d,]+)\s*ft/);
  return m ? +m[1].replace(/,/g, "") : null;
};
const inch = (v, digits) => {
  if (!fin(v)) return "–";
  if (v < 0.05) return "0″";
  const d = digits ?? (v < 1 ? 1 : v < 10 ? 1 : 0);
  return v.toFixed(d).replace(/\.0$/, "") + "″";
};
const rangeTxt = (a, b) => {
  if (!fin(a) || !fin(b)) return "–";
  const r = (v) => (v < 0.5 ? 0 : v < 3 ? Math.round(v) : Math.round(v));
  const lo = r(a),
    hi = Math.max(r(b), lo);
  if (hi === 0) return b >= 0.1 ? "<1″" : "0″";
  return lo === hi ? `${lo}″` : `${lo}–${hi}″`;
};

/* ---------- data ---------- */
function pastSnow(p) {
  return U().memo(`past:${p[0]},${p[1]}`, 60, async () => {
    const u = new URL("https://api.open-meteo.com/v1/forecast");
    Object.entries({
      latitude: p[0],
      longitude: p[1],
      hourly: "snowfall",
      past_days: 15,
      forecast_days: 1,
      timezone: "UTC",
      precipitation_unit: "inch",
      models: "best_match",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    return getJSON(u.toString());
  });
}
function ensSnow(p) {
  return U().memo(`enssnow:${p[0]},${p[1]}`, 30, async () => {
    const u = new URL("https://ensemble-api.open-meteo.com/v1/ensemble");
    Object.entries({
      latitude: p[0],
      longitude: p[1],
      hourly: "snowfall,precipitation",
      models: "ncep_gefs025,ecmwf_ifs025_ensemble",
      forecast_days: 16,
      temporal_resolution: "hourly_3",
      timezone: "UTC",
      precipitation_unit: "inch",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    return getJSON(u.toString());
  });
}
/* Ensemble members' snowfall as [{times, values}] (inches per 3 h, accumulation ending at each time). */
function members(ens, key = "snowfall") {
  const out = [];
  const times = ens.hourly.time.map(U().omTime);
  for (const k of Object.keys(ens.hourly)) {
    if (!k.startsWith(key + "_")) continue;
    if (!/_(ncep_gefs025|ecmwf_ifs025_ensemble)$/.test(k)) continue;
    if (key === "snowfall" && k.startsWith("snowfall_height")) continue;
    out.push(ens.hourly[k].map((v) => (fin(v) ? v : null)));
  }
  return { times, list: out };
}
function memberSums(m, a, b) {
  // Accumulations end at each timestamp; a 3-hourly value ending at t covers (t-3h, t].
  return m.list
    .map((vals) => {
      let s = 0,
        n = 0;
      m.times.forEach((t, k) => {
        if (t > a && t <= b && fin(vals[k])) {
          s += vals[k];
          n++;
        }
      });
      return n ? s : null;
    })
    .filter(fin)
    .sort((x, y) => x - y);
}
function stationMeta(id) {
  return U().memo(`stn:${id}`, 24 * 60, async () => (await getJSON(`https://api.weather.gov/stations/${id}`)));
}
function stationObs(id) {
  return U().memo(`stnobs:${id}`, 15, async () => {
    const start = new Date(Date.now() - 25 * H).toISOString().replace(/\.\d+Z$/, "Z");
    const j = await getJSON(`https://api.weather.gov/stations/${id}/observations?start=${start}&limit=150`);
    return (j.features || []).map((f) => f.properties).filter((x) => fin(Date.parse(x.timestamp)));
  });
}

/* ---------- geometry ---------- */
function distBearing(a, b) {
  const R = 3958.8,
    rad = Math.PI / 180,
    dLat = (b[0] - a[0]) * rad,
    dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(h));
  const y = Math.sin(dLon) * Math.cos(b[0] * rad),
    x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos(dLon);
  const brg = (Math.atan2(y, x) / rad + 360) % 360;
  return { mi: d, dir: compass(brg) };
}

/* =====================================================================
   #8 Past and future snow strip
   ===================================================================== */
function dayStarts(fromDay, n) {
  // Local midnights starting `fromDay` days from today (negative = past).
  const { zParts, hourFloor } = U();
  let t = hourFloor(Date.now());
  for (let k = 0; k < 25 && zParts(t, ZONE).hour !== 0; k++) t -= H;
  const out = [];
  let cur = t;
  const step = fromDay >= 0 ? 1 : -1;
  for (let k = 0; k < Math.abs(fromDay); k++) {
    cur += step * 24 * H;
    // DST: snap back to local midnight.
    for (let j = 0; j < 2 && zParts(cur, ZONE).hour !== 0; j++) cur += zParts(cur, ZONE).hour >= 12 ? H : -H;
  }
  for (let k = 0; k < n; k++) {
    let next = cur + 24 * H;
    for (let j = 0; j < 2 && zParts(next, ZONE).hour !== 0; j++) next += zParts(next, ZONE).hour >= 12 ? H : -H;
    out.push([cur, next]);
    cur = next;
  }
  return out;
}
function stripBox(title, days, values, total, sub, kind) {
  const max = Math.max(1, ...values.filter(fin));
  return `<div class="ss-box ss-${kind}"><div class="ss-title">${title}</div><div class="ss-total">${total}</div>${sub ? `<div class="ss-sub">${sub}</div>` : ""}<div class="ss-bars" aria-hidden="true">${days
    .map(([a], i) => {
      const v = values[i],
        hgt = fin(v) && v >= 0.05 ? Math.max(3, (v / max) * 34) : 0;
      return `<span title="${escapeHTML(new Date(a).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: ZONE }))}: ${inch(v)}"><i style="height:${hgt}px"></i><b>${escapeHTML(new Date(a).toLocaleDateString("en-US", { weekday: "narrow", timeZone: ZONE }))}</b></span>`;
    })
    .join("")}</div></div>`;
}
async function loadStrip(el, p, nws, snotelNear) {
  const [past, ens] = await Promise.allSettled([pastSnow(p), ensSnow(p)]);
  if (!el.isConnected) return;
  const boxes = [];
  const now = Date.now();
  if (past.status === "fulfilled" && past.value.hourly?.time) {
    const t = past.value.hourly.time.map(U().omTime),
      v = past.value.hourly.snowfall;
    const daySum = ([a, b]) => {
      let s = 0,
        n = 0;
      t.forEach((tm, k) => {
        if (tm > a && tm <= Math.min(b, now) && fin(v[k])) {
          s += v[k];
          n++;
        }
      });
      return n ? s : null;
    };
    for (const [from, label] of [
      [-15, "Prev 11–15 days"],
      [-10, "Prev 6–10 days"],
      [-5, "Prev 1–5 days"],
    ]) {
      const days = dayStarts(from, 5),
        vals = days.map(daySum);
      boxes.push(stripBox(label, days, vals, inch(vals.filter(fin).reduce((a, b) => a + b, 0)), "model estimate", "past"));
    }
    let s24 = 0;
    t.forEach((tm, k) => {
      if (tm > now - 24 * H && tm <= now && fin(v[k])) s24 += v[k];
    });
    const measured = snotelNear && fin(snotelNear.change24) ? `SNOTEL depth ${snotelNear.change24 > 0 ? "+" : ""}${snotelNear.change24.toFixed(1)}″` : "model estimate";
    boxes.push(`<div class="ss-box ss-now"><div class="ss-title">Last 24 hours</div><div class="ss-total">${inch(s24)}</div><div class="ss-sub">${escapeHTML(measured)}</div><div class="ss-now-note">${escapeHTML(new Date(now).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: ZONE }))}</div></div>`);
  } else boxes.push('<div class="ss-box ss-past"><div class="ss-title">Past 15 days</div><div class="ss-sub">Unavailable</div></div>');
  if (ens.status === "fulfilled" && ens.value.hourly?.time) {
    const m = members(ens.value);
    const g = nws?.grid ? U().gridHours(nws.grid.snowfallAmount, true) : null;
    for (const [from, label] of [
      [0, "Next 1–5 days"],
      [5, "Next 6–10 days"],
      [10, "Next 11–15 days"],
    ]) {
      const days = dayStarts(from, 5).map(([a, b]) => [Math.max(a, from === 0 ? now : a), b]);
      const med = days.map(([a, b]) => U().quant(memberSums(m, a, b), 0.5));
      const tot = memberSums(m, days[0][0], days[4][1]);
      let sub = `range ${rangeTxt(U().quant(tot, 0.25), U().quant(tot, 0.75))}`;
      if (from === 0 && g) {
        const ns = U().over(g, now, days[4][1], "sum");
        if (ns != null) sub = `NWS ${inch(ns / 25.4)} · ${sub}`;
      }
      boxes.push(stripBox(label, dayStarts(from, 5), med, inch(U().quant(tot, 0.5)), sub, "future"));
    }
  } else boxes.push('<div class="ss-box ss-future"><div class="ss-title">Next 15 days</div><div class="ss-sub">Unavailable</div></div>');
  el.innerHTML = `<h3>Snow summary · ${escapeHTML(p[2].split(" · ")[0])}</h3><div class="ss-strip">${boxes.join("")}</div>${U().freshLine({
    updated: Date.now(),
    source: "Open-Meteo past model snowfall · GEFS + ECMWF ensembles (82 runs)" + (nws ? " · NWS grid" : "") + (snotelNear ? ` · SNOTEL ${escapeHTML(snotelNear.name || "")}` : ""),
    detail: escapeHTML(p[2]),
    help: "<p>Left of <b>Last 24 hours</b> is what fell, right of it is what is forecast, in inches of snow. Mini bars are single days (local midnight to midnight).</p><p><b>Past</b> totals are model estimates at this point, not a resort report; the measured SNOTEL depth change (settling included) is shown for the last 24 hours when a station is nearby. <b>Future</b> totals are the median of 82 ensemble runs with the middle half of runs as the range; the NWS official total covers the first days only. Days 6–15 are trends, not promises.</p>",
  })}`;
}

/* =====================================================================
   #3 + #5 12-hour snow table: snowfall range, snow-to-liquid ratio, snow level
   ===================================================================== */
function slrWord(r) {
  return r >= 18 ? "very light" : r >= 13 ? "light" : r >= 9 ? "average" : "dense";
}
function snowTable(p, nws, ens, ptFt) {
  const u = U(),
    now = Date.now();
  const blocks = u.blocks12(ZONE, 15).filter((b) => b.end > now).slice(0, 14);
  const g = u.gridSeries(nws.grid);
  const lvl = u.gridHours(nws.grid.snowLevel);
  const m = ens ? members(ens) : null;
  const cols = blocks.map((b) => {
    const a = Math.max(b.start, u.hourFloor(now));
    const qpf = u.over(g.qpf, a, b.end, "sum"),
      sn = u.over(g.snow, a, b.end, "sum"),
      pop = u.over(g.pop, a, b.end, "max"),
      tlo = u.over(g.temp, a, b.end, "min"),
      thi = u.over(g.temp, a, b.end, "max"),
      llo = u.over(lvl, a, b.end, "min"),
      lhi = u.over(lvl, a, b.end, "max");
    const L = qpf == null ? null : qpf / 25.4,
      S = sn == null ? null : sn / 25.4;
    const ens = m ? memberSums(m, a, b.end) : [];
    const slr = fin(L) && L >= 0.02 && fin(S) && S > 0 ? S / L : null;
    let type = "";
    if (fin(L) && L >= 0.01) {
      const lv = fin(llo) ? llo * 3.28084 : null;
      if (fin(S) && S < 0.05 && fin(lv) && ptFt && lv > ptFt) type = "R";
      else if (fin(lv) && ptFt) type = lv <= ptFt - 500 ? "S" : lv >= ptFt + 500 ? "R" : "M";
      else type = fin(S) && S > 0 ? "S" : "R";
    }
    return { b, L, S, pop, tlo: cToF(tlo), thi: cToF(thi), llo: fin(llo) ? llo * 3.28084 : null, lhi: fin(lhi) ? lhi * 3.28084 : null, ens, slr, type };
  });
  const r100 = (v) => (Math.round(v / 100) * 100).toLocaleString();
  const row = (name, fn, cls = "") => `<tr class="${cls}"><th scope="row">${name}</th>${cols.map((c) => `<td class="${c.b.day ? "dn-day" : "dn-night"}">${fn(c)}</td>`).join("")}</tr>`;
  const head = `<thead><tr><th></th>${cols
    .map((c) => `<th scope="col" class="${c.b.day ? "dn-day" : "dn-night"}"><b>${escapeHTML(new Date(c.b.start + 3 * H).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: ZONE }))}</b><small>${c.b.day ? "day" : "night"}</small></th>`)
    .join("")}</tr></thead>`;
  const body = `<tbody>${row(
    "Snowfall",
    (c) => {
      const r = c.ens.length ? rangeTxt(u.quant(c.ens, 0.25), u.quant(c.ens, 0.75)) : "–";
      return `<b class="sn-range">${r}</b><small>NWS ${inch(c.S)}</small>`;
    },
    "sn-main",
  )}${row("Type", (c) => (c.type ? `<span class="pt pt-${c.type}">${c.type}</span><small>${u.PT_NAME[c.type]}</small>` : "–"))}${row(
    "Snow ratio",
    (c) => (fin(c.slr) ? `<b>${Math.round(c.slr)}:1</b><small>${slrWord(c.slr)}</small>` : "–"),
  )}${row("Snow level", (c) => (fin(c.llo) ? (r100(c.llo) === r100(c.lhi) ? `${r100(c.llo)}<small>ft</small>` : `${r100(c.llo)}–${r100(c.lhi)}<small>ft</small>`) : "–"))}${row(
    "Precip chance",
    (c) => (fin(c.pop) ? `${Math.round(c.pop)}%` : "–"),
  )}${row("Liquid", (c) => u.fmtIn(c.L))}${row("Temp", (c) => (fin(c.tlo) ? `${c.tlo}–${c.thi}°` : "–"))}</tbody>`;
  return { html: `<div class="dn-wrap"><table class="dn-table sn-table">${head}${body}</table></div>`, cols };
}
/* Snow level over the next week against the summit, forecast point, mid mountain and base. */
function levelChart(nws, refs, width) {
  const u = U(),
    now = Date.now();
  const lvl = [...u.gridHours(nws.grid.snowLevel).entries()].filter(([t]) => t >= u.hourFloor(now) && t < now + 7 * 24 * H).sort((a, b) => a[0] - b[0]);
  if (lvl.length < 4) return '<p class="muted">Snow level forecast unavailable.</p>';
  const qpf = u.gridHours(nws.grid.quantitativePrecipitation, true);
  const w = Math.max(320, Math.round(width)),
    h = 220,
    left = 54,
    right = 112,
    top = 14,
    plotH = 170;
  const t0 = lvl[0][0],
    t1 = lvl.at(-1)[0];
  const x = (t) => left + ((t - t0) / (t1 - t0)) * (w - left - right);
  const ft = lvl.map(([, v]) => v * 3.28084);
  const all = [...ft, ...refs.map((r) => r.ft)].filter(fin);
  const lo = Math.floor((Math.min(...all) - 500) / 1000) * 1000,
    hi = Math.ceil((Math.max(...all) + 500) / 1000) * 1000;
  const y = (v) => top + ((hi - v) / (hi - lo)) * plotH;
  let g = "";
  for (let v = lo; v <= hi; v += 1000)
    g += `<line x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}" class="rg-grid"/><text x="${left - 6}" y="${y(v) + 4}" text-anchor="end" class="axis-label">${(v / 1000).toFixed(0)}k</text>`;
  let wet = "";
  for (let t = t0; t < t1; t += H) if ((qpf.get(t) || 0) > 0.05) wet += `<rect x="${x(t)}" y="${top}" width="${Math.max(1, x(t + H) - x(t))}" height="${plotH}" class="sl-wet"/>`;
  let days = "";
  for (let t = t0; t <= t1; t += H)
    if (u.zParts(t, ZONE).hour === 0)
      days += `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top + plotH}" class="rg-day"/><text x="${x(t) + 3}" y="${h - 8}" class="axis-label">${escapeHTML(u.zParts(t, ZONE).wd)}</text>`;
  const refsSvg = refs
    .map((r, i) => `<line x1="${left}" x2="${w - right}" y1="${y(r.ft)}" y2="${y(r.ft)}" class="sl-ref sl-ref-${i}"/><text x="${w - right + 6}" y="${y(r.ft) + 4}" class="sl-ref-lbl">${escapeHTML(r.name)} ${(r.ft / 1000).toFixed(1)}k</text>`)
    .join("");
  const path = lvl.map(([t], k) => `${k ? "L" : "M"}${x(t).toFixed(1)},${y(ft[k]).toFixed(1)}`).join("");
  return `<svg class="rg-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Snow level forecast for the next week">${g}${wet}${days}${refsSvg}<path d="${path}" class="sl-line"/></svg><div class="rg-legend"><span><i class="lg-median"></i>Snow level (rain below, snow above)</span><span><i class="lg-wet"></i>Precipitation falling</span><span><i class="lg-ref"></i>Mountain elevations</span></div>`;
}

/* =====================================================================
   #7 Nearby stations
   ===================================================================== */
async function stationCards(r, p, snotel) {
  const ids = new Set();
  for (const q of r.p) for (const id of OBS_STATIONS[`${q[0]},${q[1]}`] || []) ids.add(id);
  try {
    const point = await pointMeta(p);
    const j = await getJSON(point.observationStations);
    (j.features || []).slice(0, 5).forEach((f) => ids.add(f.properties.stationIdentifier));
  } catch {}
  const ptFt = ftOf(p);
  const list = await Promise.all(
    [...ids].slice(0, 10).map(async (id) => {
      try {
        const [meta, obs] = await Promise.all([stationMeta(id), stationObs(id).catch(() => [])]);
        const c = meta.geometry?.coordinates;
        const elevFt = fin(meta.properties?.elevation?.value) ? Math.round(meta.properties.elevation.value * 3.28084) : null;
        const sorted = obs.slice().sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
        const latest = sorted.find((o) => fin(o.temperature?.value));
        const depth = (o) => (fin(o?.snowDepth?.value) ? o.snowDepth.value / 25.4 : null);
        const nowD = depth(sorted.find((o) => fin(o.snowDepth?.value)));
        const at = (hrs) => depth(sorted.find((o) => fin(o.snowDepth?.value) && Date.parse(o.timestamp) <= Date.now() - hrs * H));
        const d12 = at(12),
          d24 = at(23);
        return {
          kind: "Weather station",
          id,
          name: meta.properties?.name || id,
          lat: c?.[1],
          lon: c?.[0],
          elevFt,
          time: latest ? Date.parse(latest.timestamp) : null,
          temp: latest ? cToF(latest.temperature.value) : null,
          wind: latest ? kmhToMph(latest.windSpeed?.value) : null,
          gust: latest ? kmhToMph(latest.windGust?.value) : null,
          dir: latest ? compass(latest.windDirection?.value) : "",
          depth: nowD,
          ch12: fin(nowD) && fin(d12) ? nowD - d12 : null,
          ch24: fin(nowD) && fin(d24) ? nowD - d24 : null,
        };
      } catch {
        return null;
      }
    }),
  );
  const out = list.filter((x) => x && (fin(x.temp) || fin(x.depth)));
  for (const s of snotel?.stations || []) {
    const hourly = (s.hourly || []).filter((x) => fin(x.depth));
    const last = hourly.at(-1);
    const back = (hrs) => last && hourly.find((x) => Date.parse(x.time.replace(" ", "T")) >= Date.parse(last.time.replace(" ", "T")) - hrs * H);
    const b12 = back(12);
    out.push({
      kind: "SNOTEL",
      id: s.triplet,
      name: s.name || s.triplet,
      near: s.near,
      lat: s.lat,
      lon: s.lon,
      elevFt: s.elevFt,
      time: s.latest?.time ? Date.parse(s.latest.time.replace(" ", "T") + ":00-07:00") : null,
      temp: fin(s.latest?.temp) ? Math.round(s.latest.temp) : null,
      depth: s.latest?.depth,
      swe: s.latest?.swe,
      ch12: fin(s.change12) ? s.change12 : last && b12 ? Math.round((last.depth - b12.depth) * 10) / 10 : null,
      ch24: s.change24,
      stale: s.stale,
    });
  }
  out.forEach((s) => {
    if (fin(s.lat) && fin(s.lon)) Object.assign(s, distBearing(p, [s.lat, s.lon]));
    s.dFt = fin(s.elevFt) && ptFt ? s.elevFt - ptFt : null;
  });
  return out
    .filter((s) => !fin(s.mi) || s.mi <= 15)
    .sort((a, b) => (fin(a.mi) ? a.mi : 99) - (fin(b.mi) ? b.mi : 99))
    .slice(0, 10);
}
function stationHTML(list, p) {
  const ptName = p[2].split(" · ")[0].toLowerCase();
  const ch = (v) => (fin(v) ? `${v > 0.05 ? "+" : ""}${Math.abs(v) < 0.05 ? "0" : v.toFixed(1)}″` : "–");
  return `<div class="stn-grid">${list
    .map((s) => {
      const where = fin(s.mi)
        ? `${s.mi < 0.95 ? s.mi.toFixed(1) : Math.round(s.mi)} mi ${s.dir}${fin(s.dFt) ? ` &amp; ${Math.abs(Math.round(s.dFt / 50) * 50).toLocaleString()} ft ${s.dFt >= 0 ? "higher" : "lower"}` : ""} than the ${escapeHTML(ptName)} point`
        : escapeHTML(s.near ? `Near ${s.near}` : "Location not listed");
      const snowy = fin(s.depth) || fin(s.ch24);
      return `<article class="stn"><header><b>${escapeHTML(s.name)}</b><small>${s.kind}${fin(s.elevFt) ? ` · ${s.elevFt.toLocaleString()} ft` : ""} · ${escapeHTML(s.id)}</small></header><p class="stn-where">${where}</p><dl>${
        snowy
          ? `<div><dt>New snow 12 h</dt><dd>${ch(s.ch12)}</dd></div><div><dt>24 h</dt><dd>${ch(s.ch24)}</dd></div><div><dt>Depth</dt><dd>${fin(s.depth) ? Math.round(s.depth) + "″" : "–"}</dd></div>`
          : ""
      }<div><dt>Temp</dt><dd>${fin(s.temp) ? s.temp + "°F" : "–"}</dd></div>${s.kind !== "SNOTEL" ? `<div><dt>Wind</dt><dd>${fin(s.wind) ? (s.wind === 0 ? "calm" : `${escapeHTML(s.dir)} ${s.wind}${fin(s.gust) ? `<small> g${s.gust}</small>` : ""}`) : "–"}</dd></div>` : fin(s.swe) ? `<div><dt>Water in snow</dt><dd>${s.swe.toFixed(1)}″</dd></div>` : ""}</dl><p class="stn-time">${s.time ? (s.stale ? "Last good reading " : "Reported ") + U().agoText(s.time) : "No recent report"}</p></article>`;
    })
    .join("")}</div>`;
}

/* ---------- page ---------- */
let detailPoint = 1;
async function render(el, r, snotel) {
  const pi = Math.min(detailPoint, r.p.length - 1),
    p = r.p[pi],
    ptFt = ftOf(p);
  el.innerHTML = `<div class="sd-head"><h3>${escapeHTML(r.name)}</h3>${
    r.p.length > 1
      ? `<div class="seg" aria-label="Elevation">${r.p
          .map((q, k) => [q, k])
          .reverse()
          .map(([q, k]) => `<button type="button" data-sdp="${k}" class="${k === pi ? "active" : ""}" aria-pressed="${k === pi}">${escapeHTML(q[2].split(" · ")[0])}</button>`)
          .join("")}</div>`
      : ""
  }</div><article class="card afd-card" id="sd-strip"><div class="state">Loading past and future snowfall…</div></article><article class="card afd-card" id="sd-table"><div class="state">Loading the 12-hour snow forecast…</div></article><article class="card afd-card" id="sd-stations"><h3>Nearby stations</h3><div class="state">Loading station reports…</div></article>`;
  el.querySelectorAll("[data-sdp]").forEach(
    (b) =>
      (b.onclick = () => {
        detailPoint = +b.dataset.sdp;
        render(el, r, snotel);
      }),
  );
  const nwsP = mountainPoint(p).catch(() => null);
  const snotelNear = (() => {
    const list = (snotel?.stations || []).filter((s) => fin(s.lat));
    if (!list.length) return (snotel?.stations || []).find((s) => (s.near || "").includes(r.name.split(" ")[0])) || null;
    return list.map((s) => ({ s, d: distBearing(p, [s.lat, s.lon]).mi })).sort((a, b) => a.d - b.d)[0]?.s || null;
  })();
  nwsP.then((nws) => loadStrip(el.querySelector("#sd-strip"), p, nws, snotelNear)).catch(() => {});
  // 12-hour table and snow level chart.
  (async () => {
    const box = el.querySelector("#sd-table");
    const [nws, ens] = await Promise.all([nwsP, ensSnow(p).catch(() => null)]);
    if (!box?.isConnected) return;
    if (!nws?.grid) {
      box.innerHTML = '<h3>Next 7 days by 12 hours</h3><div class="error">NWS gridded forecast is temporarily unavailable.</div>';
      return;
    }
    const t = snowTable(p, nws, ens, ptFt);
    const refs = [
      ...r.p
        .map((q) => ({ name: q[2].split(" · ")[0].replace("Mid mountain", "Mid"), ft: ftOf(q) }))
        .filter((x) => fin(x.ft)),
      ...(BASE_FT[r.name] ? [{ name: "Base", ft: BASE_FT[r.name] }] : []),
    ].sort((a, b) => b.ft - a.ft);
    box.innerHTML = `<h3>Next 7 days by 12 hours</h3><p class="afd-intro">Snowfall is the range most ensemble runs agree on (middle half of 82 runs), with the official NWS amount underneath. Type, snow ratio and snow level come from the NWS forecast for ${escapeHTML(p[2])}.</p>${t.html}<h4 class="sl-h">Snow level vs. the mountain</h4><div class="sl-chart"></div>${U().freshLine({
      updated: Date.parse(nws.grid.updateTime),
      source: `NWS gridded forecast${ens ? " · GEFS + ECMWF ensembles" : ""}`,
      detail: `NWS grid ${fin(nws.forecast?.elevation?.value) ? Math.round(nws.forecast.elevation.value * 3.28084).toLocaleString() + " ft" : ""}`,
      help: `<p><b>Snow level</b> is the elevation where rain turns to snow. Below the line you get rain or wet snow; well above it, snow. When it sits within a few hundred feet of the mountain, expect mixed precipitation and heavy snow at that elevation.</p><p><b>Snow ratio</b> (snow-to-liquid) is inches of snow per inch of water: under 9:1 is dense, wet snow; 9–12:1 average; 13:1 and up light and dry; 18:1 and up is very light powder.</p><p><b>Type</b> uses the snow level against this point's elevation: <b>S</b> snow, <b>M</b> mixed (snow level within 500 ft), <b>R</b> rain. Day is 6 am–6 pm, night 6 pm–6 am, Mountain time. Bases are approximate.</p>`,
    })}`;
    const chart = box.querySelector(".sl-chart");
    const draw = () => chart.isConnected && (chart.innerHTML = levelChart(nws, refs, chartWidth(chart)));
    draw();
    redrawOnResize(chart, draw);
  })();
  // Stations.
  (async () => {
    const box = el.querySelector("#sd-stations");
    try {
      const list = await stationCards(r, p, snotel);
      if (!box?.isConnected) return;
      if (!list.length) throw Error("none");
      box.innerHTML = `<h3>Nearby stations</h3><p class="afd-intro">Latest reports from weather stations and SNOTEL sites around ${escapeHTML(r.name)}, closest first. Use them to check the forecast against what actually happened.</p>${stationHTML(list, p)}${U().freshLine({
        updated: Math.max(...list.map((s) => s.time).filter(fin), 0) || null,
        source: "NWS / MesoWest station feeds · USDA NRCS SNOTEL",
        help: "<p>Distance, direction and the elevation difference are measured from the forecast point you picked (peak or mid mountain). <b>New snow</b> is the change in measured snow depth, so settling can make it read low or negative; SNOTEL sites sit in sheltered clearings and usually show less than a resort's high-elevation snow stake. Stations without a depth sensor show temperature and wind only.</p>",
      })}`;
    } catch {
      if (box?.isConnected) box.innerHTML = '<h3>Nearby stations</h3><div class="error">Station reports are temporarily unavailable.</div>';
    }
  })();
}

window.snowPlus = { render, _: { distBearing, rangeTxt, slrWord, dayStarts, members, memberSums } };
})();
