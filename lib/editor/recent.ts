// A person's recent fonts and colours in the editor, kept with their account
// (in the company's storage, under their own folder: <prefix>settings/editor-recent.json),
// so a second browser or device sees the same "Recent". The browser keeps its
// own copy too and uses it when the account's can't be reached
// (components/canvas/recent.ts). Each change adds one value at the front on the
// server, so two browsers adding at once both keep theirs (a conditional write,
// tried again on a clash). Plain module: the route and the tests share it.

export const RECENT_MAX={fonts:8,colours:10} as const;
export type RecentKind=keyof typeof RECENT_MAX;
export type Recent={fonts:string[];colours:string[]};
export const EMPTY_RECENT:Recent={fonts:[],colours:[]};
export const recentKey=(prefix:string)=>prefix+'settings/editor-recent.json';

const HEX=/^#[0-9A-F]{6}([0-9A-F]{2})?$/;
const LINKISH=/:\/\/|x-amz-|signature=|^\/\//i;
/** A value a list may hold: a font's name (as a design names it) or a colour as #RRGGBB(AA). */
export function cleanValue(kind:RecentKind,v:unknown):string|null{
 if(typeof v!=='string')return null;
 if(kind==='colours'){const c=v.trim().toUpperCase();return HEX.test(c)?c:null}
 const n=v.replace(/[\p{Cc}]+/gu,'').trim();
 return n&&n.length<=60&&!LINKISH.test(n)?n:null;
}
/** A list read back through the same check (anything else is dropped), each once, at most its size. */
export function cleanList(kind:RecentKind,v:unknown):string[]{
 if(!Array.isArray(v))return [];
 return [...new Set(v.map(x=>cleanValue(kind,x)).filter((x):x is string=>!!x))].slice(0,RECENT_MAX[kind]);
}
export function readRecent(text:string|null|undefined):Recent{
 if(!text)return {...EMPTY_RECENT};
 try{const v=JSON.parse(text) as Partial<Recent>;return {fonts:cleanList('fonts',v?.fonts),colours:cleanList('colours',v?.colours)}}
 catch{return {...EMPTY_RECENT}}
}
/** The list with a value first, each once, at most its size. */
export const withValue=(list:readonly string[],value:string,kind:RecentKind)=>[value,...list.filter(x=>x!==value)].slice(0,RECENT_MAX[kind]);
/** Two copies as one (the account's first, then what only this device has), each once, at most its size. */
export const mergeLists=(account:readonly string[],device:readonly string[],kind:RecentKind)=>[...new Set([...account,...device])].slice(0,RECENT_MAX[kind]);

type Store={
 get(key:string):Promise<{etag:string;text():Promise<string>}|null>;
 put(key:string,value:string,options?:{httpMetadata?:{contentType?:string};onlyIf?:{etagMatches?:string;etagDoesNotMatch?:string}}):Promise<unknown>;
};
/** Adds a value at the front of the person's list on the server; another browser's write in between is kept. */
export async function addRecent(store:Store,prefix:string,kind:RecentKind,value:string):Promise<Recent>{
 const key=recentKey(prefix);
 for(let attempt=0;attempt<4;attempt++){
  const current=await store.get(key),recent=readRecent(current?await current.text():null);
  const next={...recent,[kind]:withValue(recent[kind],value,kind)};
  const written=await store.put(key,JSON.stringify(next),{httpMetadata:{contentType:'application/json'},onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'}});
  if(written)return next;
 }
 throw new Error('Recent list busy');
}
