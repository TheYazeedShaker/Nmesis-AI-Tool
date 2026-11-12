// What a client's plan lets the Studio do, decided on the server from
// accounts.entitlements(org). Pure functions: no I/O, so routes, pages and tests
// share one answer. The admin owns the plan data; the Studio only reads it.
export const MEMBER_ROLES=['owner','creator','viewer'] as const;
export type Role=typeof MEMBER_ROLES[number];
export const FEATURES=['studio.key_visuals','studio.lineups','studio.area_edit','studio.object_select','studio.pinterest','studio.smart_reference','studio.upscale','studio.film','studio.swap','studio.storyboards','studio.own_keys'] as const;
export type FeatureKey=typeof FEATURES[number];
// The answer of accounts.entitlements(org), as the Studio reads it.
export type Entitlements={legacy:boolean;status:string|null;planId:string|null;planName:string|null;endsOn:string|null;features:Record<string,unknown>};
export const FEATURE_LABELS:Record<FeatureKey,string>={'studio.key_visuals':'Key visuals','studio.lineups':'Line-ups','studio.area_edit':'Area edit','studio.object_select':'Object select','studio.pinterest':'Pinterest','studio.smart_reference':'Smart references','studio.upscale':'Upscale','studio.film':'Film Studio','studio.swap':'Car swap','studio.storyboards':'Storyboards','studio.own_keys':'Your own provider keys'};
// The smallest plan that includes each feature, for the upsell chip.
export const UPSELL_PLAN:Record<FeatureKey,'Growth'|'Enterprise'>={'studio.key_visuals':'Growth','studio.lineups':'Growth','studio.area_edit':'Growth','studio.object_select':'Growth','studio.pinterest':'Growth','studio.smart_reference':'Growth','studio.upscale':'Growth','studio.film':'Enterprise','studio.swap':'Enterprise','studio.storyboards':'Enterprise','studio.own_keys':'Enterprise'};
const ENDED=new Set(['ended','cancelled']);
// Accepts the raw jsonb document; anything unexpected reads as "everything off".
export function readEntitlements(raw:unknown):Entitlements{
 const d=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!d)return {legacy:false,status:'ended',planId:null,planName:null,endsOn:null,features:{}};
 const text=(v:unknown)=>typeof v==='string'?v:null;
 const features=d.features&&typeof d.features==='object'&&!Array.isArray(d.features)?d.features as Record<string,unknown>:{};
 return {legacy:d.legacy===true,status:text(d.status),planId:text(d.plan_id),planName:text(d.plan_name),endsOn:text(d.ends_on),features};
}
// No plan yet ("legacy") allows everything; an ended plan names every key off.
export function featureOn(e:Entitlements,key:FeatureKey){if(e.legacy)return true;if(e.status&&ENDED.has(e.status))return false;return e.features[key]===true}
// The longest edge a plan may produce or upscale to, in pixels.
export const OUTPUT_EDGES={'2k':2048,'4k':3840,'8k':7680} as const;
export function maxEdge(e:Entitlements):number{
 if(e.legacy)return OUTPUT_EDGES['8k'];
 if(!('studio.max_output' in e.features))return OUTPUT_EDGES['2k'];
 const v=e.features['studio.max_output'];
 if(v===null)return OUTPUT_EDGES['8k'];// a plan row with no value means "no limit"
 return typeof v==='string'&&v in OUTPUT_EDGES?OUTPUT_EDGES[v as keyof typeof OUTPUT_EDGES]:OUTPUT_EDGES['2k'];
}
export const LIBRARY_GRACE_DAYS=30;
// Open: work as usual. Closed: a plain notice; the library stays viewable for 30
// days after the subscription's end date (or while no end date is known).
export function workspaceState(e:Entitlements,now=Date.now()):{open:boolean;libraryOpen:boolean;libraryUntil:string|null}{
 if(e.legacy)return {open:true,libraryOpen:true,libraryUntil:null};
 const ended=!!e.status&&ENDED.has(e.status),enabled=e.features['studio.enabled']===true;
 if(enabled&&!ended)return {open:true,libraryOpen:true,libraryUntil:null};
 const end=e.endsOn?Date.parse(e.endsOn+'T23:59:59Z'):NaN;
 if(Number.isNaN(end))return {open:false,libraryOpen:true,libraryUntil:null};
 const until=end+LIBRARY_GRACE_DAYS*86_400_000;
 return {open:false,libraryOpen:now<=until,libraryUntil:new Date(until).toISOString().slice(0,10)};
}
// The single table of which plan feature each API route needs. `null` means the
// route is not a plan feature (it still needs a signed-in member). `methods`
// narrows an entry; the first matching entry wins. Routes whose feature depends
// on the request body (line-ups, smart references, adding an object) also call
// requireFeature themselves once the body is read.
export type RouteRule={path:RegExp;methods?:string[];feature:FeatureKey|null;library?:boolean};
const ID='[a-z0-9-]{8,80}';
export const ROUTE_FEATURES:RouteRule[]=[
 {path:/^\/api\/area-edits(\/[^/]+)?$/,feature:'studio.area_edit'},
 {path:/^\/api\/assets$/,feature:null},
 {path:new RegExp(`^/api/assets/${ID}$`),methods:['GET'],feature:null,library:true},
 {path:new RegExp(`^/api/assets/${ID}/original$`),feature:null},
 {path:/^\/api\/configurators$/,feature:null,library:true},
 {path:/^\/api\/connection$/,methods:['GET'],feature:null},
 {path:/^\/api\/connection$/,feature:'studio.own_keys'},
 {path:/^\/api\/directions$/,feature:'studio.key_visuals'},
 {path:/^\/api\/films(\/.*)?$/,feature:'studio.film'},
 {path:/^\/api\/generate$/,feature:'studio.key_visuals'},
 {path:/^\/api\/google\/analyze$/,feature:'studio.smart_reference'},
 {path:/^\/api\/google\/connection$/,methods:['GET'],feature:null},
 {path:/^\/api\/google\/connection$/,feature:'studio.own_keys'},
 {path:/^\/api\/google\/generate$/,feature:'studio.key_visuals'},
 {path:/^\/api\/image-jobs(\/.*)?$/,feature:'studio.key_visuals'},
 {path:/^\/api\/pinterest$/,feature:'studio.pinterest'},
 {path:/^\/api\/smart-prompts$/,feature:'studio.smart_reference'},
 {path:/^\/api\/smart-review$/,feature:'studio.smart_reference'},
 {path:/^\/api\/status$/,feature:null,library:true},
 {path:/^\/api\/storyboards(\/.*)?$/,feature:'studio.storyboards'},
 {path:/^\/api\/swap-source(\/.*)?$/,feature:'studio.swap'},
 {path:/^\/api\/swaps(\/.*)?$/,feature:'studio.swap'},
 {path:/^\/api\/topaz\/connection$/,methods:['GET'],feature:null},
 {path:/^\/api\/topaz\/connection$/,feature:'studio.own_keys'},
 {path:/^\/api\/topaz\/jobs(\/.*)?$/,feature:'studio.upscale'},
 {path:/^\/api\/uploads$/,feature:null},
 {path:/^\/api\/upscale-import$/,feature:'studio.upscale'},
 {path:/^\/api\/video-connection$/,methods:['GET','PATCH'],feature:null},
 {path:/^\/api\/video-connection$/,feature:'studio.own_keys'},
 {path:/^\/api\/visuals$/,methods:['GET'],feature:null,library:true},
 {path:new RegExp(`^/api/visuals/${ID}$`),methods:['GET'],feature:null,library:true},
 {path:/^\/api\/visuals(\/.*)?$/,feature:null},
];
export function routeRule(pathname:string,method:string):RouteRule|null{
 const m=method.toUpperCase();
 return ROUTE_FEATURES.find(r=>r.path.test(pathname)&&(!r.methods||r.methods.includes(m)))||null;
}
// Plain fields: tests load this file under Node's strip-only TypeScript mode.
export class PlanError extends Error{status:number;constructor(message:string,status=403){super(message);this.status=status}}
export const notOnPlan=(key:FeatureKey)=>`${FEATURE_LABELS[key]} is not on your company's plan. It is available on ${UPSELL_PLAN[key]}; ask Nmesis to add it.`;
export const CLOSED_MESSAGE='Your company\'s Studio subscription is not active, so new work is paused. Your library stays viewable. Ask Nmesis to reopen it.';
export const LIBRARY_CLOSED_MESSAGE='Your company\'s Studio subscription has ended and its library is no longer available here. Ask Nmesis.';
export const VIEWER_MESSAGE='Your role is viewer, so you can look at your company\'s work but not create or change it. Ask your company\'s owner for creator access.';
// What one request may do. Throws PlanError with a plain sentence.
export function requireFeature(ctx:{entitlements:Entitlements},key:FeatureKey){if(!featureOn(ctx.entitlements,key))throw new PlanError(notOnPlan(key))}
export function checkRoute(ctx:{entitlements:Entitlements;role:Role},pathname:string,method:string){
 const rule=routeRule(pathname,method),write=method.toUpperCase()!=='GET',state=workspaceState(ctx.entitlements);
 if(!rule)throw new PlanError('That address is not part of the Studio.',404);
 if(!state.open&&!(rule.library&&!write&&state.libraryOpen))throw new PlanError(state.libraryOpen?CLOSED_MESSAGE:LIBRARY_CLOSED_MESSAGE);
 if(write&&ctx.role==='viewer')throw new PlanError(VIEWER_MESSAGE);
 if(rule.feature)requireFeature(ctx,rule.feature);
 return rule;
}
// A generation size or an upscale target, checked against studio.max_output.
export function requireEdge(ctx:{entitlements:Entitlements},longEdge:number){
 const cap=maxEdge(ctx.entitlements);
 if(!(longEdge<=cap))throw new PlanError(`Your company's plan creates images up to ${cap===2048?'2K':cap===3840?'4K':'8K'}. Choose a smaller size, or ask Nmesis about a larger plan.`);
}
export const longEdgeOf=(size:string)=>{const m=/^(\d{2,5})x(\d{2,5})$/.exec(size);return m?Math.max(Number(m[1]),Number(m[2])):NaN};
