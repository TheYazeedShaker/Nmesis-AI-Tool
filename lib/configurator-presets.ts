'use client';
import {useEffect,useRef,useState} from 'react';
import {CONFIGURATORS,DEMO_CONFIGURATOR,type Configurator} from '@/lib/configurators';
// Loads the deployment's configurator presets once per page load. Signed out, or if
// the request fails, pages keep the synthetic demo preset.
let pending:Promise<Configurator[]>|undefined;
function valid(item:unknown):item is Configurator{const c=item as Configurator;return !!c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.url==='string'&&c.url.startsWith('https://')}
export function loadConfiguratorPresets(){
 return pending??=fetch('/api/configurators',{credentials:'same-origin',cache:'no-store'})
  .then(async r=>{if(!r.ok)throw new Error('Configurator presets unavailable');const d=await r.json() as {configurators?:unknown};const list=Array.isArray(d.configurators)?d.configurators.filter(valid):[];return list.length?list:CONFIGURATORS})
  .catch(()=>{pending=undefined;return CONFIGURATORS});
}
// True while a page still shows the placeholder rather than a chosen configurator.
export const isDemoConfigurator=(c:{id?:string;url?:string}|undefined)=>!!c&&(c.id===DEMO_CONFIGURATOR.id||c.url===DEMO_CONFIGURATOR.url);
// Presets first, then the browser's own saved configurators; the placeholder goes once presets exist.
export const mergePresets=(presets:Configurator[])=>(items:Configurator[])=>[...presets,...items.filter(x=>!isDemoConfigurator(x)&&!presets.some(p=>p.url===x.url))];
// `onLoad` runs once the presets arrive, so pages can move off the placeholder.
export function useConfiguratorPresets(onLoad?:(presets:Configurator[])=>void){
 const [presets,setPresets]=useState<Configurator[]>(CONFIGURATORS);const callback=useRef(onLoad);
 useEffect(()=>{callback.current=onLoad});
 useEffect(()=>{let live=true;void loadConfiguratorPresets().then(list=>{if(!live)return;setPresets(list);callback.current?.(list)});return()=>{live=false}},[]);
 return presets;
}
