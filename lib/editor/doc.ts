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
// Settings added after the first v2 designs are optional, so every design saved before them reads as it was.
type Base=Box&Placed&{/** 0 (not seen) to 1 (solid); absent: 1. */opacity?:number};
export type ImageLayer=Base&{kind:'image';asset:AssetKey;source:'logo'|'upload';
 /** Rounded corners, in picture pixels; absent: square. */radius?:number;/** Mirrored left to right / top to bottom. */flipX?:boolean;flipY?:boolean};
export type TextStyle='heading'|'subheading'|'body';
export type TextLayer=Base&{kind:'text';text:string;style:TextStyle;font:string;fontSize:number;fontWeight:number;color:string;align:'left'|'center'|'right';
 /** Line spacing as a multiple of the size; absent: TEXT_LINE_HEIGHT. */lineHeight?:number;/** Letter spacing in picture pixels; absent: 0. */letterSpacing?:number};
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
/** A layer's opacity (1 when it has never been set). */
export const opacityOf=(l:DrawnLayer)=>l.opacity??1;
/** A text's line spacing, as a multiple of its size. */
export const lineHeightOf=(l:TextLayer)=>l.lineHeight??TEXT_LINE_HEIGHT;
/** The ways a selection lines up: with the page (one layer) or with the selection's own edges (several). */
export const ALIGNS=['left','centre','right','top','middle','bottom'] as const;
export type Align=typeof ALIGNS[number];
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
/** The layer and every group above it, the layer first (a parent chain always ends on the page; bounded all the same). */
function chain(doc:EditorDoc,id:string):Layer[]{
 const out:Layer[]=[];let at:Layer|undefined=doc.layers[id];
 while(at&&out.length<=MAX_LAYERS*4){out.push(at);at=at.parentId?doc.layers[at.parentId]:undefined}
 return out;
}
/** Every drawn layer a layer stands for: itself, or everything inside a group (nested groups opened), back first. */
export function descendants(doc:EditorDoc,id:string):DrawnLayer[]{
 const l=doc.layers[id];if(!l)return [];
 if(!isGroup(l))return [l];
 const out:DrawnLayer[]=[];
 const walk=(parentId:string,depth:number)=>{if(depth>MAX_LAYERS)return;for(const c of siblings(doc,l.pageId,parentId)){if(isGroup(c))walk(c.id,depth+1);else out.push(c)}};
 walk(id,0);return out;
}
/** What a click on a layer selects: the outermost group holding it, or the layer itself when it sits on the page. */
export function topOf(doc:EditorDoc,id:string):string{const c=chain(doc,id);return c.length?c[c.length-1].id:id}
/** Hidden, itself or by a group above it. */
export const hiddenIn=(doc:EditorDoc,id:string)=>chain(doc,id).some(l=>l.hidden===true);
/** Locked, itself or by a group above it. */
export const lockedIn=(doc:EditorDoc,id:string)=>chain(doc,id).some(l=>l.locked===true);
/** Kills the float noise of cos/sin (a quarter turn's 6e-17), so lined-up edges compare equal. */
const tidy=(n:number)=>Math.round(n*1e6)/1e6;
/** The upright box around one layer as drawn: Konva turns a layer about its own x, y (its top-left corner), clockwise. */
function outline(l:Box):{x1:number;y1:number;x2:number;y2:number}{
 if(!l.rotation)return {x1:l.x,y1:l.y,x2:l.x+l.width,y2:l.y+l.height};
 const a=l.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const xs=[0,l.width,l.width,0],ys=[0,0,l.height,l.height];
 const px=xs.map((x,i)=>tidy(l.x+x*c-ys[i]*s)),py=xs.map((x,i)=>tidy(l.y+x*s+ys[i]*c));
 return {x1:Math.min(...px),y1:Math.min(...py),x2:Math.max(...px),y2:Math.max(...py)};
}
/** The upright box around these layers as drawn (groups opened, rotation counted); null when there is nothing. */
export function boundsOf(doc:EditorDoc,ids:string[]):Box|null{
 let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
 for(const id of ids)for(const l of descendants(doc,id)){const o=outline(l);x1=Math.min(x1,o.x1);y1=Math.min(y1,o.y1);x2=Math.max(x2,o.x2);y2=Math.max(y2,o.y2)}
 return x1===Infinity?null:{x:x1,y:y1,width:x2-x1,height:y2-y1,rotation:0};
}

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
  // Only this kind's own settings (anything else is not part of the format), and never an address: a picture is a
  // storage key (an asset key, checked), and no other setting may hold a link (only typed text may say one).
  const own=FIELDS[l.kind];
  for(const [k,v] of Object.entries(rest)){
   if(v===undefined||!own.has(k))continue;
   if(k==='asset'&&!isAssetKey(v))throw new Error('Only pictures from this Studio can go on a design.');
   if(typeof v==='string'&&k!=='text'&&LINKISH.test(v))throw new Error('A setting can’t be a link.');
   if((l as Record<string,unknown>)[k]!==v)(l as Record<string,unknown>)[k]=v;
  }
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
 /** Groups layers that sit side by side (same page, same group): the group takes the topmost one's place, they keep their order inside it. */
 group(d:D,ids:string[],groupId:string){
  const doc=d as EditorDoc,members=[...new Set(ids)].flatMap(id=>doc.layers[id]?[doc.layers[id]]:[]);
  if(members.length<2)throw new Error('Choose two or more layers to group.');
  const {pageId,parentId}=members[0];
  if(members.some(l=>l.pageId!==pageId||l.parentId!==parentId))throw new Error('Only layers side by side in the Layers list can be grouped.');
  if(doc.layers[groupId]||!LAYER_ID.test(groupId))throw new Error('The group couldn’t be made. Try again.');
  roomFor(d,pageId,1);
  const order=childIds(d,pageId,parentId),chosen=new Set(members.map(l=>l.id)),inside=order.filter(id=>chosen.has(id));
  const top=order.indexOf(inside[inside.length-1]),rest=order.filter(id=>!chosen.has(id));
  rest.splice(top-(inside.length-1),0,groupId);
  d.layers[groupId]={id:groupId,name:'Group',kind:'group',pageId,parentId,index:0};
  renumber(d,pageId,parentId,rest);renumber(d,pageId,groupId,inside);
 },
 /** Takes a group apart: what was in it takes its place, in order (hidden or locked as the group was). Returns their ids, back first. */
 ungroup(d:D,groupId:string):string[]{
  const g=d.layers[groupId];if(!g||!isGroup(g))return [];
  const {pageId,parentId}=g,kids=childIds(d,pageId,groupId),order=childIds(d,pageId,parentId);
  order.splice(order.indexOf(groupId),1,...kids);
  for(const id of kids){const c=d.layers[id];if(g.hidden)c.hidden=true;if(g.locked)c.locked=true}
  delete d.layers[groupId];renumber(d,pageId,parentId,order);
  return kids;
 },
 /** Moves a layer to a place among its siblings (0: the back), as dragging it in the Layers list does. */
 place(d:D,id:string,index:number){
  const l=d.layers[id];if(!l)return;
  const order=childIds(d,l.pageId,l.parentId).filter(x=>x!==id);
  order.splice(clamp(Math.round(index),0,order.length),0,id);renumber(d,l.pageId,l.parentId,order);
 },
 /** Lines layers up with a box (the page, or the selection's own bounds): each by its drawn bounds; a group moves whole. */
 align(d:D,ids:string[],how:Align,to:Box){
  const doc=d as EditorDoc;
  for(const id of movable(doc,ids)){
   const b=boundsOf(doc,[id]);if(!b)continue;
   const dx=how==='left'?to.x-b.x:how==='centre'?to.x+to.width/2-(b.x+b.width/2):how==='right'?to.x+to.width-(b.x+b.width):0;
   const dy=how==='top'?to.y-b.y:how==='middle'?to.y+to.height/2-(b.y+b.height/2):how==='bottom'?to.y+to.height-(b.y+b.height):0;
   if(dx||dy)edit.nudge(d,id,dx,dy);
  }
 },
 /** Equal gaps between three or more layers along one axis; the first and the last stay where they are. */
 distribute(d:D,ids:string[],axis:'x'|'y'){
  const doc=d as EditorDoc;
  const items=movable(doc,ids).flatMap(id=>{const b=boundsOf(doc,[id]);return b?[{id,start:axis==='x'?b.x:b.y,size:axis==='x'?b.width:b.height}]:[]}).sort((a,b)=>a.start-b.start||(a.id<b.id?-1:1));
  if(items.length<3)return;
  const first=items[0],last=items[items.length-1];
  const gap=(last.start+last.size-first.start-items.reduce((s,i)=>s+i.size,0))/(items.length-1);
  let at=first.start+first.size+gap;
  for(const i of items.slice(1,-1)){const by=at-i.start;if(Math.abs(by)>1e-9)edit.nudge(d,i.id,axis==='x'?by:0,axis==='y'?by:0);at+=i.size+gap}
 },
 /** A layer's (or a group's) name, as the Layers list shows it. */
 rename(d:D,id:string,name:string){
  const l=d.layers[id];if(!l)return;
  // Control characters become spaces, then the name is trimmed.
  const n=String(name??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,NAME_MAX).trim();
  if(!n)throw new Error('Give it a name.');
  if(LINKISH.test(n))throw new Error('A name can’t be a link.');
  if(l.name!==n)l.name=n;
 },
 /** Locks or hides a layer or a group (true sets the flag; false removes it, so an unhidden design is as it was). */
 setFlags(d:D,id:string,flags:{locked?:boolean;hidden?:boolean}){
  const l=d.layers[id];if(!l)return;
  for(const k of ['locked','hidden'] as const){const v=flags[k];if(v===true&&l[k]!==true)l[k]=true;else if(v===false&&l[k]===true)delete l[k]}
 },
 /** A page's background: a colour, or a picture of this Studio (by its storage key). */
 setBackground(d:D,pageId:string,bg:PageBackground){
  const p=d.pages.find(x=>x.id===pageId);if(!p)throw new Error('That page is no longer in the design.');
  if(bg?.kind==='colour'){
   if(!colour(bg.colour))throw new Error('That isn’t a colour.');
   if(p.background.kind!=='colour'||p.background.colour!==bg.colour)p.background={kind:'colour',colour:bg.colour};
  }else if(bg?.kind==='picture'&&isAssetKey(bg.asset)&&bg.asset.startsWith('images/')){
   if(p.background.kind!=='picture'||p.background.asset!==bg.asset)p.background={kind:'picture',asset:bg.asset};
  }else throw new Error('Only pictures from this Studio can be a page’s background.');
 },
};
/** The layers an arrange moves: each once (not again through a group also chosen), never one that is locked or holds a locked layer. */
function movable(doc:EditorDoc,ids:string[]):string[]{
 const set=new Set(ids.filter(id=>doc.layers[id]));
 return [...set].filter(id=>!chain(doc,id).slice(1).some(a=>set.has(a.id))&&!descendants(doc,id).some(l=>lockedIn(doc,l.id))&&!lockedIn(doc,id));
}

/** Where Ctrl/Cmd+D and Alt-drag put a copy: down and right of the original by 2 % of the page's short side. */
export const duplicateOffset=(doc:{width:number;height:number})=>{const s=Math.max(1,Math.round(Math.min(doc.width,doc.height)*0.02));return {x:s,y:s}};

// The same operations, applied once (tests, the server, one-off changes).
export const addLayer=(doc:EditorDoc,add:CanvasAdd,id:string,pageId=doc.pages[0].id)=>produce(doc,d=>{edit.add(d,pageId,add,id)});
export const updateLayer=(doc:EditorDoc,id:string,patch:Partial<DrawnLayer>)=>produce(doc,d=>{edit.update(d,id,patch)});
export const removeLayer=(doc:EditorDoc,id:string)=>produce(doc,d=>{edit.remove(d,id)});
export const duplicateLayer=(doc:EditorDoc,id:string,newId:string)=>produce(doc,d=>{edit.duplicate(d,id,()=>newId,duplicateOffset(doc))});
export const reorder=(doc:EditorDoc,id:string,to:'forward'|'backward'|'front'|'back')=>produce(doc,d=>{edit.reorder(d,id,to)});
export const nudge=(doc:EditorDoc,id:string,dx:number,dy:number)=>produce(doc,d=>{edit.nudge(d,id,dx,dy)});

// ── Smart guides and equal spacing ───────────────────────────────────────
/** A guide line: vertical ('v', at an x) or horizontal ('h', at a y), drawn from/to along it (absent: across the whole page). */
export type Guide={orientation:'v'|'h';at:number;from?:number;to?:number};
/** A spacing mark: the gap from `start` to `end` along an axis, drawn at `at` across it. */
export type Gap={axis:'x'|'y';start:number;end:number;at:number};
/** A box seen along one axis (a1..a2) and across it (c1..c2). */
type Span={a1:number;a2:number;c1:number;c2:number};
const along=(o:{x1:number;y1:number;x2:number;y2:number},axis:'x'|'y'):Span=>axis==='x'?{a1:o.x1,a2:o.x2,c1:o.y1,c2:o.y2}:{a1:o.y1,a2:o.y2,c1:o.x1,c2:o.x2};
const crosses=(p:Span,q:Span)=>Math.min(p.c2,q.c2)>Math.max(p.c1,q.c1);
const across=(p:Span,q:Span)=>(Math.max(p.c1,q.c1)+Math.min(p.c2,q.c2))/2;
const lines=(s:Span)=>[s.a1,(s.a1+s.a2)/2,s.a2];
const SAME=1e-6;
/** The nearest snap along one axis: an edge or centre onto a line (the page's or a layer's), or a gap made equal to one already there. */
function snapAxis(m:Span,others:Span[],page:number,threshold:number,axis:'x'|'y'):{shift:number;gaps:((m:Span)=>Gap[])|null}|null{
 let best:{shift:number;gaps:((m:Span)=>Gap[])|null}|null=null;
 const offer=(shift:number,gaps:((m:Span)=>Gap[])|null)=>{if(Math.abs(shift)<=threshold&&(!best||Math.abs(shift)<Math.abs(best.shift)))best={shift,gaps}};
 const targets=[0,page/2,page,...others.flatMap(lines)];
 for(const e of lines(m))for(const t of targets)offer(t-e,null);
 // The gaps already on the page: each layer to its nearest neighbour after it (overlapping across the axis).
 const gaps:{g:number;mark:Gap}[]=[];
 for(const o of others){
  let n:Span|null=null;for(const q of others)if(q!==o&&q.a1>=o.a2&&crosses(o,q)&&(!n||q.a1<n.a1))n=q;
  if(n&&n.a1-o.a2>SAME)gaps.push({g:n.a1-o.a2,mark:{axis,start:o.a2,end:n.a1,at:across(o,n)}});
 }
 // The moving box's neighbours before and after it.
 let before:Span|null=null,after:Span|null=null;
 for(const o of others){
  if(!crosses(o,m))continue;
  if(o.a2<=m.a1+threshold&&o.a1<m.a1&&(!before||o.a2>before.a2))before=o;
  if(o.a1>=m.a2-threshold&&o.a2>m.a2&&(!after||o.a1<after.a1))after=o;
 }
 const L=before,R=after;
 for(const {g,mark} of gaps){
  if(L)offer(g-(m.a1-L.a2),f=>[{axis,start:L.a2,end:f.a1,at:across(L,f)},mark]);
  if(R)offer((R.a1-m.a2)-g,f=>[{axis,start:f.a2,end:R.a1,at:across(f,R)},mark]);
 }
 // Right in the middle of its two neighbours.
 if(L&&R){const s=(R.a1+L.a2-m.a1-m.a2)/2;if(m.a1+s-L.a2>SAME)offer(s,f=>[{axis,start:L.a2,end:f.a1,at:across(L,f)},{axis,start:f.a2,end:R.a1,at:across(f,R)}])}
 return best;
}
/**
 * Snaps a moving box (a layer, a group or a selection, by its drawn bounds) to the page's edges and
 * centre lines, to the other layers' edges and centres, and to equal spacing with its neighbours,
 * within `threshold` picture pixels, on each axis the nearest. Layers in `ignore` (or inside a group
 * in it) and hidden ones are not targets. Returns the move to make and the guides and gaps to draw.
 */
export function snapBox(doc:EditorDoc,pageId:string,moving:Box,ignore:ReadonlySet<string>,threshold:number):{dx:number;dy:number;guides:Guide[];gaps:Gap[]}{
 const others=drawOrder(doc,pageId).filter(l=>!chain(doc,l.id).some(a=>ignore.has(a.id)||a.hidden===true)).map(outline);
 const m=outline(moving),guides:Guide[]=[],gaps:Gap[]=[];
 const pick={x:snapAxis(along(m,'x'),others.map(o=>along(o,'x')),doc.width,threshold,'x'),y:snapAxis(along(m,'y'),others.map(o=>along(o,'y')),doc.height,threshold,'y')};
 const dx=pick.x?.shift??0,dy=pick.y?.shift??0,f={x1:m.x1+dx,y1:m.y1+dy,x2:m.x2+dx,y2:m.y2+dy};
 for(const axis of ['x','y'] as const){
  const p=pick[axis];if(!p)continue;
  const fm=along(f,axis);
  if(p.gaps){gaps.push(...p.gaps(fm));continue}
  // A guide on every line the box now shares: across the whole page for the page's own, else from the box to the layers on it.
  const page=axis==='x'?doc.width:doc.height,orientation=axis==='x'?'v':'h';
  for(const e of new Set(lines(fm))){
   if([0,page/2,page].some(t=>Math.abs(t-e)<SAME)){guides.push({orientation,at:e});continue}
   const on=others.map(o=>along(o,axis)).filter(o=>lines(o).some(t=>Math.abs(t-e)<SAME));
   if(on.length)guides.push({orientation,at:e,from:Math.min(fm.c1,...on.map(o=>o.c1)),to:Math.max(fm.c2,...on.map(o=>o.c2))});
  }
 }
 return {dx,dy,guides,gaps};
}
/** The older call (one layer by its id): where the box goes and the guides to draw. */
export function snap(doc:EditorDoc,pageId:string,moving:{id:string}&Box,threshold:number):{x:number;y:number;guides:Guide[]}{
 const s=snapBox(doc,pageId,moving,new Set([moving.id]),threshold);
 return {x:moving.x+s.dx,y:moving.y+s.dy,guides:s.guides};
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
/** Whether a value (a string, or a list of them) holds an address or a signed link's marks. */
const linkIn=(v:unknown):boolean=>typeof v==='string'?LINKISH.test(v):Array.isArray(v)?v.some(linkIn):false;
/** Each kind's own fields: what a design keeps of a layer (cleanDoc) and what a change may set (edit.update). */
const PLACED_FIELDS=['id','name','kind','pageId','parentId','index','locked','hidden'],BOX_FIELDS=['x','y','width','height','rotation','opacity'];
const FIELDS:Record<Layer['kind'],ReadonlySet<string>>={
 group:new Set(PLACED_FIELDS),
 image:new Set([...PLACED_FIELDS,...BOX_FIELDS,'asset','source','radius','flipX','flipY']),
 text:new Set([...PLACED_FIELDS,...BOX_FIELDS,'text','style','font','fontSize','fontWeight','color','align','lineHeight','letterSpacing']),
 shape:new Set([...PLACED_FIELDS,...BOX_FIELDS,'shape','fill','stroke','strokeWidth']),
 line:new Set([...PLACED_FIELDS,...BOX_FIELDS,'dash','arrow','stroke','strokeWidth']),
 frame:new Set([...PLACED_FIELDS,...BOX_FIELDS,'stroke','strokeWidth','radius']),
 icon:new Set([...PLACED_FIELDS,...BOX_FIELDS,'icon','paths','color','strokeWidth']),
};
const num=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const str=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const plain=(v:unknown,max:number)=>str(v,max)&&!LINKISH.test(v as string);
const colour=(v:unknown)=>v==='transparent'||(typeof v==='string'&&HEX.test(v));
const flag=(v:unknown)=>v===undefined||typeof v==='boolean';
type Checked={ok:true;doc:EditorDoc}|{ok:false;reason:string};

function checkLayerBody(l:Record<string,unknown>,span:number):string|null{
 if(!num(l.x,-span,span)||!num(l.y,-span,span)||!num(l.width,0,span)||!num(l.height,0,span)||!num(l.rotation,-360,360))return 'box';
 // The optional settings: absent, or of the right kind and in range.
 const maybe=(v:unknown,ok:(v:unknown)=>boolean)=>v===undefined||ok(v);
 if(!maybe(l.opacity,v=>num(v,0,1)))return 'opacity';
 if(l.kind==='image')return isAssetKey(l.asset)&&(l.source==='logo'||l.source==='upload')&&maybe(l.radius,v=>num(v,0,span))&&flag(l.flipX)&&flag(l.flipY)?null:'image';
 if(l.kind==='text')return str(l.text,TEXT_MAX)&&plain(l.font,60)&&num(l.fontSize,1,4000)&&num(l.fontWeight,100,900)&&colour(l.color)&&['heading','subheading','body'].includes(l.style as string)&&['left','center','right'].includes(l.align as string)
  &&maybe(l.lineHeight,v=>num(v,0.5,4))&&maybe(l.letterSpacing,v=>num(v,-1000,1000))?null:'text';
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
  // No address anywhere in a layer (a field of its own or one the format doesn't have), except typed words.
  for(const [k,v] of Object.entries(l))if(k!=='text'&&linkIn(v))return {ok:false,reason:'link'};
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
 const layers:Record<string,Layer>={};
 for(const [key,l] of Object.entries(doc.layers)){
  const own=FIELDS[l.kind]??FIELDS.group,out:Record<string,unknown>={};
  for(const [k,v] of Object.entries(l))if(v!==undefined&&own.has(k))out[k]=v;
  layers[key]=out as Layer;
 }
 return {schemaVersion:SCHEMA_VERSION,width:doc.width,height:doc.height,base:doc.base,pages:doc.pages.map(p=>({id:p.id,background:p.background.kind==='picture'?{kind:'picture',asset:p.background.asset}:{kind:'colour',colour:p.background.colour}})),layers};
}
/** A design applied to a recipe once, outside the history (the server: a restored version). */
export const change=(doc:EditorDoc,recipe:(d:D)=>void)=>produce(doc,recipe);
