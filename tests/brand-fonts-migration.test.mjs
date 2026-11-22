// Migration 0013 (the company's own font files): its shape, checked without a
// database. tests/postgres.test.mjs runs it on Postgres itself: members read,
// only owners add or remove, another company or environment sees nothing, and
// no row is ever deleted.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {studioSchemaSql} from './sqlite-schema.mjs';

const sql=readFileSync(new URL('../supabase/migrations/0013_brand_fonts.sql',import.meta.url),'utf8');
const code=sql.replace(/--[^\n]*/g,'');

test('migration 0013 is the next number after 0012_designs, the only one with its number',()=>{
 const names=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>/^\d{4}_/.test(n)).sort();
 assert.equal(names.at(-1),'0013_brand_fonts.sql');
 assert.equal(names.filter(n=>n.startsWith('0013_')).length,1);
 assert.equal(names.at(-2),'0012_designs.sql');
 // The Postgres test applies it with the others, in order.
 assert.match(readFileSync(new URL('./postgres.test.mjs',import.meta.url),'utf8'),/'0012_designs\.sql','0013_brand_fonts\.sql'\]/);
});

test('migration 0013: idempotent, per environment, forced row level security, nothing for anyone else',()=>{
 assert.match(code,/create table if not exists studio\.brand_fonts \(/);
 assert.doesNotMatch(code,/create table (?!if not exists)/i);assert.doesNotMatch(code,/drop table/i);
 assert.match(code,/create index if not exists brand_fonts_env_org_family/);
 assert.match(code,/create unique index if not exists brand_fonts_env_org_file on studio\.brand_fonts \(environment, org_id, sha256\) where deleted_at is null and status = 'ready'/);
 assert.match(code,/environment text not null default 'production'/);
 assert.match(code,/alter column environment set default studio\.request_env\(\)/);
 assert.match(code,/enable row level security/);assert.match(code,/force row level security/);
 assert.match(code,/revoke all on studio\.brand_fonts from public/);assert.match(code,/'anon', 'authenticated'/);
 // Every constraint is added once ("if not exists"), so a second run changes nothing.
 const constraints=[...code.matchAll(/add constraint (\w+)/g)].map(m=>m[1]);
 assert.deepEqual(constraints,['brand_fonts_environment_ck','brand_fonts_names_ck','brand_fonts_shape_ck','brand_fonts_file_ck','brand_fonts_keys_ck','brand_fonts_licence_ck','brand_fonts_embedding_ck','brand_fonts_status_ck','brand_fonts_deleted_ck']);
 for(const c of constraints)assert.match(code,new RegExp(`if not exists \\(select 1 from pg_constraint where conname = '${c}'\\)`),c);
});

test('migration 0013: members read; only owners add or change; no delete policy, so a row (and its licence record) is never deleted',()=>{
 const policies=[...code.matchAll(/create policy (\w+) on studio\.brand_fonts for (\w+)/g)].map(m=>[m[1],m[2]]);
 assert.deepEqual(policies,[['members_read','select'],['owners_add','insert'],['owners_change','update']]);
 for(const [name] of policies)assert.match(code,new RegExp(`drop policy if exists ${name} on studio\\.brand_fonts`),name+' is dropped first (idempotent)');
 assert.doesNotMatch(code,/for (all|delete)/,'no policy lets anyone delete a row');
 const body=name=>code.slice(code.indexOf(`create policy ${name}`)).split(/;\s*\n/)[0];
 assert.match(body('members_read'),/request_is_staff\(\)\) or org_id = any \(coalesce\(\(select studio\.request_orgs\(\)\)/,'every member (and staff, read-only) reads');
 for(const name of ['owners_add','owners_change']){
  const b=body(name);
  assert.match(b,/org_id = any \(coalesce\(\(select studio\.request_owner_orgs\(\)\)/,name+': owners only');
  assert.doesNotMatch(b,/request_is_staff|request_orgs\(\)/,name+': not staff, not every member');
 }
 for(const [name] of policies)assert.match(body(name),/environment = \(select studio\.request_env\(\)\)/,name+': this environment only');
 // The update policy checks the row both before and after (it cannot move to another company).
 assert.match(body('owners_change'),/using \(.*\)\s*with check \(/s);
});

test('migration 0013: what the server checks, held by the table (keys in the company folder, ready means sanitised and not restricted, licence words kept)',()=>{
 assert.match(code,/starts_with\(original_key, 'orgs\/' \|\| org_id \|\| '\/brand\/fonts\/'\)/);
 assert.match(code,/woff2_key is null or starts_with\(woff2_key, 'orgs\/' \|\| org_id \|\| '\/brand\/fonts\/'\)/);
 assert.match(code,/format in \('otf', 'ttf', 'woff', 'woff2'\) and size between 1 and 10485760/);
 assert.match(code,/embedding in \('installable', 'editable', 'preview-print', 'restricted'\)/);
 assert.match(code,/status = 'ready' and woff2_key is not null and preview_key is not null and reason is null and embedding <> 'restricted'/);
 assert.match(code,/status = 'refused' and woff2_key is null and preview_key is null and char_length\(reason\) between 1 and 300/);
 assert.match(code,/char_length\(licence_text\) between 1 and 1000/);
});

test('migration 0013: the SQLite stand-in builds the table with every column the routes use',()=>{
 const db=new DatabaseSync(':memory:');db.exec(studioSchemaSql());
 const cols=db.prepare('PRAGMA table_info(brand_fonts)').all().map(c=>c.name);
 assert.deepEqual(cols,['id','environment','org_id','family','style','weight','italic','variable','axes','weight_min','weight_max','format','size','sha256','original_key','woff2_key','preview_key','licence_by','licence_at','licence_version','licence_text','fs_type','embedding','status','reason','created_by','created_at','deleted_at','deleted_by']);
 const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='brand_fonts' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 assert.deepEqual(indexes,['brand_fonts_env_org_family','brand_fonts_env_org_file']);
 db.close();
});
