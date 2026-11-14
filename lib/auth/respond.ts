import {PROBLEMS,type Problem} from './words';
// Sign-in answers: never cached, never Supabase's own words.
export const NO_STORE={'Cache-Control':'private, no-store'};
export const answer=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:NO_STORE});
export const refuse=(problem:Problem,status=400)=>answer({error:PROBLEMS[problem],problem},status);
// Same-origin, small JSON bodies only.
export async function body(request:Request):Promise<Record<string,unknown>|null>{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return null;
 if(!request.headers.get('content-type')?.startsWith('application/json'))return null;
 const text=await request.text().catch(()=>'');if(text.length>8000)return null;
 try{const v=JSON.parse(text);return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null}catch{return null}
}
export const redirect=(request:Request,path:string)=>new Response(null,{status:303,headers:{...NO_STORE,Location:new URL(path,request.url).href}});
