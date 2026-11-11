// Every row and every stored object belongs to one client organization.
// Until accounts exist (PR S2) every signed-in user belongs to the studio's own
// organization; S2 replaces `currentOrg` with the signed-in member's org and
// nothing else needs to change: keys and rows already carry the org id.
export const STUDIO_ORG='nmesis';
const ORG=/^[a-z0-9][a-z0-9-]{0,62}$/;
const USER=/^[a-f0-9]{64}$/;
export function currentOrg(){return STUDIO_ORG}
// The single builder for a user's private storage prefix (also the row owner/payer).
export function userPrefix(org:string,userHash:string){
 if(!ORG.test(org)||!USER.test(userHash))throw new Error('Invalid organization or user.');
 return `orgs/${org}/users/${userHash}/`;
}
export const isUserPrefix=(value:unknown):value is string=>typeof value==='string'&&/^orgs\/[a-z0-9][a-z0-9-]{0,62}\/users\/[a-f0-9]{64}\/$/.test(value);
// Organization of a server-built prefix; throws for anything else (fail closed).
export function orgOf(prefix:string){
 const match=/^orgs\/([a-z0-9][a-z0-9-]{0,62})\/users\//.exec(prefix);
 if(!match)throw new Error('Invalid storage prefix.');
 return match[1];
}
// Organization-wide objects (not owned by one user) live beside the users.
export const orgKey=(org:string,path:string)=>{if(!ORG.test(org))throw new Error('Invalid organization.');return `orgs/${org}/${path}`};
