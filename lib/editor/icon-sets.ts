// The editor's icon sets (the Icons panel, components/canvas/icons-panel.tsx):
// open sets whose licences allow commercial use without attribution (MIT,
// Apache 2.0, ISC), shipped with the Studio in public/icons/ and listed in
// ./icon-sets.json, both built by scripts/icons/build-icons.mjs (docs/icons.md).
// A set's file is read from the Studio's own address only when its category
// opens; nothing asks an icon service. Plain module: the panel and the tests share it.
import SETS from './icon-sets.json';
import {iconGridOk,ICON_PATH_MAX,ICON_PATHS_MAX} from './doc';
import {searchIcons} from './icons';

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

/** What the panel shows for a search: every icon in the set's order with no words, else the best matches first. */
export function iconsFor(set:LoadedIconSet,query:string):SetIcon[]{
 if(!query.trim())return set.icons;
 return searchIcons(set.icons.map(i=>i.name),query,Infinity).names.flatMap(n=>{const i=set.byName.get(n);return i?[i]:[]});
}
