'use client';
import {studioFetch} from './studio-fetch';
import {validateReference,PREPARED_REFERENCE_BYTES} from './reference-policy';
import {imageDimensions} from './image-dimensions';
export type ReferenceAsset={id:string;url:string;originalUrl:string;prepared:boolean;width:number;height:number;originalWidth:number;originalHeight:number};
export async function readReference(file:File){
 validateReference(file);imageDimensions(new Uint8Array(await file.arrayBuffer()));
 return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('This image could not be read.'));r.readAsDataURL(file)});
}
// Try re-encoding at the original dimensions before reducing any pixels.
// WebP keeps transparent pixels, unlike a JPEG flattened onto white.
export async function prepareReference(original:Blob,knownDimensions?:ReturnType<typeof imageDimensions>){
 validateReference(original);const dimensions=knownDimensions||imageDimensions(new Uint8Array(await original.arrayBuffer()));
 if(original.size<=PREPARED_REFERENCE_BYTES)return {blob:original,...dimensions};
 const bitmap=await createImageBitmap(original);const canvas=document.createElement('canvas');
 try{
  let scale=1;
  for(let attempt=0;attempt<10;attempt++){
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser could not prepare this image.');
   ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   for(const quality of [.98,.94,.9]){
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('This image could not be prepared.')),'image/webp',quality));
    if(blob.size<=PREPARED_REFERENCE_BYTES)return {blob,width:canvas.width,height:canvas.height,type:blob.type};
   }
   scale*=.82;
  }
  throw new Error('This image could not be prepared. Try a simpler crop.');
 }finally{bitmap.close();canvas.width=canvas.height=1}
}
async function json(response:Response){const d=await response.json().catch(()=>({error:'Image upload was interrupted.'})) as {id:string;url:string;error?:string};if(!response.ok)throw new Error(d.error||'Image upload failed.');return d}
export type ReferenceUploadOptions={signal?:AbortSignal;onStage?:(stage:string)=>void};
export async function uploadReference(image:Blob,original:Blob=image,options:ReferenceUploadOptions={}):Promise<ReferenceAsset>{
 options.signal?.throwIfAborted();options.onStage?.('Preparing image…');
 validateReference(original);const originalDimensions=imageDimensions(new Uint8Array(await original.arrayBuffer()));
 const prepared=await prepareReference(image,image===original?originalDimensions:undefined);options.signal?.throwIfAborted();
 const form=new FormData();form.set('image',prepared.blob,'reference.'+prepared.blob.type.split('/')[1]);
 options.onStage?.('Uploading reference…');
 const signal=()=>options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000);
 const asset=await json(await studioFetch('/api/assets',{method:'POST',body:form,signal:signal()}));
 // A failed original upload fails the entire operation visibly; never claim it was kept.
 if(prepared.blob!==original){options.signal?.throwIfAborted();options.onStage?.('Saving full-resolution original…');const originalForm=new FormData();originalForm.set('image',original,'original.'+original.type.split('/')[1]);await json(await studioFetch('/api/assets/'+asset.id+'/original',{method:'PUT',body:originalForm,signal:signal()}));}
 options.signal?.throwIfAborted();
 return {...asset,originalUrl:asset.url+'?original=1&download=1',prepared:prepared.blob!==image,width:prepared.width,height:prepared.height,originalWidth:originalDimensions.width,originalHeight:originalDimensions.height};
}
