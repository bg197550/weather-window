/* The forecast story at the top of Insights: a short written forecast in the order a forecaster would tell it
   (summary, then each storm's timing, rounds, snow levels, water and snow, then the extended outlook), written
   from the shared snow outlook (assets/snowcore.js) so its numbers match the Snow section.
   Classic script for the browser; also loads in Node for tests (module.exports). */
const ForecastStory = (() => {
  const H = 3600000;
  const fin = Number.isFinite;
  const ft = (v) => `${(Math.round(v / 500) * 500).toLocaleString()} ft`;
  const inch = (v) => (v < 1 ? "under an inch" : `${Math.round(v)}″`);
  const range = (lo, hi) => (hi < 1 ? "under an inch" : `${Math.max(0, Math.round(lo))}–${Math.round(hi)}″`);
  const water = (v) => `${v < 0.1 ? "a trace" : (Math.round(v * 20) / 20).toFixed(2).replace(/0$/, "")}″`;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  /* Mountains that usually behave alike, for the "across the range" line. */
  const GROUPS = {
    utah: [
      ["the Cottonwoods", ["alta", "snowbird", "solitude", "brighton"]],
      ["the Park City side", ["park-city-mountain", "deer-valley", "canyons-resort"]],
      ["Snowbasin", ["snowbasin"]],
    ],
    ne: [
      ["southern Vermont", ["stratton-mountain", "killington"]],
      ["Stowe", ["stowe"]],
      ["Gunstock", ["gunstock"]],
    ],
  };
  const HOLIDAYS = (y) => {
    const nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
    const thanks = 1 + ((4 - nov1 + 7) % 7) + 21;
    return { [`${y}-11-${thanks}`]: "Thanksgiving", [`${y}-12-24`]: "Christmas Eve", [`${y}-12-25`]: "Christmas", [`${y}-12-31`]: "New Year's Eve", [`${y + 1}-01-01`]: "New Year's Day" };
  };

  function clock(o, now) {
    const zone = o.tz || "America/Denver";
    const t0 = Math.floor(Date.parse(o.built) / H) * H; // hour offsets in the outlook count from here
    const at = (h) => t0 + h * H;
    const local = (ms) => {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "long" })
          .formatToParts(new Date(ms))
          .map((x) => [x.type, x.value]),
      );
      return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, weekday: p.weekday };
    };
    const today = local(now).date;
    const dayDiff = (d) => Math.round((Date.parse(d) - Date.parse(today)) / 86400000);
    /* "this morning", "midday today", "tonight", "Thursday afternoon", "early Friday" */
    const when = (ms) => {
      const { date, hour, weekday } = local(ms);
      const dd = dayDiff(date);
      const part = hour < 5 ? "early" : hour < 11 ? "morning" : hour < 14 ? "midday" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
      if (dd === 0) return part === "night" ? "tonight" : part === "early" ? "early this morning" : part === "midday" ? "around midday" : `this ${part}`;
      if (dd === 1 && part === "early") return "late tonight";
      const day = dd === 1 ? `tomorrow (${weekday})` : weekday;
      return part === "early" ? `early ${day}` : part === "midday" ? `${day} around midday` : `${day} ${part}`;
    };
    const dayName = (ms) => {
      const { date, weekday } = local(ms);
      const dd = dayDiff(date);
      return dd === 0 ? `today (${weekday})` : dd === 1 ? `tomorrow (${weekday})` : weekday;
    };
    const dateName = (ms) => {
      const { date, weekday } = local(ms);
      const hol = HOLIDAYS(+date.slice(0, 4))[date];
      const md = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      return `${weekday.slice(0, 3)}, ${md}${hol ? ` (${hol})` : ""}`;
    };
    /* The time of day alone when it falls on the same day as ref ("around midday"), else the full phrase. */
    const whenAfter = (ms, ref) => {
      if (local(ms).date !== local(ref).date) return when(ms);
      const h = local(ms).hour;
      return h < 5 ? "early on" : h < 11 ? "in the morning" : h < 14 ? "around midday" : h < 17 ? "in the afternoon" : h < 21 ? "in the evening" : "overnight";
    };
    return { at, when, whenAfter, dayName, dateName, local };
  }

  /* Storms from the outlook's 6-hour blocks: wet blocks in a row, allowing one dry block (a lull) inside a storm. */
  function findStorms(o, horizonH) {
    const wet = (b) => (b.chance ?? 0) >= 0.5 && (b.liq ?? 0) >= 0.04;
    const blocks = o.blocks.filter((b) => b.a < horizonH);
    const storms = [];
    let cur = null,
      dry = 0;
    for (const b of blocks) {
      if (wet(b)) {
        if (cur && dry <= 1) {
          if (dry === 1) cur.rounds.push([b]);
          else cur.rounds[cur.rounds.length - 1].push(b);
        } else storms.push((cur = { rounds: [[b]] }));
        dry = 0;
      } else if (cur) dry++;
    }
    return storms
      .map((s) => {
        const all = s.rounds.flat();
        return { ...s, blocks: all, a: all[0].a, b: all[all.length - 1].b, liq: all.reduce((t, b) => t + (b.liq || 0), 0), peak: all.reduce((m, b) => ((b.liq || 0) > (m.liq || 0) ? b : m), all[0]) };
      })
      .filter((s) => s.liq >= 0.15);
  }
  function snowBetween(o, a, b) {
    const idx = (h) => {
      let i = 0;
      for (let j = 0; j < o.h.length; j++) if (o.h[j] <= h + 0.5) i = j;
      return i;
    };
    const i = idx(a),
      j = idx(b);
    const v = o.members
      .map((m) => (fin(m.cum[i]) && fin(m.cum[j]) ? m.cum[j] - m.cum[i] : null))
      .filter(fin)
      .sort((x, y) => x - y);
    const q = (p) => (v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))] : null);
    const mid = Math.max(0, (o.mid[j] ?? 0) - (o.mid[i] ?? 0));
    return { mid, lo: Math.min(mid, q(0.1) ?? mid), hi: Math.max(mid, q(0.9) ?? mid) };
  }
  const tempAt = (o, h) => {
    let best = null;
    for (let i = 0; i < o.h.length; i++) if (o.h[i] <= h + 0.5 && fin(o.temp[i])) best = o.temp[i];
    return best;
  };
  const ratioOf = (t) => (t == null ? null : t <= 10 ? 17 : t <= 15 ? 16 : t <= 20 ? 14 : t <= 24 ? 12 : t <= 28 ? 10 : t <= 32 ? 8 : 7);

  /* Snow over a time window at every mountain in a group (from the region summary's half days). */
  function groupLine(sum, section, fromMs, toMs) {
    const groups = GROUPS[section];
    if (!sum?.places || !groups) return "";
    const parts = [];
    for (const [label, ids] of groups) {
      const tot = ids
        .map((id) => sum.places[id])
        .filter((p) => p && Date.now() - Date.parse(p.built) < 6 * H)
        .map((p) => {
          const segs = p.segments.filter((s) => {
            const t0 = Math.floor(Date.parse(p.built) / H) * H;
            const a = t0 + s.a * H,
              b = t0 + s.b * H;
            return b > fromMs && a < toMs;
          });
          const mid = segs.reduce((t, s) => t + (s.mid || 0), 0),
            lo = segs.reduce((t, s) => t + (s.lo || 0), 0),
            hi = segs.reduce((t, s) => t + (s.hi || 0), 0);
          return { lo: mid - (mid - lo) * 0.6, hi: mid + (hi - mid) * 0.6 };
        });
      if (!tot.length) continue;
      const lo = Math.min(...tot.map((t) => t.lo)),
        hi = Math.max(...tot.map((t) => t.hi));
      parts.push(`${label} ${range(lo, hi)}`);
    }
    return parts.length >= 2 ? `Across the range: ${parts.join(", ")}.` : "";
  }

  /* The story. kinds: Insights' storm descriptions [{start, end, kind, from}] (optional). */
  function build(o, { section = "utah", now = Date.now(), sum = null, kinds = [], afdQuote = "" } = {}) {
    const c = clock(o, now);
    const where = o.ski ? `at the summit (${o.summit.toLocaleString()} ft)` : "here";
    const storms = findStorms(o, 8 * 24).slice(0, 3);
    const elev = o.elev,
      base = o.base ?? elev;
    const S = storms.map((s, i) => {
      const fromMs = c.at(s.a),
        toMs = c.at(s.b);
      const snow = snowBetween(o, s.a, s.b);
      const first = s.blocks[0],
        low = s.blocks.reduce((m, b) => (fin(b.med) && (!fin(m.med) || b.med < m.med) ? b : m), first);
      const t0 = tempAt(o, s.a + 3),
        r0 = ratioOf(t0),
        rLow = ratioOf(tempAt(o, low.a + 3));
      const kind = kinds.find((k) => k.end > fromMs && k.start < toMs);
      return { ...s, i, fromMs, toMs, snow, l0: first.med, lMin: low.med, lMinMs: c.at(low.b), r0, rLow, kind, ongoing: s.a <= 1 };
    });
    const intensity = (s) => ((s.peak.liq || 0) >= 0.3 ? "heavy" : (s.peak.liq || 0) >= 0.12 ? "steady" : "light");
    const what = (s) => (s.snow.mid >= 1 ? (o.ski ? "mountain snow" : "snow") : s.l0 > elev + 250 ? "rain" : "rain and snow");

    // Summary.
    const sum1 = [];
    if (!S.length) sum1.push(`No significant storms in the next week ${where}. ${afdQuote ? "" : ""}`.trim());
    else {
      const s = S[0];
      sum1.push(
        s.ongoing
          ? `A storm is under way with ${intensity(s)} ${what(s)}, lasting until ${c.when(s.toMs)}.`
          : `Our next storm arrives ${c.dayName(s.fromMs)} with ${intensity(s)} ${what(s)} developing ${c.whenAfter(c.at(s.peak.a), s.fromMs)}.`,
      );
      if (fin(s.l0) && fin(s.lMin) && s.l0 - s.lMin >= 1000) sum1.push(`Snow levels start around ${ft(s.l0)} but drop to ${ft(s.lMin)} by ${c.when(s.lMinMs)}.`);
      else if (fin(s.l0)) sum1.push(`Snow levels stay near ${ft(s.l0)}.`);
      if (S[1]) {
        const n = S[1];
        const sameDay = c.dayName(n.fromMs) === c.dayName(n.toMs);
        sum1.push(`The next storm arrives ${c.dayName(n.fromMs)}${sameDay ? "" : ` and continues into ${c.dayName(n.toMs)}`}, with ${n.snow.mid >= 6 ? "additional significant accumulation likely" : n.snow.mid >= 1 ? "more snow" : "light amounts"}.`);
      }
      const last = S[S.length - 1];
      const tot = snowBetween(o, S[0].ongoing ? 0 : S[0].a, last.b);
      if (S.length > 1 && tot.hi >= 1) sum1.push(`Through ${c.dayName(last.toMs)}: ${range(tot.lo, tot.hi)} ${where}.`);
    }

    // Short term: each storm.
    const short = S.map((s) => {
      const p = [];
      if (s.kind?.kind) p.push(`${cap(s.kind.kind)}${s.kind.from ? `, ${s.kind.from}` : ""}.`);
      // Timing and rounds.
      if (s.rounds.length > 1) {
        const r2 = s.rounds[1];
        const lull = c.at(s.rounds[0][s.rounds[0].length - 1].b);
        p.push(`${s.ongoing ? "Snow continues" : `Precipitation arrives ${c.when(s.fromMs)}`}, heaviest ${c.whenAfter(c.at(s.peak.a), s.fromMs)}. Expect a lull ${c.whenAfter(lull, c.at(s.peak.a))} before a second round ${c.whenAfter(c.at(r2[0].a), lull)}${s.rounds.length > 2 ? ", then more bursts" : ""}. It tapers off ${c.when(s.toMs)}.`);
      } else {
        const start = s.ongoing ? "Snow continues" : `Precipitation arrives ${c.when(s.fromMs)}`;
        const peak = c.whenAfter(c.at(s.peak.a), s.fromMs);
        const same = !s.ongoing && (peak === c.when(s.fromMs) || c.at(s.peak.a) <= s.fromMs);
        p.push(`${start}${same ? " and is heaviest early on" : `, heaviest ${peak}`}, tapering off ${c.when(s.toMs)}.`);
      }
      // Snow levels against the mountain.
      if (fin(s.l0)) {
        const fall = fin(s.lMin) && s.l0 - s.lMin >= 1000;
        let lvl = `Snow levels start around ${ft(s.l0)}`;
        if (o.ski && s.l0 > base + 250) lvl += s.l0 > elev - 250 ? ` — rain or mix even near the summit at first` : ` — rain or mix at the base (${base.toLocaleString()} ft) at first`;
        else if (!o.ski && s.l0 > elev + 250) lvl += ` — rain here at first`;
        lvl += fall ? ` and fall to ${ft(s.lMin)} by ${c.when(s.lMinMs)}.` : ".";
        p.push(lvl);
      }
      // Water and snow.
      let ws = `About ${water(s.liq)} of water, which works out to about ${inch(s.snow.mid)} ${o.ski ? "at the summit" : "here"}, likely ${range(s.snow.lo, s.snow.hi)}.`;
      if (s.r0 != null && s.r0 <= 10 && s.snow.mid >= 1) ws += ` The early snow is wet and dense (around ${s.r0}:1), which holds totals down${s.rLow > s.r0 + 3 ? `; colder air later lifts ratios to about ${s.rLow}:1` : ""}.`;
      else if (s.r0 != null && s.r0 >= 14 && s.snow.mid >= 1) ws += ` Cold air means light, fluffy snow (about ${s.r0}:1).`;
      p.push(ws);
      const g = groupLine(sum, section, s.fromMs, s.toMs);
      if (g) p.push(g);
      const title = `${s.i === 0 ? (s.ongoing ? "Current storm" : "Next storm") : `Storm ${s.i + 1}`} · ${c.dayName(s.fromMs)}${c.dayName(s.fromMs) === c.dayName(s.toMs) ? "" : ` → ${c.dayName(s.toMs)}`}`;
      return { title, text: p.join(" ") };
    });

    // Extended: the quiet stretch after these storms, then what the ensemble runs show for days 8–15.
    const ext = [];
    const lastB = S.length ? S[S.length - 1].b : 0;
    const later = findStorms(o, 15 * 24).filter((s) => s.a > lastB + 6);
    const next = later[0];
    if (S.length) ext.push(next ? `Quieter weather follows from ${c.dayName(c.at(lastB))} until about ${c.dateName(c.at(next.a))}.` : `Quieter weather follows from ${c.dayName(c.at(lastB))}.`);
    const days = [];
    for (let d = 7; d < 15; d++) {
      const a = d * 24,
        b = a + 24;
      const idx = (h) => {
        let i = 0;
        for (let j = 0; j < o.h.length; j++) if (o.h[j] <= h + 0.5) i = j;
        return i;
      };
      const i = idx(a),
        j = idx(b);
      const v = o.members.map((m) => (fin(m.cum[i]) && fin(m.cum[j]) ? m.cum[j] - m.cum[i] : null)).filter(fin);
      if (v.length >= 10) days.push({ d, share: v.filter((x) => x >= 2).length / v.length, n: v.length });
    }
    const best = days.sort((x, y) => y.share - x.share)[0];
    if (best && best.share >= 0.25) ext.push(`Looking further out, about ${Math.round(best.share * 10) * 10}% of the ${best.n} ensemble runs show another 2″ or more around ${c.dateName(c.at(best.d * 24 + 12))}; too far out to count on.`);
    else if (days.length) ext.push(`Further out, most ensemble runs stay mostly dry through ${c.dateName(c.at(15 * 24 - 12))}.`);

    return { summary: sum1.join(" "), short, extended: ext.join(" "), afdQuote };
  }
  function html(story, { esc, title = "Forecast story", link = "" } = {}) {
    const e = esc || ((s) => String(s));
    return `<article class="card afd-card ins-story"><div class="ins-head"><h3>${e(title)}</h3>${link}</div><section><h4>Summary</h4><p>${e(story.summary)}</p></section>${
      story.short.length ? `<section><h4>Short term</h4>${story.short.map((s) => `<p><b>${e(s.title)}.</b> ${e(s.text)}</p>`).join("")}</section>` : ""
    }${story.extended ? `<section><h4>Extended</h4><p>${e(story.extended)}</p></section>` : ""}${story.afdQuote ? `<p class="ins-quote"><b>NWS forecasters:</b> “${e(story.afdQuote)}”</p>` : ""}</article>`;
  }
  return { build, html, findStorms };
})();
if (typeof module === "object" && module.exports) module.exports = ForecastStory;
