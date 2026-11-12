import {FEATURES,UPSELL_PLAN,featureOn,maxEdge,workspaceState} from './plan';
import type {StudioContext} from './context';
import type {StudioDatabase} from '@/lib/portable/database';
// What the workspace may show the signed-in person, derived only from the
// server's context. The browser uses it to hide tools and show upsells; every
// route still decides for itself.
export function accountSummary(ctx:StudioContext,now=Date.now()){
 return {
  user:{email:ctx.user.email},
  org:{id:ctx.org.id,name:ctx.org.name},
  role:ctx.role,
  orgs:ctx.orgs,
  staff:!!ctx.staff,
  viewingAs:ctx.viewingAs,
  plan:{name:ctx.entitlements.planName,legacy:ctx.entitlements.legacy},
  features:Object.fromEntries(FEATURES.map(k=>[k,featureOn(ctx.entitlements,k)])),
  upsell:UPSELL_PLAN,
  maxEdge:maxEdge(ctx.entitlements),
  workspace:workspaceState(ctx.entitlements,now),
 };
}
export type AccountSummary=ReturnType<typeof accountSummary>;
// A member of staff opening a client's workspace, recorded in the studio's own log.
export async function logStaffView(db:StudioDatabase|undefined,ctx:StudioContext,path:string){
 if(!ctx.viewingAs||!ctx.staff)return;
 console.info('Staff viewing as',JSON.stringify({staff:ctx.user.id,org:ctx.org.id,path}));
 if(!db)return;
 await db.prepare('INSERT INTO staff_access_log(id,org_id,staff_user,path,at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),ctx.org.id,ctx.user.id,path.slice(0,200),now()).run();
}
const now=()=>Date.now();
