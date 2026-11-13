// A company's library is everyone's work in that company: each member's objects
// stay under their own prefix (orgs/<org>/users/<user>/), and reads look across
// the members of the signed-in user's company only. The company comes from the
// verified context, so a guessed id from another company is never found.
import {StudioError,type RequestContext} from './studio-server';
import {isUserPrefix,membersPrefix,orgOf} from './portable/tenancy';
import {ttlCache} from './accounts/cache';
import type {StudioBucket} from './portable/storage';
type Ctx=Pick<RequestContext,'org'|'prefix'|'role'|'BUCKET'>;
const members=ttlCache<string[]>(60_000);
// Every member prefix that holds objects, the signed-in user's own first.
export async function memberPrefixes(ctx:Ctx):Promise<string[]>{
 const store=ctx.BUCKET;if(!store)return [ctx.prefix];
 const found=await members(ctx.org,async()=>{
  const out:string[]=[];let cursor:string|undefined;
  do{const page=await store.list({prefix:membersPrefix(ctx.org),delimiter:'/',limit:1000,...cursor?{cursor}:{}});out.push(...(page.prefixes||[]));cursor=page.truncated?page.cursor:undefined}while(cursor&&out.length<5000);
  return out;
 });
 return [ctx.prefix,...found.filter(p=>p!==ctx.prefix&&isUserPrefix(p)&&orgOf(p)===ctx.org)];
}
// The member prefix under which `suffix` exists, or null. Own prefix first.
export async function locate(ctx:Ctx,suffix:string,store:Pick<StudioBucket,'head'|'list'>|undefined=ctx.BUCKET){
 if(!store)return null;
 for(const prefix of await memberPrefixes({...ctx,BUCKET:store as StudioBucket}))if(await store.head(prefix+suffix))return prefix;
 return null;
}
// Deleting (or restoring) is for whoever made it, or an owner of the company.
export function requireDeleteRight(ctx:Ctx,ownerPrefix:string){
 if(ownerPrefix!==ctx.prefix&&ctx.role!=='owner')throw new StudioError('Only the person who made this, or an owner of your company, can delete it.',403);
}
