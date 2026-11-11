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
// A server-built storage prefix (also the row owner/payer) for a synthetic user.
export const userPrefix=(c='a')=>`orgs/${ORG}/users/${c.repeat(64)}/`;
