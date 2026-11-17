import {StudioError,type RequestContext} from '../studio-server';
import {MEMBER_ROLES,type Role} from './plan';
import {cleanEmail} from '../auth/words';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Company settings → Team: the company's people, and (owners only) invite,
// change role and remove. The Studio never writes the admin's member list
// itself: the changes go through the narrow SECURITY DEFINER functions of
// docs/supabase-setup.sql section 7, which check again that the person asking
// is an active owner of that company and log every change. Before the owner
// has run that section, the team is listed and every change says why it can't.
export type TeamPerson={userId:string;email:string;role:Role;status:'active'|'invited'};
export type TeamChange={at:string;actorEmail:string;action:'invite'|'role'|'remove';email:string;roleBefore:Role|null;roleAfter:Role|null};
export type TeamResult={result:'invited'|'already_member'|'no_account'|'no_seats'|'changed'|'unchanged'|'not_member'|'last_owner'|'removed';userId?:string;seats?:number};
export type InviteSent={ok:true}|{ok:false;reason:'exists'|'rate_limited'|'unreachable'|'failed'};
export type TeamStore={
 /** Whether section 7 is installed and granted. */
 ready():Promise<boolean>;
 people(org:string):Promise<TeamPerson[]>;
 log(org:string,limit:number):Promise<TeamChange[]>;
 invite(org:string,actor:string,email:string,role:Role):Promise<TeamResult>;
 setRole(org:string,actor:string,user:string,role:Role):Promise<TeamResult>;
 remove(org:string,actor:string,user:string):Promise<TeamResult>;
 /** Supabase Auth's invitation: creates the sign-in and emails the link (timed out by the auth client). */
 sendInvite(email:string,redirectTo:string):Promise<InviteSent>;
};
type Ctx=Pick<RequestContext,'org'|'userId'|'role'|'account'|'entitlements'>;
export const ROLE_LABELS:Record<Role,string>={owner:'Owner',creator:'Creator',viewer:'Viewer'};
export const TEAM_NOT_READY='Team changes aren’t switched on for this Studio yet. Nmesis has one setup step left; until then, ask Nmesis to change your team.';
export const OWNERS_ONLY='Only your company’s owners can change the team.';
const SUPPORT_READ_ONLY='You are viewing this company with support access, so the team is read-only.';
const INTERNAL='Nmesis’s own team is managed in the Nmesis admin.';
// Why this person may not change the team, or null when they may.
export function teamBlocker(ctx:Pick<Ctx,'role'|'account'>):string|null{
 if(ctx.account.viewingAs)return SUPPORT_READ_ONLY;
 if(ctx.account.org.kind==='internal')return INTERNAL;
 if(ctx.role!=='owner')return OWNERS_ONLY;
 return null;
}
export function requireTeamOwner(ctx:Pick<Ctx,'role'|'account'>){const why=teamBlocker(ctx);if(why)throw new StudioError(why,403)}
export function cleanRole(value:unknown):Role{
 if(typeof value!=='string'||!MEMBER_ROLES.includes(value as Role))throw new StudioError('Choose Owner, Creator or Viewer.');
 return value as Role;
}
export function cleanPerson(value:unknown):string{
 if(typeof value!=='string'||!UUID.test(value))throw new StudioError('That person isn’t in your team.',404);
 return value;
}
// The plan's seats (the admin's plan feature `studio.seats`), when it sets a number.
export function seatLimit(e:Ctx['entitlements']):number|null{
 const v=e.features['studio.seats'];
 return typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.floor(v):null;
}
export type TeamPage={
 people:(TeamPerson&{you:boolean})[];
 /** People not listed for this person (creators and viewers see the owners and themselves). */
 others:number;
 seats:{taken:number;limit:number|null};
 canEdit:boolean;
 /** Why the change buttons are off, in one sentence (null when they work). */
 blocked:string|null;
 log:TeamChange[];
};
const ORDER:Record<Role,number>={owner:0,creator:1,viewer:2};
// Everyone in the company may read the team. Owners (and Nmesis staff with
// support access) see everybody; creators and viewers see the owners, whom
// they can ask, and themselves: teammates' addresses stay with the owners.
export async function teamPage(ctx:Ctx,store:TeamStore):Promise<TeamPage>{
 const [people,ready]=await Promise.all([store.people(ctx.org),store.ready()]);
 const why=teamBlocker(ctx)??(ready?null:TEAM_NOT_READY);
 const full=ctx.role==='owner'||ctx.account.viewingAs;
 const sorted=[...people].sort((a,b)=>ORDER[a.role]-ORDER[b.role]||a.email.localeCompare(b.email));
 const shown=full?sorted:sorted.filter(p=>p.role==='owner'||p.userId===ctx.userId);
 const log=full&&ready?await store.log(ctx.org,30):[];
 return {people:shown.map(p=>({...p,you:p.userId===ctx.userId})),others:people.length-shown.length,seats:{taken:people.length,limit:seatLimit(ctx.entitlements)},canEdit:!why,blocked:why,log};
}
async function readyOrRefuse(store:TeamStore){if(!await store.ready())throw new StudioError(TEAM_NOT_READY,503)}
const MORE_SEATS='Ask Nmesis for more seats.';
// Invite someone by email. Someone with no sign-in yet gets Supabase's
// invitation email first (it creates their account), then joins as invited.
export async function invitePerson(ctx:Ctx,store:TeamStore,body:Record<string,unknown>,linkOrigin:string):Promise<{said:string}>{
 requireTeamOwner(ctx);
 const email=cleanEmail(body.email);if(!email)throw new StudioError('Enter the person’s email address.');
 const role=cleanRole(body.role);
 await readyOrRefuse(store);
 let r=await store.invite(ctx.org,ctx.userId,email,role),emailed=false;
 if(r.result==='no_account'){
  const sent=await store.sendInvite(email,linkOrigin);
  if(!sent.ok&&sent.reason!=='exists')throw new StudioError(sent.reason==='rate_limited'?'Too many invitations were sent just now. Wait a few minutes, then try again.':'The invitation email couldn’t be sent. Try again in a minute.',sent.reason==='rate_limited'?429:503);
  emailed=sent.ok;
  r=await store.invite(ctx.org,ctx.userId,email,role);
  if(r.result==='no_account')throw new StudioError('The invitation was sent, but their account isn’t ready yet. Try again in a minute.',503);
 }
 if(r.result==='already_member')throw new StudioError(`${email} is already in your team.`,409);
 if(r.result==='no_seats')throw new StudioError(`Every seat on your plan is taken${r.seats!==undefined?` (${r.seats})`:''}. ${MORE_SEATS}`,409);
 if(r.result!=='invited')throw new StudioError('That invitation couldn’t be made. Try again.',409);
 return {said:emailed?`Invitation sent to ${email}. They choose a password from the email.`:`${email} already has a Nmesis sign-in, so they’re added. They see your company when they next sign in.`};
}
export async function changeRole(ctx:Ctx,store:TeamStore,user:unknown,role:unknown):Promise<{said:string}>{
 requireTeamOwner(ctx);
 const who=cleanPerson(user),next=cleanRole(role);
 await readyOrRefuse(store);
 const r=await store.setRole(ctx.org,ctx.userId,who,next);
 return {said:answer(r,`Now ${ROLE_LABELS[next].toLowerCase()}.`)};
}
export async function removePerson(ctx:Ctx,store:TeamStore,user:unknown):Promise<{said:string}>{
 requireTeamOwner(ctx);
 const who=cleanPerson(user);
 await readyOrRefuse(store);
 const r=await store.remove(ctx.org,ctx.userId,who);
 return {said:answer(r,'Removed from your team. Their work stays in the library.')};
}
function answer(r:TeamResult,done:string){
 if(r.result==='not_member')throw new StudioError('That person isn’t in your team.',404);
 if(r.result==='last_owner')throw new StudioError('Your company needs at least one owner. Make someone else an owner first.',409);
 if(r.result==='unchanged')return 'Nothing changed.';
 if(r.result==='changed'||r.result==='removed')return done;
 throw new StudioError('That change couldn’t be made. Try again.',409);
}
// A refusal from the setup SQL's functions (lib/accounts/team-store.ts): the
// person is not an owner there (42501) or the request was not valid (22023).
export function teamDatabaseError(e:unknown):StudioError|null{
 const code=e&&typeof e==='object'&&'code' in e?String((e as {code:unknown}).code):'';
 if(code==='42501')return new StudioError(OWNERS_ONLY,403);
 if(code==='22023')return new StudioError('That change couldn’t be made. Check the address and the role.',400);
 return null;
}
