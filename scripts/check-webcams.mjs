/* Checks every camera in assets/webcams.js, plus candidate streams found on webcam directories, and prints
   one line per camera: OK / DEAD / NOT LIVE / NO EMBED, with the reason. Run by the "Check webcams" workflow. */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../assets/webcams.js", import.meta.url), "utf8");
const RESORTS = new Function(src.slice(0, src.indexOf("const content")) + ";return RESORTS;")();

// Streams listed by resort pages or directories (SnowStash, OnTheSnow) that the dashboard doesn't use yet.
const CANDIDATES = [
  ["brighton", "Molly Green's (SnowStash)", "yt:HD1S-bdI1AA"],
  ["brighton", "Explorer Lift (SnowStash)", "yt:x85ZtkULEcw"],
  ["brighton", "Milly Express (SnowStash)", "yt:7FqDxizb_hs"],
  ["brighton", "Majestic Lift (SnowStash)", "yt:XLzKPufaAts"],
  ["stratton", "Mid Mountain (SnowStash)", "yt:AhcH03HwuH0"],
  ["stratton", "Main Base (SnowStash)", "yt:H-_sGi4Sbtk"],
  ["sugarloaf", "Top of Skyline (SnowStash)", "yt:rhLXBwVfszw"],
  ["sugarloaf", "Narrow Gauge (SnowStash)", "yt:KijmSwVBDpc"],
  ["sugarloaf", "Beach (SnowStash)", "yt:K77ahIkmPGw"],
  ["sugarloaf", "Bullwinkle's (SnowStash)", "yt:IdibWuNtW1c"],
  ["loon", "Octagon Base (SnowStash)", "yt:5NUYOuzzZwc"],
  ["loon", "Loon Peak (SnowStash)", "yt:pkR1I-UkAAk"],
  ["loon", "Kanc 8 Summit (SnowStash)", "yt:1ulgeNTlFJc"],
  ["loon", "Camp III (SnowStash)", "yt:Hlu86D572fM"],
  ["sunday-river", "Peak Lodge (SnowStash)", "yt:J98tW5YX4Z8"],
  ["sunday-river", "Jordan 8 (SnowStash)", "yt:AtXgvVaqy88"],
  ["sunday-river", "Barker 6 (SnowStash)", "yt:2KZpFcnZ7ig"],
  ["jay-peak", "Summit Cam (SnowStash)", "img:https://storage.googleapis.com/prism-cam-00058/1080-watermark.jpg"],
  ["snowbasin", "Wildcat (SnowStash)", "img:https://img.hdrelay.com/frames/61864e5d-bba4-4906-b134-0fdf9426d5a0/default/last.jpg"],
  ["snowbasin", "Mt. Ogden (Ski Utah)", "img:https://www.skiutah.com/files/blob/webcam/1590681040"],
  ["snowbasin", "John Paul Lodge (Ski Utah)", "img:https://www.skiutah.com/files/blob/webcam/140020919"],
  ["sundance", "Ray's Lift Summit (SnowStash)", "img:https://b9.hdrelay.com/camera/636ec93547fa8645ab27e878/snapshot"],
  ["sundance", "Ray's Lift Base (Ski Utah)", "img:https://www.skiutah.com/files/blob/webcam/1175860327"],
  ["sundance", "Mandan Summit (Ski Utah)", "img:https://www.skiutah.com/files/blob/webcam/1286533593"],
  ["deer-valley", "Snow Park Lodge (SnowStash)", "yt:E7Hh7Q6qIKk"],
  ["deer-valley", "Silver Lake Lodge (SnowStash)", "yt:5isUB8vvMWg"],
];

const UA = "Mozilla/5.0 (WeatherWindow webcam check)";
async function get(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...(opts.headers || {}) }, redirect: "follow", signal: ctl.signal });
    const body = opts.body === false ? "" : await r.text().catch(() => "");
    return { status: r.status, type: r.headers.get("content-type") || "", modified: r.headers.get("last-modified") || "", body };
  } catch (e) {
    return { status: 0, type: "", modified: "", body: "", error: e.cause?.code || e.name };
  } finally {
    clearTimeout(t);
  }
}
const ytId = (u) => (String(u).match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/) || [])[1];
async function youtube(id) {
  const o = await get(`https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}&format=json`);
  const live = await get(`https://i.ytimg.com/vi/${id}/hqdefault_live.jpg`, { body: false });
  if (o.status === 401 || o.status === 403) return ["NO EMBED", `owner blocks playing on other sites${live.status === 200 ? " (stream is live)" : ""}`];
  if (o.status !== 200) return ["DEAD", `video not found (${o.status || o.error})`];
  let title = "";
  try {
    title = JSON.parse(o.body).title;
  } catch {}
  return live.status === 200 ? ["OK", `live · “${title}”`] : ["NOT LIVE", `exists but not streaming now · “${title}”`];
}
async function check(kind, url) {
  if (kind === "yt") return youtube(url);
  if (kind === "hls") {
    const r = await get(url);
    return r.status === 200 && r.body.startsWith("#EXTM3U") ? ["OK", "stream playlist answers"] : ["DEAD", `playlist ${r.status || r.error}`];
  }
  if (kind === "img") {
    const r = await get(url, { body: false });
    if (r.status !== 200 || !/image/.test(r.type)) return ["DEAD", `image ${r.status || r.error} ${r.type}`];
    const age = r.modified ? Math.round((Date.now() - Date.parse(r.modified)) / 3600000) : null;
    return age != null && age > 24 ? ["STALE", `image last updated ${age} h ago`] : ["OK", `image${age != null ? ` updated ${age} h ago` : ""}`];
  }
  // Player pages (CamStreamer, Brownrice, WetMet, Angelcam, HDRelay): page answers; CamStreamer names its YouTube stream.
  const r = await get(url);
  if (r.status !== 200) return ["DEAD", `player page ${r.status || r.error}`];
  const inner = ytId(r.body) || (r.body.match(/["'\/]([\w-]{11})["']?\s*[,}]?\s*(?:\/\/)?\s*youtube/i) || [])[1];
  if (/camstreamer/.test(url) && inner) {
    const [st, why] = await youtube(inner);
    return [st, `CamStreamer → YouTube ${inner}: ${why}`];
  }
  if (/offline|not available|unavailable/i.test(r.body.slice(0, 20000)) && /camstreamer/.test(url)) return ["CHECK", "player page mentions offline"];
  return ["OK", "player page answers"];
}
const lines = [];
const counts = {};
async function run(resort, name, kind, url) {
  const [st, why] = await check(kind, url);
  counts[st] = (counts[st] || 0) + 1;
  lines.push(`${st.padEnd(8)} ${resort.padEnd(16)} ${name.padEnd(34)} ${why}`);
}
for (const r of RESORTS)
  for (const c of r.cams) {
    if (c.external) {
      lines.push(`${"SKIP".padEnd(8)} ${r.id.padEnd(16)} ${c.name.padEnd(34)} marked external on the dashboard`);
      continue;
    }
    // Cameras marked offline are checked too, to see whether they have come back.
    const label = c.offline ? `${c.name} [marked offline]` : c.name;
    const id = ytId(c.embed);
    if (id) await run(r.id, label, "yt", id);
    else if (c.hls) await run(r.id, label, "hls", c.hls);
    else if (c.snapshot) await run(r.id, label, "img", c.snapshot);
    else await run(r.id, label, "page", c.embed.replace("{W}", "1280").replace("{H}", "720"));
  }
lines.push("", "Candidates not on the dashboard yet:");
for (const [resort, name, spec] of CANDIDATES) {
  const [kind, url] = [spec.slice(0, spec.indexOf(":")), spec.slice(spec.indexOf(":") + 1)];
  await run(resort, name, kind, url);
}
console.log(lines.join("\n"));
console.log("\n" + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · "));
