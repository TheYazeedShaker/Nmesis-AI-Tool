import type {Visual} from './studio';
export async function submitSmartImage(url:string,payload:{id:string;[key:string]:unknown}):Promise<{visual:Visual}>{
 let response:Response;
 try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}
 catch{
  // A disconnected browser does not mean the provider failed. Read only; never resubmit.
  const saved=await fetch('/api/visuals/'+encodeURIComponent(payload.id)).then(async r=>r.ok?await r.json() as {visual?:Visual}:null).catch(()=>null);
  if(saved?.visual?.status==='ready')return {visual:saved.visual};
  throw new Error('The connection dropped. This request may still finish. Refresh saved visuals before trying again; no duplicate generation was submitted.');
 }
 const data=await response.json() as {visual?:Visual;error?:string};if(!response.ok||!data.visual)throw new Error(data.error||'Image generation failed.');return {visual:data.visual};
}
