// Whether this database has migration 0005 (deleted_at on films, swaps and
// stories). Until the owner runs it, everything works as before and only Delete
// answers that it is not available yet; once it has run, delete and restore
// start within a minute, with no redeploy. Leaf module: the row readers
// (film, swap, story) and lib/trash.ts all use it.
type Db={prepare(sql:string):{first():Promise<unknown>}};
let known:{at:number;ready:boolean}|undefined;
export async function trashReady(db:Db,now=Date.now()){
 if(known&&(known.ready||now-known.at<60_000))return known.ready;
 let ready=true;
 // A column that does not exist fails the statement (Postgres 42703, SQLite
 // "no such column"); any other failure is a real one and is not hidden.
 try{await db.prepare('SELECT deleted_at FROM films WHERE 1=0').first()}
 catch(e){if(!/deleted_at/i.test(e instanceof Error?e.message:String(e)))throw e;ready=false;console.info('Delete for films, swaps and stories waits for migration 0005.')}
 known={at:now,ready};return ready;
}
// The condition for the rows a list or a change may use.
export const notDeleted=(ready:boolean)=>ready?' AND deleted_at IS NULL':'';
