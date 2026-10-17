// In-process Postgres (PGlite) with every drizzle migration applied, wrapped in the
// production StudioDatabase adapter so tests run the studio's real SQL on Postgres.
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {StudioDatabase} from '../../lib/portable/database.ts';
const folder=new URL('../../drizzle/',import.meta.url);
export const migrationStatements=()=>readdirSync(folder).filter(x=>x.endsWith('.sql')).sort().flatMap(name=>readFileSync(new URL(name,folder),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean));
function wrap(q){return{async query(text,params){const r=await q.query(text,params);return{rows:r.rows,changes:r.affectedRows??0}},transaction:fn=>q.transaction(tx=>fn(wrap(tx)))}}
export async function testDatabase(){
 const pg=await PGlite.create({parsers:{20:Number,1700:Number}});
 for(const statement of migrationStatements())await pg.exec(statement);
 const db=new StudioDatabase(wrap(pg));
 return{pg,db,run:(sql,...params)=>db.prepare(sql).bind(...params).run(),first:(sql,...params)=>db.prepare(sql).bind(...params).first(),close:()=>pg.close()};
}
