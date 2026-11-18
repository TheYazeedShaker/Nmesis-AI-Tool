import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {StudioError,imageKey,imageType,validId,type RequestContext} from './studio-server';
import {isUserPrefix,orgOf,userOf} from './portable/tenancy';
import {accessReady,indexReady} from './library-index';
import {locate} from './org-library';
import {can} from './accounts/can';
import {teamPage,type TeamStore} from './accounts/team';
import type {Role} from './accounts/plan';
import type {StudioBucket} from './portable/storage';
import {studioEnvironment} from './portable/environment';
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
// The page shows a copy of the picture at a neutral key, public/<32 random hex>,
// made when the link is made: its address names no company, person or piece of
// work. The copy is deleted when the link is turned off or replaced, and after
// it expires by the sweep (sweepPublicCopies: the link routes, the public page
// and a daily job, app/api/cron/public-links).

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

// ── Public copies ──────────────────────────────────────────────────────────
/** A public link's picture: a key that names no company, person or piece of work. */
export const PUBLIC_KEY=/^public\/[0-9a-f]{32}$/;
export const newPublicKey=()=>'public/'+randomBytes(16).toString('hex');
const PICTURE_TYPE=/^image\/(png|jpeg|webp)$/;
type CopyStore=Pick<StudioBucket,'get'|'put'|'delete'>;
/** Copies a picture to a new neutral key (server to storage, no browser in between); null when it is not there. */
export async function copyToPublic(store:Pick<StudioBucket,'get'|'put'>,source:string):Promise<string|null>{
 const got=await store.get(source);
 if(!got)return null;
 const bytes=new Uint8Array(await got.arrayBuffer());
 const type=PICTURE_TYPE.test(got.httpMetadata.contentType||'')?got.httpMetadata.contentType!:imageType(bytes);
 if(!type)return null;
 const key=newPublicKey();
 await store.put(key,bytes,{httpMetadata:{contentType:type}});
 return key;
}
/** Deletes the copies; answers the ids of the rows whose copy is gone (a failure is logged and left for the next sweep). */
async function deleteCopies(store:Pick<StudioBucket,'delete'>,rows:{id:string;public_key:string}[]):Promise<string[]>{
 const gone:string[]=[];
 for(const r of rows){
  if(!PUBLIC_KEY.test(r.public_key))continue;
  try{await store.delete(r.public_key);gone.push(r.id)}
  catch(e){console.error('Public link picture not deleted; the next sweep tries again',e instanceof Error?e.name:'UnknownError')}
 }
 return gone;
}
/** This piece of work's dead links (turned off, replaced or expired): their copies, at once. Never fails the request. */
async function clearItemCopies(db:Db,store:CopyStore,org:string,kind:ShareKind,id:string,now:number){
 try{
  const dead=(await db.prepare('SELECT id,public_key FROM share_links WHERE org_id=? AND item_kind=? AND item_id=? AND public_key IS NOT NULL AND cleared_at IS NULL AND (revoked_at IS NOT NULL OR expires_at<=?)').bind(org,kind,id,now).all<{id:string;public_key:string}>()).results;
  for(const done of await deleteCopies(store,dead))await db.prepare('UPDATE share_links SET cleared_at=? WHERE id=? AND org_id=?').bind(now,done,org).run();
 }catch(e){console.error('Public link pictures not cleared; the next sweep tries again',e instanceof Error?e.name:'UnknownError')}
}
type SweepDb={prepare(sql:string):{bind(...v:unknown[]):{all<T=unknown>():Promise<{results:T[]}>;first<T=unknown>():Promise<T|null>}}};
/** Postgres: the SECURITY DEFINER pair of 0011 (dead links of every company in one environment, keys only). */
export const PUBLIC_COPIES_DUE_SQL='SELECT id,public_key FROM studio.public_copies_due(?,?)';
export const PUBLIC_COPIES_CLEARED_SQL='SELECT studio.public_copies_cleared(?,?) AS n';
export const SWEEP_LIMIT=50;
/** Deletes the copies of dead links (turned off or expired) in this environment, oldest first,
 *  at most `limit`; answers how many were cleared. Never throws: a failure is logged and the next sweep tries again. */
export async function sweepPublicCopies(db:SweepDb|undefined,store:CopyStore|undefined,env:string,limit=SWEEP_LIMIT):Promise<number>{
 if(!db||!store)return 0;
 try{
  const due=(await db.prepare(PUBLIC_COPIES_DUE_SQL).bind(env,limit).all<{id:string;public_key:string}>()).results;
  if(!due.length)return 0;
  const gone=await deleteCopies(store,due);
  if(!gone.length)return 0;
  const row=await db.prepare(PUBLIC_COPIES_CLEARED_SQL).bind(env,gone).first<{n:number|string}>();
  return Number(row?.n||0);
 }catch(e){console.error('Public link pictures not swept; the next sweep tries again',e instanceof Error?e.name:'UnknownError');return 0}
}
/** The daily job's caller: Vercel sends Authorization: Bearer <CRON_SECRET>. Compared in constant time; no secret, no entry. */
export function cronAuthorized(header:string|null,secret=process.env.CRON_SECRET):boolean{
 if(!secret||secret.length<16)return false;
 const want=Buffer.from('Bearer '+secret,'utf8'),got=Buffer.from(header||'','utf8');
 return got.length===want.length&&timingSafeEqual(got,want);
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
 if(!ctx.BUCKET)throw new StudioError(NOT_YET,503);
 const store=ctx.BUCKET,token=newToken(),expiresAt=now+days*DAY_MS;
 // The picture the link shows: a copy at a neutral key (no company or person in its address).
 const publicKey=await copyToPublic(store,imageKey(work.owner,work.assetId));
 if(!publicKey)throw new StudioError('This picture isn’t ready to share yet. Try again in a minute.',409);
 try{
  await db.batch([
   db.prepare('UPDATE share_links SET revoked_at=? WHERE org_id=? AND item_kind=? AND item_id=? AND revoked_at IS NULL').bind(now,ctx.org,work.kind,work.id),
   db.prepare('INSERT INTO share_links(id,org_id,item_kind,item_id,token_hash,expires_at,revoked_at,created_by,created_at,public_key) VALUES(?,?,?,?,?,?,NULL,?,?,?)').bind(randomUUID(),ctx.org,work.kind,work.id,hashToken(token),expiresAt,ctx.prefix,now,publicKey),
  ]);
 }catch(e){
  // No link was made: its copy goes too.
  await store.delete(publicKey).catch(err=>console.error('Public link picture not deleted after a failed link',err instanceof Error?err.name:'UnknownError'));
  throw e;
 }
 // The link it replaced: its copy goes now; and any other expired copies in this environment.
 await clearItemCopies(db,store,ctx.org,work.kind,work.id,now);
 await sweepPublicCopies(db,store,studioEnvironment());
 return {token,expiresAt,days};
}
export async function turnOffLink(ctx:Ctx,kind:unknown,id:unknown,now=Date.now()){
 const {work,db}=await managed(ctx,kind,id);
 await db.prepare('UPDATE share_links SET revoked_at=? WHERE org_id=? AND item_kind=? AND item_id=? AND revoked_at IS NULL').bind(now,ctx.org,work.kind,work.id).run();
 // Off: its picture copy is deleted now (and any other expired ones in this environment).
 if(ctx.BUCKET){await clearItemCopies(db,ctx.BUCKET,ctx.org,work.kind,work.id,now);await sweepPublicCopies(db,ctx.BUCKET,studioEnvironment())}
 return {link:null};
}
export const linkUrl=(origin:string,token:string)=>`${origin.replace(/\/+$/,'')}/view/${token}`;

// ── The public page ────────────────────────────────────────────────────────
type PlainDb={prepare(sql:string):{bind(...v:unknown[]):{first<T=unknown>():Promise<T|null>}}};
export type PublicShare={org:string;kind:ShareKind;id:string;title:string;publicKey:string;expiresAt:number};
/** Postgres: the SECURITY DEFINER lookup of 0011 (the page has no signed-in user). */
export const PUBLIC_SHARE_SQL='SELECT org_id,item_kind,item_id,title,public_key,expires_at FROM studio.public_share(?,?)';
/** The work behind a public token, or null (malformed, unknown, turned off, expired, deleted).
 *  The database decides; the answer is checked again here and fails closed. */
export async function publicShare(db:PlainDb|undefined,token:unknown,env:string,now=Date.now()):Promise<PublicShare|null>{
 if(!db||typeof token!=='string'||!TOKEN_SHAPE.test(token))return null;
 const row=await db.prepare(PUBLIC_SHARE_SQL).bind(hashToken(token),env).first<{org_id:string;item_kind:string;item_id:string;title:string;public_key:string|null;expires_at:number|string}>();
 if(!row||!(SHARE_KINDS as readonly string[]).includes(row.item_kind)||!(Number(row.expires_at)>now))return null;
 if(typeof row.public_key!=='string'||!PUBLIC_KEY.test(row.public_key))return null;
 return {org:row.org_id,kind:row.item_kind as ShareKind,id:row.item_id,title:row.title,publicKey:row.public_key,expiresAt:Number(row.expires_at)};
}
/** A short-lived signed link to the link's own copy, at its neutral key: the address names no company, person or work. */
export async function publicPicture(store:Pick<StudioBucket,'head'|'downloadUrl'>|undefined,share:PublicShare):Promise<string|null>{
 if(!store||!PUBLIC_KEY.test(share.publicKey))return null;
 if(!await store.head(share.publicKey))return null;
 return store.downloadUrl(share.publicKey);
}
