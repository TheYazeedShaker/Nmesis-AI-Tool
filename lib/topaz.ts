import type {Visual} from './studio';
export const TOPAZ_MODEL = 'Upscale High Fidelity V3';
export const TOPAZ_MODEL_ID = 'topaz-high-fidelity-3';
export type TopazConnectionStatus={connected:boolean;keySetup:boolean;checkedAt?:string;credits?:number};
export type TopazJob={id:string;parentId:string;status:string;progress:number;createdAt:number;error?:string;credits?:number;width:number;height:number;visual?:Visual};
export const topazActive=(status:string)=>['submitting','unknown','queued','processing','archiving'].includes(status);
// Core fields follow the Enhance endpoint schema; model options follow the HF3 model page.
export function topazForm(image:Blob,width:number,height:number){
  const form=new FormData();form.set('image',image,'visual.'+(image.type==='image/png'?'png':'jpg'));
  for(const [k,v] of Object.entries({model:TOPAZ_MODEL,output_width:width,output_height:height,output_format:'jpeg',crop_to_fill:false,faceEnhancement:false,subjectDetection:'all',sharpen:0.1,denoise:0,fixCompression:0,strength:0.25,recoveryStrength:1,opacity:1}))form.set(k,String(v));
  return form;
}
export function topazProcessId(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(value))throw new Error('Topaz did not return a valid request ID.');return value}
