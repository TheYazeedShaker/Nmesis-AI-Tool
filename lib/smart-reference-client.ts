import type {Visual} from './studio';
export async function submitSmartImage(url:string,payload:{id:string;[key:string]:unknown}):Promise<{visual:Visual}>{
 let response:Response;
 try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(300000)})}
 catch{
  // A disconnected browser does not mean the provider failed. Read only; never resubmit.
  const saved=await fetch('/api/visuals/'+encodeURIComponent(payload.id),{signal:AbortSignal.timeout(15000),cache:'no-store'}).then(async r=>r.ok?await r.json() as {visual?:Visual}:null).catch(()=>null);
  if(saved?.visual?.id===payload.id)return {visual:saved.visual};
  throw new Error('The connection dropped. This request may still finish. Refresh saved visuals before trying again; no duplicate generation was submitted.');
 }
 const data=await response.json() as {visual?:Visual;error?:string};if(!response.ok||!data.visual)throw new Error(data.error||'Image generation failed.');return {visual:data.visual};
}
