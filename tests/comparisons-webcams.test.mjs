import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
const webcams=readFileSync(new URL("../assets/webcams.js",import.meta.url),"utf8");
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function guidance(){
 const s={Date,Math,Number,Intl,escapeHTML,windNum:s=>{const a=String(s??"").match(/\d+/g);return a?Math.max(...a.map(Number)):null;},snowLevelLow:()=>null,periodSnow:()=>null};
 vm.createContext(s);
 vm.runInContext(app.slice(app.indexOf("function modelRows("),app.indexOf("async function loadModels("))+
 app.slice(app.indexOf("function makePlot("),app.indexOf("function renderModelChart("))+
 app.slice(app.indexOf("function mountainRows("),app.indexOf("function renderMountain(")),s);
 return s;
}
const model=(name,dates,temps)=>({name,data:{daily:{time:dates,temperature_2m_max:temps,temperature_2m_min:temps,precipitation_sum:temps.map(()=>0),snowfall_sum:temps.map(()=>2.54)},daily_units:{snowfall_sum:"cm"}}});
test("model values align by date rather than array index",()=>{
 const s=guidance(),rows=s.modelRows([model("GFS",["2026-10-26","2026-10-27"],[50,40]),model("GEM",["2026-10-27"],[30])],"utah");
 assert.equal(rows[0].values[1].high,null);assert.equal(rows[1].values[1].high,30);assert.equal(rows[0].values[0].rain,0);assert.equal(rows[1].values[1].snow,1);
});
test("missing values never create false model spread or numeric labels",()=>{
 const s=guidance();assert.equal(s.guidanceValue(null," mph"),"Unavailable");
 assert.equal(s.guidanceRange([null,0]," in"),"0 in");
 assert.equal(s.modelFlags({values:[{name:"GFS",high:50,low:30,rain:0,snow:0},{name:"GEM",high:null,low:null,rain:null,snow:null}]},"utah").length,0);
});
test("plot gaps stay gaps and all-missing metrics show an empty state",()=>{
 const s=guidance();
 const html=s.makePlot([{name:"GFS",values:[30,null,40]}],["Mon","Tue","Wed"],"°F","line",0,true);
 assert.ok(!html.includes("NaN"));assert.ok(!html.includes("Infinity"));
 assert.ok(html.includes('d="M'));assert.ok(html.includes(" M"));
 assert.ok(s.makePlot([{name:"GFS",values:[null,null]}],["Mon","Tue"]," in","bar",0).includes("unavailable"));
 const gem=s.makePlot([{name:"GEM",values:[1,2]}],["Mon","Tue"],"°F","line",0);
 assert.ok(gem.includes("#d1b3f1"));assert.ok(gem.includes('stroke-dasharray="2 5"'));
});
test("mountain periods align and wind ranges retain their maximum",()=>{
 const s=guidance(),q={name:"Monday",startTime:"2026-10-26T12:00:00Z",endTime:"2026-10-27T00:00:00Z",temperature:30,windSpeed:"5 to 15 mph"};
 const d=(periods)=>({forecast:{periods,elevation:{value:2000},updateTime:"2026-10-26T00:00:00Z"},point:{forecastGridData:"same-grid"},grid:{}});
 const rows=s.mountainRows({p:[[0,0,"Mid"],[0,0,"Peak"]]},[d([q]),d([{...q,startTime:"2026-10-27T00:00:00Z",windSpeed:null}])]);
 assert.equal(rows[0].periods[0].wind,15);assert.equal(rows[1].periods[0].temp,null);
 assert.equal(rows[1].periods[1].wind,null);assert.equal(rows[0].gridFt,6562);
});
function cams(){
 const s={Date,Math,Number,String,cameraSearch:"",cameraType:"all"};
 vm.createContext(s);
 vm.runInContext(webcams.slice(0,webcams.indexOf('const content ='))+'globalThis.resorts=RESORTS;',s);
 vm.runInContext(webcams.slice(webcams.indexOf('const safe ='),webcams.indexOf('const REGIONS =')),s);return s;
}
test("video and embedded players have no visible status notes; stills retain labels",()=>{
 const s=cams();
 assert.equal(s.cameraStatus({embed:"https://example.com"}),"");
 assert.equal(s.cameraStatus({hls:"stream"}),"");
 assert.equal(s.cameraStatus({snapshot:"still"}),"Loading still");
 for(const r of s.resorts)for(const c of r.cams){
  if(c.offline)continue;
  const html=s.camera(r,c);
  const badge=html.match(/<span class="badge"[^>]*>/)?.[0];
  assert.ok(badge);
  assert.equal(badge.includes(" hidden"),!(c.snapshot&&!c.hls));
  if(c.hls||(!c.snapshot&&c.embed))assert.ok(!s.cameraCard(r,c).includes("feed-kind"));
 }
});
test("all original resort camera views retain source links and escaped labels",()=>{
 const s=cams();assert.ok(s.resorts.length>10);
 for(const r of s.resorts)for(const c of r.cams){const card=s.cameraCard(r,c);assert.ok(card.includes(escapeHTML(r.source)));assert.ok(card.includes(escapeHTML(c.name)));}
 const r={name:'<script>',area:'<img>',id:"test",source:"https://example.com",cams:[{name:'A " camera',snapshot:"https://example.com/image.jpg"}]};
 assert.ok(!s.cameraCard(r,r.cams[0]).includes("<script>"));
});
test("webcam pages omit search, feed filters, result counts and explanation",()=>{
 assert.ok(!webcams.includes("webcamFilters"));
 assert.ok(!webcams.includes("camera-search"));
 assert.ok(!webcams.includes("camera-results"));
 assert.ok(!webcams.includes("Video playback is confirmed only"));
 const s=cams();assert.ok(s.groupedResorts(s.resorts).includes('class="grid"'));
});
test("still-image recovery clears unavailable state and records load time only",()=>{
 const s=cams(),failure={hidden:true},badge={dataset:{}},cam={querySelector:q=>q===".badge"?badge:failure};
 const img={closest:()=>cam,complete:false,naturalWidth:0};
 s.wireStill(img);img.onerror();assert.equal(failure.hidden,false);assert.equal(badge.dataset.state,"error");
 img.onload();assert.equal(failure.hidden,true);assert.equal(badge.dataset.state,"still");assert.ok(badge.textContent.includes("loaded"));
});
