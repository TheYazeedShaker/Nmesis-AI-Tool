import {bucket,StudioError,type StudioEnv} from './studio-server';
import {credentialContext,keyAccess,keysManagedBy,KEYS_NOT_ON_PLAN,type KeyContext} from './org-keys';
import {sealKey,unsealKey,type SealedKey,requireKeySecret} from './secret-crypto';
import {noCreditMessage,NO_CREDIT_STATUS,outOfCredit,readProviderError} from './provider-credit';
import {GEMINI_IMAGE_MODELS,geminiImageModel,geminiSize} from './image-models';
import {imageDimensions} from './image-dimensions';
type Context=StudioEnv&KeyContext;
type GoogleSecret=SealedKey&{models:string[]};
const credentialPath=(ctx:Context)=>ctx.prefix+'credentials/google.json';
export async function googleStatus(ctx:Context){
  const owner=await credentialContext(ctx),sponsored=!keyAccess(ctx).manage;
  const record=owner?await owner.BUCKET?.get(credentialPath(owner)):null;
  const saved=record?await record.json<GoogleSecret>():null;
  return {connected:!!saved,keySetup:!sponsored&&!!ctx.BUCKET&&!!ctx.KEY_ENCRYPTION_SECRET,sponsored,models:saved?.models||[],checkedAt:saved?.verifiedAt};
}
export async function googleKey(ctx:Context){
  const owner=await credentialContext(ctx);if(!owner)throw new StudioError('Google generation needs your company’s own Google key, which is not on your plan yet. Ask Nmesis.',503);ctx=owner;
  const record=await bucket(ctx.BUCKET).get(credentialPath(ctx));
  if(!record)throw new StudioError('Connect Google AI Studio before generating with Nano Banana.',503);
  requireKeySecret(ctx.KEY_ENCRYPTION_SECRET);if(!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('Secure Google key storage is unavailable.',503);
  try{return await unsealKey(await record.json<GoogleSecret>(),ctx.KEY_ENCRYPTION_SECRET,ctx.prefix+'google')}
  catch{throw new StudioError('Reconnect your Google AI Studio key.',503)}
}
async function managedKeys(ctx:Context){const access=keyAccess(ctx);if(!access.own)throw new StudioError(KEYS_NOT_ON_PLAN,403);if(!access.manage)throw new StudioError(keysManagedBy('Google'),403);return (await credentialContext(ctx))!}
export async function saveGoogleKey(ctx:Context,key:string){
  ctx=await managedKeys(ctx);
  requireKeySecret(ctx.KEY_ENCRYPTION_SECRET);if(!ctx.KEY_ENCRYPTION_SECRET)throw new StudioError('Secure key storage is not ready.',503);
  // Read-only model checks never start a paid image request.
  const checks=await Promise.all(GEMINI_IMAGE_MODELS.map(async model=>{
    let response:Response;
    try{response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model.id,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(20000),redirect:'manual'})}
    catch{throw new StudioError('Google could not be reached. Your key has not been saved.',502)}
    if(response.status===401||response.status===403||response.status===400)throw new StudioError('Google did not accept this key. Check its Gemini API permissions.',400);
    if(response.status===404)return null;
    if(!response.ok)throw new StudioError('Google could not verify model access. Please try again later.',502);
    const data:any=await response.json();return data.name==='models/'+model.id?model.id:null;
  }));
  const models=checks.filter(m=>m!==null);
  if(!models.length)throw new StudioError('Neither Nano Banana model is available to this key. Check your Google project and model access.');
  const sealed=await sealKey(key,ctx.KEY_ENCRYPTION_SECRET,ctx.prefix+'google');
  await bucket(ctx.BUCKET).put(credentialPath(ctx),JSON.stringify({...sealed,models}),{httpMetadata:{contentType:'application/json'}});
  return models;
}
export async function removeGoogleKey(ctx:Context){ctx=await managedKeys(ctx);await bucket(ctx.BUCKET).delete(credentialPath(ctx))}
export function googleFailure(status:number){
  if(status===401||status===403)return new StudioError('Google access was denied. Check the connected key and Gemini API permissions.',503);
  if(status===429)return new StudioError('Google quota is exhausted or billing is not enabled. Check billing and limits in Google AI Studio.',429);
  if(status===404)return new StudioError('This Nano Banana model is not available to your Google project. Check model access or choose the other model.',400);
  if(status===400)return new StudioError('Google rejected the image request. Check the references and model settings.',400);
  return new StudioError('Google could not complete the image. Check saved visuals before trying again.',502);
}
export async function googleResponseFailure(response:Response,key:string){
  const body:any=await response.json().catch(()=>null);
  const status=typeof body?.error?.status==='string'&&/^[A-Z_]{1,60}$/.test(body.error.status)?body.error.status:undefined;
  console.error('Google image request rejected',JSON.stringify({httpStatus:response.status,status}));
  if(outOfCredit('google',{status:response.status,...readProviderError(body)}))return new StudioError(noCreditMessage('google'),NO_CREDIT_STATUS);
  if(response.status===400&&typeof body?.error?.message==='string'){
    const detail=body.error.message.split(key).join('[redacted]').replace(/https?:\/\/\S+/g,'[link]').replace(/[A-Za-z0-9_+\/.=-]{60,}/g,'[redacted]').replace(/[\r\n]+/g,' ').slice(0,500);
    return new StudioError('Google rejected the image request: '+detail,400);
  }
  return googleFailure(response.status);
}
export type GoogleImageInput={bytes:Uint8Array;type:string};
export async function renderGoogleImage(key:string,model:string,size:string,prompt:string,images:GoogleImageInput[],aspectRatio='16:9'){
  geminiImageModel(model);const resolution=geminiSize(size);
  if(!['1:1','16:9','9:16','4:3','3:4','3:2','2:3'].includes(aspectRatio))throw new StudioError('Unsupported image shape.');
  if(images.length<2||images.length>14)throw new StudioError('Nano Banana accepts 2–14 reference images in this studio.');
  const input:Array<Record<string,string>>=[{type:'text',text:prompt}];
  const total=images.reduce((n,i)=>n+i.bytes.length,0);
  if(total>80_000_000)throw new StudioError('These references exceed the studio processing limit. Use fewer images.');
  for(const image of images)if(!['image/png','image/jpeg','image/webp'].includes(image.type))throw new StudioError('Use PNG, JPEG or WebP references.');
  const temporaryFiles:string[]=[];
  try{
  // Inline remains fast for small requests. Larger sets use file URIs instead
  // of another lossy compression pass or a base64-expanded request body.
  for(const image of images){
    if(total<=12_000_000)input.push({type:'image',mime_type:image.type,data:Buffer.from(image.bytes).toString('base64')});
    else{
      const start=await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json','X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(image.bytes.length),'X-Goog-Upload-Header-Content-Type':image.type},body:JSON.stringify({file:{display_name:'Nmesis generation reference'}}),signal:AbortSignal.timeout(30000),redirect:'manual'});
      if(!start.ok)throw await googleResponseFailure(start,key);
      const uploadUrl=new URL(start.headers.get('x-goog-upload-url')||'');
      if(uploadUrl.protocol!=='https:'||uploadUrl.hostname!=='generativelanguage.googleapis.com'||uploadUrl.username||uploadUrl.password)throw new StudioError('Google returned an invalid reference upload address.',502);
      const upload=await fetch(uploadUrl,{method:'POST',headers:{'Content-Type':image.type,'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},body:new Uint8Array(image.bytes),signal:AbortSignal.timeout(60000),redirect:'manual'});
      if(!upload.ok)throw await googleResponseFailure(upload,key);
      const result=await upload.json() as {file?:{name?:unknown;uri?:unknown;state?:unknown}},file=result.file;
      if(typeof file?.name!=='string'||!/^files\/[a-zA-Z0-9_-]+$/.test(file.name))throw new StudioError('Google did not save a usable reference file.',502);
      temporaryFiles.push(file.name);
      if(file.uri!=='https://generativelanguage.googleapis.com/v1beta/'+file.name||file.state&&file.state!=='ACTIVE')throw new StudioError('Google has not finished preparing a reference. No image request was started.',502);
      input.push({type:'image',mime_type:image.type,uri:file.uri});
    }
  }
  let response:Response;
  try{response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({model,input,store:false,response_format:{type:'image',mime_type:'image/jpeg',aspect_ratio:aspectRatio,image_size:resolution}}),signal:AbortSignal.timeout(240000),redirect:'manual'})}
  catch{throw new StudioError('Google’s response was interrupted. This request may have been billed; no automatic retry was made.',504)}
  if(!response.ok)throw await googleResponseFailure(response,key);
  const data:any=await response.json();
  const output=data.output_image||(Array.isArray(data.steps)?data.steps.filter((s:any)=>s.type==='model_output').flatMap((s:any)=>Array.isArray(s.content)?s.content:[]).find((p:any)=>p.type==='image'&&p.data):null);
  if(typeof output?.data!=='string'||output.data.length>50_000_000)throw new StudioError('Google returned no usable image. Your references are saved; try a different prompt.',502);
  const bytes=Buffer.from(output.data,'base64');let dimensions;
  try{dimensions=imageDimensions(bytes)}catch{throw new StudioError('Google returned an unreadable image.',502)}
  return {bytes,...dimensions};
  }finally{
    for(const name of temporaryFiles){try{await fetch('https://generativelanguage.googleapis.com/v1beta/'+name,{method:'DELETE',headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(10000),redirect:'manual'})}catch{console.warn('Temporary reference cleanup could not finish; provider expiration remains active.')} }
  }
}
