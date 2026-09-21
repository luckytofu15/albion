const CITIES = ["Bridgewatch","Fort Sterling","Lymhurst","Martlock","Thetford","Caerleon","Brecilien","Black Market"];
const HOSTS = {
  west:"https://west.albion-online-data.com",
  east:"https://east.albion-online-data.com",
  europe:"https://europe.albion-online-data.com"
};
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
        out.push({id,name,kind:'flip',from,to,buy:acquisition,sell:dst.price,fees:buySetup+sellFees+risk,profit,roi,age:Math.max(src.age,dst.age),volume:null,score:0,detail:`${$('buyOrders').checked?'Buy order':'Instant buy'} → ${dst.order?'Sell order':'Instant sell'}`});
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
    let matCost=0,maxMatAge=0,sourceNames=[],valid=true;
    for(const mat of recipe.materials){
      let src;
      if($('globalSource').checked) src=cheapestMaterial(mat,map,cities,maxAge);
      else{ const q=sourceQuote(map.get(`${mat.id}|${craftCity}`)); src=q?{...q,city:craftCity}:null; if(mat.vendorPrice>0&&(!src||mat.vendorPrice<src.price))src={price:mat.vendorPrice,date:new Date().toISOString(),age:0,city:'Vendor'}; }
      if(!src||src.age>maxAge){valid=false;break}
      const effectiveCount=mat.count*(mat.returnable===false?1:(1-rrr)), base=src.price*effectiveCount;
      matCost+=base+($('buyOrders').checked?base*(+$('setupFee').value/100):0); maxMatAge=Math.max(maxMatAge,src.age); sourceNames.push(src.city);
    }
    if(!valid)continue;
    const amount=recipe.amountCrafted||1, station=((recipe.itemValue||0)*0.1125*stationRate)+(recipe.silverCost||0), totalCost=(matCost+station)/amount;
    for(const to of cities){
      const dst=exitQuote(map.get(`${id}|${to}`),to); if(!dst||dst.age>maxAge)continue;
      const sellFees=feesForSale(dst.price,dst.order),risk=riskCost(totalCost),profit=dst.price-sellFees-totalCost-risk+journal,roi=totalCost>0?profit/(totalCost+risk)*100:0,unique=[...new Set(sourceNames)];
      out.push({id,name:recipe.name||id,kind:recipe.kind||state.mode,from:craftCity,to,buy:totalCost,sell:dst.price,fees:sellFees+station+risk,profit,roi,age:Math.max(maxMatAge,dst.age),volume:null,score:0,detail:`${unique.length>1?'Global mats':unique[0]||craftCity} → ${craftCity} ${state.mode} → ${to}`});
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
      {id:'T6_BAG',name:"Master's Bag",from:'Martlock',to:'Black Market',buy:28600,sell:39200,fees:3584,profit:7016,roi:24.0,age:now,volume:44,detail:'Demo: instant buy → Black Market'},
      {id:'T5_MAIN_AXE',name:"Expert's Battleaxe",from:'Thetford',to:'Caerleon',buy:17800,sell:24850,fees:2065,profit:4985,roi:27.4,age:1.4,volume:31,detail:'Demo: city flip'},
      {id:'T4_BAG',name:"Adept's Bag",from:'Bridgewatch',to:'Lymhurst',buy:6400,sell:8840,fees:768,profit:1672,roi:25.6,age:2.1,volume:126,detail:'Demo: fast-volume flip'},
      {id:'T7_LEATHER',name:"Grandmaster's Leather",from:'Martlock',to:'Caerleon',buy:7350,sell:9720,fees:861,profit:1509,roi:20.1,age:3.2,volume:212,detail:'Demo: refined resource spread'}
    ],
    craft:[
      {id:'T6_BAG',name:"Master's Bag",from:'Bridgewatch',to:'Black Market',buy:31500,sell:47200,fees:4770,profit:10930,roi:33.9,age:.8,volume:38,detail:'Demo: global mats → craft → Black Market'},
      {id:'T5_MAIN_AXE',name:"Expert's Battleaxe",from:'Thetford',to:'Caerleon',buy:19200,sell:28600,fees:2700,profit:6700,roi:34.1,age:1.6,volume:27,detail:'Demo: Thetford craft → Caerleon'},
      {id:'T4_BAG',name:"Adept's Bag",from:'Bridgewatch',to:'Bridgewatch',buy:6550,sell:9050,fees:804,profit:1696,roi:25.4,age:2.6,volume:109,detail:'Demo: local craft & sell'}
    ],
    refine:[
      {id:'T6_LEATHER',name:"Master's Leather",from:'Martlock',to:'Caerleon',buy:4200,sell:6280,fees:596,profit:1484,roi:34.6,age:.6,volume:318,detail:'Demo: Martlock refine → Caerleon'},
      {id:'T5_METALBAR',name:"Expert's Metal Bar",from:'Thetford',to:'Bridgewatch',buy:2050,sell:2940,fees:282,profit:608,roi:29.1,age:1.1,volume:512,detail:'Demo: Thetford refine → Bridgewatch'},
      {id:'T4_CLOTH',name:"Adept's Cloth",from:'Lymhurst',to:'Caerleon',buy:720,sell:1010,fees:99,profit:191,roi:25.9,age:2.4,volume:880,detail:'Demo: Lymhurst refine → Caerleon'}
    ]
  };
  return sets[state.mode].map(x=>({...x,kind:state.mode,score:0}));
}

function render(){
  const q=$('searchResults').value.trim().toLowerCase(), rows=state.rows.filter(r=>!q||`${r.name} ${r.id} ${r.from} ${r.to}`.toLowerCase().includes(q));
  $('resultsBody').innerHTML=rows.map(r=>`<tr><td><span class="score-pill">${r.score}</span></td><td><strong>${escapeHtml(r.name)}</strong><br><span class="tag">${escapeHtml(r.id)}</span></td><td><strong>${escapeHtml(r.from)}</strong> → <strong>${escapeHtml(r.to)}</strong><br><span class="tag">${escapeHtml(r.detail)}</span></td><td>${money(r.buy)}</td><td>${money(r.sell)}</td><td>${money(r.fees)}</td><td class="${r.profit>=0?'money-pos':'money-neg'}">${money(r.profit)}</td><td>${pct(r.roi)}</td><td>${r.volume==null?'—':fmt.format(Math.round(r.volume))}/d</td><td class="${r.age<=12?'fresh':'stale'}">${humanAge(r.age)}</td></tr>`).join('');
  $('mobileResults').innerHTML=rows.map(r=>`<article class="result-card"><div class="result-top"><div class="score-box">${r.score}</div><div class="result-title"><strong>${escapeHtml(r.name)}</strong><span>${escapeHtml(r.from)} → ${escapeHtml(r.to)} · ${escapeHtml(r.detail)}</span></div><div class="profit-box"><strong>+${money(Math.max(0,r.profit))}</strong><span>${pct(r.roi)} ROI</span></div></div><div class="result-metrics"><div><b>${money(r.buy)}</b><span>Cost</span></div><div><b>${money(r.sell)}</b><span>Sell</span></div><div><b>${r.volume==null?'—':fmt.format(Math.round(r.volume))}</b><span>Vol/day</span></div><div><b>${humanAge(r.age)}</b><span>Age</span></div></div></article>`).join('');

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

buildCities();updateLabels();setMode('flip');loadRecipes().then(()=>{ if(new URLSearchParams(location.search).get('demo')==='1') runDemo(); else restoreCached(); });
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
