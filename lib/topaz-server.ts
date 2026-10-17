import {bucket,StudioError,imageKey,validId} from './studio-server';
import {database,type FilmContext} from './film-server';
import {sealKey,unsealKey,type SealedKey} from './secret-crypto';
import {keyFingerprint,publicMediaUrl} from './film-policy';
import {publicImage,type ImageRow} from './image-server';
import {imageDimensions} from './image-dimensions';
import {upscaleTarget} from './upscale-models';
import {TOPAZ_MODEL,TOPAZ_MODEL_ID,topazForm,topazProcessId,type TopazJob} from './topaz';
import type {Visual} from './studio';
type Ctx=FilmContext;
type Row={id:string;owner:string;parent_id:string;status:string;data:string;provider_id:string|null;created_at:number;updated_at:number;lock_until:number;error:string|null};
type Data={parent:Visual;width:number;height:number;fingerprint:string;progress?:number;credits?:number};
const secretPath=(ctx:Ctx)=>ctx.prefix+'credentials/topaz.json';
export class TopazFailure extends StudioError{constructor(public httpStatus:number){super(httpStatus===401||httpStatus===403?'Topaz did not accept this key. Check your Topaz API connection.':httpStatus===402?'Add API credits to your Topaz account before upscaling.':httpStatus===429?'Topaz is busy or your request limit has been reached. Wait a moment and refresh.':httpStatus===404?'This Topaz request is unavailable. Results are held by Topaz for seven days.':`Topaz could not complete this request (HTTP ${httpStatus}).`,httpStatus===429?429:502)}}
export async function topazRequest(key:string,path:string,form?:FormData){
  let r:Response;try{r=await fetch('https://api.topazlabs.com/'+path,{method:form?'POST':'GET',headers:{'X-API-Key':key},...(form?{body:form}:{}),signal:AbortSignal.timeout(45000),redirect:'manual'})}catch{throw new StudioError('The Topaz connection was interrupted. Refresh the saved request before starting another upscale.',504)}
  if(!r.ok)throw new TopazFailure(r.status);return await r.json() as Record<string,any>;
}
export async function topazStatus(ctx:Ctx){const saved=await bucket(ctx.BUCKET).get(secretPath(ctx));const data=saved?await saved.json<SealedKey&{credits?:number}>():null;return {connected:!!data,keySetup:!!ctx.KEY_ENCRYPTION_SECRET,checkedAt:data?.verifiedAt,credits:data?.credits}}
export async function topazKey(ctx:Ctx){const saved=await bucket(ctx.BUCKET).get(secretPath(ctx));if(!saved||!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('Connect your Topaz API key before upscaling.',503);try{return await unsealKey(await saved.json<SealedKey>(),ctx.KEY_ENCRYPTION_SECRET,ctx.prefix+'topaz')}catch{throw new StudioError('Reconnect your Topaz API key.',503)}}
export async function saveTopazKey(ctx:Ctx,key:string){
  if(!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('Secure key storage is not ready.',503);
  const balance=await topazRequest(key,'account/v1/credits/balance');
  if(typeof balance.available_credits!=='number'||!Number.isFinite(balance.available_credits))throw new StudioError('Topaz did not return a verifiable credit balance. Your key was not saved.',502);
  await bucket(ctx.BUCKET).put(secretPath(ctx),JSON.stringify({...await sealKey(key,ctx.KEY_ENCRYPTION_SECRET,ctx.prefix+'topaz'),credits:balance.available_credits}),{httpMetadata:{contentType:'application/json'}});
}
export async function removeTopazKey(ctx:Ctx){await bucket(ctx.BUCKET).delete(secretPath(ctx))}
export async function topazRow(ctx:Ctx,id:string){if(!validId(id))throw new StudioError('Upscale request not found.',404);const row=await database(ctx).prepare('SELECT * FROM topaz_jobs WHERE id=? AND owner=?').bind(id,ctx.prefix).first<Row>();if(!row)throw new StudioError('Upscale request not found.',404);return row}
export async function publicTopaz(ctx:Ctx,row:Row):Promise<TopazJob>{const d=JSON.parse(row.data) as Data;const saved=row.status==='ready'?await bucket(ctx.BUCKET).get(ctx.prefix+'visuals/'+row.id+'.json'):null;return{id:row.id,parentId:row.parent_id,status:row.status,progress:d.progress||0,createdAt:row.created_at,error:row.error||undefined,width:d.width,height:d.height,credits:d.credits,visual:saved?await saved.json<Visual>():undefined}}
export async function listTopaz(ctx:Ctx,parentId:string){if(!validId(parentId))throw new StudioError('Choose a saved visual.');const rows=await database(ctx).prepare('SELECT * FROM topaz_jobs WHERE owner=? AND parent_id=? ORDER BY created_at DESC LIMIT 10').bind(ctx.prefix,parentId).all<Row>();return await Promise.all(rows.results.map(row=>publicTopaz(ctx,row)))}
export async function startTopaz(ctx:Ctx,id:string,parentId:string,edge:number){
  if(!validId(id)||!validId(parentId))throw new StudioError('Choose a saved visual.');
  const db=database(ctx),store=bucket(ctx.BUCKET);
  const existing=await db.prepare('SELECT * FROM topaz_jobs WHERE id=? AND owner=?').bind(id,ctx.prefix).first<Row>();
  if(existing){const d=JSON.parse(existing.data) as Data;if(existing.parent_id!==parentId||Math.max(d.width,d.height)!==edge)throw new StudioError('This request ID belongs to another upscale.',409);return publicTopaz(ctx,existing)}
  if(![2048,3840,7680].includes(edge))throw new StudioError('Choose 2K, 4K or 8K.');
  const key=await topazKey(ctx),saved=await store.get(ctx.prefix+'visuals/'+parentId+'.json');
  let parent=saved?await saved.json<Visual>():null;
  if(!parent){const row=await db.prepare('SELECT * FROM image_jobs WHERE id=? AND owner=?').bind(parentId,ctx.prefix).first<ImageRow>();if(row)parent=publicImage(row)}
  if(!parent||parent.status!=='ready'||await store.head(ctx.prefix+'deleted-visuals/'+parentId+'.json'))throw new StudioError('The original visual is unavailable.',404);
  const original=await store.get(imageKey(ctx.prefix,parentId));if(!original)throw new StudioError('The original image file is unavailable.',404);
  if(original.size>20_000_000)throw new StudioError('Use a source image under 20 MB.');
  const bytes=new Uint8Array(await original.arrayBuffer()),dims=imageDimensions(bytes);
  if(!['image/png','image/jpeg'].includes(dims.type))throw new StudioError('Topaz needs a PNG or JPEG source.');
  if(edge<=Math.max(dims.width,dims.height))throw new StudioError('Choose a target larger than the original.');
  const target=upscaleTarget(dims.width,dims.height,edge),now=Date.now();
  const data:Data={parent:{...parent,width:dims.width,height:dims.height},...target,fingerprint:await keyFingerprint(key)};
  // A single atomic insert prevents duplicate clicks and concurrent tabs for this source.
  const inserted=await db.prepare("INSERT INTO topaz_jobs(id,owner,parent_id,status,data,created_at,updated_at,lock_until) SELECT ?::text,?::text,?::text,'submitting',?::text,?::bigint,?::bigint,?::bigint WHERE NOT EXISTS (SELECT 1 FROM topaz_jobs WHERE owner=? AND parent_id=? AND status IN ('submitting','unknown','queued','processing','archiving')) ON CONFLICT DO NOTHING").bind(id,ctx.prefix,parentId,JSON.stringify(data),now,now,now+90000,ctx.prefix,parentId).run();
  if(!inserted.meta.changes){const row=await db.prepare("SELECT * FROM topaz_jobs WHERE owner=? AND (id=? OR (parent_id=? AND status IN ('submitting','unknown','queued','processing','archiving'))) ORDER BY created_at DESC LIMIT 1").bind(ctx.prefix,id,parentId).first<Row>();if(row)return publicTopaz(ctx,row);throw new StudioError('This request is already being handled.',409)}
  let acceptedId:string|undefined;
  try{
    const r=await topazRequest(key,'image/v1/enhance/async',topazForm(new Blob([bytes],{type:dims.type}),target.width,target.height));acceptedId=topazProcessId(r.process_id);
    // Receipt allows recovery if the database update is interrupted after acceptance.
    await store.put(ctx.prefix+'topaz-receipts/'+id+'.json',JSON.stringify({id:acceptedId}),{httpMetadata:{contentType:'application/json'}});
    await db.prepare("UPDATE topaz_jobs SET status='queued',provider_id=?,updated_at=?,lock_until=0 WHERE id=? AND owner=?").bind(acceptedId,Date.now(),id,ctx.prefix).run();
  }catch(e){
    const rejected=!acceptedId&&e instanceof TopazFailure&&[400,401,402,403,404,412,413,415,422,429].includes(e.httpStatus);
    await db.prepare('UPDATE topaz_jobs SET status=?,provider_id=?,error=?,updated_at=?,lock_until=0 WHERE id=? AND owner=?').bind(acceptedId?'queued':rejected?'failed':'unknown',acceptedId||null,rejected?(e as Error).message:'Submission needs checking. No automatic second request will be sent. Use Refresh status; if no receipt is available, check your Topaz account before trying again.',Date.now(),id,ctx.prefix).run();
  }
  return publicTopaz(ctx,await topazRow(ctx,id));
}
async function limitedBytes(r:Response){
  const max=30_000_000;if(!r.ok||!r.body||Number(r.headers.get('content-length')||0)>max)throw new StudioError('The upscale is complete, but downloading it failed. Refresh to retry saving.',502);
  const reader=r.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const v=await reader.read();if(v.done)break;total+=v.value.length;if(total>max)throw new StudioError('The result is larger than the 30 MB studio limit.',502);chunks.push(v.value)}}finally{await reader.cancel()}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
}
export async function refreshTopaz(ctx:Ctx,id:string){
  let row=await topazRow(ctx,id);if(['ready','failed','cancelled'].includes(row.status))return publicTopaz(ctx,row);
  const db=database(ctx),store=bucket(ctx.BUCKET),now=Date.now();
  const lock=await db.prepare('UPDATE topaz_jobs SET lock_until=? WHERE id=? AND owner=? AND lock_until<?').bind(now+120000,id,ctx.prefix,now).run();
  if(!lock.meta.changes)return publicTopaz(ctx,row);
  try{
    row=await topazRow(ctx,id);const data=JSON.parse(row.data) as Data;const key=await topazKey(ctx);
    if(data.fingerprint!==await keyFingerprint(key))throw new StudioError('Reconnect the original Topaz key to check this request.',409);
    if(!row.provider_id){const receipt=await store.get(ctx.prefix+'topaz-receipts/'+id+'.json');if(receipt)row.provider_id=topazProcessId((await receipt.json<{id:string}>()).id);else{await db.prepare("UPDATE topaz_jobs SET status='unknown',error=? WHERE id=? AND owner=?").bind('Topaz submission could not be confirmed. No second request was sent. Check your Topaz account before starting another upscale.',id,ctx.prefix).run();return publicTopaz(ctx,await topazRow(ctx,id))}}
    const result=await topazRequest(key,'image/v1/status/'+topazProcessId(row.provider_id));
    if(result.process_id!==row.provider_id)throw new StudioError('Topaz returned a different request. Refresh to check again.',502);
    if(result.model&&result.model!==TOPAZ_MODEL)throw new StudioError('Topaz reported an unexpected model. The result has not been labeled as High Fidelity 3.',502);
    data.progress=typeof result.progress==='number'?Math.min(100,Math.max(0,result.progress)):0;
    if(typeof result.credits==='number'&&Number.isFinite(result.credits))data.credits=result.credits;
    const status=({Pending:'queued',Processing:'processing',Completed:'archiving',Failed:'failed',Cancelled:'cancelled'} as Record<string,string>)[result.status];
    if(!status)throw new StudioError('Topaz returned an unrecognized status. Refresh to check again.',502);
    await db.prepare('UPDATE topaz_jobs SET status=?,provider_id=?,data=?,error=?,updated_at=? WHERE id=? AND owner=?').bind(status,row.provider_id,JSON.stringify(data),status==='failed'?'Topaz could not complete this image. Check the request in your Topaz account.':null,Date.now(),id,ctx.prefix).run();
    if(status==='archiving'){
      const download=await topazRequest(key,'image/v1/download/'+row.provider_id);
      const url=publicMediaUrl(download.download_url||download.url);
      const media=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(60000)}); // Never forward the API key to storage.
      const bytes=await limitedBytes(media),dims=imageDimensions(bytes);
      if(Math.abs(dims.width-data.width)>2||Math.abs(dims.height-data.height)>2)throw new StudioError('Topaz returned an unexpected image size. The result was not saved as the requested upscale.',502);
      const parent=data.parent;
      const visual:Visual={...parent,id,src:'/api/assets/'+id,title:parent.title+' · HF3 upscale',status:'ready',createdAt:new Date(row.created_at).toISOString(),width:dims.width,height:dims.height,size:dims.width+'x'+dims.height,error:undefined,example:undefined,upscale:{modelId:TOPAZ_MODEL_ID,parentId:parent.id,parentSrc:parent.src,method:'topaz-api',credits:data.credits,processId:row.provider_id}};
      await store.put(imageKey(ctx.prefix,id),bytes,{httpMetadata:{contentType:dims.type}});
      await store.put(ctx.prefix+'visuals/'+id+'.json',JSON.stringify(visual),{httpMetadata:{contentType:'application/json'}});
      await db.prepare("UPDATE topaz_jobs SET status='ready',error=NULL,updated_at=? WHERE id=? AND owner=?").bind(Date.now(),id,ctx.prefix).run();
    }
    return publicTopaz(ctx,await topazRow(ctx,id));
  }finally{await db.prepare('UPDATE topaz_jobs SET lock_until=0 WHERE id=? AND owner=?').bind(id,ctx.prefix).run()}
}
