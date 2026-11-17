import postgres from 'postgres';
import {studioEnvironment,type StudioEnvironment} from './environment';
// Match the small D1 surface used by the studio (prepare/bind/first/all/run)
// over Postgres. Statements keep `?` placeholders; they are translated to
// $1…$n once per statement text. Conditional UPDATEs stay single statements,
// so reservations and leases remain atomic.
type Sql=ReturnType<typeof postgres>;
type Param=postgres.ParameterOrJSON<never>;
const translated=new Map<string,string>();
// `?` inside a quoted string literal, quoted identifier or comment is not a placeholder.
export function toPositional(sql:string){
 const cached=translated.get(sql);if(cached!==undefined)return cached;
 let out='',n=0;
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(c==="'"||c==='"'){const end=closing(sql,i,c);out+=sql.slice(i,end+1);i=end;continue}
  if(c==='-'&&sql[i+1]==='-'){const end=sql.indexOf('\n',i);const stop=end<0?sql.length-1:end;out+=sql.slice(i,stop+1);i=stop;continue}
  if(c==='/'&&sql[i+1]==='*'){const end=sql.indexOf('*/',i+2);const stop=end<0?sql.length-1:end+1;out+=sql.slice(i,stop+1);i=stop;continue}
  out+=c==='?'?'$'+(++n):c;
 }
 if(translated.size>500)translated.clear();
 translated.set(sql,out);return out;
}
// A doubled quote inside a literal is an escaped quote, not the end.
function closing(sql:string,start:number,quote:string){
 for(let i=start+1;i<sql.length;i++){if(sql[i]===quote){if(sql[i+1]===quote){i++;continue}return i}}
 return sql.length-1;
}
// Round trips (speed, finish pass): with `prepare:false` (the transaction
// pooler) the driver sends every statement that has parameters twice, once to
// learn the parameter types and once to run it, and nothing else can travel on
// that connection in between. A value that cannot change the statement's
// meaning is written into the text instead, so the statement goes in one
// message, in one round trip, and pipelines with others on the connection:
// null, a boolean, a number, or a string with no quote, no backslash and no NUL
// byte. Such a string wrapped in single quotes is one complete string constant
// whatever standard_conforming_strings says, and it is an untyped constant,
// exactly as the untyped parameter was. Any other value (quotes, backslashes,
// dates, bytes, arrays) keeps the parameter path. A space before each value
// keeps it a separate token (`e?` would otherwise read as E'…').
export function literalFor(v:unknown):string|null{
 if(v===null||v===undefined)return 'NULL';
 if(v===true)return 'TRUE';if(v===false)return 'FALSE';
 if(typeof v==='number')return `'${String(v)}'`;
 if(typeof v==='string')return /['\\\0]/.test(v)?null:`'${v}'`;
 return null;
}
/** The statement with its values written in, or null when one of them must stay a parameter. */
export function inlined(sql:string,args:readonly unknown[]):string|null{
 const values:string[]=[];
 for(const a of args){const v=literalFor(a);if(v===null)return null;values.push(v)}
 if(!values.length)return sql;
 let out='',n=0;
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(c==="'"||c==='"'){const end=closing(sql,i,c);out+=sql.slice(i,end+1);i=end;continue}
  if(c==='-'&&sql[i+1]==='-'){const end=sql.indexOf('\n',i);const stop=end<0?sql.length-1:end;out+=sql.slice(i,stop+1);i=stop;continue}
  if(c==='/'&&sql[i+1]==='*'){const end=sql.indexOf('*/',i+2);const stop=end<0?sql.length-1:end+1;out+=sql.slice(i,stop+1);i=stop;continue}
  if(c==='?'){if(n>=values.length)return null;out+=' '+values[n++]+' ';continue}
  out+=c;
 }
 // As many placeholders as values, or the parameter path decides (and reports) it.
 return n===values.length?out:null;
}
// The row level security settings for a bound statement, as text: the user id
// and the environment are checked to be plain values first (literalFor).
function settings(user:string,environment:string){
 const u=literalFor(user),e=literalFor(environment);
 return u&&e?`SET LOCAL studio.user_id = ${u}; SET LOCAL studio.env = ${e}; `:null;
}
// The message's answer: a list of results (one per statement with rows: the
// settings, then the statement's own, last), or the statement's result alone
// (an UPDATE after the settings: the driver keeps one result with its count).
// Rows are objects, results are lists: the first element tells which.
type Out=postgres.RowList<postgres.Row[]>;
export function lastResult(r:Out|Out[]):Out{return r.length>0&&Array.isArray(r[0])?(r as Out[])[r.length-1]:r as Out}
// Plain fields, not constructor parameter properties: tests import this file
// under Node's strip-only TypeScript mode, which rejects parameter properties.
// A database bound to a signed-in user (forUser) runs every statement in a short
// transaction that first sets `studio.user_id` and `studio.env`, which the row
// level security policies read (migrations 0002 and 0004). Unbound, the policies
// see nobody and every studio table reads as empty. `studio.env` is this
// server's environment (./environment.ts): Production and Preview share the
// database, and each sees and writes only its own rows of client work.
export class StudioDatabase {
 private sql:Sql;
 private user:string|null;
 readonly environment:StudioEnvironment;
 constructor(sql:Sql, user:string|null=null, environment:StudioEnvironment=studioEnvironment()) { this.sql=sql; this.user=user; this.environment=environment; }
 forUser(userId:string) { return new StudioDatabase(this.sql, userId, this.environment); }
 prepare(text:string) { return new Statement(this.sql, text, [], this.user, this.environment); }
 // D1 batch: every statement in one transaction, in order; any error rolls back all.
 async batch(statements:Statement[]) { return this.sql.begin(async tx=>{if(this.user){const set=settings(this.user,this.environment);await (set?tx.unsafe(set):tx`select set_config('studio.user_id', ${this.user}, true), set_config('studio.env', ${this.environment}, true)`)}const out=[];for(const s of statements)out.push(await s.runIn(tx as unknown as Sql));return out}); }
}
class Statement {
 private sql:Sql;
 private text:string;
 private args:Param[];
 private user:string|null;
 private environment:StudioEnvironment;
 constructor(sql:Sql, text:string, args:Param[] = [], user:string|null=null, environment:StudioEnvironment='development') { this.sql=sql; this.text=text; this.args=args; this.user=user; this.environment=environment; }
 bind(...values: unknown[]) { return new Statement(this.sql,this.text,values.map(v=>v===undefined?null:v) as Param[],this.user,this.environment); }
 private execute(sql:Sql=this.sql):Promise<postgres.RowList<postgres.Row[]>> {
  const written=inlined(this.text,this.args);
  if(sql!==this.sql||!this.user)return written!==null?sql.unsafe(written):sql.unsafe(toPositional(this.text),this.args);
  // Bound to a user, with plain values: the settings and the statement in one
  // message, which Postgres runs as one implicit transaction (so SET LOCAL holds
  // for the statement and ends with it): one round trip, no connection held.
  const set=written!==null?settings(this.user,this.environment):null;
  if(set)return this.sql.unsafe(set+written).then(r=>lastResult(r as unknown as Out|Out[]));
  // Otherwise the settings and the statement travel together inside one transaction.
  const user=this.user,environment=this.environment,text=toPositional(this.text),args=this.args;
  return this.sql.begin(tx=>[tx`select set_config('studio.user_id', ${user}, true), set_config('studio.env', ${environment}, true)`,tx.unsafe(text,args)]).then(r=>(r as unknown as postgres.RowList<postgres.Row[]>[])[1]);
 }
 async runIn(sql:Sql) {return this.result(await this.execute(sql));}
 async first<T=Record<string,unknown>>(column?:string):Promise<T|null> { const r=await this.execute();const row=r[0];return row?(column?row[column]:{...row}) as T:null; }
 async all<T=Record<string,unknown>>() {return this.result<T>(await this.execute());}
 async run() {return this.result(await this.execute());}
 // No caller reads last_row_id (every key is an application UUID); it stays 0 for D1 shape compatibility.
 private result<T>(r:postgres.RowList<postgres.Row[]>){return {success:true,results:r.map(row=>({...row})) as T[],meta:{changes:r.count??0,last_row_id:0}};}
}
// Epoch-millisecond and money columns are bigint; their values stay below 2^53,
// so they are returned as numbers, matching the previous driver.
const int8={to:20,from:[20],serialize:(x:number|bigint)=>String(x),parse:(x:string)=>Number(x)};
export function connect(url:string){
 return postgres(url,{
  max:Number(process.env.DATABASE_POOL_MAX)||2, // per serverless instance
  idle_timeout:20,connect_timeout:10,max_lifetime:60*30,
  prepare:false, // required by the transaction pooler
  ssl:/[?&]sslmode=disable\b/.test(url)?false:'require',
  connection:{application_name:'nmesis-studio',search_path:'studio'},
  types:{int8},
  onnotice:()=>{},
 });
}
let database:StudioDatabase|undefined;
export function getDatabase(){
 if(!process.env.DATABASE_URL)return undefined;
 return database??=new StudioDatabase(connect(process.env.DATABASE_URL));
}
