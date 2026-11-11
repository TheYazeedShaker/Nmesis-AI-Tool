import postgres from 'postgres';
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
export class StudioDatabase {
 constructor(private sql:Sql) {}
 prepare(text:string) { return new Statement(this.sql, text); }
 // D1 batch: every statement in one transaction, in order; any error rolls back all.
 async batch(statements:Statement[]) { return this.sql.begin(async tx=>{const out=[];for(const s of statements)out.push(await s.runIn(tx as unknown as Sql));return out}); }
}
class Statement {
 constructor(private sql:Sql, private text:string, private args:Param[] = []) {}
 bind(...values: unknown[]) { return new Statement(this.sql,this.text,values.map(v=>v===undefined?null:v) as Param[]); }
 private execute(sql:Sql=this.sql) { return sql.unsafe(toPositional(this.text),this.args); }
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
 return (database??=new StudioDatabase(connect(process.env.DATABASE_URL))) as unknown as D1Database;
}
