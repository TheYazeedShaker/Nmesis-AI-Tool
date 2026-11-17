import {getDatabase,type StudioDatabase} from '@/lib/portable/database';
import {adminAuth,authConfigured} from '@/lib/auth/supabase';
import {StudioError} from '@/lib/studio-server';
import {MEMBER_ROLES,type Role} from './plan';
import {ttlCache} from './cache';
import {teamDatabaseError,type TeamChange,type TeamPerson,type TeamResult,type TeamStore} from './team';
// The team in Postgres: read through accounts.studio_people and
// accounts.studio_team_changes, changed only through the setup SQL's section 7
// functions (which check the owner again and log). Invitations for someone
// with no sign-in yet go through Supabase Auth's own invitation, on the server,
// with the secret key and the auth client's 10-second timeout.
const roleOf=(v:unknown):Role|null=>MEMBER_ROLES.includes(v as Role)?v as Role:null;
const INVITE_FN="to_regprocedure('accounts.studio_team_invite(uuid,uuid,text,text)')";
const READY_SQL=`SELECT CASE WHEN ${INVITE_FN} IS NULL OR to_regclass('accounts.studio_team_changes') IS NULL THEN false ELSE has_function_privilege(${INVITE_FN},'execute') AND has_table_privilege(to_regclass('accounts.studio_team_changes'),'select') END AS ok`;
const readyCache=ttlCache<boolean>(60_000,4);
function parse(raw:unknown):TeamResult{
 let v:unknown=raw;
 if(typeof raw==='string'){try{v=JSON.parse(raw)}catch{v=null}}
 const d=v&&typeof v==='object'?v as Record<string,unknown>:{};
 const result=typeof d.result==='string'?d.result:'';
 const known=['invited','already_member','no_account','no_seats','changed','unchanged','not_member','last_owner','removed'];
 if(!known.includes(result))throw new StudioError('That change couldn’t be made. Try again.',502);
 return {result:result as TeamResult['result'],userId:typeof d.user_id==='string'?d.user_id:undefined,seats:Number.isFinite(Number(d.seats))&&d.seats!==undefined?Number(d.seats):undefined};
}
const iso=(v:unknown)=>{const t=v instanceof Date?v.getTime():Date.parse(String(v));return Number.isFinite(t)?new Date(t).toISOString():''};
export function postgresTeamStore(db:StudioDatabase):TeamStore{
 const call=async(text:string,args:unknown[])=>{
  try{return parse(await db.prepare(text).bind(...args).first('r'))}
  catch(e){const mapped=teamDatabaseError(e);if(mapped)throw mapped;throw e}
 };
 return {
  ready:()=>readyCache('ready',async()=>{
   try{return Boolean(await db.prepare(READY_SQL).first('ok'))}
   catch(e){console.warn('Team functions could not be checked; team changes are off',e instanceof Error?e.name:'UnknownError');return false}
  }),
  async people(org){
   const rows=await db.prepare("SELECT user_id::text AS user_id,role,status,email FROM accounts.studio_people WHERE org_id=CAST(? AS uuid) AND status IN ('active','invited') ORDER BY email").bind(org).all<Record<string,unknown>>();
   return rows.results.flatMap((r):TeamPerson[]=>{const role=roleOf(r.role);return role?[{userId:String(r.user_id),email:String(r.email||''),role,status:r.status==='active'?'active':'invited'}]:[]});
  },
  async log(org,limit){
   const rows=await db.prepare('SELECT at,actor_email,action,email,role_before,role_after FROM accounts.studio_team_changes WHERE org_id=CAST(? AS uuid) ORDER BY at DESC,id DESC LIMIT '+Math.max(1,Math.min(100,Math.floor(limit)))).bind(org).all<Record<string,unknown>>();
   return rows.results.flatMap((r):TeamChange[]=>{const action=r.action==='invite'||r.action==='role'||r.action==='remove'?r.action:null;return action?[{at:iso(r.at),actorEmail:String(r.actor_email||''),action,email:String(r.email||''),roleBefore:roleOf(r.role_before),roleAfter:roleOf(r.role_after)}]:[]});
  },
  invite:(org,actor,email,role)=>call('SELECT accounts.studio_team_invite(CAST(? AS uuid),CAST(? AS uuid),?,?) AS r',[org,actor,email,role]),
  setRole:(org,actor,user,role)=>call('SELECT accounts.studio_team_set_role(CAST(? AS uuid),CAST(? AS uuid),CAST(? AS uuid),?) AS r',[org,actor,user,role]),
  remove:(org,actor,user)=>call('SELECT accounts.studio_team_remove(CAST(? AS uuid),CAST(? AS uuid),CAST(? AS uuid)) AS r',[org,actor,user]),
  async sendInvite(email,redirectTo){
   if(!authConfigured())return {ok:false,reason:'failed'};
   try{
    const {error}=await adminAuth().auth.admin.inviteUserByEmail(email,{redirectTo});
    if(!error)return {ok:true};
    const code=String((error as {code?:unknown}).code||''),status=Number((error as {status?:unknown}).status)||0;
    if(code==='email_exists'||code==='user_already_exists'||status===422)return {ok:false,reason:'exists'};
    if(status===429||code.startsWith('over_'))return {ok:false,reason:'rate_limited'};
    console.warn('Team invitation not sent',JSON.stringify({code:code.slice(0,40)||null,status}));
    return {ok:false,reason:status?'failed':'unreachable'};
   }catch(e){
    console.warn('Team invitation not sent: the sign-in service did not answer',e instanceof Error?e.name:'UnknownError');
    return {ok:false,reason:'unreachable'};
   }
  },
 };
}
let store:TeamStore|undefined;
export function getTeamStore():TeamStore{
 const db=getDatabase();
 if(!db)throw new StudioError('Company settings are not connected on this Studio yet.',503);
 return store??=postgresTeamStore(db);
}
