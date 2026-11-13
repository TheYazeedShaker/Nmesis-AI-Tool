import {readEntitlements,type Entitlements,type Role} from './plan';
import {UUID,type Directory,type Membership} from './directory';
// Who is asking and for which company, decided from a verified Supabase user and
// the master list. No I/O of its own beyond the directory, so tests drive it.
export type StudioContext={
 user:{id:string;email:string};
 org:{id:string;name:string;kind:string};
 role:Role;
 entitlements:Entitlements;
 staff:{role:string}|null;
 // A member of Nmesis staff looking at a client they do not belong to.
 viewingAs:boolean;
 orgs:{id:string;name:string}[];
};
export type Resolved={ok:true;ctx:StudioContext}|{ok:false;reason:'no_company'};
// `chosenOrg` comes from the company cookie and is only a wish: it is honoured
// when the user is an active member of that company, or is staff.
export async function resolveContext({user,chosenOrg,directory}:{user:{id:string;email:string};chosenOrg?:string|null;directory:Directory}):Promise<Resolved>{
 let memberships:Membership[]=await directory.memberships(user.id);
 // First arrival after an invitation: the member row becomes active, so the
 // admin's People tab stops showing them as invited.
 if(memberships.some(m=>m.status==='invited')){await directory.acceptInvitations(user.id);memberships=await directory.memberships(user.id)}
 const active=memberships.filter(m=>m.status==='active');
 const staffRole=await directory.staffRole(user.id),staff=staffRole?{role:staffRole}:null;
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
 const orgs=staff?(await directory.organisations()).map(o=>({id:o.id,name:o.name})):active.map(m=>({id:m.orgId,name:m.orgName}));
 return {ok:true,ctx:{user,org,role,entitlements,staff,viewingAs,orgs}};
}
