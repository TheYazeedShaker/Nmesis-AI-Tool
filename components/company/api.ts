// One way for the Company settings screens to talk to the server: JSON in and
// out, a time limit, and the server's own sentence when it refuses.
export async function api<T>(url:string,method='GET',body?:unknown):Promise<T>{
 let r:Response;
 try{r=await fetch(url,{method,cache:'no-store',headers:body!==undefined?{'Content-Type':'application/json'}:undefined,body:body!==undefined?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30_000)})}
 catch(e){throw new Error(e instanceof Error&&e.name==='TimeoutError'?'That took too long. Try again.':'The connection was interrupted. Try again.')}
 const d=await r.json().catch(()=>null) as (T&{error?:string})|null;
 if(!r.ok||!d)throw new Error(d?.error||'Something went wrong. Try again.');
 return d;
}
