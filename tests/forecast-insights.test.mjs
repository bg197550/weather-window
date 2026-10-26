import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
const common=readFileSync(new URL("../assets/common.js",import.meta.url),"utf8");
const slice=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to));
function context(){
 const s={Date,Intl,Number,Math,URL,escapeHTML:s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
 regionZone:s=>s==="ne"?"America/New_York":"America/Denver",
 regionTime:(t,s,o)=>new Date(t).toLocaleString("en-US",{...o,timeZone:s==="ne"?"America/New_York":"America/Denver"}),
 forecastIcon:()=>"",WW:{region:()=>"utah"},utah:[{name:"Snyderville"},{name:"Park City"},{name:"Deer Valley"}],ne:[{name:"Boston"}],
 slug:s=>s.toLowerCase().replaceAll(" ","-"),location:{hash:"",replace(){}},view:{utah:"forecast",ne:"forecast"},selection:{utah:0,ne:0}};
 vm.createContext(s);
 vm.runInContext(slice("function detailedPeriods(","async function loadDiscussion(")+slice("function readHash()",'window.addEventListener("hashchange"'),s);
 return s;
}
const periods=Array.from({length:14},(_,i)=>({name:"Period "+i,isDaytime:i%2===0,
 startTime:new Date(Date.UTC(2026,9,26,12)+i*12*3600000).toISOString(),
 endTime:new Date(Date.UTC(2026,9,27)+i*12*3600000).toISOString(),
 temperature:57-i,temperatureUnit:"F",windSpeed:"3 mph",windDirection:"S",
 detailedForecast:"Original wording "+i,shortForecast:i===3?"Chance snow":"Sunny",
 probabilityOfPrecipitation:{value:i===2?null:i*5}}));
test("default, legacy and regional links select the right forecast view",()=>{
 const s=context();
 for(const hash of ["#utah/snyderville/overview","#utah/snyderville/discussion","#utah/snyderville","#utah"]){
  s.location.hash=hash;s.readHash();assert.equal(s.view.utah,"forecast");
 }
 for(const [region,place] of [["utah","snyderville"],["ne","boston"]]){
  s.location.hash="#"+region+"/"+place+"/insights";s.readHash();assert.equal(s.view[region],"insights");
 }
 s.location.hash="#utah/deer-valley/mountain";s.readHash();assert.equal(s.view.utah,"mountain");
 s.location.hash="#utah/snyderville/mountain";s.readHash();assert.equal(s.view.utah,"forecast");
});
test("all full forecast periods and hourly indices survive grouping",()=>{
 const html=context().detailedPeriods(periods,2,"utah");
 assert.equal((html.match(/data-period-hourly=/g)||[]).length,14);
 for(const [i,q] of periods.entries()){assert.ok(html.includes(q.detailedForecast));assert.ok(html.includes('period-hours-2-'+i));}
 assert.ok(html.includes("0%"));assert.ok(html.includes("Unavailable"));
});
test("NWS text is escaped before insertion",()=>{
 const html=context().detailedPeriods([{...periods[0],name:"<script>bad</script>",detailedForecast:"<img src=x onerror=bad>"}],0,"utah");
 assert.ok(!html.includes("<script>"));assert.ok(!html.includes("<img src=x"));
});
test("patterns suppress stale guidance and label their source",()=>{
 const s=context();
 assert.ok(s.patternSummary({periods,updateTime:"2000-01-01"},"utah").includes("unavailable"));
 assert.ok(s.patternSummary({periods,updateTime:new Date().toISOString()},"utah").includes("not an alert"));
});
test("hourly charts retain missing values, separate scales and correct freezing units",()=>{
 const s=context();
 const rows=periods.map((p,i)=>({...p,temperature:i===3?null:p.temperature}));
 const html=s.insightsHourlyChart(rows,"America/Denver",14,360);
 assert.ok(!html.includes("NaN"));assert.ok(html.includes("unavailable"));assert.ok(html.includes("0% chance"));
 assert.ok(html.includes("TEMPERATURE"));assert.ok(html.includes("PRECIPITATION CHANCE"));assert.ok(html.includes("❄"));
 assert.ok(s.insightsHourlyChart(rows.map(p=>({...p,temperature:null})),"America/Denver",14,360).includes("unavailable"));
 const c=rows.map((p,i)=>({...p,temperatureUnit:"C",temperature:i-5}));
 assert.ok(s.insightsHourlyChart(c,"America/Denver",14,360).includes("0° freezing"));
});
test("grouping follows local calendar dates across daylight-saving changes",()=>{
 const s=context();
 const input=[{...periods[0],startTime:"2026-11-01T05:30:00Z"},{...periods[1],startTime:"2026-11-01T07:30:00Z"},{...periods[2],startTime:"2026-11-01T08:30:00Z"}];
 const html=s.detailedPeriods(input,0,"utah");
 assert.equal((html.match(/class="forecast-day-group"/g)||[]).length,2);
});
test("hourly expansion preserves the original period and toggles accessibly",async()=>{
 const s=context();vm.runInContext(slice("async function loadDiscussion(","async function loadAFD("),s);
 const obs={isConnected:true},body={isConnected:true,hidden:true},attrs={"aria-expanded":"false","aria-controls":"period-hours-0-3"};
 const b={dataset:{periodHourly:"3"},getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v};
 const el={isConnected:true,innerHTML:"",querySelector:q=>q===".obs-slot"?obs:body,querySelectorAll:()=>[b]};
 const wrap={isConnected:true,innerHTML:"",querySelector:()=>el},calls=[];
 Object.assign(s,{document:{querySelector:()=>wrap},uniquePoints:async()=>[{label:"Town",p:[40,-111,"Town"]}],
 pointForecast:async()=>({forecast:{periods}}),pointDetail:()=>"",gridFeet:()=>6585,issuedLine:()=>"",
 loadObs:(p,t)=>calls.push(["obs",t]),loadPeriodHourly:(p,q)=>calls.push(["hour",q]),pointError:()=>"Unavailable"});
 await s.loadDiscussion({p:[[40,-111,"Town"]]},"utah");await new Promise(r=>setImmediate(r));
 assert.equal(calls[0][0],"obs");b.onclick();assert.equal(attrs["aria-expanded"],"true");assert.equal(body.hidden,false);
 assert.equal(calls[1][1].name,"Period 3");b.onclick();assert.equal(body.hidden,true);
 s.pointForecast=async()=>{throw Error("offline")};calls.length=0;
 await s.loadDiscussion({p:[[40,-111,"Town"]]},"utah");await new Promise(r=>setImmediate(r));
 assert.ok(el.innerHTML.includes("Unavailable"));assert.equal(calls[0][0],"obs");
});
