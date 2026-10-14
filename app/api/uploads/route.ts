import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {getStorage} from '@/lib/portable/storage';
import {signTicket,uploadTarget} from '@/lib/portable/uploads';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const ctx=await context(request,true);if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudioError('Upload from your studio.',403);
 const data=await readJson(request),store=getStorage();if(!store)throw new StudioError('Storage is not configured.',503);
 if(typeof data.target!=='string'||!uploadTarget(data.target)||typeof data.type!=='string'||!/^multipart\/form-data; boundary=[-a-zA-Z0-9]{1,150}$/.test(data.type)||!Number.isSafeInteger(data.size)||data.size<=0||data.size>60_000_000)throw new StudioError('Invalid file upload.');
 const ticket={key:'staging/'+ctx.prefix+'uploads/'+crypto.randomUUID(),prefix:ctx.prefix,target:data.target,type:data.type,size:data.size,expires:Date.now()+15*60*1000};
 return Response.json({url:await store.uploadUrl(ticket.key,ticket.type,ticket.size),token:signTicket(ticket)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e)}}
