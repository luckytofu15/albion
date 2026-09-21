import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)), ROOT=path.dirname(HERE), OUT=path.join(ROOT,'data','recipes.json');
const RAW='https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json';
const FORMATTED='https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json';
const REFINE_CITY={METALBAR:'Thetford',LEATHER:'Martlock',CLOTH:'Lymhurst',PLANKS:'Fort Sterling',STONEBLOCK:'Bridgewatch'};
const SUBCAT_TO_CITY={sword:'Lymhurst',bow:'Lymhurst',arcanestaff:'Lymhurst',axe:'Martlock',quarterstaff:'Martlock',froststaff:'Martlock',mace:'Thetford',firestaff:'Thetford',naturestaff:'Thetford',hammer:'Fort Sterling',spear:'Fort Sterling',holystaff:'Fort Sterling',crossbow:'Bridgewatch',dagger:'Bridgewatch',cursestaff:'Bridgewatch',knuckles:'Caerleon',shapeshifterstaff:'Caerleon',cloth_armor:'Fort Sterling',plate_helmet:'Fort Sterling',leather_helmet:'Lymhurst',leather_shoes:'Lymhurst',plate_armor:'Bridgewatch',cloth_shoes:'Bridgewatch',leather_armor:'Thetford',cloth_helmet:'Thetford',plate_shoes:'Martlock'};
const CATEGORY_TO_CITY={offhands:'Martlock',bags:'Brecilien',capes:'Brecilien',gathering:'Caerleon'};

console.log('Downloading current ao-bin-dumps item data…');
const [rawR,fmtR]=await Promise.all([fetch(RAW),fetch(FORMATTED)]); if(!rawR.ok)throw new Error(`raw dump ${rawR.status}`);
const raw=await rawR.json(); const formatted=fmtR.ok?await fmtR.json():[];
const names=new Map(); const formattedArr=Array.isArray(formatted)?formatted:(formatted.items||[]);
for(const it of formattedArr){const id=it.UniqueName||it.uniqueName||it['@uniquename']; const loc=it.LocalizedNames||it.localizedNames||{}; if(id)names.set(id,loc['EN-US']||loc['en-US']||it.Name||id)}
const recipes={};
function walk(v){if(!v)return;if(Array.isArray(v)){for(const x of v)walk(x);return}if(typeof v!=='object')return;if(v['@uniquename']&&v.craftingrequirements) addItem(v); for(const x of Object.values(v)) if(x&&typeof x==='object') walk(x)}
function priceId(r){const id=r['@uniquename'];const e=r['@enchantmentlevel'];return e&&e!=='0'&&!id.includes('@')?`${id}@${e}`:id}
function mats(cr){let a=cr?.craftresource;if(!a)return[];if(!Array.isArray(a))a=[a];return a.filter(x=>x?.['@uniquename']).map(x=>({id:priceId(x),name:names.get(priceId(x))||names.get(x['@uniquename'])||x['@uniquename'],count:+x['@count']||0,returnable:x['@maxreturnamount']!=='0',vendorPrice:+x['@silver']||0}))}
function refineType(id){const m=id.match(/^T\d_(METALBAR|LEATHER|CLOTH|PLANKS|STONEBLOCK)(?:_LEVEL\d+)?(?:@\d+)?$/);return m?.[1]||null}
function inferKind(id){return refineType(id)?'refine':'craft'}
function city(it,id){const rt=refineType(id);if(rt)return REFINE_CITY[rt]; return CATEGORY_TO_CITY[it['@shopcategory']]||SUBCAT_TO_CITY[it['@shopsubcategory1']]||null}
function addEntry(id,it,cr){const materials=mats(cr);if(!materials.length)return;const kind=inferKind(id);recipes[id]={name:names.get(id)||names.get(it['@uniquename'])||id.replace(/^T\d_/,'').replaceAll('_',' '),kind,city:city(it,id),itemValue:+it['@itemvalue']||+cr?.['@itemvalue']||0,amountCrafted:+cr?.['@amountcrafted']||1,silverCost:+cr?.['@silver']||0,materials}}
function addItem(it){if(it['@showinmarketplace']==='false')return;const id=it['@uniquename'];let cr=it.craftingrequirements;if(Array.isArray(cr))cr=cr[0];addEntry(id,it,cr);let e=it.enchantments?.enchantment;if(!e)return;if(!Array.isArray(e))e=[e];for(const lv of e){let ec=lv.craftingrequirements;if(Array.isArray(ec))ec=ec[0];if(ec&&lv['@enchantmentlevel'])addEntry(`${id}@${lv['@enchantmentlevel']}`,it,ec)}}
walk(raw.items||raw);
const payload={meta:{generated:new Date().toISOString(),source:'ao-data/ao-bin-dumps',count:Object.keys(recipes).length},items:recipes};
await fs.writeFile(OUT,JSON.stringify(payload)); console.log(`Wrote ${Object.keys(recipes).length} recipes to ${OUT}`);
