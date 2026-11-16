import {FEATURES,UPSELL_PLAN,featureOn,maxEdge,workspaceState} from './plan';
import {switcherSections,type StudioContext} from './context';
import type {StudioDatabase} from '@/lib/portable/database';
// What the workspace may show the signed-in person, derived only from the
// server's context. The browser uses it to hide tools and show upsells; every
// route still decides for itself.
export function accountSummary(ctx:StudioContext,now=Date.now()){
 return {
  user:{email:ctx.user.email},
  // The company's legal name: shown only in Company settings, Usage and billing.
  org:{id:ctx.org.id,name:ctx.org.name},
  // What its people work as everywhere else (the top bar, the switcher, Home, titles).
  brand:ctx.brand,
  brands:ctx.brands,
  role:ctx.role,
  orgs:ctx.orgs.map(o=>({id:o.id,name:o.name,brands:o.brands})),
  // Staff only: the switcher's "Nmesis" and "Clients" sections.
  switcher:switcherSections(ctx),
  staff:!!ctx.staff,
  viewingAs:ctx.viewingAs,
  // Staff with support access: when the client's grant ends.
  supportUntil:ctx.supportUntil?new Date(ctx.supportUntil).toISOString():null,
  internal:ctx.org.kind==='internal',
  plan:{name:ctx.entitlements.planName,legacy:ctx.entitlements.legacy,none:!!ctx.entitlements.noPlan},
  features:Object.fromEntries(FEATURES.map(k=>[k,featureOn(ctx.entitlements,k)])),
  upsell:UPSELL_PLAN,
  maxEdge:maxEdge(ctx.entitlements),
  workspace:workspaceState(ctx.entitlements,now),
 };
}
export type AccountSummary=ReturnType<typeof accountSummary>;
// A member of staff opening a client's workspace (with its support grant), recorded
// in the studio's own log, which the client's owners can read in Company settings.
export async function logStaffView(db:StudioDatabase|undefined,ctx:StudioContext,path:string){
 if(!ctx.viewingAs||!ctx.staff)return;
 console.info('Staff viewing as',JSON.stringify({staff:ctx.user.id,org:ctx.org.id,path}));
 if(!db)return;
 await db.prepare('INSERT INTO staff_access_log(id,org_id,staff_user,path,at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),ctx.org.id,ctx.user.id,path.slice(0,200),now()).run();
}
const now=()=>Date.now();
