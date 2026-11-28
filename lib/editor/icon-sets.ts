// The editor's icon sets (the Icons panel, components/canvas/icons-panel.tsx):
// open sets whose licences allow commercial use without attribution (MIT,
// Apache 2.0, ISC), shipped with the Studio in public/icons/ and listed in
// ./icon-sets.json, both built by scripts/icons/build-icons.mjs (docs/icons.md).
// A set's file is read from the Studio's own address only when its category
// opens; nothing asks an icon service. Plain module: the panel and the tests share it.
import SETS from './icon-sets.json';
import {iconGridOk,ICON_PATH_MAX,ICON_PATHS_MAX} from './doc';

export type IconSetInfo={id:string;label:string;style:string;licence:string;spdx:string;count:number;grid:number;file:string;licenceFile:string};
export const ICON_SETS:readonly IconSetInfo[]=SETS as IconSetInfo[];
export const iconSet=(id:unknown)=>ICON_SETS.find(s=>s.id===id)??null;

export type SetIcon={name:string;fill:boolean;paths:string[]};
export type LoadedIconSet={id:string;grid:number;icons:SetIcon[];byName:Map<string,SetIcon>};

const NAME=/^[a-z0-9-]{1,60}$/,PATH_DATA=/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;
/** A set's file as the panel uses it, keeping only icons in the shape the build writes; null when it isn't that set's file. */
export function readIconSet(raw:unknown,info:Pick<IconSetInfo,'id'|'grid'>):LoadedIconSet|null{
 const r=raw as {id?:unknown;grid?:unknown;icons?:unknown};
 if(!r||typeof r!=='object'||r.id!==info.id||r.grid!==info.grid||!iconGridOk(r.grid)||!Array.isArray(r.icons))return null;
 const icons:SetIcon[]=[];
 for(const item of r.icons){
  if(!Array.isArray(item)||item.length!==3)continue;
  const [name,fill,paths]=item as [unknown,unknown,unknown];
  if(typeof name!=='string'||!NAME.test(name)||(fill!==0&&fill!==1)||!Array.isArray(paths)||!paths.length||paths.length>ICON_PATHS_MAX)continue;
  if(!paths.every(d=>typeof d==='string'&&d.length<=ICON_PATH_MAX&&PATH_DATA.test(d)))continue;
  icons.push({name,fill:fill===1,paths:paths as string[]});
 }
 return {id:info.id,grid:r.grid,icons,byName:new Map(icons.map(i=>[i.name,i]))};
}


// ── One search across every set (the Icons panel's search box) ──
// public/icons/index.json: each set's names in its own order, and each icon's tags (its other names, its
// category, the Studio's plain words): no drawings, loaded the first time someone searches. A result's
// drawing is in its set's chunk of ICON_CHUNK icons (public/icons/<set>/<n>.json), loaded when it scrolls
// into view. All from the Studio's own address (scripts/icons/build-icons.mjs).
export const ICON_INDEX_FILE='/icons/index.json';
export type IconIndex={chunk:number;sets:{id:string;names:string[];tags:Record<string,string>}[]};
export type IconHit={set:string;name:string;/** Its place in its set (its chunk is place / chunk). */at:number};

/** The index as the panel uses it, keeping only the sets this Studio lists and names in their shape; null when it isn't one. */
export function readIconIndex(raw:unknown):IconIndex|null{
 const r=raw as IconIndex;
 if(!r||typeof r!=='object'||!Number.isInteger(r.chunk)||r.chunk<1||!Array.isArray(r.sets))return null;
 const sets=r.sets.filter(s=>!!s&&iconSet(s.id)!==null&&Array.isArray(s.names)&&s.names.every(n=>typeof n==='string'&&NAME.test(n)))
  .map(s=>({id:s.id,names:s.names,tags:s.tags&&typeof s.tags==='object'&&!Array.isArray(s.tags)?s.tags:{}}));
 return {chunk:r.chunk,sets};
}

const wordsOf=(text:string)=>text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g,' ').split(/[\s-]+/).filter(Boolean);
/**
 * Every set's icons whose name or tags match what was typed, as one list: an exact name first (in the
 * sets' order), then by how well each word matches (a name's word beats a tag's; whole beats a start beats
 * anywhere), then shorter names. Each hit says its set, so the panel can label it.
 */
export function searchAllSets(index:IconIndex,query:string):IconHit[]{
 const words=wordsOf(query);if(!words.length)return [];
 const exact=words.join('-'),scored:{hit:IconHit;score:number}[]=[];
 const order=new Map(ICON_SETS.map((s,i)=>[s.id,i]));
 for(const set of index.sets)set.names.forEach((name,at)=>{
  const own=name.split('-'),tags=(set.tags[name]||'').split(' ').filter(Boolean);
  let score=0;
  for(const w of words){
   const inName=own.reduce((s,h)=>Math.max(s,h===w?6:h.startsWith(w)?4:h.includes(w)?1:0),0);
   const inTags=tags.reduce((s,h)=>Math.max(s,h===w?3:h.startsWith(w)?2:0),0);
   const best=Math.max(inName,inTags);
   if(!best){score=0;return}
   score+=best;
  }
  scored.push({hit:{set:set.id,name,at},score:(name===exact?1e6:0)+score*100-name.length});
 });
 scored.sort((a,b)=>b.score-a.score||(order.get(a.hit.set)??0)-(order.get(b.hit.set)??0)||a.hit.name.localeCompare(b.hit.name));
 return scored.map(s=>s.hit);
}

/** A chunk of a set's drawings, in the build's shape; icons that aren't are left out (an empty list: not a chunk). */
export function readIconChunk(raw:unknown):SetIcon[]{
 if(!Array.isArray(raw))return [];
 return readIconSet({id:'chunk',grid:24,icons:raw},{id:'chunk',grid:24})?.icons??[];
}
