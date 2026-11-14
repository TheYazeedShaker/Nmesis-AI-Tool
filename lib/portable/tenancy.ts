// Every row and every stored object belongs to one client organization and one
// user: rows carry org_id, objects live under orgs/<org>/users/<user>/. Both ids
// are Supabase ids (uuid) taken from the verified session and the master list
// (lib/studio-context.ts), never from a request.
const ORG=/^[a-z0-9][a-z0-9-]{0,62}$/;
const USER=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The single builder for a user's private storage prefix (also the row owner).
export function userPrefix(org:string,userId:string){
 if(!ORG.test(org)||!USER.test(userId))throw new Error('Invalid organization or user.');
 return `orgs/${org}/users/${userId}/`;
}
const PREFIX=/^orgs\/([a-z0-9][a-z0-9-]{0,62})\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/$/;
export const isUserPrefix=(value:unknown):value is string=>typeof value==='string'&&PREFIX.test(value);
// Organization of a server-built prefix; throws for anything else (fail closed).
export function orgOf(prefix:string){
 const match=/^orgs\/([a-z0-9][a-z0-9-]{0,62})\/(users|keys)\//.exec(prefix);
 if(!match)throw new Error('Invalid storage prefix.');
 return match[1];
}
// User of a server-built user prefix, or null.
export const userOf=(prefix:string)=>PREFIX.exec(prefix)?.[2]??null;
// Organization-wide objects (not owned by one user) live beside the users.
export const orgKey=(org:string,path:string)=>{if(!ORG.test(org))throw new Error('Invalid organization.');return `orgs/${org}/${path}`};
// Where a company's own provider keys (and its video budget) live: one place per
// organization, managed by its owners when the plan includes studio.own_keys.
export const orgKeysPrefix=(org:string)=>orgKey(org,'keys/');
export const membersPrefix=(org:string)=>orgKey(org,'users/');
