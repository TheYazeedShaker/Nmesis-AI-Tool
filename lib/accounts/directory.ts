import {getDatabase,type StudioDatabase} from '@/lib/portable/database';
import {MEMBER_ROLES,readEntitlements,type Entitlements,type Role} from './plan';
// The master list, read-only, through the studio's own Postgres role. Only the
// narrow `accounts.studio_*` views and two functions are granted to it
// (docs/supabase-setup.sql); the admin owns and writes everything here.
export type Membership={orgId:string;orgName:string;orgKind:string;role:Role;status:'active'|'invited'};
export type Organisation={id:string;name:string;kind:string};
export type Car={brandId:string;modelId:string;brandName:string;modelName:string;path:string;template:string};
export type Directory={
 memberships(userId:string):Promise<Membership[]>;
 staffRole(userId:string):Promise<string|null>;
 organisation(orgId:string):Promise<Organisation|null>;
 organisations():Promise<Organisation[]>;
 entitlements(orgId:string):Promise<Entitlements|null>;
 cars(orgId:string|null):Promise<Car[]>;
 acceptInvitations(userId:string):Promise<number>;
};
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
import {ttlCache} from './cache';
export {ttlCache};
const roleOf=(v:unknown):Role|null=>MEMBER_ROLES.includes(v as Role)?v as Role:null;
export function postgresDirectory(db:StudioDatabase):Directory{
 const orgs=ttlCache<Organisation|null>(60_000),ents=ttlCache<Entitlements|null>(60_000),cars=ttlCache<Car[]>(10*60_000),all=ttlCache<Organisation[]>(60_000);
 const org=(r:Record<string,unknown>):Organisation=>({id:String(r.id),name:String(r.name||'Unnamed company'),kind:String(r.kind||'client')});
 return {
  async memberships(userId){
   if(!UUID.test(userId))return [];
   const rows=await db.prepare("SELECT org_id::text AS org_id,org_name,org_kind,role,status FROM accounts.studio_memberships WHERE user_id=?::uuid AND status IN ('active','invited') ORDER BY org_name").bind(userId).all<Record<string,unknown>>();
   return rows.results.flatMap(r=>{const role=roleOf(r.role);return role&&UUID.test(String(r.org_id))?[{orgId:String(r.org_id),orgName:String(r.org_name||'Unnamed company'),orgKind:String(r.org_kind||'client'),role,status:r.status==='active'?'active' as const:'invited' as const}]:[]});
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
  async acceptInvitations(userId){if(!UUID.test(userId))return 0;const r=await db.prepare('SELECT accounts.studio_accept_membership(?::uuid) AS n').bind(userId).first<{n:number}>();return Number(r?.n)||0},
 };
}
let directory:Directory|undefined;
export function getDirectory():Directory|undefined{const db=getDatabase();if(!db)return undefined;return directory??=postgresDirectory(db)}
