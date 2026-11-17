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

// The same for migration 0006 (folders). Before it runs, the library shows
// everything with no folders, and creating or moving into a folder answers
// that folders are not available yet.
let foldersKnown:{at:number;ready:boolean}|undefined;
export async function foldersReady(db:Db,now=Date.now()){
 if(foldersKnown&&(foldersKnown.ready||now-foldersKnown.at<60_000))return foldersKnown.ready;
 let ready=true;
 // A missing table: Postgres 42P01 'relation "folders" does not exist', SQLite 'no such table: folders'.
 try{await db.prepare('SELECT id FROM folders WHERE 1=0').first()}
 catch(e){if(!/folders/i.test(e instanceof Error?e.message:String(e)))throw e;ready=false;console.info('Folders wait for migration 0006.')}
 foldersKnown={at:now,ready};return ready;
}
