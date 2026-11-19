// Saving a design from the canvas editor: a NEW picture, never a change to the
// one it was made from. Save makes a new version (it keeps its parent, so it
// shows as the original's next version); Duplicate makes a separate copy.
// Plain module: the editor, the route (app/api/edits) and the tests share it.
import type {Visual} from '../studio';

export const EDITS_PATH='/api/edits';
export const EDIT_MAX_BYTES=60_000_000;

/** A file name for a download or an upload, from the picture's title. */
export function editFileName(title:string,ext:'png'|'jpg',copy:boolean){
 const base=(title||'design').normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-').toLowerCase().slice(0,60)||'design';
 return `${base}-${copy?'copy':'edited'}.${ext}`;
}

/**
 * The new picture's record. The original (`parent`) is read only: its id, its
 * address and everything else stay exactly as they were. The size must be the
 * original's (the editor exports at full resolution); a different size is
 * refused by the caller.
 */
export function editedVisual(parent:Visual,{id,width,height,layers,copy,now}:{id:string;width:number;height:number;layers:number;copy:boolean;now:Date}):Visual{
 const title=(parent.title||'Design').replace(/ · (edited|copy)$/,'');
 return {
  id,title:(title+(copy?' · copy':' · edited')).slice(0,120),src:'/api/assets/'+id,status:'ready',createdAt:now.toISOString(),
  width,height,size:width+'x'+height,vehicle:parent.vehicle,configurator:parent.configurator,lineup:parent.lineup,
  parentId:copy?null:parent.id,
  edit:{parentId:parent.id,parentSrc:parent.src,layers,...(copy?{copy:true}:{})},
 };
}

/** Whether an export is the original's full size (the save route refuses anything else). */
export const fullSize=(parent:{width?:number;height?:number},got:{width:number;height:number})=>!parent.width||!parent.height||(got.width===parent.width&&got.height===parent.height);
