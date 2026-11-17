import {getDatabase,type StudioDatabase} from '@/lib/portable/database';
import {MEMBER_ROLES,readEntitlements,type Entitlements,type Role} from './plan';
// The master list, read-only, through the studio's own Postgres role. Only the
// narrow `accounts.studio_*` views and two functions are granted to it
// (docs/supabase-setup.sql); the admin owns and writes everything here.
export type Membership={orgId:string;orgName:string;orgKind:string;role:Role;status:'active'|'invited'};
export type Organisation={id:string;name:string;kind:string};
export type Car={brandId:string;modelId:string;brandName:string;modelName:string;path:string;template:string};
/** A brand a company owns (accounts.organisation_brands): what its people work as. */
export type Brand={id:string;name:string};
export type Directory={
 memberships(userId:string):Promise<Membership[]>;
 staffRole(userId:string):Promise<string|null>;
 /** Both of the above in one statement (a request's first read); optional, so test directories may leave it out. */
 person?(userId:string):Promise<{staffRole:string|null;memberships:Membership[]}>;
 organisation(orgId:string):Promise<Organisation|null>;
 organisations():Promise<Organisation[]>;
 entitlements(orgId:string):Promise<Entitlements|null>;
 cars(orgId:string|null):Promise<Car[]>;
 // Each company's brands, by company id (accounts.studio_brands; before that view exists, the brands of the company's cars).
 brands():Promise<Map<string,Brand[]>>;
 acceptInvitations(userId:string):Promise<number>;
 // The clients that grant Nmesis support access now: org id → until (epoch ms),
 // as the given member of staff may read them (studio.support_grants, RLS).
 supportGrants(userId:string):Promise<Map<string,number>>;
};
export const PERSON_SQL="SELECT (SELECT role FROM accounts.studio_staff WHERE user_id=?::uuid AND active LIMIT 1) AS staff_role, COALESCE((SELECT json_agg(json_build_object('org_id',m.org_id::text,'org_name',m.org_name,'org_kind',m.org_kind,'role',m.role,'status',m.status) ORDER BY m.org_name) FROM accounts.studio_memberships m WHERE m.user_id=?::uuid AND m.status IN ('active','invited')),'[]'::json) AS memberships";
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
import {ttlCache} from './cache';
export {ttlCache};
const roleOf=(v:unknown):Role|null=>MEMBER_ROLES.includes(v as Role)?v as Role:null;
export function postgresDirectory(db:StudioDatabase):Directory{
 const brandMap=ttlCache<Map<string,Brand[]>>(60_000),orgs=ttlCache<Organisation|null>(60_000),ents=ttlCache<Entitlements|null>(60_000),cars=ttlCache<Car[]>(10*60_000),all=ttlCache<Organisation[]>(60_000);
 const org=(r:Record<string,unknown>):Organisation=>({id:String(r.id),name:String(r.name||'Unnamed company'),kind:String(r.kind||'client')});
 const member=(r:Record<string,unknown>):Membership[]=>{const role=roleOf(r.role);return role&&UUID.test(String(r.org_id))?[{orgId:String(r.org_id),orgName:String(r.org_name||'Unnamed company'),orgKind:String(r.org_kind||'client'),role,status:r.status==='active'?'active' as const:'invited' as const}]:[]};
 return {
  async memberships(userId){
   if(!UUID.test(userId))return [];
   const rows=await db.prepare("SELECT org_id::text AS org_id,org_name,org_kind,role,status FROM accounts.studio_memberships WHERE user_id=?::uuid AND status IN ('active','invited') ORDER BY org_name").bind(userId).all<Record<string,unknown>>();
   return rows.results.flatMap(member);
  },
  // The staff role and the memberships in one statement, the user id a parameter.
  async person(userId){
   if(!UUID.test(userId))return {staffRole:null,memberships:[]};
   const r=await db.prepare(PERSON_SQL).bind(userId,userId).first<{staff_role:unknown;memberships:unknown}>();
   let list:unknown=r?.memberships;
   if(typeof list==='string'){try{list=JSON.parse(list)}catch{list=[]}}
   return {staffRole:r?.staff_role==null?null:String(r.staff_role),memberships:Array.isArray(list)?(list as Record<string,unknown>[]).flatMap(member):[]};
  },
  async staffRole(userId){if(!UUID.test(userId))return null;const r=await db.prepare('SELECT role FROM accounts.studio_staff WHERE user_id=?::uuid AND active').bind(userId).first<{role:string}>();return r?String(r.role):null},
  organisation:orgId=>UUID.test(orgId)?orgs(orgId,async()=>{const r=await db.prepare('SELECT id::text AS id,name,kind FROM accounts.studio_organisations WHERE id=?::uuid').bind(orgId).first<Record<string,unknown>>();return r?org(r):null}):Promise.resolve(null),
  organisations:()=>all('all',async()=>(await db.prepare("SELECT id::text AS id,name,kind FROM accounts.studio_organisations ORDER BY kind DESC,name LIMIT 500").all<Record<string,unknown>>()).results.map(org)),
  entitlements:orgId=>UUID.test(orgId)?ents(orgId,async()=>{const r=await db.prepare('SELECT accounts.entitlements(?::uuid) AS e').bind(orgId).first<{e:unknown}>();return r?.e?readEntitlements(typeof r.e==='string'?JSON.parse(r.e):r.e):null}):Promise.resolve(null),
  cars:orgId=>cars(orgId||'*',async()=>{
   const rows=orgId?await db.prepare('SELECT c.brand_id,c.model_id,c.brand_name,c.model_name,c.configurator_url,s.capture_template FROM accounts.studio_cars c LEFT JOIN studio.car_settings s ON s.brand_id=c.brand_id AND s.model_id=c.model_id WHERE c.org_id=?::uuid ORDER BY c.brand_name,c.model_name').bind(orgId).all<Record<string,unknown>>()
    :await db.prepare('SELECT c.brand_id,c.model_id,c.brand_name,c.model_name,c.configurator_url,s.capture_template FROM accounts.studio_live_cars c LEFT JOIN studio.car_settings s ON s.brand_id=c.brand_id AND s.model_id=c.model_id ORDER BY c.brand_name,c.model_name').all<Record<string,unknown>>();
   return rows.results.map(r=>({brandId:String(r.brand_id),modelId:String(r.model_id),brandName:String(r.brand_name||r.brand_id),modelName:String(r.model_name||r.model_id),path:String(r.configurator_url||''),template:String(r.capture_template||'capture')}));
  }),
  brands:()=>brandMap('all',async()=>{
   let rows:Record<string,unknown>[];
   try{rows=(await db.prepare('SELECT org_id::text AS org_id,brand_id,brand_name FROM accounts.studio_brands ORDER BY brand_name').all<Record<string,unknown>>()).results}
   catch(e){
    // The view comes with the setup SQL's section 5 (re-run by the owner); until then the brands of each company's cars.
    console.warn('accounts.studio_brands is not readable yet; brands come from the cars',e instanceof Error?e.name:'UnknownError');
    rows=(await db.prepare('SELECT DISTINCT org_id::text AS org_id,brand_id,brand_name FROM accounts.studio_cars ORDER BY brand_name').all<Record<string,unknown>>()).results;
   }
   const out=new Map<string,Brand[]>();
   for(const r of rows){const org=String(r.org_id),id=String(r.brand_id||'');if(!UUID.test(org)||!id)continue;const list=out.get(org)||[];if(!list.some(b=>b.id===id))list.push({id,name:String(r.brand_name||id).slice(0,80)});out.set(org,list)}
   return out;
  }),
  async supportGrants(userId){
   if(!UUID.test(userId))return new Map();
   try{const rows=await db.forUser(userId).prepare('SELECT org_id,until FROM studio.support_grants WHERE until>CAST(? AS BIGINT)').bind(Date.now()).all<{org_id:string;until:number}>();return new Map(rows.results.map(r=>[String(r.org_id),Number(r.until)]))}
   catch(e){console.error('Support grants could not be read; no client is open to staff',e instanceof Error?e.name:'UnknownError');return new Map()}
  },
  async acceptInvitations(userId){if(!UUID.test(userId))return 0;const r=await db.prepare('SELECT accounts.studio_accept_membership(?::uuid) AS n').bind(userId).first<{n:number}>();return Number(r?.n)||0},
 };
}
let directory:Directory|undefined;
export function getDirectory():Directory|undefined{const db=getDatabase();if(!db)return undefined;return directory??=postgresDirectory(db)}
