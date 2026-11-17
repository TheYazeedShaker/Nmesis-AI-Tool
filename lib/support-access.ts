import {StudioError,type RequestContext} from './studio-server';
// "Allow Nmesis support access": a client owner opens their workspace to Nmesis
// staff for 7 days (renewable), with an optional note. Off by default. While it
// lasts, staff see the company in their switcher and open it read-only; every
// opening is logged (studio.staff_access_log) and the owner can read the log.
// Nmesis's own workspace (kind internal) needs no grant.
export const SUPPORT_DAYS=7;
const DAY=86_400_000;
type Ctx=Pick<RequestContext,'DB'|'org'|'userId'|'role'|'account'>;
// log: when Nmesis opened the workspace, at which page (`page` is the page's name, "Library"; `path` the address).
export type SupportState={internal:boolean;grant:{grantedAt:string;until:string;note:string}|null;active:boolean;canEdit:boolean;log:{at:string;page:string;path:string}[]};
// The name of a Studio page, for the openings log ("Key visual", not "/key-visual").
const PAGE_NAMES:[RegExp,string][]=[
 [/^\/$/,'Home'],[/^\/library$/,'Library'],[/^\/projects$/,'Projects'],[/^\/projects\/[^/]+$/,'A folder'],
 [/^\/key-visual$/,'Key visual'],[/^\/lineup$/,'Line-up'],[/^\/films$/,'Film'],[/^\/swap$/,'Swap'],[/^\/storyboard$/,'Story'],
 [/^\/nano-lab$/,'Reference lab'],[/^\/usage$/,'Usage'],[/^\/company$/,'Company settings'],
];
export function pageName(path:unknown):string{
 const p=typeof path==='string'?(path.split(/[?#]/)[0].replace(/(.)\/+$/,'$1')||'/'):'/';
 return PAGE_NAMES.find(([r])=>r.test(p))?.[1]||'The Studio';
}
function db(ctx:Pick<Ctx,'DB'>){if(!ctx.DB)throw new StudioError('Company settings are not connected on this Studio yet.',503);return ctx.DB}
export function cleanNote(value:unknown){
 if(value===undefined||value===null)return '';
 if(typeof value!=='string')throw new StudioError('Write the note as plain text.');
 const note=value.replace(/[\u0000-\u001f\u007f]+/g,' ').trim();
 if(note.length>300)throw new StudioError('Keep the note under 300 characters.');
 return note;
}
// Only the company's own owners (not staff "viewing as", not creators or viewers).
export function requireOwner(ctx:Pick<Ctx,'role'|'account'>){
 if(ctx.role!=='owner'||ctx.account.viewingAs)throw new StudioError('Only your company’s owners can change support access.',403);
 if(ctx.account.org.kind==='internal')throw new StudioError('Nmesis’s own workspace doesn’t need support access.',400);
}
const iso=(ms:number)=>new Date(ms).toISOString();
// Everyone in the company may read it (owners change it); staff read it while they have access.
export async function supportState(ctx:Ctx,now=Date.now()):Promise<SupportState>{
 const internal=ctx.account.org.kind==='internal',canEdit=ctx.role==='owner'&&!ctx.account.viewingAs&&!internal;
 const row=await db(ctx).prepare('SELECT granted_at,until,note FROM support_grants WHERE org_id=?').bind(ctx.org).first<{granted_at:number;until:number;note:string|null}>();
 const log=await db(ctx).prepare('SELECT at,path FROM staff_access_log WHERE org_id=? ORDER BY at DESC LIMIT 50').bind(ctx.org).all<{at:number;path:string|null}>();
 return {internal,grant:row?{grantedAt:iso(Number(row.granted_at)),until:iso(Number(row.until)),note:row.note||''}:null,active:!!row&&Number(row.until)>now,canEdit,log:log.results.map(r=>({at:iso(Number(r.at)),page:pageName(r.path),path:String(r.path||'/')}))};
}
// Turn on, or renew for another 7 days from now.
export async function grantSupport(ctx:Ctx,note:unknown,now=Date.now()){
 requireOwner(ctx);const text=cleanNote(note);
 await db(ctx).prepare('INSERT INTO support_grants(org_id,granted_by,granted_at,until,note) VALUES(?,?,CAST(? AS BIGINT),CAST(? AS BIGINT),?) ON CONFLICT(org_id) DO UPDATE SET granted_by=excluded.granted_by,granted_at=excluded.granted_at,until=excluded.until,note=excluded.note').bind(ctx.org,ctx.userId,now,now+SUPPORT_DAYS*DAY,text||null).run();
 return supportState(ctx,now);
}
// Turn off now: the grant ends at this moment (kept as the record of the last grant).
export async function withdrawSupport(ctx:Ctx,now=Date.now()){
 requireOwner(ctx);
 await db(ctx).prepare('UPDATE support_grants SET until=CAST(? AS BIGINT) WHERE org_id=? AND until>CAST(? AS BIGINT)').bind(now,ctx.org,now).run();
 return supportState(ctx,now);
}
