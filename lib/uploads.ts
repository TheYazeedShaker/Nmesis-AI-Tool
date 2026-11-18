// A person's Uploads: the pictures they added on purpose (from the Uploads
// panel, or as a reference), reusable as references now and in the editor
// later. The picture itself is an ordinary asset (images/<id>, served at
// /api/assets/<id>); an empty mark at uploads/<id>.json beside it says it is
// one of their uploads, so listing them is one storage listing of their own
// prefix. Work they generated is never listed here.
export const UPLOADS_SHOWN=120;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const uploadsPrefix=(prefix:string)=>prefix+'uploads/';
export const uploadMarkKey=(prefix:string,id:string)=>uploadsPrefix(prefix)+id+'.json';
export type Upload={id:string;src:string;thumb:string;at:string};
/** The marks under a prefix as uploads, newest first; anything that is not a mark is skipped. */
export function uploadsFrom(objects:{key:string;uploaded:Date}[],prefix:string):Upload[]{
 const base=uploadsPrefix(prefix);
 return objects
  .filter(o=>o.key.startsWith(base))
  .map(o=>({id:o.key.slice(base.length).replace(/\.json$/,''),at:o.uploaded}))
  .filter(o=>ID.test(o.id))
  .sort((a,b)=>b.at.getTime()-a.at.getTime())
  .map(o=>({id:o.id,src:'/api/assets/'+o.id,thumb:'/api/assets/'+o.id+'?thumb=1',at:o.at.toISOString()}));
}
