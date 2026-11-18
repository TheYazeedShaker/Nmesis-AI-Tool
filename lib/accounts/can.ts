// What a role may do, in one table (the admin's `ds.can` style): the pages use
// it to show or hide a control, and every route checks the same rule again with
// the server's own context. Owners and creators make and change the company's
// work and brand; viewers look. A member of staff viewing a client's Studio is
// always read-only, whatever the role says.
export type Role='owner'|'creator'|'viewer';
export type Action='brand.edit'|'share.manage'|'uploads.add'|'work.create';
const RULES:Record<Action,readonly Role[]>={
 'brand.edit':['owner','creator'],
 'share.manage':['owner','creator'],
 'uploads.add':['owner','creator'],
 'work.create':['owner','creator'],
};
export function can(who:{role:Role;viewingAs?:unknown}|null|undefined,action:Action):boolean{
 if(!who||who.viewingAs)return false;
 return RULES[action].includes(who.role);
}
