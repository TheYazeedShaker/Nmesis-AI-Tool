import postgres from 'postgres';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
// Applies supabase/migrations/*.sql in name order, once each, as the studio role.
// Uses the direct/session connection: DDL through the transaction pooler is unreliable.
// A recorded migration whose file content changed stops the run (checksum guard).
export async function migrate(url,{folder=new URL('../supabase/migrations/',import.meta.url),log=console.log}={}){
 const sql=postgres(url,{max:1,prepare:false,connect_timeout:10,idle_timeout:5,ssl:/[?&]sslmode=disable\b/.test(url)?false:'require',onnotice:()=>{}});
 const applied=[];
 try{
  for(const name of (await readdir(folder)).filter(x=>/^\d{4}_[a-z0-9_]+\.sql$/.test(x)).sort()){
   const text=await readFile(new URL(name,folder),'utf8'),hash=createHash('sha256').update(text).digest('hex');
   const done=await sql.begin(async tx=>{
    // One runner at a time per database.
    await tx`select pg_advisory_xact_lock(hashtext('studio.__studio_migrations'))`;
    const [{ledger}]=await tx`select to_regclass('studio.__studio_migrations') is not null as ledger`;
    if(ledger){
     const rows=await tx`select sha256 from studio.__studio_migrations where name=${name}`;
     if(rows.length){if(rows[0].sha256!==hash)throw new Error('Previously applied migration changed: '+name);return false}
    }
    await tx.unsafe(text);
    await tx`insert into studio.__studio_migrations(name,sha256,applied_at) values(${name},${hash},${new Date().toISOString()})`;
    return true;
   });
   log((done?'Applied: ':'Already applied: ')+name);if(done)applied.push(name);
  }
  return applied;
 }finally{await sql.end({timeout:5})}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(!process.env.DATABASE_URL_DIRECT)throw new Error('Set DATABASE_URL_DIRECT (direct or session connection, port 5432) in .env.local first.');
 await migrate(process.env.DATABASE_URL_DIRECT);
}
