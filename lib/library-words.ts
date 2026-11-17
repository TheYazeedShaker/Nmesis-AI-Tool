// What the library says when a view has nothing to show (components/workspace/
// library.tsx draws it with the design system's State). Each view and filter
// gets its own short line: an empty place says how to fill it, a filter or a
// search that finds nothing offers Clear. Kept here, free of React, so the
// words are tested (tests/library-words.test.mjs).

export type EmptyQuery={place:'all'|'unsorted'|'deleted'|string;tool?:string;car?:string;who?:''|'you'|'others';q?:string};
export type EmptyWords={kind:'empty'|'no-results';title:string;body:string;/** Show a Clear button with these words. */clear?:'Clear search'|'Clear filters'|'Clear filter'};

const PLURAL:Record<string,string>={'Key visual':'key visuals','Line-up':'line-ups','Film':'films','Car swap':'car swaps','Story':'stories'};
const plural=(tool:string)=>PLURAL[tool]||tool.toLowerCase();

/** folderName: the folder's name when place is a folder. readOnly: viewers and staff viewing a client (no Create). */
export function emptyWords(query:EmptyQuery,{folderName,readOnly=false,anything=true}:{folderName?:string;readOnly?:boolean;/** The company has some work (live). */anything?:boolean}={}):EmptyWords{
 const q=(query.q||'').trim(),tool=query.tool||'',car=query.car||'',who=query.who||'';
 const place=query.place,deleted=place==='deleted',unsorted=place==='unsorted',folder=!['all','unsorted','deleted'].includes(place);
 const name=folderName||'this folder';
 const filters=[tool,car,who].filter(Boolean).length;
 // A search, alone or with filters.
 if(q){
  const where=deleted?' in Deleted':folder?` in ${name}`:unsorted?' outside folders':'';
  return {kind:'no-results',title:`Nothing called “${q}”${where}`,body:filters?'Try another word, or fewer filters.':'Try another word, or part of a name.',clear:filters?'Clear filters':'Clear search'};
 }
 if(filters>1){
  const where=deleted?' in Deleted':folder?` in ${name}`:unsorted?' outside folders':'';
  return {kind:'no-results',title:`Nothing matches these filters${where}`,body:'Try fewer filters.',clear:'Clear filters'};
 }
 if(filters===1){
  const body='Clear the filter to see everything.',clear='Clear filter' as const;
  if(tool){
   const t=plural(tool);
   return {kind:'no-results',body,clear,title:deleted?`No deleted ${t}`:folder?`No ${t} in ${name}`:unsorted?`No ${t} outside folders`:`No ${t} yet`};
  }
  if(car)return {kind:'no-results',body,clear,title:deleted?`No deleted work for ${car}`:folder?`Nothing for ${car} in ${name}`:unsorted?`Nothing for ${car} outside folders`:`Nothing made for ${car} yet`};
  if(who==='you')return {kind:'no-results',body,clear,title:deleted?'You haven’t deleted anything':folder?`Nothing of yours in ${name}`:unsorted?'Nothing of yours outside folders':'You haven’t made anything yet'};
  return {kind:'no-results',body,clear,title:deleted?'Nothing deleted by a teammate':folder?`Nothing from a teammate in ${name}`:unsorted?'Nothing from a teammate outside folders':'Nothing from a teammate yet'};
 }
 // No filter: the place itself is empty.
 if(deleted)return {kind:'empty',title:'Nothing deleted',body:'What you delete waits here, with Restore.'};
 if(folder)return {kind:'empty',title:`${folderName||'This folder'} is empty`,body:readOnly?'Work moved into this folder shows here.':'Move work here from the library with Move to…'};
 if(unsorted&&anything)return {kind:'empty',title:'Everything is in a folder',body:'Work that isn’t in a folder shows here.'};
 return {kind:'empty',title:'Nothing made yet',body:readOnly?'What your company makes shows here.':'Start with Create.'};
}
