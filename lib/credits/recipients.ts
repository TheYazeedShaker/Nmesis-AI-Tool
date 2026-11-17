import type {StudioDatabase} from '../portable/database';
// Who gets a company's 80% and 100% credit emails (Company settings →
// Notifications; migration 0008). The owners choose among the company's people.
// With no choice saved, or when nobody chosen is still in the company, the
// company's owners get them, as before.
export type Person={userId:string;role:string;email:string};
const EMAIL=/^[^\s@]+@[^\s@]+$/;
export const MAX_RECIPIENTS=20;
// The saved choice (user ids). Before migration 0008 the table is missing: no
// choice, so the owners (logged once per call, never a failed warning).
export async function chosenRecipients(db:StudioDatabase,org:string):Promise<string[]|null>{
 try{
  const rows=await db.prepare('SELECT user_id FROM alert_recipients WHERE org_id=? ORDER BY chosen_at,user_id').bind(org).all<{user_id:string}>();
  return rows.results.map(r=>String(r.user_id));
 }catch(e){
  console.warn('Credit email recipients unreadable; the owners get the warnings',e instanceof Error?e.name:'UnknownError');
  return null;
 }
}
// The addresses one warning goes to, and whether that is the owners by default.
export function recipientEmails(people:Person[],chosen:string[]|null):{emails:string[];fallback:boolean}{
 const valid=people.filter(p=>EMAIL.test(p.email));
 const picked=chosen?.length?valid.filter(p=>chosen.includes(p.userId)):[];
 if(picked.length)return {emails:[...new Set(picked.map(p=>p.email))],fallback:false};
 return {emails:[...new Set(valid.filter(p=>p.role==='owner').map(p=>p.email))],fallback:true};
}
export async function alertRecipients(db:StudioDatabase|undefined,org:string,people:Person[]):Promise<string[]>{
 return recipientEmails(people,db?await chosenRecipients(db,org):null).emails;
}
// Replaces the company's choice in one transaction (owners only, by RLS and by
// the route). Every id must be one of the company's people.
export async function saveRecipients(db:StudioDatabase,org:string,actor:string,userIds:string[],now=Date.now()){
 await db.batch([
  db.prepare('DELETE FROM alert_recipients WHERE org_id=?').bind(org),
  ...userIds.map(id=>db.prepare('INSERT INTO alert_recipients(org_id,user_id,chosen_by,chosen_at) VALUES(?,?,?,CAST(? AS BIGINT))').bind(org,id,actor,now)),
 ]);
}
