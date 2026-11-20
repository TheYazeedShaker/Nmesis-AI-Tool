// The canvas editor's document: a generated picture (the background, never
// changed) and the layers put on it (logos, uploads, text, shapes, lines,
// frames). Every position and size is in the picture's own pixels, so the
// export is the picture's full resolution whatever the screen shows. Plain
// module with pure functions: the editor (components/canvas/*), the save route
// (app/api/edits) and the tests share it.

export type Box={x:number;y:number;width:number;height:number;rotation:number};
type Base=Box&{id:string;name:string};
export type ImageLayer=Base&{kind:'image';src:string;assetId?:string;source:'logo'|'upload'};
export type TextStyle='heading'|'subheading'|'body';
export type TextLayer=Base&{kind:'text';text:string;style:TextStyle;font:string;fontSize:number;fontWeight:number;color:string;align:'left'|'center'|'right'};
export const SHAPES=['rect','rounded','circle','triangle','star','hexagon'] as const;
export type ShapeKind=typeof SHAPES[number];
export type ShapeLayer=Base&{kind:'shape';shape:ShapeKind;fill:string;stroke:string;strokeWidth:number};
export type LineLayer=Base&{kind:'line';dash:boolean;arrow:'none'|'end'|'both';stroke:string;strokeWidth:number};
export type FrameLayer=Base&{kind:'frame';stroke:string;strokeWidth:number;radius:number};
/** An icon from the Studio's icon set (lucide), kept as its vector paths on a 24 x 24 grid
 *  (lib/editor/icons.ts), so it draws sharp at any size and needs nothing else to reopen. */
export type IconLayer=Base&{kind:'icon';icon:string;paths:string[];color:string;strokeWidth:number};
export type Layer=ImageLayer|TextLayer|ShapeLayer|LineLayer|FrameLayer|IconLayer;
export type EditorDoc={width:number;height:number;background:{visualId:string;src:string};layers:Layer[]};

/** What a panel asks the canvas to add (Brand, Elements, Text, Uploads). */
export type CanvasAdd=
 |{kind:'image';src:string;assetId?:string;name:string;source:'logo'|'upload';naturalWidth?:number;naturalHeight?:number}
 |{kind:'text';style:TextStyle;text?:string;font?:string;color?:string}
 |{kind:'shape';shape:ShapeKind;fill?:string}
 |{kind:'line';dash?:boolean;arrow?:'none'|'end'|'both'}
 |{kind:'frame';ratio:number;radius?:number}
 |{kind:'icon';icon:string;name:string;paths:string[];color?:string};

export const MAX_LAYERS=200,TEXT_MAX=500,NAME_MAX=80,ICON_PATHS_MAX=40,ICON_PATH_MAX=4000;
/** An icon's own grid (lucide draws on 24 x 24) and its default line weight on that grid. */
export const ICON_GRID=24,ICON_STROKE=2;
/** Text's line height on the canvas, the in-place text box and the export alike. */
export const TEXT_LINE_HEIGHT=1.15;
export const TEXT_STYLES:Record<TextStyle,{label:string;sample:string;size:number;weight:number}>={
 // Sizes are fractions of the picture's height, so a style looks the same on any picture.
 heading:{label:'Heading',sample:'Add a heading',size:0.08,weight:700},
 subheading:{label:'Subheading',sample:'Add a subheading',size:0.05,weight:600},
 body:{label:'Body text',sample:'Add a little body text',size:0.032,weight:400},
};
const INK='#ffffff',FALLBACK_FONT='Inter';
const round=(n:number)=>Math.round(n*100)/100;
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));

/** A new document on a saved picture of this size. */
export function createDoc(picture:{id:string;src:string;width:number;height:number}):EditorDoc{
 if(!(picture.width>0&&picture.height>0))throw new Error('The picture has no size yet.');
 return {width:Math.round(picture.width),height:Math.round(picture.height),background:{visualId:picture.id,src:picture.src},layers:[]};
}

/** A box of this size, centred on the picture. */
function centred(doc:EditorDoc,width:number,height:number):Box{return {x:round((doc.width-width)/2),y:round((doc.height-height)/2),width:round(width),height:round(height),rotation:0}}

/** The layer an add makes, placed in the middle of the picture at a size that reads well. */
export function layerFor(doc:EditorDoc,add:CanvasAdd,id:string):Layer{
 const short=Math.min(doc.width,doc.height);
 if(add.kind==='image'){
  const w=(add.source==='logo'?0.18:0.35)*doc.width,ratio=add.naturalWidth&&add.naturalHeight?add.naturalHeight/add.naturalWidth:add.source==='logo'?0.5:0.75;
  return {...centred(doc,w,w*ratio),id,kind:'image',name:(add.name||(add.source==='logo'?'Logo':'Picture')).slice(0,NAME_MAX),src:add.src,assetId:add.assetId,source:add.source};
 }
 if(add.kind==='text'){
  const s=TEXT_STYLES[add.style],fontSize=Math.max(8,Math.round(s.size*doc.height)),text=(add.text||s.sample).slice(0,TEXT_MAX);
  const width=Math.min(doc.width*0.8,Math.max(fontSize*4,text.length*fontSize*0.55));
  return {...centred(doc,width,fontSize*1.3),id,kind:'text',name:s.label,text,style:add.style,font:add.font||FALLBACK_FONT,fontSize,fontWeight:s.weight,color:add.color||INK,align:'center'};
 }
 if(add.kind==='shape')return {...centred(doc,short*0.25,short*0.25),id,kind:'shape',name:SHAPE_NAMES[add.shape],shape:add.shape,fill:add.fill||INK,stroke:'transparent',strokeWidth:0};
 if(add.kind==='icon'){const s=short*0.16;return {...centred(doc,s,s),id,kind:'icon',name:(add.name||'Icon').slice(0,NAME_MAX),icon:add.icon,paths:add.paths.slice(0,ICON_PATHS_MAX),color:add.color||INK,strokeWidth:ICON_STROKE}}
 if(add.kind==='line')return {...centred(doc,doc.width*0.3,Math.max(2,short*0.006)),id,kind:'line',name:add.arrow&&add.arrow!=='none'?'Arrow':'Line',dash:!!add.dash,arrow:add.arrow||'none',stroke:INK,strokeWidth:Math.max(2,Math.round(short*0.006))};
 const h=short*0.4,w=clamp(h*add.ratio,8,doc.width*0.9);
 return {...centred(doc,w,h),id,kind:'frame',name:'Frame',stroke:INK,strokeWidth:Math.max(2,Math.round(short*0.004)),radius:Math.round((add.radius||0)*short)};
}
export const SHAPE_NAMES:Record<ShapeKind,string>={rect:'Rectangle',rounded:'Rounded rectangle',circle:'Circle',triangle:'Triangle',star:'Star',hexagon:'Hexagon'};

export function addLayer(doc:EditorDoc,add:CanvasAdd,id:string):EditorDoc{
 if(doc.layers.length>=MAX_LAYERS)throw new Error(`A design holds up to ${MAX_LAYERS} layers.`);
 return {...doc,layers:[...doc.layers,layerFor(doc,add,id)]};
}
export function updateLayer(doc:EditorDoc,id:string,patch:Partial<Layer>):EditorDoc{
 return {...doc,layers:doc.layers.map(l=>l.id===id?{...l,...patch,id:l.id,kind:l.kind} as Layer:l)};
}
export function removeLayer(doc:EditorDoc,id:string):EditorDoc{return {...doc,layers:doc.layers.filter(l=>l.id!==id)}}
export function duplicateLayer(doc:EditorDoc,id:string,newId:string):EditorDoc{
 const at=doc.layers.findIndex(l=>l.id===id);if(at<0)return doc;
 if(doc.layers.length>=MAX_LAYERS)throw new Error(`A design holds up to ${MAX_LAYERS} layers.`);
 const step=Math.round(Math.min(doc.width,doc.height)*0.02),copy={...doc.layers[at],id:newId,x:doc.layers[at].x+step,y:doc.layers[at].y+step} as Layer;
 return {...doc,layers:[...doc.layers.slice(0,at+1),copy,...doc.layers.slice(at+1)]};
}
/** Layer order: the last layer is drawn on top. */
export function reorder(doc:EditorDoc,id:string,to:'forward'|'backward'|'front'|'back'):EditorDoc{
 const at=doc.layers.findIndex(l=>l.id===id);if(at<0)return doc;
 const layers=[...doc.layers],[layer]=layers.splice(at,1);
 const target=to==='front'?layers.length:to==='back'?0:to==='forward'?Math.min(layers.length,at+1):Math.max(0,at-1);
 layers.splice(target,0,layer);return {...doc,layers};
}
/** Moves a layer by whole pixels of the picture (the arrow keys). */
export function nudge(doc:EditorDoc,id:string,dx:number,dy:number):EditorDoc{
 const l=doc.layers.find(x=>x.id===id);return l?updateLayer(doc,id,{x:round(l.x+dx),y:round(l.y+dy)}):doc;
}

// ── Alignment guides ─────────────────────────────────────────────────────
export type Guide={orientation:'v'|'h';at:number};
/**
 * Snaps a moving (unrotated) box to the picture's edges and centre lines and to
 * the other layers' edges and centres, within `threshold` picture pixels.
 * Returns the snapped position and the guides to draw.
 */
export function snap(doc:EditorDoc,moving:{id:string}&Box,threshold:number):{x:number;y:number;guides:Guide[]}{
 const xs=[0,doc.width/2,doc.width],ys=[0,doc.height/2,doc.height];
 for(const l of doc.layers){if(l.id===moving.id||l.rotation)continue;xs.push(l.x,l.x+l.width/2,l.x+l.width);ys.push(l.y,l.y+l.height/2,l.y+l.height)}
 const pick=(targets:number[],edges:number[])=>{let best:{d:number;shift:number;at:number}|null=null;for(const t of targets)for(const e of edges){const d=Math.abs(t-e);if(d<=threshold&&(!best||d<best.d))best={d,shift:t-e,at:t}}return best};
 const bx=pick(xs,[moving.x,moving.x+moving.width/2,moving.x+moving.width]),by=pick(ys,[moving.y,moving.y+moving.height/2,moving.y+moving.height]);
 const guides:Guide[]=[];if(bx)guides.push({orientation:'v',at:bx.at});if(by)guides.push({orientation:'h',at:by.at});
 return {x:moving.x+(bx?.shift||0),y:moving.y+(by?.shift||0),guides};
}

// ── Undo and redo ────────────────────────────────────────────────────────
/** `merge`: the key of the last step when it may take more of the same change (typing in one text). */
export type History<T>={past:T[];present:T;future:T[];merge?:string};
export const HISTORY_MAX=100;
export const startHistory=<T,>(present:T):History<T>=>({past:[],present,future:[]});
/** A new step (clears what was undone). Pushing the same state twice is a no-op.
 *  With `merge` (e.g. "type:<layer>:<session>"), a change right after another
 *  with the same key joins that step: typing a word is one step to undo, not one per letter. */
export function commit<T>(h:History<T>,next:T,merge?:string):History<T>{
 if(next===h.present)return h;
 if(merge&&h.merge===merge&&h.past.length)return {past:h.past,present:next,future:[],merge};
 const step:History<T>={past:[...h.past,h.present].slice(-HISTORY_MAX),present:next,future:[]};
 return merge?{...step,merge}:step;
}
export function undo<T>(h:History<T>):History<T>{
 if(!h.past.length)return h;
 return {past:h.past.slice(0,-1),present:h.past[h.past.length-1],future:[h.present,...h.future]};// merge is not kept: what comes next is a new step
}
export function redo<T>(h:History<T>):History<T>{
 if(!h.future.length)return h;
 return {past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)};// a new step after this, too
}

// ── Export ───────────────────────────────────────────────────────────────
/** The export is always the picture's own size: the stage is drawn at this pixel ratio. */
export const exportSize=(doc:EditorDoc)=>({width:doc.width,height:doc.height});
export function exportPixelRatio(doc:EditorDoc,shownWidth:number){
 if(!(shownWidth>0))throw new Error('The canvas has no size yet.');
 return doc.width/shownWidth;
}

// ── Checking a document from outside (the save route) ────────────────────
/** SVG path data: commands, numbers, separators. Nothing that could be markup or a URL. */
const PATH_DATA=/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/,ICON_NAME=/^[a-z0-9-]{1,60}$/;
const HEX=/^#[0-9a-f]{6}$/i,SAFE_SRC=/^(\/api\/(assets|brand-kit\/logos)\/[a-z0-9-]{8,80}(\?[a-z0-9=&]*)?|https:\/\/[^\s"'<>]+)$/i;
const num=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const str=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const colour=(v:unknown)=>v==='transparent'||(typeof v==='string'&&HEX.test(v));
/** The document, or the reason it isn't one. Positions may sit partly off the picture; sizes may not be absurd. */
export function checkDoc(v:unknown):{ok:true;doc:EditorDoc}|{ok:false;reason:string}{
 const d=v as EditorDoc;
 if(!d||typeof d!=='object'||!num(d.width,1,20000)||!num(d.height,1,20000))return {ok:false,reason:'size'};
 if(!d.background||!str(d.background.visualId,80)||!str(d.background.src,300))return {ok:false,reason:'background'};
 if(!Array.isArray(d.layers)||d.layers.length>MAX_LAYERS)return {ok:false,reason:'layers'};
 const span=Math.max(d.width,d.height)*4;
 for(const l of d.layers){
  if(!l||typeof l!=='object'||!str(l.id,80)||!str(l.name,NAME_MAX))return {ok:false,reason:'layer'};
  if(!num(l.x,-span,span)||!num(l.y,-span,span)||!num(l.width,0,span)||!num(l.height,0,span)||!num(l.rotation,-360,360))return {ok:false,reason:'box'};
  if(l.kind==='image'){if(!str(l.src,600)||!SAFE_SRC.test(l.src)||(l.source!=='logo'&&l.source!=='upload'))return {ok:false,reason:'image'}}
  else if(l.kind==='text'){if(!str(l.text,TEXT_MAX)||!str(l.font,60)||!num(l.fontSize,1,4000)||!num(l.fontWeight,100,900)||!colour(l.color)||!['heading','subheading','body'].includes(l.style)||!['left','center','right'].includes(l.align))return {ok:false,reason:'text'}}
  else if(l.kind==='shape'){if(!SHAPES.includes(l.shape)||!colour(l.fill)||!colour(l.stroke)||!num(l.strokeWidth,0,500))return {ok:false,reason:'shape'}}
  else if(l.kind==='line'){if(!colour(l.stroke)||!num(l.strokeWidth,0,500)||typeof l.dash!=='boolean'||!['none','end','both'].includes(l.arrow))return {ok:false,reason:'line'}}
  else if(l.kind==='frame'){if(!colour(l.stroke)||!num(l.strokeWidth,0,500)||!num(l.radius,0,span))return {ok:false,reason:'frame'}}
  else if(l.kind==='icon'){if(typeof l.icon!=='string'||!ICON_NAME.test(l.icon)||!Array.isArray(l.paths)||!l.paths.length||l.paths.length>ICON_PATHS_MAX||!l.paths.every(d=>str(d,ICON_PATH_MAX)&&PATH_DATA.test(d))||!colour(l.color)||l.color==='transparent'||!num(l.strokeWidth,0.25,6))return {ok:false,reason:'icon'}}
  else return {ok:false,reason:'kind'};
 }
 return {ok:true,doc:d};
}
