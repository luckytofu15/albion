import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=process.env.PORT||4173;
const HOSTS={west:'https://west.albion-online-data.com',east:'https://east.albion-online-data.com',europe:'https://europe.albion-online-data.com'};
const cache=new Map(); const TTL=180_000;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};

const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));};
async function cachedFetch(url){
  const c=cache.get(url); if(c&&Date.now()-c.at<TTL) return c.data;
  const r=await fetch(url,{headers:{'accept':'application/json','accept-encoding':'gzip','user-agent':'AlbionProfitRadar/1.0'}});
  if(!r.ok) throw new Error(`Upstream ${r.status}`); const data=await r.json(); cache.set(url,{at:Date.now(),data}); return data;
}
function chunksByUrl(items,base,locations,quality,max=3900){
  const chunks=[];let cur=[];
  for(const id of items){
    const test=[...cur,id]; const u=`${base}${test.join(',')}.json?locations=${encodeURIComponent(locations)}&qualities=${quality}`;
    if(u.length>max&&cur.length){chunks.push(cur);cur=[id]}else cur=test;
  }
  if(cur.length)chunks.push(cur); return chunks;
}
async function pricesApi(reqUrl,res){
  const server=reqUrl.searchParams.get('server')||'west', host=HOSTS[server]; if(!host)return json(res,400,{error:'invalid server'});
  const items=(reqUrl.searchParams.get('items')||'').split(',').filter(Boolean), locations=reqUrl.searchParams.get('locations')||'', quality=reqUrl.searchParams.get('quality')||'1';
  if(!items.length||!locations)return json(res,400,{error:'items and locations required'});
  const base=`${host}/api/v2/stats/prices/`, chunks=chunksByUrl(items,base,locations,quality);
  const all=(await Promise.all(chunks.map(ids=>cachedFetch(`${base}${ids.join(',')}.json?locations=${encodeURIComponent(locations)}&qualities=${quality}`)))).flat();
  return json(res,200,all);
}
async function historyApi(reqUrl,res){
  const server=reqUrl.searchParams.get('server')||'west',host=HOSTS[server];if(!host)return json(res,400,{error:'invalid server'});
  const items=(reqUrl.searchParams.get('items')||'').split(',').filter(Boolean),locations=reqUrl.searchParams.get('locations')||'',quality=reqUrl.searchParams.get('quality')||'1',days=+(reqUrl.searchParams.get('days')||7);
  if(!items.length||!locations)return json(res,400,{error:'items and locations required'});
  const end=new Date(),start=new Date(Date.now()-days*864e5),fmt=d=>d.toISOString().slice(0,10),base=`${host}/api/v2/stats/history/`;
  const chunks=chunksByUrl(items,base,locations,quality,3600);
  const all=(await Promise.all(chunks.map(ids=>cachedFetch(`${base}${ids.join(',')}.json?date=${fmt(start)}&end_date=${fmt(end)}&locations=${encodeURIComponent(locations)}&qualities=${quality}&time-scale=24`)))).flat();
  return json(res,200,all);
}
async function recipesApi(res){
  let file=path.join(ROOT,'data','recipes.json');
  try{await fs.access(file)}catch{file=path.join(ROOT,'data','recipes.demo.json')}
  try{const data=await fs.readFile(file,'utf8');res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300'});res.end(data)}catch(e){json(res,500,{error:e.message})}
}
async function staticFile(p,res){
  let rel=decodeURIComponent(p); if(rel==='/')rel='/index.html';
  const file=path.normalize(path.join(ROOT,rel)); if(!file.startsWith(ROOT))return json(res,403,{error:'forbidden'});
  try{const data=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(data)}catch{res.writeHead(404);res.end('Not found')}
}

http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host}`);
  try{
    if(u.pathname==='/api/prices')return await pricesApi(u,res);
    if(u.pathname==='/api/history')return await historyApi(u,res);
    if(u.pathname==='/api/recipes')return await recipesApi(res);
    if(u.pathname==='/api/status')return json(res,200,{ok:true,cacheEntries:cache.size});
    return await staticFile(u.pathname,res);
  }catch(e){return json(res,502,{error:e.message||String(e)})}
}).listen(PORT,()=>console.log(`Albion Profit Radar: http://localhost:${PORT}`));
