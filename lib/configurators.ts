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
// Server only: cars from the directory as configurators. Paths are joined to the
// deployment's CONFIGURATOR_ORIGIN (accounts.cars stores a path, not an address);
// anything that does not become an https page link is left out.
export function carConfigurators(cars:{brandId:string;modelId:string;brandName:string;modelName:string;path:string;template:string}[],origin=process.env.CONFIGURATOR_ORIGIN):Configurator[]{
 const out:Configurator[]=[];
 for(const car of cars){
  if(!car.path)continue;
  let url:string;try{url=normalizeConfiguratorUrl(/^https:\/\//i.test(car.path)?car.path:new URL(car.path,origin||undefined).href)}catch{continue}
  const name=carName(car.brandName,car.modelName).slice(0,100)||'Configurator',id=(car.brandId+'.'+car.modelId).slice(0,120);
  out.push({id,name,url,template:car.template==='choose-view'?'choose-view':'capture',brandId:car.brandId,brandName:car.brandName,picture:'/api/cars/'+encodeURIComponent(id)+'/picture'});
 }
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
