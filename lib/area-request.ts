// A lost browser response is not permission to submit another paid edit.
export class AreaEditRejected extends Error {}
export const AREA_REQUEST_TIMEOUT=300_000;
export type AreaEditStatus={status:'ready'|'pending'|'failed'|'not-found';visual?:import('./studio').Visual;error?:string};
export async function areaEditRequest(form:FormData,send:typeof fetch=fetch,timeout=AREA_REQUEST_TIMEOUT){
 const response=await send('/api/area-edits',{method:'POST',body:form,signal:AbortSignal.timeout(timeout)});
 const data=await response.json().catch(()=>{throw new Error('The edit response was interrupted.')}) as {error?:string;visual?:import('./studio').Visual};
 if(!response.ok){const ErrorType=response.headers.get('X-Area-Edit-Not-Started')==='true'?AreaEditRejected:Error;throw new ErrorType(data.error||'The area edit could not finish.');}
 if(!data.visual?.id||data.visual.status!=='ready'||!data.visual.src)throw new Error('The edit returned no completed image.');
 return data.visual as import('./studio').Visual;
}
export async function checkAreaEdit(id:string,send:typeof fetch=fetch):Promise<AreaEditStatus>{
 const response=await send('/api/area-edits/'+encodeURIComponent(id),{cache:'no-store',signal:AbortSignal.timeout(15_000)});
 const data=await response.json() as AreaEditStatus;if(!response.ok)throw new Error(data.error||'Could not check the edit.');if(!['ready','pending','failed','not-found'].includes(data.status))throw new Error('The saved edit status was unavailable. Please check again.');return data;
}
