import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {StudioError,imageKey,validId,type RequestContext} from './studio-server';
import {isUserPrefix,orgOf,userOf} from './portable/tenancy';
import {accessReady,indexReady} from './library-index';
import {locate} from './org-library';
import {can} from './accounts/can';
import {teamPage,type TeamStore} from './accounts/team';
import type {Role} from './accounts/plan';
import type {StudioBucket} from './portable/storage';
// Share (migration 0011): who in the company sees a piece of work, and its
// public view link. Server only; the panel is components/share/share-panel.tsx.
//
// Access, set by the work's creator or a company owner (never staff viewing
// with support access, never a viewer):
//  - 'private' (Only me): left out of the library for everyone but its creator
//    (lib/library-page.ts) and, for a picture, answered 404 by /api/visuals/<id>
//    and /api/assets/<id>. Nmesis staff viewing with support access still see it.
//  - 'view' (Company can view): everyone in the company; the default (no row).
//  - 'edit' (Company can edit): stored and shown. What owners and creators may
//    do to company work today (move it between folders) does not depend on it.
// Public view link: off by default; a random 32-byte token (base64url) shown
// once, of which only the SHA-256 is stored; 1, 7 or 30 days; off at any time.
// Making a new link turns the previous one off. /view/<token> (app/view) reads
// it through studio.public_share, the one way past row level security.

export const SHARE_KINDS=['visual','film','swap','story'] as const;
export type ShareKind=typeof SHARE_KINDS[number];
export const ACCESS_LEVELS=['private','view','edit'] as const;
export type Access=typeof ACCESS_LEVELS[number];
export const DEFAULT_ACCESS:Access='view';
export const LINK_DAYS=[1,7,30] as const;
export const DEFAULT_LINK_DAYS=7;
export const DAY_MS=86_400_000;
export const TOKEN_BYTES=32;
/** A public link's token as /view/<token> accepts it (proxy.ts lets exactly these through). */
export const TOKEN_SHAPE=/^[A-Za-z0-9_-]{20,80}$/;

export const NOT_HERE='That piece of work isn’t in your library.';
export const MANAGERS_ONLY='Only the person who made this, or an owner of your company, can change who can see it.';
const NOT_YET='Sharing isn’t available on this Studio yet. Try again later.';

export type SharePerson={key:string;label:string;role:Role|null;you:boolean;
 /** Made this piece of work. */maker:boolean;canView:boolean;canEdit:boolean;
 /** A row standing for several people whose addresses this person does not see. */count?:number};
export type ShareLink={on:boolean;expiresAt:number};
export type ShareState={kind:ShareKind;id:string;title:string;access:Access;canManage:boolean;mine:boolean;
 /** null: no link (never made, or turned off). on:false: it expired. */link:ShareLink|null;
 /** null when the company's people could not be read. */people:SharePerson[]|null};

type Ctx=Pick<RequestContext,'DB'|'BUCKET'|'org'|'prefix'|'role'|'userId'|'entitlements'|'account'>;
type Db=NonNullable<RequestContext['DB']>;

// ── Tokens ─────────────────────────────────────────────────────────────────
export const newToken=()=>randomBytes(TOKEN_BYTES).toString('base64url');
export const hashToken=(token:string)=>createHash('sha256').update(token,'utf8').digest('hex');

// ── Input ──────────────────────────────────────────────────────────────────
export function cleanKind(value:unknown):ShareKind{
 if(typeof value!=='string'||!(SHARE_KINDS as readonly string[]).includes(value))throw new StudioError(NOT_HERE,404);
 return value as ShareKind;
}
export function cleanAccess(value:unknown):Access{
 if(typeof value!=='string'||!(ACCESS_LEVELS as readonly string[]).includes(value))throw new StudioError('Choose Only me, Company can view or Company can edit.');
 return value as Access;
}
export function cleanDays(value:unknown):number{
 if(value===undefined||value===null)return DEFAULT_LINK_DAYS;
 if(typeof value!=='number'||!(LINK_DAYS as readonly number[]).includes(value))throw new StudioError('Choose 1, 7 or 30 days.');
 return value;
}

// ── Rules ──────────────────────────────────────────────────────────────────
/** The creator or a company owner, as a member who may change work (not staff viewing, not a viewer). */
export function canManage(ctx:Pick<Ctx,'prefix'|'role'|'account'>,owner:string){
 return can({role:ctx.role,viewingAs:ctx.account.viewingAs},'share.manage')&&(owner===ctx.prefix||ctx.role==='owner');
}
/** "Only me" work of someone else: answered as if it were not there. */
export function hiddenFrom(ctx:Pick<Ctx,'prefix'|'account'>,owner:string,access:Access){
 return access==='private'&&owner!==ctx.prefix&&!ctx.account.viewingAs;
}
export type LinkRow={expires_at:number|string;revoked_at:number|string|null};
export function linkState(row:LinkRow|null|undefined,now=Date.now()):'on'|'expired'|'off'{
 if(!row||(row.revoked_at!==null&&row.revoked_at!==undefined))return 'off';
 return Number(row.expires_at)>now?'on':'expired';
}

// ── The work ───────────────────────────────────────────────────────────────
export type Work={kind:ShareKind;id:string;owner:string;title:string;assetId:string|null;status:string;indexed:boolean};
function database(ctx:Pick<Ctx,'DB'>):Db{if(!ctx.DB)throw new StudioError(NOT_YET,503);return ctx.DB}
async function ready(ctx:Pick<Ctx,'DB'>){const db=database(ctx);if(!await accessReady(db)||!await indexReady(db))throw new StudioError(NOT_YET,503);return db}
/** A piece of this company's work that is not deleted, from the library index (or, before it is indexed, its own record). */
export async function findWork(ctx:Ctx,kindValue:unknown,id:unknown):Promise<Work>{
 const kind=cleanKind(kindValue);if(!validId(id))throw new StudioError(NOT_HERE,404);
 const db=await ready(ctx);
 const row=await db.prepare('SELECT owner,title,asset_id,status,deleted_at FROM library_items WHERE org_id=? AND kind=? AND id=?').bind(ctx.org,kind,id).first<{owner:string;title:string;asset_id:string|null;status:string;deleted_at:number|null}>();
 if(row){
  if(row.deleted_at!==null&&row.deleted_at!==undefined)throw new StudioError(NOT_HERE,404);
  if(!isUserPrefix(row.owner)||orgOf(row.owner)!==ctx.org)throw new StudioError(NOT_HERE,404);
  return {kind,id,owner:row.owner,title:row.title,assetId:row.asset_id,status:row.status,indexed:true};
 }
 // Work from before the index (0007) waits for lib/library-backfill.ts; until then its own record says whose it is.
 const table=kind==='film'?'films':kind==='swap'?'swap_jobs':kind==='story'?'storyboards':'image_jobs';
 const job=await db.prepare(`SELECT owner FROM ${table} WHERE id=? AND org_id=?${kind==='visual'?'':' AND deleted_at IS NULL'}`).bind(id,ctx.org).first<{owner:string}>();
 let owner=job&&isUserPrefix(job.owner)&&orgOf(job.owner)===ctx.org?job.owner:null;
 if(!owner&&kind==='visual'){
  owner=await locate(ctx,'visuals/'+id+'.json');
  if(owner&&await ctx.BUCKET?.head(owner+'deleted-visuals/'+id+'.json'))owner=null;
 }
 if(!owner)throw new StudioError(NOT_HERE,404);
 return {kind,id,owner,title:'Untitled',assetId:null,status:'working',indexed:false};
}
export async function readAccess(db:Db,org:string,kind:ShareKind,id:string):Promise<Access>{
 const row=await db.prepare('SELECT access FROM work_access WHERE org_id=? AND item_kind=? AND item_id=?').bind(org,kind,id).first<{access:string}>();
 return row&&(ACCESS_LEVELS as readonly string[]).includes(row.access)?row.access as Access:DEFAULT_ACCESS;
}
/** For the routes that open one piece of work (/api/visuals/<id>, /api/assets/<id>): someone else's "Only me" work answers 404. */
export async function hiddenFromRequester(ctx:Pick<Ctx,'DB'|'org'|'prefix'|'account'>,kind:ShareKind,id:string,owner:string){
 if(owner===ctx.prefix||ctx.account.viewingAs||!ctx.DB||!await accessReady(ctx.DB))return false;
 return hiddenFrom(ctx,owner,await readAccess(ctx.DB,ctx.org,kind,id));
}
/** The work, when this person may change who sees it: 404 when they may not even see it, else 403. */
async function managed(ctx:Ctx,kind:unknown,id:unknown){
 const work=await findWork(ctx,kind,id),db=database(ctx);
 if(!canManage(ctx,work.owner)){
  if(hiddenFrom(ctx,work.owner,await readAccess(db,ctx.org,work.kind,work.id)))throw new StudioError(NOT_HERE,404);
  throw new StudioError(MANAGERS_ONLY,403);
 }
 return {work,db};
}

// ── People with access ─────────────────────────────────────────────────────
type TeamView={people:{userId:string;email:string;role:Role;you:boolean}[];others:number};
const ROLE_WORDS:Record<Role,string>={owner:'Owner',creator:'Creator',viewer:'Viewer'};
/** The company's people as this person may see them (lib/accounts/team.ts teamPage: owners see
 *  everyone; creators and viewers see the owners and themselves), and what each may do with it. */
export function peopleWithAccess(team:TeamView,owner:string,access:Access):SharePerson[]{
 const maker=userOf(owner),company=access!=='private';
 const rows:SharePerson[]=team.people.map(p=>{const made=p.userId===maker;
  return {key:p.userId,label:p.email||ROLE_WORDS[p.role],role:p.role,you:p.you,maker:made,canView:made||company,canEdit:made||(access==='edit'&&p.role!=='viewer')}});
 let others=team.others;
 // The creator, when this person does not see their address.
 if(maker&&!rows.some(r=>r.maker)){rows.push({key:'maker',label:'The person who made it',role:null,you:false,maker:true,canView:true,canEdit:true});others=Math.max(0,others-1)}
 rows.sort((a,b)=>Number(b.maker)-Number(a.maker)||Number(b.you)-Number(a.you));
 if(others>0)rows.push({key:'others',label:`${others} other ${others===1?'person':'people'} in your company`,role:null,you:false,maker:false,canView:company,canEdit:access==='edit',count:others});
 return rows;
}

// ── Links ──────────────────────────────────────────────────────────────────
async function latestLink(db:Db,org:string,kind:ShareKind,id:string,now:number):Promise<ShareLink|null>{
 const row=await db.prepare('SELECT expires_at,revoked_at FROM share_links WHERE org_id=? AND item_kind=? AND item_id=? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1').bind(org,kind,id).first<LinkRow>();
 const state=linkState(row,now);
 return state==='off'||!row?null:{on:state==='on',expiresAt:Number(row.expires_at)};
}

// ── What the routes do ─────────────────────────────────────────────────────
export async function shareState(ctx:Ctx,kind:unknown,id:unknown,team?:()=>TeamStore,now=Date.now()):Promise<ShareState>{
 const work=await findWork(ctx,kind,id),db=database(ctx);
 const access=await readAccess(db,ctx.org,work.kind,work.id),manage=canManage(ctx,work.owner);
 if(hiddenFrom(ctx,work.owner,access)&&!manage)throw new StudioError(NOT_HERE,404);
 let people:SharePerson[]|null=null;
 if(team){
  try{people=peopleWithAccess(await teamPage(ctx,team()),work.owner,access)}
  catch(e){console.warn('Share: the company’s people did not load',e instanceof Error?e.name:'UnknownError')}
 }
 return {kind:work.kind,id:work.id,title:work.title,access,canManage:manage,mine:work.owner===ctx.prefix,link:await latestLink(db,ctx.org,work.kind,work.id,now),people};
}
export async function setAccess(ctx:Ctx,kind:unknown,id:unknown,value:unknown,now=Date.now()){
 const access=cleanAccess(value);
 const {work,db}=await managed(ctx,kind,id);
 await db.prepare(`INSERT INTO work_access(org_id,item_kind,item_id,access,updated_by,updated_at) VALUES(?,?,?,?,?,?)
  ON CONFLICT(environment,item_kind,item_id) DO UPDATE SET access=excluded.access,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE work_access.org_id=excluded.org_id`).bind(ctx.org,work.kind,work.id,access,ctx.prefix,now).run();
 return {access};
}
/** Makes (or replaces) the public link; the token is returned once and never stored. */
export async function createLink(ctx:Ctx,kind:unknown,id:unknown,daysValue:unknown,now=Date.now()){
 const days=cleanDays(daysValue);
 const {work,db}=await managed(ctx,kind,id);
 if(work.kind!=='visual')throw new StudioError('A public view link can be made for pictures for now.',409);
 if(!work.indexed||work.status!=='ready'||!validId(work.assetId))throw new StudioError('This picture isn’t ready to share yet. Try again in a minute.',409);
 const token=newToken(),expiresAt=now+days*DAY_MS;
 await db.batch([
  db.prepare('UPDATE share_links SET revoked_at=? WHERE org_id=? AND item_kind=? AND item_id=? AND revoked_at IS NULL').bind(now,ctx.org,work.kind,work.id),
  db.prepare('INSERT INTO share_links(id,org_id,item_kind,item_id,token_hash,expires_at,revoked_at,created_by,created_at) VALUES(?,?,?,?,?,?,NULL,?,?)').bind(randomUUID(),ctx.org,work.kind,work.id,hashToken(token),expiresAt,ctx.prefix,now),
 ]);
 return {token,expiresAt,days};
}
export async function turnOffLink(ctx:Ctx,kind:unknown,id:unknown,now=Date.now()){
 const {work,db}=await managed(ctx,kind,id);
 await db.prepare('UPDATE share_links SET revoked_at=? WHERE org_id=? AND item_kind=? AND item_id=? AND revoked_at IS NULL').bind(now,ctx.org,work.kind,work.id).run();
 return {link:null};
}
export const linkUrl=(origin:string,token:string)=>`${origin.replace(/\/+$/,'')}/view/${token}`;

// ── The public page ────────────────────────────────────────────────────────
type PlainDb={prepare(sql:string):{bind(...v:unknown[]):{first<T=unknown>():Promise<T|null>}}};
export type PublicShare={org:string;kind:ShareKind;id:string;owner:string;title:string;assetId:string;expiresAt:number};
/** Postgres: the SECURITY DEFINER lookup of 0011 (the page has no signed-in user). */
export const PUBLIC_SHARE_SQL='SELECT org_id,item_kind,item_id,owner,title,asset_id,expires_at FROM studio.public_share(?,?)';
/** The work behind a public token, or null (malformed, unknown, turned off, expired, deleted).
 *  The database decides; the answer is checked again here and fails closed. */
export async function publicShare(db:PlainDb|undefined,token:unknown,env:string,now=Date.now()):Promise<PublicShare|null>{
 if(!db||typeof token!=='string'||!TOKEN_SHAPE.test(token))return null;
 const row=await db.prepare(PUBLIC_SHARE_SQL).bind(hashToken(token),env).first<{org_id:string;item_kind:string;item_id:string;owner:string;title:string;asset_id:string|null;expires_at:number|string}>();
 if(!row||!(SHARE_KINDS as readonly string[]).includes(row.item_kind)||!(Number(row.expires_at)>now))return null;
 if(!isUserPrefix(row.owner)||orgOf(row.owner)!==row.org_id||!validId(row.asset_id))return null;
 return {org:row.org_id,kind:row.item_kind as ShareKind,id:row.item_id,owner:row.owner,title:row.title,assetId:row.asset_id,expiresAt:Number(row.expires_at)};
}
/** A short-lived signed link to the picture, built from the stored owner prefix and id (as /api/assets/<id>). */
export async function publicPicture(store:Pick<StudioBucket,'head'|'downloadUrl'>|undefined,share:PublicShare):Promise<string|null>{
 if(!store)return null;
 const key=imageKey(share.owner,share.assetId);
 if(!await store.head(key))return null;
 return store.downloadUrl(key);
}
