import {createClient, type Client, type InValue, type ResultSet} from '@libsql/client';
// Match the small D1 surface used by the studio; preserve atomic conditional SQL.
export class StudioDatabase {
 constructor(private client: Client) {}
 prepare(sql: string) { return new Statement(this.client, sql); }
}
class Statement {
 constructor(private client: Client, private sql: string, private args: InValue[] = []) {}
 bind(...values: unknown[]) { return new Statement(this.client,this.sql,values.map(v=>v===undefined?null:v) as InValue[]); }
 private execute() { return this.client.execute({sql:this.sql,args:this.args}); }
 async first<T=Record<string,unknown>>(column?:string):Promise<T|null> { const r=await this.execute();const row=r.rows[0];return row?(column?row[column]:{...row}) as T:null; }
 async all<T=Record<string,unknown>>() {return this.result<T>(await this.execute());}
 async run() {return this.result(await this.execute());}
 private result<T>(r:ResultSet){return {success:true,results:r.rows.map(row=>({...row})) as T[],meta:{changes:r.rowsAffected,last_row_id:Number(r.lastInsertRowid||0)}};}
}
let database:StudioDatabase|undefined;
export function getDatabase(){
 if(!process.env.TURSO_DATABASE_URL)return undefined;
 return (database??=new StudioDatabase(createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN}))) as unknown as D1Database;
}
