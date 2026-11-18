import {carName} from './car-names.ts';
// A configurator the signed-in company may use: one live car from the master list
// (accounts.cars, narrowed by accounts.configurator_access), served by
// /api/configurators. Real names and addresses never live in this repository.
// `template` is the car's explicit capture template (studio.car_settings).
export type Configurator={id:string;name:string;url:string;template?:'capture'|'choose-view';
 /** The master list's ids (cars from /api/configurators only): which brand it belongs to, and its picture at /api/cars/<id>/picture. */brandId?:string;brandName?:string;picture?:string};
// What every page shows until the company's configurators arrive (and when there are none).
export const DEMO_CONFIGURATOR:Configurator={id:'demo',name:'Demo vehicle',url:'https://configurator.example.com/demo/',template:'choose-view'};
export const CONFIGURATORS:Configurator[]=[DEMO_CONFIGURATOR];
/** The address a live configurator frame may load, or null. The placeholder is
 *  never loaded: its host does not exist, so the browser drew its own error page
 *  (a torn-page icon) in the car view above "Use this view" while the company's
 *  cars were loading, and for good when none came back (the list failed, or every
 *  car was left out). Only an https page link of one of the company's cars loads. */
export function liveConfiguratorUrl(c:{id?:string;url?:string}|null|undefined):string|null{
 if(!c?.url||c.id===DEMO_CONFIGURATOR.id||c.url===DEMO_CONFIGURATOR.url)return null;
 try{return normalizeConfiguratorUrl(c.url)}catch{return null}
}
type Warn=(message:string,detail:Record<string,unknown>)=>void;
// Server only: cars from the directory as configurators. Paths are joined to the
// deployment's CONFIGURATOR_ORIGIN (accounts.cars stores a path, not an address);
// anything that does not become an https page link is left out, and said in the
// log (counts only, never an address): a company whose cars were all left out
// used to see the placeholder with nothing in the log to say why.
export function carConfigurators(cars:{brandId:string;modelId:string;brandName:string;modelName:string;path:string;template:string}[],origin=process.env.CONFIGURATOR_ORIGIN,warn:Warn=(m,d)=>console.warn(m,JSON.stringify(d))):Configurator[]{
 const out:Configurator[]=[];let unjoined=0,refused=0;
 for(const car of cars){
  if(!car.path)continue;
  const absolute=/^https:\/\//i.test(car.path);
  if(!absolute&&!origin){unjoined++;continue}
  let url:string;try{url=normalizeConfiguratorUrl(absolute?car.path:new URL(car.path,origin).href)}catch{refused++;continue}
  const name=carName(car.brandName,car.modelName).slice(0,100)||'Configurator',id=(car.brandId+'.'+car.modelId).slice(0,120);
  out.push({id,name,url,template:car.template==='choose-view'?'choose-view':'capture',brandId:car.brandId,brandName:car.brandName,picture:'/api/cars/'+encodeURIComponent(id)+'/picture'});
 }
 if(unjoined)warn('Configurators left out: CONFIGURATOR_ORIGIN is not set, so their paths cannot become links',{cars:unjoined});
 if(refused)warn('Configurators left out: their address is not an https page link',{cars:refused});
 return out;
}
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
