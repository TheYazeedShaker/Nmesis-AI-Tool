// Saving a design from the canvas editor: a NEW picture, never a change to the
// one it was made from. Save makes a new version (it keeps its parent, so it
// shows as the original's next version); Duplicate design makes a separate copy
// ("Copy of <name>"), the first picture of a design of its own; Restore makes a
// new version from an earlier one. Plain module: the editor, the routes
// (app/api/edits) and the tests share it.
import type {Visual} from '../studio';

export const EDITS_PATH='/api/edits';
export const EDIT_MAX_BYTES=60_000_000;
/** The largest working draft autosave sends (JSON); Vercel's own limit is 4.5 MB. */
export const DRAFT_MAX_BYTES=2_000_000;

/** A file name for a download or an upload, from the picture's title. */
export function editFileName(title:string,ext:'png'|'jpg',copy:boolean){
 const base=(title||'design').normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-').toLowerCase().slice(0,60)||'design';
 return `${base}-${copy?'copy':'edited'}.${ext}`;
}

/** The picture's own name, without what earlier saves added (" · edited", " · copy"). */
export const designName=(title:string|undefined)=>(title||'Design').replace(/( · (edited|copy))+$/,'').trim()||'Design';
/** The title of a duplicated design. */
export const copyTitle=(title:string|undefined)=>('Copy of '+designName(title)).slice(0,120);
/** The Studio's own address of a picture: kept in a record instead of whatever address it was shown at. */
const ownSrc=(v:Pick<Visual,'id'|'src'>)=>/^\/api\/assets\/[a-z0-9-]{8,80}$/.test(v.src||'')?v.src:'/api/assets/'+v.id;

/**
 * The new picture's record. The original (`parent`) is read only: its id, its
 * address and everything else stay exactly as they were. The size must be the
 * original's (the editor exports at full resolution); a different size is
 * refused by the caller. `designId`: the design the new picture belongs to (a
 * copy starts its own: its own id).
 */
export function editedVisual(parent:Visual,{id,width,height,layers,pages=1,copy,now,designId,restoredFrom}:{id:string;width:number;height:number;layers:number;pages?:number;copy:boolean;now:Date;designId?:string;restoredFrom?:string}):Visual{
 return {
  id,title:copy?copyTitle(parent.title):(designName(parent.title)+' · edited').slice(0,120),src:'/api/assets/'+id,status:'ready',createdAt:now.toISOString(),
  width,height,size:width+'x'+height,vehicle:parent.vehicle,configurator:parent.configurator,lineup:parent.lineup,
  parentId:copy?null:parent.id,
  edit:{parentId:parent.id,parentSrc:ownSrc(parent),layers,pages,designId:copy?id:(designId||parent.id),...(copy?{copy:true}:{}),...(restoredFrom?{restoredFrom}:{})},
 };
}

/** Whether an export is the original's full size (the save route refuses anything else). */
export const fullSize=(parent:{width?:number;height?:number},got:{width:number;height:number})=>!parent.width||!parent.height||(got.width===parent.width&&got.height===parent.height);
