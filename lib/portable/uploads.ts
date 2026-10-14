import {createHmac,timingSafeEqual} from 'node:crypto';
import {getStorage} from './storage';
import {StudioError} from '@/lib/studio-server';
type Ticket={key:string;prefix:string;target:string;size:number;type:string;expires:number};
export function uploadTarget(path:string){return ['/api/assets','/api/area-edits','/api/swap-source','/api/upscale-import'].includes(path)||/^\/api\/storyboards\/[a-z0-9-]{8,80}\/video$/.test(path);}
function secret(){const key=process.env.KEY_ENCRYPTION_SECRET;if(!key||key.length<32)throw new StudioError('Configure secure storage before uploading.',503);return key;}
export function signTicket(data:Ticket){const payload=Buffer.from(JSON.stringify(data)).toString('base64url');const sig=createHmac('sha256',secret()).update('upload:'+payload).digest('base64url');return payload+'.'+sig;}
export function verifyTicket(token:unknown,prefix:string,target:string):Ticket{
 if(typeof token!=='string'||token.length>5000)throw new StudioError('Invalid upload ticket.');
 const [payload,sig,...extra]=token.split('.');const expected=createHmac('sha256',secret()).update('upload:'+payload).digest();const received=Buffer.from(sig||'','base64url');
 if(extra.length||received.length!==expected.length||!timingSafeEqual(expected,received))throw new StudioError('Invalid upload ticket.',403);
 let data:Ticket;try{data=JSON.parse(Buffer.from(payload,'base64url').toString())}catch{throw new StudioError('Invalid upload ticket.')}
 if(data.prefix!==prefix||data.target!==target||data.expires<Date.now()||!data.key.startsWith('staging/'+prefix+'uploads/')||!uploadTarget(target))throw new StudioError('This upload expired or belongs to a different request.',403);
 return data;
}
export async function readStudioForm(request:Request,ctx:{prefix:string},max:number){
 if(request.headers.get('content-type')?.startsWith('application/json')){
  const text=await request.text();if(text.length>6000)throw new StudioError('Invalid upload request.',413);
  let value;try{value=JSON.parse(text)}catch{throw new StudioError('Invalid upload request.')}
  const ticket=verifyTicket(value.uploadToken,ctx.prefix,new URL(request.url).pathname),store=getStorage();
  if(!store)throw new StudioError('Storage is not configured.',503);
  if(ticket.size>max)throw new StudioError('The uploaded files are too large.',413);
  const head=await store.head(ticket.key);if(!head||head.size!==ticket.size||head.size>max)throw new StudioError('The uploaded file is missing or has the wrong size.');
  const object=await store.get(ticket.key);if(!object)throw new StudioError('Upload not found.',404);
  try{return await new Response(object.body,{headers:{'Content-Type':ticket.type}}).formData()}finally{await store.delete(ticket.key)}
 }
 // Retain small multipart requests for scripts and local development.
 const reader=request.body?.getReader();if(!reader)throw new StudioError('Choose a file.');
 let size=0;const chunks:Uint8Array[]=[];try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max)throw new StudioError('The uploaded files are too large.',413);chunks.push(part.value)}}finally{await reader.cancel()}
 return new Response(new Blob(chunks as BlobPart[]),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
}
