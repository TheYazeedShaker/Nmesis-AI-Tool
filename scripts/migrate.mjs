// Applies drizzle/*.sql in order, once each, each in its own transaction.
// Uses MIGRATION_DATABASE_URL when set (Supabase session pooler or direct
// connection, port 5432), otherwise DATABASE_URL. Safe to re-run; refuses to
// continue if an applied migration file has changed.
import postgres from 'postgres';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
if(!url)throw new Error('Set DATABASE_URL (or MIGRATION_DATABASE_URL) in .env.local first.');
const sql=postgres(url,{prepare:false,max:1,connect_timeout:15,onnotice:()=>{}});
try{
 await sql`CREATE TABLE IF NOT EXISTS __studio_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
 await sql`ALTER TABLE __studio_migrations ENABLE ROW LEVEL SECURITY`;
 // Supabase grants new public tables to its client roles; this bookkeeping table is server-only.
 await sql.unsafe(`DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON TABLE public.__studio_migrations FROM %I', r); END IF; END LOOP; END $$`);
 const folder=new URL('../drizzle/',import.meta.url);
 for(const name of (await readdir(folder)).filter(x=>x.endsWith('.sql')).sort()){
  const text=await readFile(new URL(name,folder),'utf8'),hash=createHash('sha256').update(text).digest('hex');
  const [applied]=await sql`SELECT sha256 FROM __studio_migrations WHERE name=${name}`;
  if(applied){if(applied.sha256!==hash)throw new Error('Previously applied migration changed: '+name);console.log('Already applied: '+name);continue;}
  const statements=text.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
  await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(hashtext('studio:migrations'))`;
   const [again]=await tx`SELECT 1 FROM __studio_migrations WHERE name=${name}`;
   if(again)return;
   for(const statement of statements)await tx.unsafe(statement);
   await tx`INSERT INTO __studio_migrations(name,sha256) VALUES(${name},${hash})`;
  });
  console.log('Applied: '+name);
 }
}finally{await sql.end({timeout:5})}
