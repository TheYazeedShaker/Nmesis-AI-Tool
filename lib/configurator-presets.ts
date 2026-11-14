'use client';
import {useEffect,useRef,useState} from 'react';
import {CONFIGURATORS,DEMO_CONFIGURATOR,type Configurator} from '@/lib/configurators';
// Loads the signed-in company's configurators once per page load. Signed out, or if
// the request fails, pages keep the synthetic demo preset.
let pending:Promise<Configurator[]>|undefined;
function valid(item:unknown):item is Configurator{const c=item as Configurator;return !!c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.url==='string'&&c.url.startsWith('https://')&&(c.template===undefined||c.template==='capture'||c.template==='choose-view')}
export function loadConfiguratorPresets(){
 return pending??=fetch('/api/configurators',{credentials:'same-origin',cache:'no-store'})
  .then(async r=>{if(!r.ok)throw new Error('Configurator presets unavailable');const d=await r.json() as {configurators?:unknown};const list=Array.isArray(d.configurators)?d.configurators.filter(valid):[];return list.length?list:CONFIGURATORS})
  .catch(()=>{pending=undefined;return CONFIGURATORS});
}
// True while a page still shows the placeholder rather than a chosen configurator.
export const isDemoConfigurator=(c:{id?:string;url?:string}|undefined)=>!!c&&(c.id===DEMO_CONFIGURATOR.id||c.url===DEMO_CONFIGURATOR.url);
// Only the company's configurators: clients cannot add their own.
export const mergePresets=(presets:Configurator[])=>(items:Configurator[])=>presets.length?presets:items;
// `onLoad` runs once the presets arrive, so pages can move off the placeholder.
export function useConfiguratorPresets(onLoad?:(presets:Configurator[])=>void){
 const [presets,setPresets]=useState<Configurator[]>(CONFIGURATORS);const callback=useRef(onLoad);
 useEffect(()=>{callback.current=onLoad});
 useEffect(()=>{let live=true;void loadConfiguratorPresets().then(list=>{if(!live)return;setPresets(list);callback.current?.(list)});return()=>{live=false}},[]);
 return presets;
}
