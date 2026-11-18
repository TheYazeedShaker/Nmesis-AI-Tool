'use client';
import {updateReference,type TrayItem} from './reference-tray';
import {uploadReference} from './reference-upload';

// Brings one reference from the tray into the Studio's own storage and answers
// its asset id (what generation reads). A photo from the library is imported
// on the server (POST /api/references/import); anything else on a link the
// Studio can read (a brand logo, a provider's hotlinked image) is fetched and
// uploaded as a reference. The id is kept on the tray item, so it happens once.
const IMPORT_MS=45_000,FETCH_MS=30_000;

export async function resolveTrayReference(item:TrayItem):Promise<string>{
 if(item.assetId)return item.assetId;
 let id:string;
 if(item.provider==='unsplash'){
  const r=await fetch('/api/references/import',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({provider:item.provider,id:item.key.slice(item.provider.length+1)}),signal:AbortSignal.timeout(IMPORT_MS)});
  const d=await r.json().catch(()=>null) as {id?:unknown;error?:unknown}|null;
  if(!r.ok||typeof d?.id!=='string')throw new Error(typeof d?.error==='string'?d.error:'That photo could not be brought in. Try again.');
  id=d.id;
 }else{
  const r=await fetch(item.src,{credentials:'same-origin',signal:AbortSignal.timeout(FETCH_MS)});
  if(!r.ok)throw new Error('That reference could not be read. Remove it and add it again.');
  const blob=await r.blob();
  id=(await uploadReference(blob,blob)).id;
 }
 updateReference(item.key,{assetId:id});
 return id;
}
