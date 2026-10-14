import {createClient} from '@libsql/client';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(!process.env.TURSO_DATABASE_URL)throw new Error('Set TURSO_DATABASE_URL in .env.local first.');
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 await client.execute('CREATE TABLE IF NOT EXISTS __studio_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)');
 const folder=new URL('../drizzle/',import.meta.url);
 for(const name of (await readdir(folder)).filter(x=>x.endsWith('.sql')).sort()){
  const sql=await readFile(new URL(name,folder),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
  const exists=await client.execute({sql:'SELECT sha256 FROM __studio_migrations WHERE name=?',args:[name]});
  if(exists.rows.length){if(exists.rows[0].sha256!==hash)throw new Error('Previously applied migration changed: '+name);console.log('Already applied: '+name);continue;}
  const statements=sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
  await client.batch([...statements,{sql:'INSERT INTO __studio_migrations VALUES(?,?,?)',args:[name,hash,new Date().toISOString()]}],'write');
  console.log('Applied: '+name);
 }
}finally{client.close()}
