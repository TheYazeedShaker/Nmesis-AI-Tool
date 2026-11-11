export type Configurator={id:string;name:string;url:string};
// Preset configurators are deployment data, not source: real vehicle names and
// hosted configurator URLs stay out of the (public) repository and out of the
// browser bundle. Set CONFIGURATOR_PRESETS (server-only) in Vercel to a JSON array
// of {"id","name","url"} objects (see .env.example); signed-in pages load them from
// /api/configurators (useConfiguratorPresets). Invalid entries are skipped; with no
// valid entries the synthetic demo preset keeps every page usable.
export const DEMO_CONFIGURATOR:Configurator={id:'demo',name:'Demo vehicle',url:'https://configurator.example.com/demo/'};
export function parseConfiguratorPresets(raw:string|undefined):Configurator[]{
 if(!raw)return[];
 let data:unknown;
 try{data=JSON.parse(raw)}catch{return[]}
 if(!Array.isArray(data))return[];
 const out:Configurator[]=[];
 for(const item of data.slice(0,50)){
  if(!item||typeof item!=='object')continue;
  const {id,name,url}=item as Record<string,unknown>;
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(id)||typeof name!=='string'||!name.trim()||name.length>100||typeof url!=='string')continue;
  try{out.push({id,name:name.trim(),url:normalizeConfiguratorUrl(url)})}catch{continue}
 }
 return out;
}
// What every page shows until the signed-in presets arrive (and when there are none).
export const CONFIGURATORS:Configurator[]=[DEMO_CONFIGURATOR];
// Server only: the presets this deployment offers. PR S2 narrows them to the signed-in client.
export function configuratorPresets(raw=process.env.CONFIGURATOR_PRESETS):Configurator[]{const presets=parseConfiguratorPresets(raw);return presets.length?presets:CONFIGURATORS}
export function normalizeConfiguratorUrl(value:string){
 const u=new URL(value.trim());
 if(u.protocol!=='https:'||u.username||u.password)throw new Error('Use an HTTPS configurator page link without a username or password.');
 if(/\.json$/i.test(u.pathname))throw new Error('Use the interactive configurator page link, rather than its JSON settings file.');
 return u.href;
}
export function generationCount(value:number,refinement=false){
 if(refinement)return 1;
 if(value!==1&&value!==3)throw new Error('Choose one or three key visuals.');
 return value;
}
