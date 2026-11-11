// Keep money in integer USD millionths. Reservations include failed/canceled jobs;
// provider refunds are not inferred from a render status.
// Postgres runs writers concurrently (SQLite serialized them). Each reservation runs
// in one transaction right after its LOCK_*_BUDGET_SQL, a no-op update that locks the
// payer's budget row; the reservation's sums then see every reservation committed before it.
export const LOCK_FILM_BUDGET_SQL='UPDATE film_budgets SET paused=paused WHERE payer=(SELECT payer FROM films WHERE id=? AND owner=?)';
export const LOCK_SWAP_BUDGET_SQL='UPDATE film_budgets SET paused=paused WHERE payer=(SELECT payer FROM swap_jobs WHERE id=? AND owner=?)';
export const LOCK_IMAGE_BUDGET_SQL='UPDATE film_budgets SET paused=paused WHERE payer=(SELECT payer FROM image_jobs WHERE id=? AND owner=?)';
export const RESERVE_FILM_SQL=`UPDATE films SET status='submitting', reserved_day=?, updated_at=?, lock_until=?
 WHERE id=? AND owner=? AND status='quoted'
 AND EXISTS(SELECT 1 FROM film_budgets WHERE payer=films.payer AND paused=0
 AND daily_limit >= films.estimate + COALESCE((SELECT SUM(f.estimate) FROM films f
 WHERE f.payer=films.payer AND f.reserved_day=? AND f.id<>films.id),0)
 + COALESCE((SELECT SUM(s.estimate) FROM swap_jobs s WHERE s.payer=films.payer AND s.reserved_day=?),0)
 + COALESCE((SELECT SUM(i.estimate) FROM image_jobs i WHERE i.payer=films.payer AND i.reserved_day=?),0))`;
export const RESERVE_SWAP_SQL=`UPDATE swap_jobs SET status='submitting', reserved_day=?, updated_at=?, lock_until=?
 WHERE id=? AND owner=? AND status='quoted'
 AND EXISTS(SELECT 1 FROM film_budgets WHERE payer=swap_jobs.payer AND paused=0
 AND daily_limit >= swap_jobs.estimate + COALESCE((SELECT SUM(f.estimate) FROM films f
 WHERE f.payer=swap_jobs.payer AND f.reserved_day=?),0)
 + COALESCE((SELECT SUM(s.estimate) FROM swap_jobs s WHERE s.payer=swap_jobs.payer AND s.reserved_day=? AND s.id<>swap_jobs.id),0)
 + COALESCE((SELECT SUM(i.estimate) FROM image_jobs i WHERE i.payer=swap_jobs.payer AND i.reserved_day=?),0))`;
export function providerUrl(value:unknown,kind:'status'|'cancel',id:string){
 if(typeof value!=='string'||typeof id!=='string'||!/^[\w-]{1,120}$/.test(id))throw new Error('Invalid video request identifier.');
 const u=new URL(value);if(u.origin!=='https://api.higgsfield.ai'||u.username||u.password||u.search||u.hash||u.pathname!==`/requests/${id}/${kind}`)throw new Error('Unexpected video status address.');return u.href;
}
export function requestUrls(id:unknown){
 if(typeof id!=='string'||!/^[\w-]{1,120}$/.test(id))throw new Error('The video service did not return a usable request identifier.');
 return{id,statusUrl:`https://api.higgsfield.ai/requests/${id}/status`,cancelUrl:`https://api.higgsfield.ai/requests/${id}/cancel`};
}
export function publicMediaUrl(value:unknown){
 if(typeof value!=='string')throw new Error('Video media address missing.');const u=new URL(value);
 // Addresses come exclusively from authenticated provider responses. Block local/IP destinations and credentials.
 if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':')||/\.(localhost|local|internal|test|invalid)$/.test(u.hostname))throw new Error('Unexpected media address.');return u.href;
}
export const budgetDay=()=>new Date().toISOString().slice(0,10);
export async function keyFingerprint(key:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(x=>x.toString(16).padStart(2,'0')).join('')}

export const RESERVE_IMAGE_SQL=`UPDATE image_jobs SET status='submitting',reserved_day=?,updated_at=? WHERE id=? AND owner=? AND status='quoted'
 AND EXISTS(SELECT 1 FROM film_budgets WHERE payer=image_jobs.payer AND paused=0
 AND daily_limit>=image_jobs.estimate+COALESCE((SELECT SUM(f.estimate) FROM films f WHERE f.payer=image_jobs.payer AND f.reserved_day=?),0)
 +COALESCE((SELECT SUM(s.estimate) FROM swap_jobs s WHERE s.payer=image_jobs.payer AND s.reserved_day=?),0)
 +COALESCE((SELECT SUM(i.estimate) FROM image_jobs i WHERE i.payer=image_jobs.payer AND i.reserved_day=? AND i.id<>image_jobs.id),0))`;
