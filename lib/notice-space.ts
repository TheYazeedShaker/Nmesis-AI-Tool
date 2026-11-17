// The room the account notices took on the last page at this window width
// (components/studio-account.tsx AccountNotices): while the next page's notices
// are not known yet, that room is held empty, so the page below draws at once
// and does not move when they arrive (CLS, F-036). Only a number and a width,
// in this browser: never who, which company or what the notices said. Storage
// that is off or full simply means the next page waits for its notices.
// No imports: tests load it under Node's strip-only mode.
export const NOTICE_SPACE_KEY='studio-notice-space';
const MAX=1200;
type Store=Pick<Storage,'getItem'|'setItem'>;
const local=():Store|null=>{try{return typeof localStorage==='undefined'?null:localStorage}catch{return null}};
// kind: the notices' look (the design-system banners or the older screens' own), which wrap differently.
const keyOf=(kind:string)=>NOTICE_SPACE_KEY+(kind?':'+kind.replace(/[^a-z]/g,'').slice(0,12):'');
/** The remembered room in pixels for this width (and kind of notices), or null when none is known. */
export function readNoticeSpace(width:number,store:Store|null=local(),kind=''):number|null{
 if(!store)return null;
 let raw:string|null;
 try{raw=store.getItem(keyOf(kind))}catch{return null}
 try{
  const v=JSON.parse(raw||'null') as {w?:unknown;h?:unknown}|null;
  if(!v||typeof v.w!=='number'||typeof v.h!=='number'||v.w!==Math.round(width))return null;
  return Number.isFinite(v.h)&&v.h>=0&&v.h<=MAX?Math.round(v.h):null;
 }catch{return null}
}
/** Remembers what the notices took (written only when it changed). */
export function rememberNoticeSpace(width:number,height:number,store:Store|null=local(),kind=''){
 if(!store||!Number.isFinite(width)||!Number.isFinite(height)||height<0||height>MAX)return;
 const value=JSON.stringify({w:Math.round(width),h:Math.round(height)});
 try{const key=keyOf(kind);if(store.getItem(key)!==value)store.setItem(key,value)}catch{/* storage off or full: the next page waits for its notices instead */}
}
/** The held room as a style (block size only). */
export const noticeSpace=(px:number)=>({height:Math.max(0,Math.round(px))});
