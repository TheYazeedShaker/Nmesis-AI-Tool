'use client';
import {uploadReference} from './reference-upload';
export async function importPinterestReference(url:string,signal?:AbortSignal){
 const response=await fetch('/api/pinterest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal});
 const data=await response.json() as {id:string;url:string;name:string;pin:string;width:number;height:number;original:boolean;needsPreparation:boolean;error?:string};if(!response.ok)throw new Error(data.error||'Pinterest import failed.');
 if(signal?.aborted)throw new DOMException('Import canceled.','AbortError');
 let result=data;
 if(data.needsPreparation){
  const original=await fetch(data.url,{signal});if(!original.ok)throw new Error('The original Pinterest image could not be loaded. Try importing again.');
  const blob=await original.blob();if(signal?.aborted)throw new DOMException('Import canceled.','AbortError');
  const prepared=await uploadReference(blob);result={...data,...prepared};
 }
 if(signal?.aborted)throw new DOMException('Import canceled.','AbortError');
 return {...result,name:data.name+' · '+data.width+' × '+data.height,originalWidth:data.width,originalHeight:data.height};
}
