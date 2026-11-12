// Checks the studio's configuration, then (unless --offline) the live database and bucket:
//   npm run check:setup            names, formats, database and bucket
//   npm run check:setup -- --offline   names and formats only
import postgres from 'postgres';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {readFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const env=process.env,offline=process.argv.includes('--offline');
const required=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','CONFIGURATOR_ORIGIN','DATABASE_URL','DATABASE_URL_DIRECT','S3_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','KEY_ENCRYPTION_SECRET'];
const missing=required.filter(k=>!env[k]?.trim());
for(const key of required)console.log(key+': '+(missing.includes(key)?'MISSING':'set'));
const issues=[],notes=[];
if(env.KEY_ENCRYPTION_SECRET&&env.KEY_ENCRYPTION_SECRET.length<32)issues.push('KEY_ENCRYPTION_SECRET must be at least 32 characters.');
for(const key of ['SUPABASE_URL','CONFIGURATOR_ORIGIN'])if(env[key]){try{const u=new URL(env[key]);if(u.protocol!=='https:'&&u.hostname!=='localhost'&&u.hostname!=='127.0.0.1')issues.push(key+' must use HTTPS.');if(key==='CONFIGURATOR_ORIGIN'&&u.pathname!=='/')issues.push('CONFIGURATOR_ORIGIN is an origin only (no path).')}catch{issues.push(key+' must be a valid URL.')}}
if(env.SUPABASE_SECRET_KEY&&env.SUPABASE_SECRET_KEY===env.SUPABASE_PUBLISHABLE_KEY)issues.push('SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY must be different keys.');
for(const old of ['NEXTAUTH_URL','NEXTAUTH_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','STUDIO_ALLOWED_EMAILS','SHARED_OPENAI_OWNER_EMAIL','SHARED_OPENAI_GUEST_EMAILS','CONFIGURATOR_PRESETS','NEXT_PUBLIC_CONFIGURATOR_PRESETS'])if(env[old])notes.push(old+' is no longer used (Supabase sign-in, company accounts and configurators replace it); remove it.');
const dbUrl=(key,port)=>{if(!env[key])return;try{const u=new URL(env[key]);if(!/^postgres(ql)?:$/.test(u.protocol))issues.push(key+' must be a postgres:// connection string.');else if(u.port&&u.port!==port)notes.push(key+' normally uses port '+port+' (found '+u.port+').')}catch{issues.push(key+' must be a valid connection string.')}};
dbUrl('DATABASE_URL','6543');dbUrl('DATABASE_URL_DIRECT','5432');
const ssl=url=>/[?&]sslmode=disable\b/.test(url)?false:'require';

async function checkDatabase(){
 const sql=postgres(env.DATABASE_URL,{max:1,prepare:false,connect_timeout:10,idle_timeout:5,ssl:ssl(env.DATABASE_URL),connection:{application_name:'nmesis-studio-check',search_path:'studio'},onnotice:()=>{}});
 try{
  const [who]=await sql`select current_user as role, current_schema() as schema, to_regnamespace('studio') is not null as has_schema`;
  console.log('Database: connected as '+who.role);
  if(!who.has_schema){issues.push('Database: schema "studio" does not exist. Run docs/supabase-setup.sql, then npm run db:migrate.');return}
  if(who.schema!=='studio')issues.push('Database: search_path does not start with "studio" (got '+who.schema+'). Run the ALTER ROLE ... SET search_path line in docs/supabase-setup.sql.');
  const [role]=await sql`select rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
  if(role.rolsuper||role.rolbypassrls)issues.push('Database: connect as the studio role, not an administrator (it must not bypass row level security).');
  const [pub]=await sql`select count(*)::int as readable from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','v','m','p','f') and has_table_privilege(c.oid,'SELECT')`;
  if(pub.readable)issues.push('Database: the studio role can read '+pub.readable+' relation(s) in schema public; it must reach only schema studio.');
  else console.log('Database: studio role cannot read schema public');
  const [ledger]=await sql`select to_regclass('studio.__studio_migrations') is not null as present`;
  const applied=new Map(ledger.present?(await sql`select name,sha256 from studio.__studio_migrations`).map(r=>[r.name,r.sha256]):[]);
  const folder=new URL('../supabase/migrations/',import.meta.url);const pending=[];
  for(const name of (await readdir(folder)).filter(x=>/^\d{4}_[a-z0-9_]+\.sql$/.test(x)).sort()){
   const hash=createHash('sha256').update(await readFile(new URL(name,folder),'utf8')).digest('hex');
   if(!applied.has(name))pending.push(name);else if(applied.get(name)!==hash)issues.push('Database: applied migration '+name+' differs from the file in this checkout.');
  }
  if(pending.length)issues.push('Database: migrations not applied: '+pending.join(', ')+'. Run npm run db:migrate.');
  else console.log('Database: migrations current ('+applied.size+')');
  // The read-only accounts grants (docs/supabase-setup.sql, section 5).
  const [acc]=await sql`select to_regclass('accounts.studio_memberships') is not null as views,
   coalesce(has_function_privilege(current_user,to_regprocedure('accounts.entitlements(uuid)'),'execute'),false) as ent,
   coalesce(has_function_privilege(current_user,to_regprocedure('accounts.studio_accept_membership(uuid)'),'execute'),false) as accept`;
  if(!acc.views||!acc.ent||!acc.accept)issues.push('Database: the accounts views and grants are missing. Run section 5 of docs/supabase-setup.sql.');
  else console.log('Database: accounts views and grants present');
 }catch(e){issues.push('Database: '+(e instanceof Error?e.message:'connection failed'))}
 finally{await sql.end({timeout:5})}
}

async function checkBucket(){
 const endpoint=env.S3_ENDPOINT?.trim()||undefined;
 const s3=new S3Client({region:env.S3_REGION,endpoint,forcePathStyle:!!endpoint&&env.S3_FORCE_PATH_STYLE==='true',credentials:{accessKeyId:env.S3_ACCESS_KEY_ID,secretAccessKey:env.S3_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',requestHandler:{requestTimeout:15000,connectionTimeout:5000}});
 const Bucket=env.S3_BUCKET,Key='staging/setup-check/'+randomUUID(),body='nmesis-studio-probe';
 try{
  await s3.send(new PutObjectCommand({Bucket,Key,Body:body,ContentType:'text/plain',IfNoneMatch:'*'}));
  const got=await s3.send(new GetObjectCommand({Bucket,Key}));if(await got.Body?.transformToString()!==body)issues.push('Bucket: the probe object read back differently.');
  try{await s3.send(new PutObjectCommand({Bucket,Key,Body:body,IfNoneMatch:'*'}));issues.push('Bucket: conditional create (If-None-Match) was not enforced.')}catch(e){if(e?.$metadata?.httpStatusCode!==412&&e?.$metadata?.httpStatusCode!==409)throw e}
  await s3.send(new DeleteObjectCommand({Bucket,Key}));
  try{await s3.send(new HeadObjectCommand({Bucket,Key}));issues.push('Bucket: the probe object was not deleted.')}catch(e){if(e?.$metadata?.httpStatusCode!==404)throw e}
  console.log('Bucket: put, conditional put, get and delete under staging/ work');
 }catch(e){issues.push('Bucket: '+(e instanceof Error?e.name+' '+e.message:'request failed'))}
}

if(!offline&&!missing.includes('DATABASE_URL'))await checkDatabase();
if(!offline&&!['S3_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'].some(k=>missing.includes(k)))await checkBucket();
for(const note of notes)console.log('Note: '+note);
if(missing.length||issues.length){console.error(issues.join('\n'));console.error('Complete .env.local or the matching Vercel environment settings.');process.exitCode=1}
else console.log(offline?'Configuration fields are present. Live database and bucket checks were skipped (--offline).':'Configuration, database and bucket checks passed.');
