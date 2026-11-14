// The studio tables in an in-memory SQLite database, built from the Postgres
// migrations themselves (create table / create index statements, `studio.` prefix
// dropped). The studio's SQL stays within what both engines accept, so these fast
// tests keep exercising it; tests/postgres.test.mjs runs it on Postgres itself.
import {readFileSync,readdirSync} from 'node:fs';
const folder=new URL('../supabase/migrations/',import.meta.url);
export function studioSchemaSql(){
 return readdirSync(folder).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort().map(n=>readFileSync(new URL(n,folder),'utf8')).join('\n')
  .replace(/--[^\n]*/g,'').split(';').map(s=>s.trim())
  .filter(s=>/^create (unique )?(table|index)/i.test(s)&&!s.includes('__studio_migrations'))
  .map(s=>s.replace(/\bstudio\./g,'')+';').join('\n');
}
export const ORG='nmesis';
// A synthetic Supabase user id (uuid) made of one hex character.
export const userId=(c='a')=>`${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`;
// A server-built storage prefix (also the row owner) for a synthetic user.
export const userPrefix=(c='a')=>`orgs/${ORG}/users/${userId(c)}/`;
// The company, role and plan every request context carries (lib/studio-server.ts):
// an owner of a company with no plan yet (everything allowed).
export const MEMBER={org:'nmesis',role:'owner',entitlements:{legacy:true,status:null,planId:null,planName:null,endsOn:null,features:{}}};
