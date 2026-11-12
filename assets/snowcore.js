/* One snow calculation for the whole site (Snow tab, Snow report table and map, Insights).
   Runs in the browser (classic script: defines SnowCore) and in Node (scripts/update-snow-outlook.mjs builds the
   dashboard mountains every 3 hours, so every page reads the same numbers).

   Basis: ski areas are forecast at their summit; towns at ground level.
   Middle number: the NWS gridded snowfall while it lasts (about 7 days), then the ensemble median added on top.
   Range: every GEFS and ECMWF ensemble run, scaled so their middle matches NWS over the NWS days.
   Snow from rain: each run's liquid × a snow ratio from its temperature, counted as snow when its snow level
   (freezing level − 1,100 ft) is below the basis elevation (half within ±250 ft). */
const SnowCore = (() => {
  const M2FT = 3.28084,
    H = 3600000,
    LEVEL_OFFSET = 1100,
    MIX = 250;
  const DET = [
    { id: "ecmwf_ifs025", label: "ECMWF", color: "#e69f00", dash: "9 4" },
    { id: "gfs_seamless", label: "GFS", color: "#f0e442", dash: "" },
    { id: "icon_seamless", label: "ICON", color: "#cc79a7", dash: "2 3" },
    { id: "gem_seamless", label: "GEM", color: "#ff8a5c", dash: "12 3 2 3" },
    { id: "ncep_hrrr_conus", label: "HRRR", color: "#3cc79a", dash: "1 3" },
    { id: "ncep_nbm_conus", label: "NBM", color: "#c5d3dc", dash: "6 2 1 2 1 2" },
  ];
  const FAM = { ncep_gefs025: "GEFS", ecmwf_ifs025_ensemble: "ECMWF ENS" };
  /* Ski areas on the dashboard: summit point and elevations (ft). Key = slug of the dashboard name. */
  const MOUNTAINS = {
    "park-city-mountain": { lat: 40.6214, lon: -111.5588, base: 6800, summit: 10026 },
    "deer-valley": { lat: 40.60884, lon: -111.48047, base: 6530, summit: 9570 },
    "canyons-resort": { lat: 40.65793, lon: -111.59575, base: 6800, summit: 9990 },
    alta: { lat: 40.56784, lon: -111.63826, base: 8530, summit: 10550 },
    snowbird: { lat: 40.56106, lon: -111.64522, base: 7760, summit: 11000 },
    solitude: { lat: 40.60156, lon: -111.61403, base: 7988, summit: 10488 },
    brighton: { lat: 40.59023, lon: -111.59742, base: 8755, summit: 10500 },
    snowbasin: { lat: 41.19994, lon: -111.88244, base: 6391, summit: 9350 },
    "stratton-mountain": { lat: 43.0959, lon: -72.9214, base: 1872, summit: 3875 },
    killington: { lat: 43.6045, lon: -72.8201, base: 1165, summit: 4241 },
    stowe: { lat: 44.5437, lon: -72.8143, base: 1559, summit: 3625 },
    gunstock: { lat: 43.5256, lon: -71.3784, base: 900, summit: 2267 },
  };
  const TZ = { utah: "America/Denver", ne: "America/New_York" };

  /* ---------- small helpers ---------- */
  const fin = Number.isFinite;
  function quant(sorted, p) {
    if (!sorted.length) return null;
    const i = (sorted.length - 1) * p,
      a = Math.floor(i),
      b = Math.ceil(i);
    return sorted[a] + (sorted[b] - sorted[a]) * (i - a);
  }
  const med = (arr) => quant(arr.filter(fin).sort((a, b) => a - b), 0.5);
  const SLR = [
    [10, 17],
    [15, 16],
    [20, 14],
    [24, 12],
    [28, 10],
    [32, 8],
    [34, 7],
  ];
  /* Snow-to-liquid ratio from the temperature (°F): 8:1 at 32°F, 16–17:1 in the teens and colder. */
  function snowRatio(tF) {
    if (!fin(tF)) return 12;
    if (tF <= SLR[0][0]) return SLR[0][1];
    for (let i = 1; i < SLR.length; i++) {
      const [t1, r1] = SLR[i - 1],
        [t2, r2] = SLR[i];
      if (tF <= t2) return r1 + ((tF - t1) / (t2 - t1)) * (r2 - r1);
    }
    return 7;
  }
  /* Share falling as snow at elevFt: from the snow level when known, otherwise from the temperature there. */
  function snowShare(levelFt, elevFt, tF) {
    if (fin(levelFt) && fin(elevFt)) return levelFt <= elevFt - MIX ? 1 : levelFt >= elevFt + MIX ? 0 : (elevFt + MIX - levelFt) / (2 * MIX);
    return !fin(tF) ? 0 : tF <= 34 ? 1 : tF >= 38 ? 0 : (38 - tF) / 4;
  }
  const hourSnow = (liq, tF, levelFt, elevFt) => (liq > 0 ? liq * snowRatio(tF) * snowShare(levelFt, elevFt, tF) : 0);
  function freezingFt(t700F, z700ft) {
    if (!fin(t700F) || !fin(z700ft)) return null;
    return z700ft + ((t700F - 32) / 1.8 / 0.0065) * M2FT;
  }
  /* Open-Meteo sends heights in feet when Fahrenheit is requested; models without data report "undefined". */
  function heightToFt(resp, word) {
    const u = Object.entries(resp?.hourly_units || {}).find(([k, v]) => k.includes(word) && (v === "ft" || v === "m"))?.[1];
    return u === "ft" ? 1 : M2FT;
  }
  /* "precipitation_member07_ncep_gefs025" → key "ncep_gefs025#07". */
  function seriesOf(hourly, v) {
    const re = new RegExp(`^${v}(?:_member(\\d+))?(?:_(.+))?$`);
    const out = new Map();
    for (const [k, vals] of Object.entries(hourly || {})) {
      const m = k.match(re);
      if (!m || /^probability/.test(m[2] || "")) continue;
      out.set(`${m[2] || ""}#${m[1] || "00"}`, { model: m[2] || "", member: m[1] || "00", values: vals });
    }
    return out;
  }
  function localHourKey(ms, tz) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date(ms))
        .map((x) => [x.type, x.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
  }
  /* NWS validTime "2026-11-13T18:00:00+00:00/PT6H" → [from, to] in ms. */
  function span(validTime) {
    const [stamp, dur] = validTime.split("/");
    const m = dur.match(/P(?:(\d+)D)?T?(?:(\d+)H)?/);
    const a = Date.parse(stamp);
    return [a, a + ((+(m?.[1] || 0)) * 24 + +(m?.[2] || 0)) * H];
  }

  /* ---------- places ---------- */
  /* place: { name, section, slug?, lat, lon, base?, summit?, town? } — basis elevation = summit for ski areas. */
  function placeFor(p, section) {
    const id = p.slug || slugOf(p.name),
      m = MOUNTAINS[id] || (p.ski ? { lat: p.p[0][0], lon: p.p[0][1], base: p.ski.base, summit: p.ski.summit } : null);
    if (m) return { name: p.name, slug: id, section, lat: m.lat, lon: m.lon, base: m.base, summit: m.summit, elev: m.summit, ski: true };
    const q = p.p ? p.p[0] : [p.lat, p.lon];
    return { name: p.name, slug: id, section, lat: q[0], lon: q[1], town: true, zone: p.zone || null };
  }
  const slugOf = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  /* ---------- fetching ---------- */
  async function fetchJSON(url, ua) {
    const r = await fetch(url, ua ? { headers: { "User-Agent": ua, Accept: "application/geo+json" } } : { headers: { Accept: "application/json" } });
    if (!r.ok) throw Error(String(r.status));
    return r.json();
  }
  function omURL(base, params) {
    const u = new URL(base);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  }
  /* Everything one place needs. nwsUA: User-Agent for api.weather.gov in Node (browsers send their own). */
  /* NWS grid squares are 2.5 km, which flattens summits. With search > 0, also check the squares around the
     point and use the highest one, so a summit forecast comes from the highest terrain NWS models there. */
  async function nwsGrid(pl, ua, search) {
    const pt = await fetchJSON(`https://api.weather.gov/points/${pl.lat.toFixed(4)},${pl.lon.toFixed(4)}`, ua);
    const { gridId, gridX, gridY, forecastGridData } = pt.properties;
    const cells = [[0, 0]];
    if (search) for (let dx = -search; dx <= search; dx++) for (let dy = -search; dy <= search; dy++) if (dx || dy) cells.push([dx, dy]);
    let best = null;
    for (const [dx, dy] of cells) {
      try {
        const url = dx || dy ? `https://api.weather.gov/gridpoints/${gridId}/${gridX + dx},${gridY + dy}` : forecastGridData;
        const g = (await fetchJSON(url, ua)).properties;
        const elevM = g.elevation?.value ?? null;
        if (!best || (fin(elevM) && elevM > best.elevM)) best = { snow: g.snowfallAmount?.values || [], elevM, cell: `${gridId}/${gridX + dx},${gridY + dy}` };
      } catch {}
    }
    if (!best) throw Error("NWS grid unavailable");
    return best;
  }
  async function fetchInputs(pl, { nwsUA, days = 15, nwsSearch = 0 } = {}) {
    const tz = TZ[pl.section] || pl.zone || "auto";
    const common = {
      latitude: pl.lat,
      longitude: pl.lon,
      ...(pl.elev ? { elevation: Math.round(pl.elev / M2FT) } : {}),
      timezone: tz,
      forecast_days: days,
      precipitation_unit: "inch",
      temperature_unit: "fahrenheit",
    };
    const ENS = "https://ensemble-api.open-meteo.com/v1/ensemble";
    const nws = nwsGrid(pl, nwsUA, pl.ski ? nwsSearch : 0).catch(() => null);
    const [ens, g05, det, nwsData] = await Promise.all([
      fetchJSON(omURL(ENS, { ...common, hourly: "precipitation,temperature_2m,cloud_cover,temperature_700hPa,geopotential_height_700hPa", models: "gfs025,ecmwf_ifs025" })),
      fetchJSON(omURL(ENS, { ...common, hourly: "temperature_700hPa,geopotential_height_700hPa", models: "gfs05" })).catch(() => null),
      fetchJSON(
        omURL("https://api.open-meteo.com/v1/forecast", {
          ...common,
          hourly: "precipitation,temperature_2m,freezing_level_height,temperature_700hPa,geopotential_height_700hPa",
          models: DET.map((m) => m.id).join(","),
        }),
      ).catch(() => null),
      nws,
    ]);
    return { ens, g05, det, nws: nwsData };
  }

  /* ---------- the outlook ---------- */
  function build(pl, { ens, g05, det, nws }, nowMs = Date.now()) {
    const times = ens?.hourly?.time;
    if (!times?.length) throw Error("No ensemble data");
    const tz = TZ[pl.section] || ens.timezone || "UTC";
    const offsetMs = (ens.utc_offset_seconds ?? 0) * 1000;
    let i0 = times.findIndex((t) => t >= localHourKey(nowMs, tz));
    if (i0 < 0) i0 = 0;
    const n = times.length - i0;
    const T = times.slice(i0);
    const msAt = (k) => Date.parse(T[k] + ":00Z") - offsetMs; // valid time (end of the hour's precipitation)
    const elev = pl.elev ?? (fin(ens.elevation) ? Math.round((ens.elevation * M2FT) / 10) * 10 : 0);
    const tail = (a) => (a ? a.slice(i0) : []);
    const levelFrom = (t7, z7, fl, zMul, fMul) =>
      Array.from({ length: n }, (_, k) => {
        const f = fin(fl?.[k]) ? fl[k] * fMul : fin(z7?.[k]) ? freezingFt(t7?.[k], z7[k] * zMul) : null;
        return f == null ? null : f - LEVEL_OFFSET;
      });
    const cumulative = (liq, temp, level) => {
      const cum = new Array(n).fill(null);
      let tot = 0;
      cum[0] = 0;
      for (let k = 1; k < n; k++) {
        if (!fin(liq[k])) break;
        tot += hourSnow(liq[k], temp[k], level?.[k], elev);
        cum[k] = tot;
      }
      return cum;
    };

    // Snow levels: ECMWF ENS from its own 700 mb fields; GEFS 0.25° runs from the matching 0.5° GEFS run.
    const zE = heightToFt(ens, "geopotential"),
      T7 = seriesOf(ens.hourly, "temperature_700hPa"),
      Z7 = seriesOf(ens.hourly, "geopotential_height_700hPa");
    const gefsLevel = new Map();
    if (g05?.hourly?.time) {
      const off = g05.hourly.time.indexOf(times[i0]);
      if (off >= 0) {
        const t7 = seriesOf(g05.hourly, "temperature_700hPa"),
          z7 = seriesOf(g05.hourly, "geopotential_height_700hPa"),
          zG = heightToFt(g05, "geopotential");
        for (const [, s] of t7) {
          if (!s.values.some(fin)) continue;
          const zz = z7.get(`${s.model}#${s.member}`)?.values;
          gefsLevel.set(s.member, levelFrom(s.values.slice(off), zz?.slice(off), null, zG));
        }
      }
    }
    const P = seriesOf(ens.hourly, "precipitation"),
      T2 = seriesOf(ens.hourly, "temperature_2m"),
      CC = seriesOf(ens.hourly, "cloud_cover");
    const members = [],
      levels = [];
    for (const [id, p] of P) {
      const liq = tail(p.values);
      if (!liq.some(fin)) continue;
      const own = T7.get(id)?.values;
      const level = own?.some(fin) ? levelFrom(tail(own), tail(Z7.get(id)?.values), null, zE) : p.model === "ncep_gefs025" ? gefsLevel.get(p.member) || null : null;
      const temp = tail(T2.get(id)?.values);
      const cum = cumulative(liq, temp, level);
      members.push({ fam: FAM[p.model] || p.model, liq, temp, cloud: tail(CC.get(id)?.values), level, cum, last: cum.findLastIndex((v) => v != null) });
      if (level) levels.push({ fam: FAM[p.model] || p.model, level });
    }
    const dets = [];
    if (det?.hourly?.time) {
      const off = det.hourly.time.indexOf(times[i0]);
      const zD = heightToFt(det, "geopotential"),
        fD = heightToFt(det, "freezing_level");
      if (off >= 0)
        for (const m of DET) {
          const g = (v) => det.hourly[`${v}_${m.id}`]?.slice(off) || [];
          const liq = g("precipitation");
          if (!liq.some(fin)) continue;
          const lv = levelFrom(g("temperature_700hPa"), g("geopotential_height_700hPa"), g("freezing_level_height"), zD, fD);
          const level = lv.some((v) => v != null) ? lv : null;
          dets.push({ label: m.label, color: m.color, dash: m.dash, cum: cumulative(liq, g("temperature_2m"), level) });
          if (level) levels.push({ fam: m.label, level, det: true });
        }
    }

    // NWS hourly cumulative while its grid lasts.
    let e = 0,
      nwsCum = null,
      nwsElev = null;
    if (nws?.snow?.length) {
      const per = new Array(n).fill(0);
      let end = 0;
      for (const q of nws.snow) {
        const [a, b] = span(q.validTime);
        end = Math.max(end, b);
        if (!fin(q.value) || b <= a) continue;
        const inch = q.value / 25.4 / ((b - a) / H);
        for (let k = 1; k < n; k++) {
          const t = msAt(k);
          if (t > a && t <= b) per[k] += inch;
        }
      }
      for (let k = 1; k < n && msAt(k) <= end; k++) e = k;
      if (e > 0) {
        nwsCum = new Array(n).fill(null);
        nwsCum[0] = 0;
        for (let k = 1; k <= e; k++) nwsCum[k] = nwsCum[k - 1] + per[k];
        nwsElev = fin(nws.elevM) ? Math.round(nws.elevM * M2FT) : null;
      }
    }

    // Blend. A run that ends within a day of the end keeps its last total so window totals stay comparable.
    const val = (m, k) => (m.cum[k] != null ? m.cum[k] : m.last >= Math.min(k, n - 1) - 24 ? m.cum[m.last] : null);
    let scale = 1;
    if (e > 0) {
      const em = med(members.map((m) => val(m, e)));
      const nv = nwsCum[e];
      scale = em != null && em >= 0.3 ? Math.min(3, Math.max(1 / 3, nv / em)) : nv < 0.3 ? 1 : 1;
    }
    const adj = (m, k) => {
      const v = val(m, k);
      if (v == null) return null;
      if (k <= e) return v * scale;
      const ve = val(m, e);
      return ve == null ? null : ve * scale + (v - ve);
    };
    const mid = new Array(n).fill(null);
    for (let k = 0; k < n; k++) {
      if (k <= e && nwsCum) mid[k] = nwsCum[k];
      else {
        const inc = med(members.map((m) => (val(m, k) != null && val(m, e) != null ? val(m, k) - val(m, e) : null)));
        mid[k] = inc == null ? (k > 0 ? mid[k - 1] : 0) : (nwsCum ? nwsCum[e] : 0) + inc;
      }
    }
    const adjCum = members.map((m) => Array.from({ length: n }, (_, k) => adj(m, k)));
    /* Snow between hour indexes a and b: middle, and the 10th–90th percentile of the scaled runs. */
    const between = (a, b) => {
      const v = adjCum
        .map((c) => (c[a] != null && c[b] != null ? c[b] - c[a] : null))
        .filter(fin)
        .sort((x, y) => x - y);
      const m = Math.max(0, mid[b] - mid[a]);
      return { mid: m, lo: Math.min(m, Math.max(0, quant(v, 0.1) ?? m)), hi: Math.max(m, quant(v, 0.9) ?? m), runs: v.length };
    };
    const tempMed = Array.from({ length: n }, (_, k) => med(members.map((m) => m.temp[k])));

    // Half days (6am–6pm, 6pm–6am local) and 6-hour blocks, keyed by local time.
    const hourOf = (k) => +T[k].slice(11, 13);
    const segs = [];
    {
      let cur = null;
      for (let k = 1; k < n; k++) {
        const prev = T[k - 1],
          h = +prev.slice(11, 13);
        const day = h >= 6 && h < 18;
        const date = !day && h < 6 ? shiftDate(prev.slice(0, 10), -1) : prev.slice(0, 10);
        const id = date + (day ? "d" : "n");
        if (!cur || cur.id !== id) segs.push((cur = { id, date, half: day ? "day" : "night", a: k - 1, b: k, full: false }));
        else cur.b = k;
      }
      for (const s of segs) s.full = s.b - s.a >= 11;
    }
    const segOut = segs.map((s) => {
      const w = between(s.a, s.b),
        temps = tempMed.slice(s.a + 1, s.b + 1).filter(fin);
      return { date: s.date, half: s.half, a: s.a, b: s.b, mid: r1(w.mid), lo: r1(w.lo), hi: r1(w.hi), src: s.b <= e ? "nws" : "model", temp: temps.length ? Math.round(s.half === "day" ? Math.max(...temps) : Math.min(...temps)) : null };
    });
    const blocks = [];
    {
      let cur = null;
      for (let k = 1; k < n; k++) {
        const hh = hourOf(k),
          start = Math.floor(((hh + 23) % 24) / 6) * 6,
          date = hh === 0 ? T[k - 1].slice(0, 10) : T[k].slice(0, 10),
          id = date + start;
        if (!cur || cur.id !== id) blocks.push((cur = { id, date, start, a: k - 1, b: k }));
        else cur.b = k;
      }
    }
    const blockOut = blocks.map((bl) => {
      const lv = [];
      for (const s of levels) for (let k = bl.a; k <= bl.b; k++) if (fin(s.level[k])) lv.push(s.level[k]);
      lv.sort((a, b) => a - b);
      const sums = members
        .map((m) => {
          let t = 0,
            any = false;
          for (let k = bl.a + 1; k <= bl.b; k++)
            if (fin(m.liq[k])) {
              t += m.liq[k];
              any = true;
            }
          return any ? t : null;
        })
        .filter((v) => v != null)
        .sort((a, b) => a - b);
      const clouds = members.flatMap((m) => m.cloud.slice(bl.a + 1, bl.b + 1)).filter(fin);
      const ml = quant(lv, 0.5);
      return {
        date: bl.date,
        start: bl.start,
        a: bl.a,
        b: bl.b,
        min: lv.length ? Math.round(lv[0]) : null,
        med: ml == null ? null : Math.round(ml),
        max: lv.length ? Math.round(lv[lv.length - 1]) : null,
        chance: sums.length ? Math.round((sums.filter((v) => v >= 0.02).length / sums.length) * 100) / 100 : null,
        liq: sums.length ? Math.round(quant(sums, 0.5) * 100) / 100 : null,
        cloud: clouds.length ? Math.round(clouds.reduce((a, b) => a + b, 0) / clouds.length) : null,
        type: ml == null ? null : ml <= elev - MIX ? "snow" : ml >= elev + MIX ? "rain" : "mix",
      };
    });
    const totals = {};
    for (const d of [5, 10, 15]) {
      const k = Math.min(n - 1, d * 24);
      const w = between(0, k);
      totals[d] = { mid: r1(w.mid), lo: r1(w.lo), hi: r1(w.hi), runs: w.runs };
    }
    return {
      v: 1,
      name: pl.name,
      slug: pl.slug,
      section: pl.section,
      ski: !!pl.ski,
      base: pl.base ?? null,
      summit: pl.summit ?? null,
      elev,
      tz,
      built: new Date(nowMs).toISOString(),
      times: T,
      h: T.map((_, k) => k),
      mid: mid.map(r2),
      members: adjCum.map((c, i) => ({ fam: members[i].fam, cum: c.map(r2) })),
      dets: dets.map((d) => ({ ...d, cum: d.cum.map(r2) })),
      levels: levels.map((s) => ({ fam: s.fam, det: !!s.det, level: s.level.map((v) => (v == null ? null : Math.round(v))) })),
      temp: tempMed.map((v) => (v == null ? null : Math.round(v))),
      nws: e > 0 ? { endIndex: e, elev: nwsElev, scale: r2(scale), cell: nws.cell || null } : null,
      segments: segOut,
      blocks: blockOut,
      totals,
    };
  }
  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  function shiftDate(d, days) {
    const t = new Date(d + "T12:00:00Z");
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  }

  /* Keep every 3rd hour (local hours divisible by 3, plus now) for the saved files; charts plot by hour offset. */
  function thin(o, every = 3) {
    const keep = o.times.map((t, k) => k === 0 || k === o.times.length - 1 || +t.slice(11, 13) % every === 0);
    const pick = (a) => a.filter((_, k) => keep[k]);
    return {
      ...o,
      times: pick(o.times),
      h: pick(o.h),
      mid: pick(o.mid),
      members: o.members.map((m) => ({ ...m, cum: pick(m.cum) })),
      dets: o.dets.map((d) => ({ ...d, cum: pick(d.cum) })),
      levels: o.levels.map((s) => ({ ...s, level: pick(s.level) })),
      temp: pick(o.temp),
    };
  }
  /* Snow between two times (ms) from an outlook: middle and range (10th–90th percentile of scaled runs). */
  function windowSnow(o, fromMs, toMs) {
    const t0 = Date.parse(o.built);
    const k = (ms) => {
      const hh = (ms - t0) / H;
      let best = 0;
      for (let i = 0; i < o.h.length; i++) if (o.h[i] <= hh + 0.5) best = i;
      return best;
    };
    const a = k(Math.max(fromMs, t0)),
      b = k(toMs);
    if (b <= a) return { mid: 0, lo: 0, hi: 0 };
    const v = o.members
      .map((m) => (m.cum[a] != null && m.cum[b] != null ? m.cum[b] - m.cum[a] : null))
      .filter(fin)
      .sort((x, y) => x - y);
    const m = Math.max(0, (o.mid[b] ?? 0) - (o.mid[a] ?? 0));
    return { mid: m, lo: Math.min(m, Math.max(0, quant(v, 0.1) ?? m)), hi: Math.max(m, quant(v, 0.9) ?? m) };
  }
  async function outlook(pl, opts = {}) {
    return build(pl, await fetchInputs(pl, opts), opts.now);
  }
  return { MOUNTAINS, DET, TZ, placeFor, fetchInputs, build, outlook, thin, windowSnow, snowRatio, snowShare, hourSnow, freezingFt, heightToFt, seriesOf, quant, localHourKey, slugOf };
})();
if (typeof module === "object" && module.exports) module.exports = SnowCore;
