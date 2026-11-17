// Stand-in for '@/lib/accounts/team-store' in the route tests: the team of each
// company in memory, with the same rules as the setup SQL's section 7 functions
// (an active owner of a client company asks; one owner always stays; the plan's
// seats; already a member; no sign-in yet). tests/postgres.test.mjs runs the
// real functions. `state.team` is set by the test; every call is recorded.
import {state} from './state.mjs';
import {teamDatabaseError} from '../../lib/accounts/team.ts';
export function memoryTeam({members=[],accounts={},orgs={},seats={},ready=true}={}){
 const calls=[],log=[];
 const owner=(org,actor)=>members.some(m=>m.orgId===org&&m.userId===actor&&m.role==='owner'&&m.status==='active');
 // As the store maps the functions' refusals (42501 not an owner, 22023 not valid).
 const refuse=code=>{const e=new Error('studio_team');e.code=code;throw teamDatabaseError(e)};
 const check=(org,actor)=>{if(orgs[org]==='internal')refuse('22023');if(!owner(org,actor))refuse('42501')};
 const live=org=>members.filter(m=>m.orgId===org&&m.status!=='removed');
 const owners=org=>live(org).filter(m=>m.role==='owner'&&m.status==='active').length;
 return {
  calls,log,members,accounts,
  setReady(v){ready=v},
  ready:async()=>ready,
  people:async org=>live(org).map(m=>({userId:m.userId,email:m.email,role:m.role,status:m.status})),
  log:async org=>log.filter(l=>l.org===org).map(l=>Object.fromEntries(Object.entries(l).filter(([k])=>k!=='org'))),
  async invite(org,actor,email,role){
   calls.push(['invite',org,actor,email,role]);check(org,actor);
   const who=accounts[email];
   if(who&&live(org).some(m=>m.userId===who))return {result:'already_member',userId:who};
   if(seats[org]!==undefined&&live(org).length>=seats[org])return {result:'no_seats',seats:seats[org]};
   if(!who)return {result:'no_account'};
   const old=members.find(m=>m.orgId===org&&m.userId===who);
   if(old)Object.assign(old,{role,status:'invited'});else members.push({orgId:org,userId:who,email,role,status:'invited'});
   log.unshift({org,at:new Date().toISOString(),actorEmail:'',action:'invite',email,roleBefore:null,roleAfter:role});
   return {result:'invited',userId:who};
  },
  async setRole(org,actor,user,role){
   calls.push(['role',org,actor,user,role]);check(org,actor);
   const m=live(org).find(x=>x.userId===user);if(!m)return {result:'not_member'};
   if(m.role===role)return {result:'unchanged'};
   if(m.role==='owner'&&m.status==='active'&&owners(org)<=1)return {result:'last_owner'};
   const before=m.role;m.role=role;log.unshift({org,at:new Date().toISOString(),actorEmail:'',action:'role',email:m.email,roleBefore:before,roleAfter:role});
   return {result:'changed'};
  },
  async remove(org,actor,user){
   calls.push(['remove',org,actor,user]);check(org,actor);
   const m=live(org).find(x=>x.userId===user);if(!m)return {result:'not_member'};
   if(m.role==='owner'&&m.status==='active'&&owners(org)<=1)return {result:'last_owner'};
   m.status='removed';log.unshift({org,at:new Date().toISOString(),actorEmail:'',action:'remove',email:m.email,roleBefore:m.role,roleAfter:null});
   return {result:'removed'};
  },
  // Supabase's invitation: creates the account (a new id) unless it exists.
  async sendInvite(email,redirectTo){
   calls.push(['send',email,redirectTo]);
   if(accounts[email])return {ok:false,reason:'exists'};
   accounts[email]='00000000-0000-4000-8000-'+String(Object.keys(accounts).length+0x900).padStart(12,'0');
   return {ok:true};
  },
 };
}
export const getTeamStore=()=>state.team;
export const postgresTeamStore=()=>state.team;
