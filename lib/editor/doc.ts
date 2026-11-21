// The canvas editor's document, format v2: a flat, versioned design.
//
//   { schemaVersion: 2, width, height, base, pages: [...], layers: { [id]: layer } }
//
// - One or more pages, all the same size (the picture's own pixels, so the
//   export is the picture's full resolution whatever the screen shows).
// - Layers by id, each saying where it lives: its page (`pageId`), its group
//   (`parentId`, null on the page itself) and its place among its siblings
//   (`index`, 0 at the back). Nothing is nested, so a change touches only the
//   layers it changes (undo keeps immer patches of exactly that, ./history.ts).
// - Pictures are referenced by storage key only (`images/<id>`, `logos/<id>`),
//   never by an address: a signed link expires and must never be kept. The
//   editor turns a key into the Studio's own address to draw it (assetSrc).
// - `base` is the original picture the design was made on; it is never written.
//
// Every saved v1 design ({width, height, background, layers: [...]}, written
// before this format) is upgraded on read by `upgradeDoc`, one way, so it opens
// exactly as it was saved. The operations are immer recipes (mutating a draft):
// the history records their patches; the plain functions below apply them once.
// Plain module: the editor (components/canvas/*), the routes (app/api/edits)
// and the tests share it.
import {produce,type Draft} from 'immer';

export const SCHEMA_VERSION=2;
export type Box={x:number;y:number;width:number;height:number;rotation:number};
/** A picture in storage: `images/<id>` (a picture or an upload in the company's storage) or `logos/<id>` (a brand-kit logo). */
export type AssetKey=string;
type Placed={id:string;name:string;pageId:string;parentId:string|null;index:number;locked?:boolean;hidden?:boolean};
type Base=Box&Placed;
export type ImageLayer=Base&{kind:'image';asset:AssetKey;source:'logo'|'upload'};
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
/** A group: its children are the layers whose parentId is its id. It has no box of its own (its children's is its). */
export type GroupLayer=Placed&{kind:'group'};
export type DrawnLayer=ImageLayer|TextLayer|ShapeLayer|LineLayer|FrameLayer|IconLayer;
export type Layer=DrawnLayer|GroupLayer;
export type PageBackground={kind:'picture';asset:AssetKey}|{kind:'colour';colour:string};
export type Page={id:string;background:PageBackground};
export type EditorDoc={schemaVersion:typeof SCHEMA_VERSION;width:number;height:number;
 /** The original picture the design was made on (its id): read only, never written. */base:string;
 pages:Page[];layers:Record<string,Layer>};

/** What a panel asks the canvas to add (Brand, Elements, Text, Uploads). `src` is the Studio's own address of the picture. */
export type CanvasAdd=
 |{kind:'image';src:string;assetId?:string;name:string;source:'logo'|'upload';naturalWidth?:number;naturalHeight?:number}
 |{kind:'text';style:TextStyle;text?:string;font?:string;color?:string}
 |{kind:'shape';shape:ShapeKind;fill?:string}
 |{kind:'line';dash?:boolean;arrow?:'none'|'end'|'both'}
 |{kind:'frame';ratio:number;radius?:number}
 |{kind:'icon';icon:string;name:string;paths:string[];color?:string};

/** Layers on one page; pages in one design. */
export const MAX_LAYERS=200,MAX_PAGES=20,TEXT_MAX=500,NAME_MAX=80,ICON_PATHS_MAX=40,ICON_PATH_MAX=4000;
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
export const SHAPE_NAMES:Record<ShapeKind,string>={rect:'Rectangle',rounded:'Rounded rectangle',circle:'Circle',triangle:'Triangle',star:'Star',hexagon:'Hexagon'};
/** A new page's background, and the default ink for what is added on a picture. */
export const BLANK_PAGE='#ffffff';
const INK='#ffffff',FALLBACK_FONT='Inter',FIRST_PAGE='page-1';
const round=(n:number)=>Math.round(n*100)/100;
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const isGroup=(l:Layer):l is GroupLayer=>l.kind==='group';

// ── Assets: storage keys, never addresses ─────────────────────────────────
const ID=/^[A-Za-z0-9-]{8,80}$/,ASSET_KEY=/^(images|logos)\/[A-Za-z0-9-]{8,80}$/;
export const isAssetKey=(v:unknown):v is AssetKey=>typeof v==='string'&&ASSET_KEY.test(v);
export const pictureKey=(id:string):AssetKey=>'images/'+id;
/** The Studio's own address for a key (it signs a short-lived link when the picture is fetched). */
export function assetSrc(key:AssetKey):string{
 if(!isAssetKey(key))throw new Error('Not a picture in this Studio.');
 const [space,id]=key.split('/');
 return space==='logos'?'/api/brand-kit/logos/'+id:'/api/assets/'+id;
}
/** The key for one of the Studio's own picture addresses; null for anything else (a signed or outside link). */
export function assetKeyOf(src:string):AssetKey|null{
 const m=/^\/api\/(assets|brand-kit\/logos)\/([A-Za-z0-9-]{8,80})(?:\?.*)?$/.exec(src||'');
 return m?(m[1]==='assets'?'images/':'logos/')+m[2]:null;
}
/** The picture id behind an `images/<id>` key (a page's background, an upload). */
export const pictureIdOf=(key:AssetKey)=>key.startsWith('images/')?key.slice(7):null;

// ── Reading a design ─────────────────────────────────────────────────────
/** Every layer of a page in drawing order, groups opened (back first): what the canvas draws and the export shows. */
export function drawOrder(doc:EditorDoc,pageId:string):DrawnLayer[]{
 const out:DrawnLayer[]=[];
 const walk=(parentId:string|null)=>{for(const l of siblings(doc,pageId,parentId)){if(isGroup(l))walk(l.id);else out.push(l)}};
 walk(null);return out;
}
/** One parent's children on a page, back first. */
export function siblings(doc:EditorDoc,pageId:string,parentId:string|null):Layer[]{
 return Object.values(doc.layers).filter(l=>l.pageId===pageId&&l.parentId===parentId).sort((a,b)=>a.index-b.index||(a.id<b.id?-1:1));
}
export const pageLayers=(doc:EditorDoc,pageId:string)=>Object.values(doc.layers).filter(l=>l.pageId===pageId);
export const pageOf=(doc:EditorDoc,pageId:string)=>doc.pages.find(p=>p.id===pageId)||null;
export const pageIndex=(doc:EditorDoc,pageId:string)=>doc.pages.findIndex(p=>p.id===pageId);
export const layerCount=(doc:EditorDoc)=>Object.keys(doc.layers).length;

// ── Making and changing a design (immer recipes) ─────────────────────────
type D=Draft<EditorDoc>;
/** A new design on a saved picture of this size: one page, the picture as its background. */
export function createDoc(picture:{id:string;width:number;height:number}):EditorDoc{
 if(!(picture.width>0&&picture.height>0))throw new Error('The picture has no size yet.');
 return {schemaVersion:SCHEMA_VERSION,width:Math.round(picture.width),height:Math.round(picture.height),base:picture.id,pages:[{id:FIRST_PAGE,background:{kind:'picture',asset:pictureKey(picture.id)}}],layers:{}};
}
/** A box of this size, centred on the page. */
function centred(doc:{width:number;height:number},width:number,height:number):Box{return {x:round((doc.width-width)/2),y:round((doc.height-height)/2),width:round(width),height:round(height),rotation:0}}
/** Puts one parent's children back in order 0, 1, 2… (after a layer joins, leaves or moves). */
function renumber(d:D,pageId:string,parentId:string|null,ordered:string[]){ordered.forEach((id,i)=>{const l=d.layers[id];if(l&&(l.index!==i||l.pageId!==pageId||l.parentId!==parentId)){l.index=i;l.pageId=pageId;l.parentId=parentId}})}
const childIds=(d:D|EditorDoc,pageId:string,parentId:string|null)=>siblings(d as EditorDoc,pageId,parentId).map(l=>l.id);
function roomFor(d:D|EditorDoc,pageId:string,more:number){if(pageLayers(d as EditorDoc,pageId).length+more>MAX_LAYERS)throw new Error(`A page holds up to ${MAX_LAYERS} layers.`)}

/** The layer an add makes, placed in the middle of the page at a size that reads well (not yet on a page). */
export function layerFor(doc:{width:number;height:number},add:CanvasAdd,id:string,pageId=FIRST_PAGE):DrawnLayer{
 const short=Math.min(doc.width,doc.height),at={id,pageId,parentId:null,index:0};
 if(add.kind==='image'){
  const asset=add.assetId&&ID.test(add.assetId)&&add.source==='upload'?pictureKey(add.assetId):assetKeyOf(add.src);
  if(!asset)throw new Error('Only pictures from this Studio can go on a design.');
  const w=(add.source==='logo'?0.18:0.35)*doc.width,ratio=add.naturalWidth&&add.naturalHeight?add.naturalHeight/add.naturalWidth:add.source==='logo'?0.5:0.75;
  return {...centred(doc,w,w*ratio),...at,kind:'image',name:(add.name||(add.source==='logo'?'Logo':'Picture')).slice(0,NAME_MAX),asset,source:add.source};
 }
 if(add.kind==='text'){
  const s=TEXT_STYLES[add.style],fontSize=Math.max(8,Math.round(s.size*doc.height)),text=(add.text||s.sample).slice(0,TEXT_MAX);
  const width=Math.min(doc.width*0.8,Math.max(fontSize*4,text.length*fontSize*0.55));
  return {...centred(doc,width,fontSize*1.3),...at,kind:'text',name:s.label,text,style:add.style,font:add.font||FALLBACK_FONT,fontSize,fontWeight:s.weight,color:add.color||INK,align:'center'};
 }
 if(add.kind==='shape')return {...centred(doc,short*0.25,short*0.25),...at,kind:'shape',name:SHAPE_NAMES[add.shape],shape:add.shape,fill:add.fill||INK,stroke:'transparent',strokeWidth:0};
 if(add.kind==='icon'){const s=short*0.16;return {...centred(doc,s,s),...at,kind:'icon',name:(add.name||'Icon').slice(0,NAME_MAX),icon:add.icon,paths:add.paths.slice(0,ICON_PATHS_MAX),color:add.color||INK,strokeWidth:ICON_STROKE}}
 if(add.kind==='line')return {...centred(doc,doc.width*0.3,Math.max(2,short*0.006)),...at,kind:'line',name:add.arrow&&add.arrow!=='none'?'Arrow':'Line',dash:!!add.dash,arrow:add.arrow||'none',stroke:INK,strokeWidth:Math.max(2,Math.round(short*0.006))};
 const h=short*0.4,w=clamp(h*add.ratio,8,doc.width*0.9);
 return {...centred(doc,w,h),...at,kind:'frame',name:'Frame',stroke:INK,strokeWidth:Math.max(2,Math.round(short*0.004)),radius:Math.round((add.radius||0)*short)};
}

export const edit={
 /** Adds a layer on top of a page. */
 add(d:D,pageId:string,add:CanvasAdd,id:string){
  if(!pageOf(d as EditorDoc,pageId))throw new Error('That page is no longer in the design.');
  roomFor(d,pageId,1);
  const l=layerFor(d,add,id,pageId);l.index=childIds(d,pageId,null).length;d.layers[id]=l;
 },
 /** Changes a layer's settings; never what it is, its id or where it lives. */
 update(d:D,id:string,patch:Partial<DrawnLayer>){
  const l=d.layers[id];if(!l||isGroup(l))return;
  const {id:_i,kind:_k,pageId:_p,parentId:_g,index:_x,...rest}=patch as Partial<DrawnLayer>&Record<string,unknown>;void _i;void _k;void _p;void _g;void _x;
  for(const [k,v] of Object.entries(rest)){if(v===undefined)continue;if((l as Record<string,unknown>)[k]!==v)(l as Record<string,unknown>)[k]=v}
 },
 /** Removes a layer (a group with everything in it) and closes the gap. */
 remove(d:D,id:string){
  const l=d.layers[id];if(!l)return;
  const drop=(x:string)=>{for(const c of Object.values(d.layers))if(c.parentId===x&&c.pageId===l.pageId)drop(c.id);delete d.layers[x]};
  drop(id);renumber(d,l.pageId,l.parentId,childIds(d,l.pageId,l.parentId));
 },
 /** A copy of a layer (a group with its children), right above it, offset by `offset` picture pixels. Returns the copy's id. */
 duplicate(d:D,id:string,newId:(old:string)=>string,offset:{x:number;y:number}){
  const l=d.layers[id];if(!l)return null;
  const tree:string[]=[];const collect=(x:string)=>{tree.push(x);for(const c of Object.values(d.layers))if(c.parentId===x&&c.pageId===l.pageId)collect(c.id)};collect(id);
  roomFor(d,l.pageId,tree.length);
  const ids=new Map(tree.map(x=>[x,newId(x)]));
  for(const x of tree){
   const src=d.layers[x] as Layer,copy={...JSON.parse(JSON.stringify(src)),id:ids.get(x)!} as Layer;
   if(x!==id)copy.parentId=ids.get(src.parentId!)!;
   if(!isGroup(copy)){copy.x=round(copy.x+offset.x);copy.y=round(copy.y+offset.y)}
   d.layers[copy.id]=copy;
  }
  const order=childIds(d,l.pageId,l.parentId).filter(x=>x!==ids.get(id));
  order.splice(order.indexOf(id)+1,0,ids.get(id)!);renumber(d,l.pageId,l.parentId,order);
  return ids.get(id)!;
 },
 /** Layer order among its siblings: the last is drawn on top. */
 reorder(d:D,id:string,to:'forward'|'backward'|'front'|'back'){
  const l=d.layers[id];if(!l)return;
  const order=childIds(d,l.pageId,l.parentId),at=order.indexOf(id);order.splice(at,1);
  const target=to==='front'?order.length:to==='back'?0:to==='forward'?Math.min(order.length,at+1):Math.max(0,at-1);
  order.splice(target,0,id);renumber(d,l.pageId,l.parentId,order);
 },
 /** Moves a layer (a group: everything in it) by picture pixels (the arrow keys). */
 nudge(d:D,id:string,dx:number,dy:number){
  const l=d.layers[id];if(!l)return;
  if(isGroup(l)){for(const c of Object.values(d.layers))if(c.parentId===id&&c.pageId===l.pageId)edit.nudge(d,c.id,dx,dy);return}
  l.x=round(l.x+dx);l.y=round(l.y+dy);
 },
 /** A new blank page right after `after` (or at the end), the same size as every page. */
 addPage(d:D,pageId:string,after?:string){
  if(d.pages.length>=MAX_PAGES)throw new Error(`A design holds up to ${MAX_PAGES} pages.`);
  const at=after?d.pages.findIndex(p=>p.id===after):-1;
  d.pages.splice(at<0?d.pages.length:at+1,0,{id:pageId,background:{kind:'colour',colour:BLANK_PAGE}});
 },
 /** A copy of a page and everything on it, right after it. */
 duplicatePage(d:D,pageId:string,newPageId:string,newId:(old:string)=>string){
  const at=d.pages.findIndex(p=>p.id===pageId);if(at<0)return;
  if(d.pages.length>=MAX_PAGES)throw new Error(`A design holds up to ${MAX_PAGES} pages.`);
  d.pages.splice(at+1,0,{id:newPageId,background:JSON.parse(JSON.stringify(d.pages[at].background))});
  const ids=new Map(pageLayers(d as EditorDoc,pageId).map(l=>[l.id,newId(l.id)]));
  for(const l of pageLayers(d as EditorDoc,pageId)){const copy={...JSON.parse(JSON.stringify(l)),id:ids.get(l.id)!,pageId:newPageId} as Layer;if(l.parentId)copy.parentId=ids.get(l.parentId)!;d.layers[copy.id]=copy}
 },
 /** Removes a page and what is on it; a design always keeps one page. */
 removePage(d:D,pageId:string){
  if(d.pages.length<=1)throw new Error('A design needs at least one page.');
  const at=d.pages.findIndex(p=>p.id===pageId);if(at<0)return;
  d.pages.splice(at,1);for(const l of Object.values(d.layers))if(l.pageId===pageId)delete d.layers[l.id];
 },
 /** Moves a page to another place in the order. */
 movePage(d:D,pageId:string,to:number){
  const at=d.pages.findIndex(p=>p.id===pageId);if(at<0)return;
  const [page]=d.pages.splice(at,1);d.pages.splice(clamp(Math.round(to),0,d.pages.length),0,page);
 },
 /** The whole design replaced (a restored version): one change, one undo step. */
 replace(d:D,next:EditorDoc){
  d.pages=JSON.parse(JSON.stringify(next.pages));d.layers=JSON.parse(JSON.stringify(next.layers));d.width=next.width;d.height=next.height;d.base=next.base;
 },
};

/** Where Ctrl/Cmd+D and Alt-drag put a copy: down and right of the original by 2 % of the page's short side. */
export const duplicateOffset=(doc:{width:number;height:number})=>{const s=Math.max(1,Math.round(Math.min(doc.width,doc.height)*0.02));return {x:s,y:s}};

// The same operations, applied once (tests, the server, one-off changes).
export const addLayer=(doc:EditorDoc,add:CanvasAdd,id:string,pageId=doc.pages[0].id)=>produce(doc,d=>{edit.add(d,pageId,add,id)});
export const updateLayer=(doc:EditorDoc,id:string,patch:Partial<DrawnLayer>)=>produce(doc,d=>{edit.update(d,id,patch)});
export const removeLayer=(doc:EditorDoc,id:string)=>produce(doc,d=>{edit.remove(d,id)});
export const duplicateLayer=(doc:EditorDoc,id:string,newId:string)=>produce(doc,d=>{edit.duplicate(d,id,()=>newId,duplicateOffset(doc))});
export const reorder=(doc:EditorDoc,id:string,to:'forward'|'backward'|'front'|'back')=>produce(doc,d=>{edit.reorder(d,id,to)});
export const nudge=(doc:EditorDoc,id:string,dx:number,dy:number)=>produce(doc,d=>{edit.nudge(d,id,dx,dy)});

// ── Alignment guides ─────────────────────────────────────────────────────
export type Guide={orientation:'v'|'h';at:number};
/**
 * Snaps a moving (unrotated) box to the page's edges and centre lines and to
 * the other layers' edges and centres on that page, within `threshold` picture
 * pixels. Returns the snapped position and the guides to draw.
 */
export function snap(doc:EditorDoc,pageId:string,moving:{id:string}&Box,threshold:number):{x:number;y:number;guides:Guide[]}{
 const xs=[0,doc.width/2,doc.width],ys=[0,doc.height/2,doc.height];
 for(const l of drawOrder(doc,pageId)){if(l.id===moving.id||l.rotation||l.hidden)continue;xs.push(l.x,l.x+l.width/2,l.x+l.width);ys.push(l.y,l.y+l.height/2,l.y+l.height)}
 const pick=(targets:number[],edges:number[])=>{let best:{d:number;shift:number;at:number}|null=null;for(const t of targets)for(const e of edges){const d=Math.abs(t-e);if(d<=threshold&&(!best||d<best.d))best={d,shift:t-e,at:t}}return best};
 const bx=pick(xs,[moving.x,moving.x+moving.width/2,moving.x+moving.width]),by=pick(ys,[moving.y,moving.y+moving.height/2,moving.y+moving.height]);
 const guides:Guide[]=[];if(bx)guides.push({orientation:'v',at:bx.at});if(by)guides.push({orientation:'h',at:by.at});
 return {x:moving.x+(bx?.shift||0),y:moving.y+(by?.shift||0),guides};
}

// ── Export ───────────────────────────────────────────────────────────────
/** The export is always the picture's own size: the stage is drawn at this pixel ratio. */
export const exportSize=(doc:EditorDoc)=>({width:doc.width,height:doc.height});
export function exportPixelRatio(doc:EditorDoc,shownWidth:number){
 if(!(shownWidth>0))throw new Error('The canvas has no size yet.');
 return doc.width/shownWidth;
}

// ── Checking a design from outside (the routes) ──────────────────────────
/** SVG path data: commands, numbers, separators. Nothing that could be markup or a URL. */
const PATH_DATA=/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/,ICON_NAME=/^[a-z0-9-]{1,60}$/;
const HEX=/^#[0-9a-f]{6}$/i,LAYER_ID=/^[A-Za-z0-9_-]{1,80}$/;
/** An address of any kind, or the marks of a signed storage link: never in a design (only text a person typed may hold one). */
const LINKISH=/:\/\/|x-amz-|signature=|^\/\//i;
const num=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const str=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const plain=(v:unknown,max:number)=>str(v,max)&&!LINKISH.test(v as string);
const colour=(v:unknown)=>v==='transparent'||(typeof v==='string'&&HEX.test(v));
const flag=(v:unknown)=>v===undefined||typeof v==='boolean';
type Checked={ok:true;doc:EditorDoc}|{ok:false;reason:string};

function checkLayerBody(l:Record<string,unknown>,span:number):string|null{
 if(!num(l.x,-span,span)||!num(l.y,-span,span)||!num(l.width,0,span)||!num(l.height,0,span)||!num(l.rotation,-360,360))return 'box';
 if(l.kind==='image')return isAssetKey(l.asset)&&(l.source==='logo'||l.source==='upload')?null:'image';
 if(l.kind==='text')return str(l.text,TEXT_MAX)&&plain(l.font,60)&&num(l.fontSize,1,4000)&&num(l.fontWeight,100,900)&&colour(l.color)&&['heading','subheading','body'].includes(l.style as string)&&['left','center','right'].includes(l.align as string)?null:'text';
 if(l.kind==='shape')return SHAPES.includes(l.shape as ShapeKind)&&colour(l.fill)&&colour(l.stroke)&&num(l.strokeWidth,0,500)?null:'shape';
 if(l.kind==='line')return colour(l.stroke)&&num(l.strokeWidth,0,500)&&typeof l.dash==='boolean'&&['none','end','both'].includes(l.arrow as string)?null:'line';
 if(l.kind==='frame')return colour(l.stroke)&&num(l.strokeWidth,0,500)&&num(l.radius,0,span)?null:'frame';
 if(l.kind==='icon')return typeof l.icon==='string'&&ICON_NAME.test(l.icon)&&Array.isArray(l.paths)&&l.paths.length&&l.paths.length<=ICON_PATHS_MAX&&l.paths.every(p=>str(p,ICON_PATH_MAX)&&PATH_DATA.test(p as string))&&colour(l.color)&&l.color!=='transparent'&&num(l.strokeWidth,0.25,6)?null:'icon';
 return 'kind';
}

/** A v2 design, or the reason it isn't one. Positions may sit partly off the page; sizes may not be absurd. */
export function checkDoc(v:unknown):Checked{
 const d=v as EditorDoc;
 if(!d||typeof d!=='object'||d.schemaVersion!==SCHEMA_VERSION)return {ok:false,reason:'version'};
 if(!num(d.width,1,20000)||!num(d.height,1,20000))return {ok:false,reason:'size'};
 if(typeof d.base!=='string'||!ID.test(d.base))return {ok:false,reason:'base'};
 if(!Array.isArray(d.pages)||!d.pages.length||d.pages.length>MAX_PAGES)return {ok:false,reason:'pages'};
 const pages=new Set<string>();
 for(const p of d.pages){
  if(!p||typeof p!=='object'||typeof p.id!=='string'||!LAYER_ID.test(p.id)||pages.has(p.id))return {ok:false,reason:'page'};
  const b=p.background as PageBackground|undefined;
  if(!b||(b.kind==='picture'?!isAssetKey(b.asset)||!b.asset.startsWith('images/'):b.kind==='colour'?!colour(b.colour):true))return {ok:false,reason:'background'};
  pages.add(p.id);
 }
 if(!d.layers||typeof d.layers!=='object'||Array.isArray(d.layers))return {ok:false,reason:'layers'};
 const span=Math.max(d.width,d.height)*4,perPage=new Map<string,number>(),all=Object.entries(d.layers);
 if(all.length>MAX_LAYERS*d.pages.length)return {ok:false,reason:'layers'};
 for(const [key,raw] of all){
  const l=raw as unknown as Record<string,unknown>;
  if(!l||typeof l!=='object'||l.id!==key||!LAYER_ID.test(key)||!plain(l.name,NAME_MAX))return {ok:false,reason:'layer'};
  if(typeof l.pageId!=='string'||!pages.has(l.pageId)||!num(l.index,0,MAX_LAYERS*4)||!Number.isInteger(l.index)||!flag(l.locked)||!flag(l.hidden))return {ok:false,reason:'place'};
  perPage.set(l.pageId,(perPage.get(l.pageId)||0)+1);if(perPage.get(l.pageId)!>MAX_LAYERS)return {ok:false,reason:'layers'};
  if(l.parentId!==null){const g=d.layers[l.parentId as string] as Layer|undefined;if(typeof l.parentId!=='string'||!g||g.kind!=='group'||g.pageId!==l.pageId||l.parentId===key)return {ok:false,reason:'group'}}
  if(l.kind==='group')continue;
  const bad=checkLayerBody(l,span);if(bad)return {ok:false,reason:bad};
 }
 // No group inside itself (a parent chain always ends on the page).
 for(const [key] of all){let at:string|null=key;for(let n=0;at;n++){if(n>MAX_LAYERS)return {ok:false,reason:'group'};at=(d.layers[at] as Layer).parentId}}
 return {ok:true,doc:d};
}

// ── Format v1 (saved before v2) and the one upgrade ──────────────────────
type V1Layer=Box&{id:string;name:string;kind:string;src?:string;assetId?:string;[k:string]:unknown};
export type DocV1={width:number;height:number;background:{visualId:string;src:string};layers:V1Layer[]};
const V1_SRC=/^(\/api\/(assets|brand-kit\/logos)\/[a-z0-9-]{8,80}(\?[a-z0-9=&]*)?|https:\/\/[^\s"'<>]+)$/i;
/** A v1 design as the v1 save route accepted it (the same rules, kept here for reading old files). */
export function checkV1(v:unknown):{ok:true;doc:DocV1}|{ok:false;reason:string}{
 const d=v as DocV1;
 if(!d||typeof d!=='object'||!num(d.width,1,20000)||!num(d.height,1,20000))return {ok:false,reason:'size'};
 if(!d.background||!str(d.background.visualId,80)||!str(d.background.src,300))return {ok:false,reason:'background'};
 if(!Array.isArray(d.layers)||d.layers.length>MAX_LAYERS)return {ok:false,reason:'layers'};
 const span=Math.max(d.width,d.height)*4;
 for(const l of d.layers){
  if(!l||typeof l!=='object'||!str(l.id,80)||!str(l.name,NAME_MAX))return {ok:false,reason:'layer'};
  if(l.kind==='image'){if(!str(l.src,600)||!V1_SRC.test(l.src!)||(l.source!=='logo'&&l.source!=='upload'))return {ok:false,reason:'image'};if(!num(l.x,-span,span)||!num(l.y,-span,span)||!num(l.width,0,span)||!num(l.height,0,span)||!num(l.rotation,-360,360))return {ok:false,reason:'box'};continue}
  const bad=checkLayerBody(l as unknown as Record<string,unknown>,span);if(bad)return {ok:false,reason:bad};
 }
 return {ok:true,doc:d};
}
/**
 * The one upgrade, v1 → v2: one page with the original picture underneath, the
 * layers in the same order with the same boxes and settings, each picture's
 * address turned into its storage key. A v1 picture with an outside address
 * (never written by the Studio's own panels) keeps its place and size as an
 * empty frame, so nothing else moves. Layer ids are kept; ids the v2 format
 * cannot hold are replaced.
 */
export function upgradeV1(v1:DocV1):EditorDoc{
 const base=String(v1.background.visualId),layers:Record<string,Layer>={},seen=new Set<string>();
 v1.layers.forEach((l,index)=>{
  let id=LAYER_ID.test(l.id)&&!seen.has(l.id)?l.id:`layer-${index+1}`;while(seen.has(id))id+='-v2';seen.add(id);
  const {src,assetId,...rest}=l,at={id,pageId:FIRST_PAGE,parentId:null,index,name:String(l.name).replace(LINKISH,'').slice(0,NAME_MAX)||'Layer'};
  if(l.kind==='image'){
   const asset=(l.source==='upload'&&typeof assetId==='string'&&ID.test(assetId)?pictureKey(assetId):null)||assetKeyOf(String(src||''));
   layers[id]=asset?{...rest,...at,kind:'image',asset,source:l.source==='logo'?'logo':'upload'} as ImageLayer
    :{x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,...at,kind:'frame',name:'Missing picture',stroke:'#888888',strokeWidth:2,radius:0};
  }else layers[id]={...rest,...at} as Layer;
 });
 return {schemaVersion:SCHEMA_VERSION,width:Math.round(v1.width),height:Math.round(v1.height),base,pages:[{id:FIRST_PAGE,background:{kind:'picture',asset:pictureKey(base)}}],layers};
}
/** Any saved design, as v2: a v2 file is checked, a v1 file is checked by v1's rules and upgraded once. */
export function readDoc(raw:unknown):Checked&{from?:1|2}{
 if(raw&&typeof raw==='object'&&'schemaVersion' in raw){const c=checkDoc(raw);return c.ok?{...c,from:2}:c}
 const v1=checkV1(raw);if(!v1.ok)return v1;
 const up=checkDoc(upgradeV1(v1.doc));
 return up.ok?{...up,from:1}:{ok:false,reason:'upgrade:'+up.reason};
}
/** What the save route keeps: a copy with only the design's own fields (nothing else a client sent). */
export function cleanDoc(doc:EditorDoc):EditorDoc{
 return {schemaVersion:SCHEMA_VERSION,width:doc.width,height:doc.height,base:doc.base,pages:doc.pages.map(p=>({id:p.id,background:p.background.kind==='picture'?{kind:'picture',asset:p.background.asset}:{kind:'colour',colour:p.background.colour}})),layers:doc.layers};
}
/** A design applied to a recipe once, outside the history (the server: a restored version). */
export const change=(doc:EditorDoc,recipe:(d:D)=>void)=>produce(doc,recipe);
