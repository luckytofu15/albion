const CITIES = ["Bridgewatch","Fort Sterling","Lymhurst","Martlock","Thetford","Caerleon","Brecilien","Black Market"];
const HOSTS = {
  west:"https://west.albion-online-data.com",
  east:"https://east.albion-online-data.com",
  europe:"https://europe.albion-online-data.com"
};
/*__TRAVEL_PURE_START__*/
/* Fast-travel cost estimation. The NPC fee depends on cargo weight × distance.
   Weights and distances below are rough estimates — the plan lets the user
   adjust the kg per leg and the silver rate, and the app remembers the rate. */
const TRAVEL_RATE_KEY='albionProfitRadarTravelRate';
const TRAVEL_RATE_DEFAULT=12; /* silver per kg per distance unit — starting estimate */
const WEIGHT_EST={
  raw:{2:.2,3:.3,4:.5,5:.8,6:1.2,7:1.8,8:2.7},      /* ORE/WOOD/HIDE/FIBER/STONE */
  refined:{2:.8,3:1.2,4:2,5:3,6:4.5,7:6.8,8:10},     /* METALBAR/PLANKS/LEATHER/CLOTH */
  gear:{2:2,3:3.5,4:7,5:10,6:14,7:20,8:28}           /* crafted items */
};
const RAW_SUFFIX=['ORE','WOOD','HIDE','FIBER','STONE'];
const REFINED_SUFFIX=['METALBAR','PLANKS','LEATHER','CLOTH'];
function itemWeightKg(id){
  const m=/^T(\d+)_(.+)$/.exec(id||''); if(!m) return 1;
  const tier=Math.min(8,Math.max(2,+m[1])), base=m[2];
  const cls=RAW_SUFFIX.includes(base)?'raw':REFINED_SUFFIX.includes(base)?'refined':'gear';
  return WEIGHT_EST[cls][tier] ?? 1;
}
/* Relative distances between royal cities (symmetric, arbitrary units). */
const CITY_DIST={
  'Bridgewatch|Caerleon':1,'Bridgewatch|Fort Sterling':2,'Bridgewatch|Lymhurst':1,'Bridgewatch|Martlock':2,'Bridgewatch|Thetford':2,
  'Caerleon|Fort Sterling':2,'Caerleon|Lymhurst':2,'Caerleon|Martlock':2,'Caerleon|Thetford':1,
  'Fort Sterling|Lymhurst':2,'Fort Sterling|Martlock':1,'Fort Sterling|Thetford':1,
  'Lymhurst|Martlock':1,'Lymhurst|Thetford':2,'Martlock|Thetford':2
};
function cityDist(a,b){
  if(a===b) return 0;
  const x=a==='Black Market'?'Caerleon':a, y=b==='Black Market'?'Caerleon':b;
  if(x===y) return 0;
  if(x==='Brecilien'||y==='Brecilien') return 3;
  return CITY_DIST[[x,y].sort().join('|')] ?? 2;
}
function travelRate(){
  try{ const v=+(localStorage.getItem(TRAVEL_RATE_KEY) ?? TRAVEL_RATE_DEFAULT); return v>0?v:TRAVEL_RATE_DEFAULT; }
  catch{ return TRAVEL_RATE_DEFAULT; }
}
function setTravelRate(v){ try{ localStorage.setItem(TRAVEL_RATE_KEY,String(v)); }catch{} }
/*__TRAVEL_PURE_END__*/
const FALLBACK_RECIPES = {
  T4_BAG:{name:"Adept's Bag",kind:"craft",city:"Bridgewatch",amountCrafted:1,itemValue:192,materials:[{id:"T4_LEATHER",count:8,returnable:true},{id:"T4_CLOTH",count:8,returnable:true}]},
  T5_MAIN_AXE:{name:"Expert's Battleaxe",kind:"craft",city:"Thetford",amountCrafted:1,itemValue:384,materials:[{id:"T5_METALBAR",count:16,returnable:true},{id:"T5_PLANKS",count:8,returnable:true}]},
  T4_LEATHER:{name:"Adept's Leather",kind:"refine",city:"Martlock",amountCrafted:1,itemValue:32,materials:[{id:"T4_HIDE",count:2,returnable:true},{id:"T3_LEATHER",count:1,returnable:true}]},
  T5_METALBAR:{name:"Expert's Metal Bar",kind:"refine",city:"Thetford",amountCrafted:1,itemValue:64,materials:[{id:"T5_ORE",count:3,returnable:true},{id:"T4_METALBAR",count:1,returnable:true}]},
  T4_CLOTH:{name:"Adept's Cloth",kind:"refine",city:"Lymhurst",amountCrafted:1,itemValue:32,materials:[{id:"T4_FIBER",count:2,returnable:true},{id:"T3_CLOTH",count:1,returnable:true}]},
  T4_PLANKS:{name:"Adept's Planks",kind:"refine",city:"Fort Sterling",amountCrafted:1,itemValue:32,materials:[{id:"T4_WOOD",count:2,returnable:true},{id:"T3_PLANKS",count:1,returnable:true}]}
};
const state = { mode:"flip", recipes:{...FALLBACK_RECIPES}, rows:[], rawRows:[], scanning:false, isDemo:false };

const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const money = n => Number.isFinite(n) ? `${n<0?'-':''}${fmt.format(Math.abs(Math.round(n)))}` : '—';
const pct = n => Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
const ageHours = iso => { if(!iso || iso.startsWith('0001')) return Infinity; return Math.max(0,(Date.now()-new Date(iso).getTime())/36e5); };
const humanAge = h => !Number.isFinite(h)?'no data':h<1?`${Math.max(1,Math.round(h*60))}m`:h<48?`${Math.round(h)}h`:`${Math.round(h/24)}d`;
const parseIds = s => [...new Set(s.split(/[\s,;]+/).map(v=>v.trim()).filter(Boolean))];
const escapeHtml = s => String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const itemIcon = id => `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?quality=1&size=64`;

function setStatus(text,type='idle'){
  $('feedStatus').textContent=text;
  $('statusDot').className=`status-dot ${type==='live'?'live':type==='demo'?'demo':type==='error'?'error':''}`;
}

function buildCities(){
  const el=$('cityChecks'); el.innerHTML='';
  CITIES.forEach(city=>{
    const lab=document.createElement('label'); lab.className='check-chip';
    const checked = city==='Black Market' || city!=='Brecilien';
    lab.innerHTML=`<input type="checkbox" data-city="${city}" ${checked?'checked':''}><span>${city}</span>`;
    el.appendChild(lab);
  });
}
function selectedCities(){
  let cities=[...document.querySelectorAll('[data-city]:checked')].map(x=>x.dataset.city);
  if(!$('includeBM').checked) cities=cities.filter(c=>c!=='Black Market');
  return cities;
}
function setMode(mode){
  const previous=state.mode; state.mode=mode;
  document.querySelectorAll('#modeTabs button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('modeBadge').textContent=mode.toUpperCase();
  document.querySelectorAll('.mode-craft').forEach(el=>el.style.display=mode==='flip'?'none':'');
  if(mode!=='flip' && mode!==previous){
    $('returnRate').value=$('useFocus').checked ? (mode==='refine'?53.9:47.9) : (mode==='refine'?36.7:24.8);
    updateLabels();
  }
  filterUniverseHint();
}
function syncTax(){ $('salesTax').value=$('premium').checked ? 4 : 8; }
function syncFocus(){ $('useReturn').checked=true; $('returnRate').value=$('useFocus').checked ? (state.mode==='refine'?53.9:47.9) : (state.mode==='refine'?36.7:24.8); updateLabels(); }
function updateLabels(){
  $('minProfitLabel').textContent=`${Math.round(+$('minProfit').value/1000)}k`;
  $('minRoiLabel').textContent=`${$('minRoi').value}%`;
  $('riskLabel').textContent=`${$('riskBuffer').value}%`;
  $('rrrLabel').textContent=`${$('returnRate').value}%`;
  $('stationLabel').textContent=`${$('stationFee').value}%`;
}
function filterUniverseHint(){
  const all=Object.values(state.recipes);
  const count=state.mode==='flip' ? Object.keys(state.recipes).length : all.filter(r=>r.kind===state.mode).length;
  $('recipeCount').textContent=`${fmt.format(count)} ${state.mode==='flip'?'items':'recipes'} loaded`;
}
async function loadRecipes(){
  for(const url of ['./data/recipes.json','./data/recipes.demo.json','/api/recipes']){
    try{
      const r=await fetch(url,{cache:'no-store'}); if(!r.ok) continue;
      const data=await r.json(); if(data?.items && Object.keys(data.items).length){ state.recipes=data.items; filterUniverseHint(); return; }
    }catch{}
  }
  state.recipes={...FALLBACK_RECIPES}; filterUniverseHint();
}
function universe(){
  const manual=parseIds($('itemIds').value); if(manual.length) return manual;
  if(state.mode==='flip'){
    const base=new Set(Object.keys(state.recipes));
    Object.values(state.recipes).forEach(r=>(r.materials||[]).forEach(m=>base.add(m.id)));
    return [...base];
  }
  return Object.entries(state.recipes).filter(([,r])=>r.kind===state.mode).map(([id])=>id);
}

function chunkItems(items,build,max=3800){
  const chunks=[]; let cur=[];
  for(const id of items){
    const test=[...cur,id];
    if(build(test).length>max && cur.length){ chunks.push(cur); cur=[id]; } else cur=test;
  }
  if(cur.length) chunks.push(cur); return chunks;
}
async function fetchJson(url){
  const r=await fetch(url,{headers:{accept:'application/json'}});
  if(!r.ok) throw new Error(`Market feed returned ${r.status}`);
  return r.json();
}
async function mapLimit(arr,limit,fn){
  const out=new Array(arr.length); let next=0;
  async function worker(){ while(next<arr.length){ const i=next++; out[i]=await fn(arr[i],i); } }
  await Promise.all(Array.from({length:Math.min(limit,arr.length)},worker)); return out;
}
async function directPrices(items,cities){
  const host=HOSTS[$('serverSelect').value]||HOSTS.west, quality=$('quality').value, loc=cities.join(',');
  const build=ids=>`${host}/api/v2/stats/prices/${ids.join(',')}.json?locations=${encodeURIComponent(loc)}&qualities=${quality}`;
  const chunks=chunkItems(items,build);
  return (await mapLimit(chunks,4,ids=>fetchJson(build(ids)))).flat();
}
async function directHistory(items,locations){
  const host=HOSTS[$('serverSelect').value]||HOSTS.west, quality=$('quality').value, loc=locations.join(',');
  const end=new Date(), start=new Date(Date.now()-7*864e5), ds=d=>d.toISOString().slice(0,10);
  const build=ids=>`${host}/api/v2/stats/history/${ids.join(',')}.json?date=${ds(start)}&end_date=${ds(end)}&locations=${encodeURIComponent(loc)}&qualities=${quality}&time-scale=24`;
  const chunks=chunkItems(items,build,3600);
  return (await mapLimit(chunks,3,ids=>fetchJson(build(ids)))).flat();
}
async function proxyPrices(items,cities){
  const q=new URLSearchParams({server:$('serverSelect').value,items:items.join(','),locations:cities.join(','),quality:$('quality').value});
  const r=await fetch(`/api/prices?${q}`); if(!r.ok) throw new Error(`Proxy returned ${r.status}`); return r.json();
}
async function proxyHistory(items,locations){
  const q=new URLSearchParams({server:$('serverSelect').value,items:items.join(','),locations:locations.join(','),quality:$('quality').value,days:'7'});
  const r=await fetch(`/api/history?${q}`); if(!r.ok) throw new Error(`Proxy returned ${r.status}`); return r.json();
}
async function apiPrices(items,cities){
  try{return await directPrices(items,cities)}catch(directErr){
    try{return await proxyPrices(items,cities)}catch{throw new Error(`Live price feed unavailable. Try Demo mode, or open the hosted HTTPS version. (${directErr.message})`)}
  }
}
async function apiHistory(items,locations){
  try{return await directHistory(items,locations)}catch{
    try{return await proxyHistory(items,locations)}catch{return []}
  }
}

function makePriceMap(prices){ const m=new Map(); for(const p of prices)m.set(`${p.item_id}|${p.city}`,p); return m; }
function sourceQuote(q){
  if(!q)return null; const buyOrder=$('buyOrders').checked;
  const price=buyOrder?q.buy_price_max:q.sell_price_min, date=buyOrder?q.buy_price_max_date:q.sell_price_min_date;
  return price>0?{price,date,age:ageHours(date)}:null;
}
function exitQuote(q,city){
  if(!q)return null; const order=$('sellOrders').checked&&city!=='Black Market';
  const price=order?q.sell_price_min:q.buy_price_max, date=order?q.sell_price_min_date:q.buy_price_max_date;
  return price>0?{price,date,age:ageHours(date),order}:null;
}
function feesForSale(sale,order){ return sale*((+$('salesTax').value/100)+(order?+$('setupFee').value/100:0)); }
function riskCost(base){ return base*(+$('riskBuffer').value/100); }
function flipRows(ids,prices,cities){
  const map=makePriceMap(prices), out=[], maxAge=+$('maxAge').value;
  for(const id of ids){
    const name=state.recipes[id]?.name||id;
    for(const from of cities.filter(c=>c!=='Black Market')){
      const src=sourceQuote(map.get(`${id}|${from}`)); if(!src||src.age>maxAge)continue;
      for(const to of cities){
        if(to===from)continue; const dst=exitQuote(map.get(`${id}|${to}`),to); if(!dst||dst.age>maxAge)continue;
        const acquisition=src.price, buySetup=$('buyOrders').checked?acquisition*(+$('setupFee').value/100):0, sellFees=feesForSale(dst.price,dst.order), risk=riskCost(acquisition);
        const profit=dst.price-acquisition-buySetup-sellFees-risk, roi=acquisition>0?profit/(acquisition+buySetup+risk)*100:0;
        out.push({id,name,kind:'flip',from,to,buy:acquisition,sell:dst.price,fees:buySetup+sellFees+risk,profit,roi,age:Math.max(src.age,dst.age),volume:null,score:0,entryOrder:$('buyOrders').checked,exitOrder:dst.order,detail:`${$('buyOrders').checked?'Buy order':'Instant buy'} → ${dst.order?'Sell order':'Instant sell'}`});
      }
    }
  }
  return out;
}
function cheapestMaterial(material,map,cities,maxAge){
  let best=material.vendorPrice>0?{price:material.vendorPrice,date:new Date().toISOString(),age:0,city:'Vendor'}:null;
  for(const city of cities.filter(c=>c!=='Black Market')){
    const q=sourceQuote(map.get(`${material.id}|${city}`)); if(!q||q.age>maxAge)continue;
    if(!best||q.price<best.price)best={...q,city};
  } return best;
}
function craftRows(ids,prices,cities){
  const map=makePriceMap(prices), out=[], maxAge=+$('maxAge').value, rrr=$('useReturn').checked?+$('returnRate').value/100:0, stationRate=+$('stationFee').value/100, journal=+$('journalValue').value;
  for(const id of ids){
    const recipe=state.recipes[id]; if(!recipe||!(recipe.materials||[]).length)continue;
    const craftCity=recipe.city&&cities.includes(recipe.city)?recipe.city:cities.find(c=>c!=='Black Market'); if(!craftCity)continue;
    let matCost=0,maxMatAge=0,sourceNames=[],valid=true; const mats=[];
    for(const mat of recipe.materials){
      let src;
      if($('globalSource').checked) src=cheapestMaterial(mat,map,cities,maxAge);
      else{ const q=sourceQuote(map.get(`${mat.id}|${craftCity}`)); src=q?{...q,city:craftCity}:null; if(mat.vendorPrice>0&&(!src||mat.vendorPrice<src.price))src={price:mat.vendorPrice,date:new Date().toISOString(),age:0,city:'Vendor'}; }
      if(!src||src.age>maxAge){valid=false;break}
      const effectiveCount=mat.count*(mat.returnable===false?1:(1-rrr)), base=src.price*effectiveCount;
      matCost+=base+($('buyOrders').checked?base*(+$('setupFee').value/100):0); maxMatAge=Math.max(maxMatAge,src.age); sourceNames.push(src.city);
      mats.push({id:mat.id,name:state.recipes[mat.id]?.name||mat.id,count:mat.count,eff:effectiveCount,price:src.price,city:src.city,fee:$('buyOrders').checked?base*(+$('setupFee').value/100):0});
    }
    if(!valid)continue;
    const amount=recipe.amountCrafted||1, station=((recipe.itemValue||0)*0.1125*stationRate)+(recipe.silverCost||0), totalCost=(matCost+station)/amount, stationUnit=station/amount, journalUnit=journal/amount;
    for(const to of cities){
      const dst=exitQuote(map.get(`${id}|${to}`),to); if(!dst||dst.age>maxAge)continue;
      const sellFees=feesForSale(dst.price,dst.order),risk=riskCost(totalCost),profit=dst.price-sellFees-totalCost-risk+journal,roi=totalCost>0?profit/(totalCost+risk)*100:0,unique=[...new Set(sourceNames)];
      out.push({id,name:recipe.name||id,kind:recipe.kind||state.mode,from:craftCity,to,buy:totalCost,sell:dst.price,fees:sellFees+station+risk,profit,roi,age:Math.max(maxMatAge,dst.age),volume:null,score:0,mats,stationUnit,journalUnit,entryOrder:$('buyOrders').checked,exitOrder:dst.order,detail:`${unique.length>1?'Global mats':unique[0]||craftCity} → ${craftCity} ${state.mode} → ${to}`});
    }
  } return out;
}
function prefilter(rows){ const minP=+$('minProfit').value,minR=+$('minRoi').value; return rows.filter(r=>r.profit>=minP&&r.roi>=minR).sort((a,b)=>b.profit-a.profit).slice(0,250); }
async function addLiquidity(rows){
  if(!$('liquidity').checked||!rows.length||state.isDemo)return rows;
  const top=rows.slice(0,18),ids=[...new Set(top.map(r=>r.id))],locs=[...new Set(top.map(r=>r.to))];
  try{
    const h=await apiHistory(ids,locs),vm=new Map();
    for(const series of h){ const pts=series.data||[],vol=pts.reduce((s,p)=>s+(+p.item_count||0),0)/Math.max(1,Math.min(7,pts.length)); vm.set(`${series.item_id}|${series.location}`,vol); }
    rows.forEach(r=>r.volume=vm.get(`${r.id}|${r.to}`)??null);
  }catch{} return rows;
}
function scoreRows(rows){
  const minVol=+$('minVolume').value;
  rows.forEach(r=>{ const freshness=Math.max(0,1-Math.min(r.age,72)/72),volume=r.volume==null?1:Math.log10(1+r.volume); r.score=Math.max(0,Math.round((Math.min(Math.max(r.roi,0),100)*.48+Math.min(Math.max(r.profit/2500,0),100)*.32+freshness*20)*Math.min(1.35,.8+volume*.18))); });
  return rows.filter(r=>r.volume==null||r.volume>=minVol).sort((a,b)=>b.score-a.score||b.profit-a.profit);
}
function demoRows(){
  const now=.35;
  const sets={
    flip:[
      {id:'T6_BAG',name:"Master's Bag",from:'Martlock',to:'Black Market',buy:28600,sell:39200,fees:3120,profit:7480,roi:25.6,age:now,volume:44,entryOrder:false,exitOrder:true,detail:'Demo: instant buy → Black Market'},
      {id:'T5_MAIN_AXE',name:"Expert's Battleaxe",from:'Thetford',to:'Caerleon',buy:17800,sell:24850,fees:1971,profit:5079,roi:28.0,age:1.4,volume:31,entryOrder:false,exitOrder:true,detail:'Demo: city flip'},
      {id:'T4_BAG',name:"Adept's Bag",from:'Bridgewatch',to:'Lymhurst',buy:6400,sell:8840,fees:703,profit:1737,roi:26.6,age:2.1,volume:126,entryOrder:false,exitOrder:true,detail:'Demo: fast-volume flip'},
      {id:'T7_LEATHER',name:"Grandmaster's Leather",from:'Martlock',to:'Caerleon',buy:7350,sell:9720,fees:779,profit:1591,roi:21.2,age:3.2,volume:212,entryOrder:false,exitOrder:true,detail:'Demo: refined resource spread'}
    ],
    craft:[
      {id:'T6_BAG',name:"Master's Bag",from:'Bridgewatch',to:'Black Market',buy:31500,sell:47200,fees:3698,profit:12002,roi:37.4,age:.8,volume:38,entryOrder:false,exitOrder:true,stationUnit:8639,journalUnit:0,
       mats:[{id:'T6_LEATHER',name:"Master's Leather",count:8,eff:6.0160526,price:2400,city:'Martlock',fee:0},{id:'T6_CLOTH',name:"Master's Cloth",count:8,eff:6.0160526,price:1400,city:'Lymhurst',fee:0}],detail:'Demo: global mats → craft → Black Market'},
      {id:'T5_MAIN_AXE',name:"Expert's Battleaxe",from:'Thetford',to:'Caerleon',buy:19200,sell:28600,fees:2243,profit:7157,roi:36.5,age:1.6,volume:27,entryOrder:false,exitOrder:true,stationUnit:5120,journalUnit:0,
       mats:[{id:'T5_METALBAR',name:"Expert's Metal Bar",count:16,eff:12.0341888,price:930,city:'Thetford',fee:0},{id:'T5_PLANKS',name:"Expert's Planks",count:8,eff:6.0170944,price:480,city:'Fort Sterling',fee:0}],detail:'Demo: Thetford craft → Caerleon'},
      {id:'T4_BAG',name:"Adept's Bag",from:'Bridgewatch',to:'Bridgewatch',buy:6550,sell:9050,fees:719,profit:1781,roi:26.7,age:2.6,volume:109,entryOrder:false,exitOrder:true,stationUnit:1810,journalUnit:0,
       mats:[{id:'T4_LEATHER',name:"Adept's Leather",count:8,eff:6.0382168,price:420,city:'Martlock',fee:0},{id:'T4_CLOTH',name:"Adept's Cloth",count:8,eff:6.0382168,price:365,city:'Lymhurst',fee:0}],detail:'Demo: local craft & sell'}
    ],
    refine:[
      {id:'T6_LEATHER',name:"Master's Leather",from:'Martlock',to:'Caerleon',buy:4200,sell:6280,fees:492,profit:1588,roi:37.1,age:.6,volume:318,entryOrder:false,exitOrder:true,stationUnit:128,journalUnit:0,
       mats:[{id:'T6_HIDE',name:"Master's Hide",count:2,eff:1.5039646,price:2010,city:'Martlock',fee:0},{id:'T5_LEATHER',name:"Expert's Leather",count:1,eff:0.7519823,price:1395,city:'Martlock',fee:0}],detail:'Demo: Martlock refine → Caerleon'},
      {id:'T5_METALBAR',name:"Expert's Metal Bar",from:'Thetford',to:'Bridgewatch',buy:2050,sell:2940,fees:232,profit:658,roi:31.5,age:1.1,volume:512,entryOrder:false,exitOrder:true,stationUnit:253,journalUnit:0,
       mats:[{id:'T5_ORE',name:"Expert's Ore",count:3,eff:2.2556493,price:600,city:'Thetford',fee:0},{id:'T4_METALBAR',name:"Adept's Metal Bar",count:1,eff:0.7518831,price:590,city:'Thetford',fee:0}],detail:'Demo: Thetford refine → Bridgewatch'},
      {id:'T4_CLOTH',name:"Adept's Cloth",from:'Lymhurst',to:'Caerleon',buy:720,sell:1010,fees:80,profit:210,roi:28.6,age:2.4,volume:880,entryOrder:false,exitOrder:true,stationUnit:92,journalUnit:0,
       mats:[{id:'T4_FIBER',name:"Adept's Fiber",count:2,eff:1.5041916,price:290,city:'Lymhurst',fee:0},{id:'T3_CLOTH',name:"Journeyman's Cloth",count:1,eff:0.7520958,price:255,city:'Lymhurst',fee:0}],detail:'Demo: Lymhurst refine → Caerleon'}
    ]
  };
  return sets[state.mode].map(x=>({...x,kind:state.mode,score:0}));
}

function render(){
  const q=$('searchResults').value.trim().toLowerCase(), rows=state.rows.filter(r=>!q||`${r.name} ${r.id} ${r.from} ${r.to}`.toLowerCase().includes(q));
  state.filtered=rows;
  $('resultsBody').innerHTML=rows.map((r,i)=>`<tr><td><span class="score-pill">${r.score}</span></td><td><strong>${escapeHtml(r.name)}</strong><br><span class="tag">${escapeHtml(r.id)}</span></td><td><strong>${escapeHtml(r.from)}</strong> → <strong>${escapeHtml(r.to)}</strong><br><span class="tag">${escapeHtml(r.detail)}</span></td><td>${money(r.buy)}</td><td>${money(r.sell)}</td><td>${money(r.fees)}</td><td class="${r.profit>=0?'money-pos':'money-neg'}">${money(r.profit)}</td><td>${pct(r.roi)}</td><td>${r.volume==null?'—':fmt.format(Math.round(r.volume))}/d</td><td class="${r.age<=12?'fresh':'stale'}">${humanAge(r.age)}</td><td><button class="plan-btn" data-plan="${i}">Plan →</button></td></tr>`).join('');
  $('mobileResults').innerHTML=rows.map((r,i)=>`<article class="result-card"><div class="result-top"><div class="score-box">${r.score}</div><div class="result-title"><strong>${escapeHtml(r.name)}</strong><span>${escapeHtml(r.from)} → ${escapeHtml(r.to)} · ${escapeHtml(r.detail)}</span></div><div class="profit-box"><strong>+${money(Math.max(0,r.profit))}</strong><span>${pct(r.roi)} ROI</span></div></div><div class="result-metrics"><div><b>${money(r.buy)}</b><span>Cost</span></div><div><b>${money(r.sell)}</b><span>Sell</span></div><div><b>${r.volume==null?'—':fmt.format(Math.round(r.volume))}</b><span>Vol/day</span></div><div><b>${humanAge(r.age)}</b><span>Age</span></div></div><button class="plan-btn plan-card-btn" data-plan="${i}">Plan this trade →</button></article>`).join('');

  const top=state.rows.slice(0,3);
  $('dailyCards').innerHTML=top.length?top.map((r,i)=>`<article class="daily-card"><span class="rank">#${i+1} · SCORE ${r.score}${state.isDemo?' · DEMO':''}</span><h4>${escapeHtml(r.name)}</h4><div class="route">${escapeHtml(r.from)} → ${escapeHtml(r.to)}</div><div class="daily-metrics"><div><strong>${money(r.profit)}</strong><span>NET SILVER</span></div><div><strong>${pct(r.roi)}</strong><span>ROI</span></div><div><strong>${r.volume==null?'—':fmt.format(Math.round(r.volume))}</strong><span>VOL/DAY</span></div></div></article>`).join(''):'<div class="empty-state"><strong>No opportunities pass your filters</strong><span>Lower minimum profit/ROI or broaden the markets.</span></div>';

  if(state.rows.length){
    const bestP=[...state.rows].sort((a,b)=>b.profit-a.profit)[0],bestR=[...state.rows].sort((a,b)=>b.roi-a.roi)[0];
    $('bestProfit').textContent=money(bestP.profit); $('bestProfitSub').textContent=bestP.name;
    $('bestRoi').textContent=pct(bestR.roi); $('bestRoiSub').textContent=bestR.name;
    $('freshCount').textContent=fmt.format(state.rows.filter(r=>r.age<=12).length); $('freshSub').textContent=`${state.rows.length} passing filters`;
  }else{['bestProfit','bestRoi','freshCount'].forEach(id=>$(id).textContent='—')}
}
async function scan(){
  if(state.scanning)return; state.scanning=true; state.isDemo=false; document.body.classList.add('loading'); setStatus('Scanning','live'); $('scanMessage').className='scan-message'; $('scanMessage').textContent='Fetching live quotes and calculating net opportunity…';
  try{
    const ids=universe(),cities=selectedCities(); if(!ids.length)throw new Error('No item IDs or recipes are available.'); if(!cities.length)throw new Error('Select at least one market.');
    let fetchIds=[...ids]; if(state.mode!=='flip')ids.forEach(id=>(state.recipes[id]?.materials||[]).forEach(m=>fetchIds.push(m.id))); fetchIds=[...new Set(fetchIds)];
    const prices=await apiPrices(fetchIds,cities),quotes=prices.filter(p=>p.sell_price_min>0||p.buy_price_max>0).length;
    $('coverage').textContent=`${Math.round(100*quotes/Math.max(1,fetchIds.length*cities.length))}%`; $('coverageSub').textContent=`${fmt.format(quotes)} usable quotes`;
    let rows=state.mode==='flip'?flipRows(ids,prices,cities):craftRows(ids,prices,cities); rows=prefilter(rows); rows=await addLiquidity(rows); rows=scoreRows(rows); state.rows=rows.slice(0,150); render();
    const now=new Date(); $('lastScan').textContent=now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); setStatus('Live','live'); $('scanMessage').textContent=`Scanned ${fmt.format(fetchIds.length)} item IDs across ${cities.length} markets. ${state.rows.length} opportunities passed your filters.`;
    localStorage.setItem('albionProfitRadarLastScan',JSON.stringify({at:Date.now(),mode:state.mode,top:state.rows.slice(0,15)}));
  }catch(e){ setStatus('Feed issue','error'); $('scanMessage').className='scan-message error'; $('scanMessage').innerHTML=`${escapeHtml(e.message||String(e))} <b>Try Demo</b> to test the app interface.`; }
  finally{state.scanning=false;document.body.classList.remove('loading')}
}
function runDemo(){
  state.isDemo=true; const rows=scoreRows(demoRows()); state.rows=rows; $('coverage').textContent='DEMO'; $('coverageSub').textContent='Sample opportunities'; $('lastScan').textContent='sample data'; setStatus('Demo mode','demo'); $('scanMessage').className='scan-message'; $('scanMessage').textContent='Demo mode: these numbers are sample data for testing the interface — not live Albion prices.'; render();
}
function exportCsv(){
  if(!state.rows.length)return; const cols=['score','id','name','kind','from','to','buy','sell','fees','profit','roi','volume','age','detail'];
  const csv=[cols.join(','),...state.rows.map(r=>cols.map(c=>`"${String(r[c]??'').replaceAll('"','""')}"`).join(','))].join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`albion-profit-radar-${state.mode}-${new Date().toISOString().slice(0,10)}${state.isDemo?'-DEMO':''}.csv`;a.click();URL.revokeObjectURL(a.href);
}
function reset(){
  $('premium').checked=true;$('buyOrders').checked=false;$('sellOrders').checked=true;$('includeBM').checked=true;$('globalSource').checked=true;$('useReturn').checked=true;$('useFocus').checked=false;$('liquidity').checked=true;$('autoScan').checked=true;
  $('minProfit').value=5000;$('minRoi').value=5;$('riskBuffer').value=2;$('returnRate').value=24.8;$('stationFee').value=10;$('setupFee').value=2.5;$('salesTax').value=4;$('journalValue').value=0;$('minVolume').value=0;$('maxAge').value=12;$('quality').value=1;$('itemIds').value='';updateLabels();
}
function restoreCached(){try{const c=JSON.parse(localStorage.getItem('albionProfitRadarLastScan')||'null');if(c?.top?.length){state.rows=c.top;state.isDemo=false;render();$('lastScan').textContent=`cached ${humanAge((Date.now()-c.at)/36e5)} ago`;setStatus('Cached','idle')}}catch{}}

function openFilters(){ $('filterBackdrop').hidden=false; requestAnimationFrame(()=>$('filterSheet').classList.add('open')); }
function closeFilters(){ $('filterSheet').classList.remove('open'); setTimeout(()=>$('filterBackdrop').hidden=true,220); }
function scrollToId(id){ document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}); }
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function showInstall(){ if(isStandalone()){alert('Albion Radar is already running as a Home Screen app.');return} $('installSheet').hidden=false; }

/* ================= TRADE PLANS & LOG ================= */
const TRADE_KEY='albionProfitRadarTrades';
function loadTrades(){try{const t=JSON.parse(localStorage.getItem(TRADE_KEY)||'[]');return Array.isArray(t)?t:[]}catch{return[]}}
function saveTrades(){try{localStorage.setItem(TRADE_KEY,JSON.stringify(state.trades))}catch{}}
state.trades=loadTrades(); state.plan=null; state.doneTrade=null; state.filtered=[];

function openSheet(name){$(name+'Backdrop').hidden=false;requestAnimationFrame(()=>$(name+'Sheet').classList.add('open'))}
function closeSheet(name){$(name+'Sheet').classList.remove('open');setTimeout(()=>$(name+'Backdrop').hidden=true,220)}

/* Travel legs for the open plan: {from,to,kg,d,fee}. fee starts as an
   estimate (kg × distance × rate) and is editable per leg in the plan. */
function computeLegs(){
  const p=state.plan; if(!p) return [];
  const r=p.row, rate=travelRate(), legs=[];
  const add=(from,to,kg)=>{
    kg=Math.round(kg*10)/10; if(kg<=0) return;
    const d=cityDist(from,to); if(d<=0) return;
    legs.push({from,to,kg,d,fee:Math.round(kg*d*rate)});
  };
  /* Per-unit legs: planMath() is per-unit and the summary/log multiply by
     quantity, so legs must not bake the quantity in (that double-counted
     travel for qty > 1). */
  if(r.kind==='flip') add(r.from,r.to,itemWeightKg(r.id));
  else{
    for(const [city,ms] of matGroups()) add(city,r.from,ms.reduce((s,m)=>s+m.count*itemWeightKg(m.id),0));
    add(r.from,r.to,(r.amountCrafted||1)*itemWeightKg(r.id));
  }
  return legs;
}
function travelTotal(){ return (state.plan?.legs||[]).reduce((s,l)=>s+(+l.fee||0),0); }
/* Per-unit math that recomputes honestly when the user overrides prices. */
function planMath(){
  const p=state.plan,r=p.row,setup=+$('setupFee').value/100,travel=travelTotal();
  if(r.kind==='flip'){
    const buySetup=r.entryOrder?p.buy*setup:0, sellFees=feesForSale(p.sell,r.exitOrder), risk=riskCost(p.buy);
    const net=p.sell-p.buy-buySetup-sellFees-risk-travel, base=p.buy+buySetup+risk;
    return {cost:p.buy,fees:buySetup+sellFees+risk+travel,net,roi:base>0?net/base*100:0,matCost:p.buy,station:0,travel};
  }
  const matCost=p.mats.reduce((s,m)=>s+m.eff*m.price+(m.fee||0),0), station=r.stationUnit||0, journal=r.journalUnit||0;
  const buy=matCost+station, sellFees=feesForSale(p.sell,r.exitOrder), risk=riskCost(buy);
  const net=p.sell-sellFees-buy-risk+journal-travel;
  return {cost:buy,fees:sellFees+risk+travel,net,roi:(buy+risk)>0?net/(buy+risk)*100:0,matCost,station,travel};
}
function matGroups(){
  const g=new Map();
  for(const m of state.plan.mats){if(!g.has(m.city))g.set(m.city,[]);g.get(m.city).push(m)}
  return [...g.entries()];
}
function openPlan(r){
  state.plan={row:r,qty:1,sell:Math.round(r.sell),buy:Math.round(r.buy),mats:(r.mats||[]).map(m=>({...m,price:Math.round(m.price)}))};
  renderPlan(); openSheet('plan');
}
function planSummaryHtml(m){
  const q=state.plan.qty, in_=Math.round(m.cost*q), fees=Math.round(m.fees*q), out=Math.round(state.plan.sell*q), net=Math.round(m.net*q);
  return `<div class="ps-row"><span>Silver in (total cost)</span><b>−${money(in_)}</b></div>
  <div class="ps-row"><span>Fast travel</span><b>${m.travel>0?`−${money(Math.round(m.travel*q))}`:'—'}</b></div>
  <div class="ps-row"><span>Fees & tax</span><b>−${money(fees)}</b></div>
  <div class="ps-row"><span>Silver out (total sell)</span><b>+${money(out)}</b></div>
  <div class="ps-row ps-net"><span>Net profit</span><b class="${net>=0?'money-pos':'money-neg'}">${net>=0?'+':''}${money(net)} silver</b></div>
  <div class="ps-row"><span>Return on investment</span><b class="${m.roi>=0?'money-pos':'money-neg'}">${pct(m.roi)}</b></div>`;
}
function travelStepHtml(num){
  const p=state.plan, legs=p.legs||[];
  const body=legs.length?legs.map((l,i)=>`
    <div class="price-line travel-leg"><span>${escapeHtml(l.from)} → ${escapeHtml(l.to)}</span>
      <input type="number" inputmode="decimal" min="0" step="1" data-legkg="${i}" value="${l.kg}" aria-label="Cargo weight in kg"><span class="silver-tag">kg</span>
      <span class="mat-total">× ${l.d} dist ≈</span>
      <input type="number" inputmode="decimal" min="0" step="1" data-legfee="${i}" value="${l.fee}" aria-label="Travel fee in silver"><span class="silver-tag">silver</span>
    </div>`).join('')
    :`<div class="step-sub">No travel needed — everything happens in ${escapeHtml(p.row.from)}.</div>`;
  return `<div class="plan-step"><span class="step-num">${num}</span><div class="step-body"><b>Fast-travel — the NPC charges by cargo weight × distance:</b>${body}
    <div class="step-sub">Rate <input type="number" id="travelRate" class="rate-input" inputmode="decimal" min="0" step="1" value="${travelRate()}"> silver per kg per distance unit. Weights are estimates — set the fee from the NPC price once and the app remembers your rate.</div></div></div>`;
}
function renderPlan(){
  const p=state.plan; if(!p)return; p.legs=computeLegs(); const r=p.row,m=planMath();
  $('planTitle').textContent=`${r.name} ×${p.qty}`;
  $('planMeta').textContent=`${r.from} → ${r.to} · ${r.kind.toUpperCase()}`;
  let steps='';
  if(r.kind==='flip'){
    steps+=`<div class="plan-step"><span class="step-num">1</span><div class="step-body"><b>Go to ${escapeHtml(r.from)} market — ${r.entryOrder?'place a buy order':'buy now'}:</b>
      <div class="price-line"><span>${p.qty}× ${escapeHtml(r.name)} @</span><input type="number" id="planBuy" inputmode="decimal" min="0" value="${p.buy}"><span class="silver-tag">silver</span></div>
      <div class="step-sub">Total buy: <b id="planBuyTotal">${money(p.buy*p.qty)} silver</b></div></div></div>
    ${travelStepHtml(2)}`;
  }else{
    const groups=matGroups();
    steps+=`<div class="plan-step"><span class="step-num">1</span><div class="step-body"><b>Go to the market and ${r.entryOrder?'place buy orders':'buy'}:</b>`;
    for(const [city,ms] of groups){
      steps+=`<div class="mat-city">AT ${escapeHtml(city.toUpperCase())} MARKET${city==='Vendor'?' (VENDOR)':''}</div>`;
      for(const mt of ms) steps+=`<div class="price-line mat"><span>${mt.count*p.qty}× ${escapeHtml(mt.name)} @</span><input type="number" inputmode="decimal" min="0" data-mat="${escapeHtml(mt.id)}" value="${mt.price}"><span class="silver-tag">silver</span><span class="mat-total" data-mat-total="${escapeHtml(mt.id)}">= ${money(mt.eff*mt.price*p.qty)}</span></div>`;
    }
    steps+=`<div class="step-sub">Materials total: <b id="planMatTotal">${money(m.matCost*p.qty)} silver</b></div></div></div>`;
    steps+=travelStepHtml(2);
    steps+=`<div class="plan-step"><span class="step-num">3</span><div class="step-body"><b>Craft ${p.qty}× ${escapeHtml(r.name)} at ${escapeHtml(r.from)}.</b><div class="step-sub">Station cost ≈ <b>${money((r.stationUnit||0)*p.qty)} silver</b></div></div></div>`;
  }
  const sellStep=r.kind==='flip'?3:4;
  steps+=`<div class="plan-step"><span class="step-num">${sellStep}</span><div class="step-body"><b>Go to ${escapeHtml(r.to)} market — ${r.exitOrder?'set a sell order':'sell instantly'}:</b>
    <div class="price-line"><span>${p.qty}× @</span><input type="number" id="planSell" inputmode="decimal" min="0" value="${p.sell}"><span class="silver-tag">silver</span></div>
    <div class="step-sub">Total sell: <b id="planSellTotal">${money(p.sell*p.qty)} silver</b></div></div></div>`;
  $('planBody').innerHTML=`
    <div class="plan-qty-row"><label>Quantity <input type="number" id="planQty" inputmode="numeric" min="1" max="9999" value="${p.qty}"></label><span class="plan-live-hint">Edit any price — numbers update live.</span></div>
    <div class="plan-steps">${steps}</div>
    <div class="plan-summary" id="planSummary">${planSummaryHtml(m)}</div>`;
  bindPlanInputs();
}
function updatePlanNumbers(){
  const p=state.plan; if(!p)return; const m=planMath(),q=p.qty;
  const set=(id,txt)=>{const el=$(id);if(el)el.textContent=txt};
  set('planBuyTotal',`${money(p.buy*q)} silver`);
  set('planSellTotal',`${money(p.sell*q)} silver`);
  set('planMatTotal',`${money(m.matCost*q)} silver`);
  document.querySelectorAll('#planBody [data-mat-total]').forEach(el=>{const mt=p.mats.find(x=>x.id===el.dataset.matTotal);if(mt)el.textContent=`= ${money(mt.eff*mt.price*q)}`});
  $('planSummary').innerHTML=planSummaryHtml(m);
}
function bindPlanInputs(){
  $('planQty').addEventListener('change',e=>{state.plan.qty=Math.max(1,Math.round(+e.target.value||1));renderPlan()});
  const b=$('planBuy'); if(b)b.addEventListener('input',e=>{state.plan.buy=Math.max(0,+e.target.value||0);updatePlanNumbers()});
  $('planSell').addEventListener('input',e=>{state.plan.sell=Math.max(0,+e.target.value||0);updatePlanNumbers()});
  document.querySelectorAll('#planBody [data-mat]').forEach(inp=>inp.addEventListener('input',e=>{
    const mt=state.plan.mats.find(x=>x.id===inp.dataset.mat); if(mt)mt.price=Math.max(0,+e.target.value||0); updatePlanNumbers();
  }));
  document.querySelectorAll('#planBody [data-legkg]').forEach(inp=>inp.addEventListener('input',()=>{
    const l=state.plan.legs[+inp.dataset.legkg]; if(!l)return;
    l.kg=Math.max(0,+inp.value||0); l.fee=Math.round(l.kg*l.d*travelRate());
    const feeInp=document.querySelector(`#planBody [data-legfee="${inp.dataset.legkg}"]`); if(feeInp)feeInp.value=l.fee;
    updatePlanNumbers();
  }));
  document.querySelectorAll('#planBody [data-legfee]').forEach(inp=>inp.addEventListener('input',()=>{
    const l=state.plan.legs[+inp.dataset.legfee]; if(!l)return;
    l.fee=Math.max(0,Math.round(+inp.value||0)); updatePlanNumbers();
  }));
  const tr=$('travelRate');
  if(tr)tr.addEventListener('input',()=>{
    const v=Math.max(0,+tr.value||0); setTravelRate(v);
    state.plan.legs.forEach(l=>{l.fee=Math.round(l.kg*l.d*v)});
    document.querySelectorAll('#planBody [data-legfee]').forEach((inp,i)=>{inp.value=state.plan.legs[i].fee});
    updatePlanNumbers();
  });
}
function travelStepLine(){
  const p=state.plan, q=p?p.qty:1, legs=p?(p.legs||[]):[];
  return legs.length?`Fast-travel: ${legs.map(l=>`${l.from} → ${l.to} (${Math.round(l.kg*q*10)/10} kg, ${money(l.fee*q)} silver)`).join(' · ')}`:'No fast travel needed';
}
function planStepTexts(){
  const p=state.plan,r=p.row,m=planMath(),q=p.qty;
  if(r.kind==='flip')return[
    `At ${r.from} market — ${r.entryOrder?'place buy order':'buy'}: ${q}× ${r.name} @ ${money(p.buy)} = ${money(p.buy*q)} silver`,
    travelStepLine(),
    `At ${r.to} market — ${r.exitOrder?'place sell order':'instant sell'}: ${q}× @ ${money(p.sell)} = ${money(p.sell*q)} silver`
  ];
  const groups=matGroups();
  return[
    groups.map(([city,ms])=>`At ${city} market — ${r.entryOrder?'place buy order':'buy'}: ${ms.map(mt=>`${mt.count*q}× ${mt.name} @ ${money(mt.price)}`).join(', ')}`).join('  •  '),
    travelStepLine(),
    `Craft ${q}× ${r.name} at ${r.from} (station ≈ ${money((r.stationUnit||0)*q)} silver)`,
    `At ${r.to} market — ${r.exitOrder?'place sell order':'instant sell'}: ${q}× @ ${money(p.sell)} = ${money(p.sell*q)} silver`
  ];
}
function startTrade(){
  const p=state.plan; if(!p)return; const r=p.row,m=planMath(),q=p.qty;
  state.trades.unshift({id:'t'+Date.now(),at:Date.now(),name:r.name,itemId:r.id,kind:r.kind,from:r.from,to:r.to,qty:q,
    plan:{cost:Math.round(m.cost*q),fees:Math.round(m.fees*q),travel:Math.round(m.travel*q),revenue:Math.round(p.sell*q),net:Math.round(m.net*q),roi:m.roi,legs:(p.legs||[]).map(l=>({...l}))},
    steps:planStepTexts(),checked:[],status:'open',actual:null});
  saveTrades(); closeSheet('plan'); renderLog(); scrollToId('logSection');
}
/* ---- Trade log ---- */
function tradeCard(t){
  const d=new Date(t.at).toLocaleDateString([],{month:'short',day:'numeric'});
  const badge=t.status==='open'?'<span class="trade-badge open">IN PROGRESS</span>':'<span class="trade-badge done">LOGGED</span>';
  const planLine=`<div class="trade-nums"><div><span>Planned in</span><b>−${money(t.plan.cost)}</b></div><div><span>Planned out</span><b>+${money(t.plan.revenue)}</b></div><div><span>Planned net</span><b class="${t.plan.net>=0?'money-pos':'money-neg'}">${t.plan.net>=0?'+':''}${money(t.plan.net)}</b></div><div><span>Planned ROI</span><b>${pct(t.plan.roi)}</b></div></div>`;
  let extra='';
  if(t.status==='open'){
    extra=`<div class="trade-steps">${t.steps.map((s,i)=>`<label class="trade-step"><input type="checkbox" data-trade-check="${t.id}" data-step="${i}" ${t.checked.includes(i)?'checked':''}><span>${escapeHtml(s)}</span></label>`).join('')}</div>
    <div class="trade-actions"><button class="secondary small" data-trade-act="complete" data-trade="${t.id}">Complete & log result</button><button class="text-btn" data-trade-act="delete" data-trade="${t.id}">Delete</button></div>`;
  }else{
    const a=t.actual;
    extra=`<div class="trade-actual ${a.net>=0?'win':'loss'}"><div class="trade-nums"><div><span>Actually spent</span><b>−${money(a.cost)}</b></div><div><span>Actually received</span><b>+${money(a.revenue)}</b></div><div><span>Real P/L</span><b class="${a.net>=0?'money-pos':'money-neg'}">${a.net>=0?'+':''}${money(a.net)}</b></div><div><span>Real ROI</span><b>${pct(a.roi)}</b></div></div><span class="trade-badge ${a.net>=0?'win':'loss'}">${a.net>=0?'WIN':'LOSS'}</span></div>`;
  }
  return `<article class="trade-card"><div class="trade-head"><div><strong>${escapeHtml(t.name)} ×${t.qty}</strong><div class="trade-route">${escapeHtml(t.from)} → ${escapeHtml(t.to)} · ${escapeHtml(t.kind)} · ${d}</div></div>${badge}</div>${planLine}${extra}</article>`;
}
function renderLog(){
  const done=state.trades.filter(t=>t.status==='done');
  const net=done.reduce((s,t)=>s+t.actual.net,0), wins=done.filter(t=>t.actual.net>=0).length, open=state.trades.length-done.length;
  $('logSummary').innerHTML=`
    <div class="log-stat"><span>Logged P/L</span><strong class="${net>=0?'money-pos':'money-neg'}">${net>=0?'+':''}${money(net)}</strong><small>silver · completed</small></div>
    <div class="log-stat"><span>Win rate</span><strong>${done.length?Math.round(100*wins/done.length):0}%</strong><small>${wins}/${done.length} winning</small></div>
    <div class="log-stat"><span>Open trades</span><strong>${open}</strong><small>${state.trades.length} total logged</small></div>`;
  $('tradeList').innerHTML=state.trades.length?state.trades.map(tradeCard).join(''):`<div class="empty-state"><strong>No trades logged yet</strong><span>Tap “Plan →” on any opportunity, then “Start trade”.</span></div>`;
}
function openDone(id){
  const t=state.trades.find(x=>x.id===id); if(!t)return; state.doneTrade=t;
  $('doneTitle').textContent=`${t.name} ×${t.qty}`;
  $('doneCost').value=t.plan.cost; $('doneRevenue').value=t.plan.revenue;
  updateDonePreview(); openSheet('done');
}
function updateDonePreview(){
  const c=Math.max(0,+$('doneCost').value||0), r=Math.max(0,+$('doneRevenue').value||0), net=r-c, roi=c>0?net/c*100:0;
  $('donePreview').innerHTML=`<div><span>Silver spent</span><b>−${money(c)}</b></div><div><span>Silver received</span><b>+${money(r)}</b></div><div><span>Real P/L</span><b class="${net>=0?'money-pos':'money-neg'}">${net>=0?'+':''}${money(net)} silver</b></div><div><span>Real ROI</span><b>${pct(roi)}</b></div>`;
}
function saveDone(){
  const t=state.doneTrade; if(!t)return;
  const c=Math.round(Math.max(0,+$('doneCost').value||0)), r=Math.round(Math.max(0,+$('doneRevenue').value||0)), net=r-c;
  t.actual={cost:c,revenue:r,net,roi:c>0?net/c*100:0}; t.status='done'; t.doneAt=Date.now();
  saveTrades(); closeSheet('done'); renderLog();
}

/* ---- Wiring ---- */
$('resultsSection').addEventListener('click',e=>{
  const b=e.target.closest('[data-plan]');
  if(b&&state.filtered){const r=state.filtered[+b.dataset.plan];if(r)openPlan(r)}
});
$('logSection').addEventListener('change',e=>{
  const c=e.target.closest('[data-trade-check]'); if(!c)return;
  const t=state.trades.find(x=>x.id===c.dataset.tradeCheck); if(!t)return;
  const i=+c.dataset.step, at=t.checked.indexOf(i);
  if(at>=0)t.checked.splice(at,1);else t.checked.push(i);
  saveTrades();
});
$('logSection').addEventListener('click',e=>{
  const a=e.target.closest('[data-trade-act]'); if(!a)return;
  if(a.dataset.tradeAct==='delete'){state.trades=state.trades.filter(t=>t.id!==a.dataset.trade);saveTrades();renderLog()}
  if(a.dataset.tradeAct==='complete')openDone(a.dataset.trade);
});
$('planClose').addEventListener('click',()=>closeSheet('plan'));
$('planBackdrop').addEventListener('click',()=>closeSheet('plan'));
$('startTradeBtn').addEventListener('click',startTrade);
$('doneClose').addEventListener('click',()=>closeSheet('done'));
$('doneBackdrop').addEventListener('click',()=>closeSheet('done'));
$('doneCost').addEventListener('input',updateDonePreview);
$('doneRevenue').addEventListener('input',updateDonePreview);
$('saveDoneBtn').addEventListener('click',saveDone);
$('navLog').addEventListener('click',()=>scrollToId('logSection'));
$('clearLogBtn').addEventListener('click',()=>{if(confirm('Delete all logged trades?')){state.trades=[];saveTrades();renderLog()}});

/* ================= INIT ================= */
buildCities();updateLabels();setMode('flip');renderLog();loadRecipes().then(()=>{ if(new URLSearchParams(location.search).get('demo')==='1') runDemo(); else restoreCached(); });
setInterval(()=>{if($('autoScan').checked&&!document.hidden&&!state.isDemo)scan()},30*60*1000);
$('modeTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-mode]');if(b){setMode(b.dataset.mode); if(state.isDemo)runDemo();}});
$('premium').addEventListener('change',syncTax);$('useFocus').addEventListener('change',syncFocus);
['minProfit','minRoi','riskBuffer','returnRate','stationFee'].forEach(id=>$(id).addEventListener('input',updateLabels));
$('refreshBtn').addEventListener('click',scan);$('navScan').addEventListener('click',scan);$('demoBtn').addEventListener('click',runDemo);$('resetBtn').addEventListener('click',reset);$('searchResults').addEventListener('input',render);$('exportBtn').addEventListener('click',exportCsv);
$('allCitiesBtn').addEventListener('click',()=>document.querySelectorAll('[data-city]').forEach(x=>x.checked=true));
$('navFilters').addEventListener('click',openFilters);$('filterClose').addEventListener('click',closeFilters);$('filterBackdrop').addEventListener('click',closeFilters);$('applyFilters').addEventListener('click',()=>{closeFilters();scan()});
$('navTop').addEventListener('click',()=>scrollToId('topSection'));$('navResults').addEventListener('click',()=>scrollToId('resultsSection'));
$('installBtn').addEventListener('click',showInstall);$('installClose').addEventListener('click',()=>$('installSheet').hidden=true);$('installDone').addEventListener('click',()=>$('installSheet').hidden=true);$('installSheet').addEventListener('click',e=>{if(e.target===$('installSheet'))$('installSheet').hidden=true});
if(isStandalone())document.documentElement.classList.add('standalone');
if('serviceWorker'in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
