import {readEntitlements,type Entitlements,type Role} from './plan';
import {UUID,type Directory,type Membership} from './directory';
// Who is asking and for which company, decided from a verified Supabase user and
// the master list. No I/O of its own beyond the directory, so tests drive it.
export type OrgChoice={id:string;name:string;kind:string};
export type StudioContext={
 user:{id:string;email:string};
 org:{id:string;name:string;kind:string};
 role:Role;
 entitlements:Entitlements;
 staff:{role:string}|null;
 // A member of Nmesis staff looking at a client they do not belong to.
 viewingAs:boolean;
 orgs:OrgChoice[];
};
export type Resolved={ok:true;ctx:StudioContext}|{ok:false;reason:'no_company'|'mfa_required'};
// Nmesis staff sign in with their admin account and must have passed its
// six-digit code in this session (AAL2) for every request; client people
// stay password-only.
export const MFA_REQUIRED='Enter the six-digit code from your authenticator app to continue.';
// `chosenOrg` comes from the company cookie (or a deep link) and is only a wish:
// it is honoured when the user is an active member of that company, or is staff.
export async function resolveContext({user,chosenOrg,directory}:{user:{id:string;email:string;aal?:'aal1'|'aal2'};chosenOrg?:string|null;directory:Directory}):Promise<Resolved>{
 const staffRole=await directory.staffRole(user.id),staff=staffRole?{role:staffRole}:null;
 if(staff&&user.aal!=='aal2')return {ok:false,reason:'mfa_required'};
 let memberships:Membership[]=await directory.memberships(user.id);
 // First arrival after an invitation: the member row becomes active, so the
 // admin's People tab stops showing them as invited.
 if(memberships.some(m=>m.status==='invited')){await directory.acceptInvitations(user.id);memberships=await directory.memberships(user.id)}
 const active=memberships.filter(m=>m.status==='active');
 const wish=typeof chosenOrg==='string'&&UUID.test(chosenOrg)?chosenOrg:null;
 let member=active.find(m=>m.orgId===wish)||null,org:{id:string;name:string;kind:string}|null=member?{id:member.orgId,name:member.orgName,kind:member.orgKind}:null;
 if(!org&&wish&&staff)org=await directory.organisation(wish);
 if(!org&&active[0]){member=active[0];org={id:member.orgId,name:member.orgName,kind:member.orgKind}}
 if(!org&&staff)org=(await directory.organisations()).find(o=>o.kind==='internal')||null;
 if(!org)return {ok:false,reason:'no_company'};
 // Staff in a company they do not belong to: Nmesis's own workspace as an owner,
 // a client's workspace read-only ("Viewing as").
 const viewingAs=!member&&!!staff&&org.kind!=='internal';
 const role:Role=member?member.role:viewingAs?'viewer':'owner';
 const entitlements=(await directory.entitlements(org.id))??readEntitlements(null);
 const orgs=staff?(await directory.organisations()).map(o=>({id:o.id,name:o.name,kind:o.kind})):active.map(m=>({id:m.orgId,name:m.orgName,kind:m.orgKind}));
 return {ok:true,ctx:{user:{id:user.id,email:user.email},org,role,entitlements,staff,viewingAs,orgs}};
}
// The company switcher's sections: staff see Nmesis (their own workspace) and
// Clients; everyone else sees only their own companies, with no sections.
export function switcherSections(ctx:Pick<StudioContext,'staff'|'orgs'>){
 if(!ctx.staff)return null;
 const pick=(o:OrgChoice)=>({id:o.id,name:o.name});
 return {nmesis:ctx.orgs.filter(o=>o.kind==='internal').map(pick),clients:ctx.orgs.filter(o=>o.kind!=='internal').map(pick)};
}
// A link straight to a company's workspace (/?org=<id>, from the admin): honoured
// only when the server agrees this user may open exactly that company.
export async function openCompany({user,orgId,directory}:{user:{id:string;email:string;aal?:'aal1'|'aal2'};orgId:unknown;directory:Directory}):Promise<{ok:true;ctx:StudioContext}|{ok:false;reason:'no_company'|'mfa_required'|'not_yours'}>{
 const wish=typeof orgId==='string'&&UUID.test(orgId)?orgId:null;
 const resolved=await resolveContext({user,chosenOrg:wish,directory});
 if(!resolved.ok)return resolved;
 if(!wish||resolved.ctx.org.id!==wish)return {ok:false,reason:'not_yours'};
 return resolved;
}
