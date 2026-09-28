// Fetch recent NRCS SNOTEL snow depth / SWE for stations near the Wasatch resorts and write snotel.json.
// Runs in a scheduled GitHub Action (NRCS does not allow browser requests from other sites).
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
const STATIONS=[
  {triplet:'814:UT:SNTL',near:'Park City · Deer Valley · Canyons'},
  {triplet:'684:UT:SNTL',near:'Parleys Summit'},
  {triplet:'628:UT:SNTL',near:'Solitude · Brighton (Big Cottonwood)'},
  {triplet:'366:UT:SNTL',near:'Brighton'},
  {triplet:'766:UT:SNTL',near:'Snowbird · Alta (Little Cottonwood)'},
  {triplet:'332:UT:SNTL',near:'Snowbasin (Ogden)'}
];
const BASE='https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customSingleStationReport';
async function csv(url){let last;for(let a=0;a<3;a++){try{const r=await fetch(url,{headers:{'User-Agent':'Snow Report (github.com/bg197550/weather-window)'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${r.status} ${url}`);const t=await r.text();if(!/Date/i.test(t))throw Error('No data rows (NRCS may be down)');return t}catch(e){last=e;await new Promise(z=>setTimeout(z,5000*(a+1)))}}throw last}
function parse(txt){const lines=txt.split(/\r?\n/);const meta=lines.filter(l=>l.startsWith('#'));const body=lines.filter(l=>l&&!l.startsWith('#'));if(!body.length)return {meta,rows:[]};
  const head=body[0].split(',').map(h=>h.trim());const rows=body.slice(1).map(l=>{const v=l.split(',');const o={};head.forEach((h,i)=>o[h]=v[i]===undefined||v[i]===''?null:v[i]);return o});return {meta,head,rows}}
const col=(head,re)=>head.find(h=>re.test(h));
const num=v=>v==null||v===''?null:(Number.isFinite(+v)?+v:null);
async function station(s){
  const out={...s};
  const d=parse(await csv(`${BASE}/daily/start_of_period/${s.triplet}%7Cid=%22%22%7Cname/-8,0/WTEQ::value,SNWD::value,TOBS::value,PREC::value`));
  const nameLine=d.meta.find(l=>/\(\d+\)/.test(l)&&/SNOTEL|Site|,/i.test(l)||/\bUT\b/.test(l));
  out.name=(d.meta.map(l=>l.match(/#\s*([A-Za-z .'\-]+)\s*\((\d+)\)/)).find(Boolean)||[])[1]?.trim()||null;
  const sd=col(d.head||[],/Snow Depth/i),sw=col(d.head||[],/Snow Water Equivalent/i),dt=col(d.head||[],/^Date/i),tb=col(d.head||[],/Air Temperature Observed/i);
  out.daily=d.rows.map(r=>({date:r[dt],depth:num(r[sd]),swe:num(r[sw]),temp:num(r[tb])})).filter(x=>x.date);
  try{const h=parse(await csv(`${BASE}/hourly/start_of_period/${s.triplet}%7Cid=%22%22%7Cname/-24,0/SNWD::value,WTEQ::value,TOBS::value`));
    const hsd=col(h.head||[],/Snow Depth/i),hsw=col(h.head||[],/Snow Water Equivalent/i),hdt=col(h.head||[],/^Date/i),htb=col(h.head||[],/Air Temperature Observed/i);
    out.hourly=h.rows.map(r=>({time:r[hdt],depth:num(r[hsd]),swe:num(r[hsw]),temp:num(r[htb])})).filter(x=>x.time)}catch(e){console.error(s.triplet,'hourly',e.message)}
  const withDepth=(out.hourly||[]).filter(x=>x.depth!=null);const last=withDepth.at(-1);const dly=out.daily.filter(x=>x.depth!=null);
  out.latest=last?{time:last.time,depth:last.depth,swe:last.swe,temp:last.temp}:(dly.at(-1)?{time:dly.at(-1).date,depth:dly.at(-1).depth,swe:dly.at(-1).swe,temp:dly.at(-1).temp}:null);
  const ago=n=>withDepth.length?withDepth.find(x=>Date.parse(x.time.replace(' ','T'))>=Date.parse(last.time.replace(' ','T'))-n*3600000):null;
  const d24=ago(24);out.change24=last&&d24?Math.round((last.depth-d24.depth)*10)/10:null;
  out.change7d=dly.length>1?Math.round((dly.at(-1).depth-dly[0].depth)*10)/10:null;
  return out;
}
const res=await Promise.allSettled(STATIONS.map(station));const stations=[],errors=[];
res.forEach((r,i)=>{if(r.status==='fulfilled')stations.push(r.value);else{errors.push(`${STATIONS[i].triplet}: ${r.reason?.message}`);console.error(r.reason)}});
const file=process.argv[2]||'snotel.json',prevFile=process.argv[3];
let prev=null;try{if(prevFile&&existsSync(prevFile))prev=JSON.parse(readFileSync(prevFile,'utf8'))}catch{}
// Keep the last good reading for any station that failed this time (marked stale) instead of failing the run.
if(prev?.stations)for(const p of prev.stations){if(!stations.some(s=>s.triplet===p.triplet))stations.push({...p,stale:true})}
if(!stations.length){console.warn('NRCS unavailable and no previous data; skipping publish this hour.');process.exit(0)}
if(stations.every(s=>s.stale)){console.warn('NRCS unavailable; keeping previous data unchanged.');process.exit(0)}
writeFileSync(file,JSON.stringify({generatedAt:new Date().toISOString(),source:'USDA NRCS SNOTEL',stations,errors},null,2)+'\n');
console.log(stations.map(s=>`${s.triplet} ${s.name}: depth ${s.latest?.depth} in, 24h ${s.change24}`).join('\n'));
