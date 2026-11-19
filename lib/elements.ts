import {cleanHex,isBrandFont,type BrandKit,type BrandLogo} from './brand-kit';
import type {CanvasAdd,ShapeKind,TextStyle} from './editor/doc';
import type {Upload} from './uploads';
// The Elements panel's catalogue (components/shell/elements-panel.tsx): the
// categories, the built-in elements and one pure filter. No React here: the
// panel draws each element from its id, and the tests load this file as is.
// Outside the canvas editor the panel only shows and filters. Inside it the
// panels (Brand, Elements, Text, Uploads) add to the design: what each one
// adds is decided by the pure functions at the end of this file.

export const ELEMENT_CATEGORIES=[
 {id:'all',label:'All'},
 {id:'logos',label:'Logos'},
 {id:'shapes',label:'Shapes'},
 {id:'lines',label:'Lines'},
 {id:'frames',label:'Frames'},
 {id:'icons',label:'Icons'},
 {id:'text',label:'Text styles'},
] as const;
export type ElementCategory=typeof ELEMENT_CATEGORIES[number]['id'];
/** A category that holds elements (every one but All). */
export type ElementGroupId=Exclude<ElementCategory,'all'>;
export const isElementCategory=(v:unknown):v is ElementCategory=>ELEMENT_CATEGORIES.some(c=>c.id===v);
export const categoryLabel=(id:ElementCategory)=>ELEMENT_CATEGORIES.find(c=>c.id===id)?.label??'All';

export type ShapeId='rectangle'|'rounded-rectangle'|'circle'|'triangle'|'diamond'|'pentagon'|'hexagon'|'star'|'arrow'|'speech-bubble'|'heart'|'cross';
export type LineId='line'|'thick-line'|'dashed-line'|'dotted-line'|'arrow-line'|'double-arrow-line'|'curved-line'|'elbow-line'|'wavy-line';
export type FrameId='frame-square'|'frame-portrait'|'frame-landscape'|'frame-story'|'frame-circle'|'frame-rounded';
export type IconId='car'|'car-front'|'gauge'|'fuel'|'zap'|'battery-charging'|'plug-zap'|'map-pin'|'route'|'navigation'|'key-round'|'shield-check'|'wrench'|'timer'|'trophy'|'award'|'star'|'sparkles'|'sun'|'moon'|'mountain'|'snowflake'|'camera'|'tag'|'percent'|'flag'|'leaf';
export type TextStyleId='heading'|'subheading'|'body'|'caption';

export type ShapeElement={kind:'shape';id:ShapeId;name:string};
export type LineElement={kind:'line';id:LineId;name:string};
/** An outlined placeholder: `ratio` is width:height; `label` is the short word drawn under it. */
export type FrameElement={kind:'frame';id:FrameId;name:string;ratio:readonly [number,number];shape:'rect'|'rounded'|'circle';label:string};
export type IconElement={kind:'icon';id:IconId;name:string};
/** A text style; `font` says which of the brand kit's two fonts it uses. */
export type TextElement={kind:'text';id:TextStyleId;name:string;font:'heading'|'body'};
/** One of the company's brand-kit logos; `url` is a same-origin signed link. */
export type LogoElement={kind:'logo';id:string;name:string;url:string};
export type ElementItem=ShapeElement|LineElement|FrameElement|IconElement|TextElement|LogoElement;

export const SHAPES:readonly ShapeElement[]=([
 ['rectangle','Rectangle'],
 ['rounded-rectangle','Rounded rectangle'],
 ['circle','Circle'],
 ['triangle','Triangle'],
 ['diamond','Diamond'],
 ['pentagon','Pentagon'],
 ['hexagon','Hexagon'],
 ['star','Star'],
 ['arrow','Arrow'],
 ['speech-bubble','Speech bubble'],
 ['heart','Heart'],
 ['cross','Cross'],
] as const).map(([id,name])=>({kind:'shape' as const,id,name}));

export const LINES:readonly LineElement[]=([
 ['line','Line'],
 ['thick-line','Thick line'],
 ['dashed-line','Dashed line'],
 ['dotted-line','Dotted line'],
 ['arrow-line','Arrow'],
 ['double-arrow-line','Double arrow'],
 ['curved-line','Curved line'],
 ['elbow-line','Elbow connector'],
 ['wavy-line','Wavy line'],
] as const).map(([id,name])=>({kind:'line' as const,id,name}));

export const FRAMES:readonly FrameElement[]=[
 {kind:'frame',id:'frame-square',name:'Square frame, 1:1',ratio:[1,1],shape:'rect',label:'1:1'},
 {kind:'frame',id:'frame-portrait',name:'Portrait frame, 4:5',ratio:[4,5],shape:'rect',label:'4:5'},
 {kind:'frame',id:'frame-landscape',name:'Landscape frame, 16:9',ratio:[16,9],shape:'rect',label:'16:9'},
 {kind:'frame',id:'frame-story',name:'Story frame, 9:16',ratio:[9,16],shape:'rect',label:'9:16'},
 {kind:'frame',id:'frame-circle',name:'Circle frame',ratio:[1,1],shape:'circle',label:'Circle'},
 {kind:'frame',id:'frame-rounded',name:'Rounded frame',ratio:[1,1],shape:'rounded',label:'Rounded'},
];

export const ICONS:readonly IconElement[]=([
 ['car','Car'],
 ['car-front','Car, front view'],
 ['gauge','Speedometer'],
 ['fuel','Fuel'],
 ['zap','Electric'],
 ['battery-charging','Charging battery'],
 ['plug-zap','Charging plug'],
 ['map-pin','Location pin'],
 ['route','Route'],
 ['navigation','Navigation'],
 ['key-round','Key'],
 ['shield-check','Safety'],
 ['wrench','Service'],
 ['timer','Timer'],
 ['trophy','Trophy'],
 ['award','Award'],
 ['star','Star'],
 ['sparkles','Sparkles'],
 ['sun','Sun'],
 ['moon','Moon'],
 ['mountain','Mountain'],
 ['snowflake','Snowflake'],
 ['camera','Camera'],
 ['tag','Price tag'],
 ['percent','Offer'],
 ['flag','Flag'],
 ['leaf','Eco'],
] as const).map(([id,name])=>({kind:'icon' as const,id,name}));

export const TEXT_STYLES:readonly TextElement[]=[
 {kind:'text',id:'heading',name:'Heading',font:'heading'},
 {kind:'text',id:'subheading',name:'Subheading',font:'heading'},
 {kind:'text',id:'body',name:'Body',font:'body'},
 {kind:'text',id:'caption',name:'Caption',font:'body'},
];

/** How many elements of each group "All" shows; "See all" opens the rest. */
export const ALL_PREVIEW=3;

/** A path on this site (a signed redirect such as /api/brand-kit/logos/…), never another origin. */
const sameOrigin=(url:string)=>url.startsWith('/')&&!url.startsWith('//')&&!url.startsWith('/\\');

/** The kit's logos as elements: only entries with an id and a same-origin link; a missing name reads "Logo". */
export function logoElements(logos:readonly Pick<BrandLogo,'id'|'name'|'url'>[]|null|undefined):LogoElement[]{
 if(!Array.isArray(logos))return [];
 const out:LogoElement[]=[];
 for(const logo of logos){
  if(!logo||typeof logo!=='object')continue;
  const {id,name,url}=logo;
  if(typeof id!=='string'||!id||typeof url!=='string'||!sameOrigin(url))continue;
  out.push({kind:'logo',id,name:typeof name==='string'&&name.trim()?name.trim():'Logo',url});
 }
 return out;
}

export type ElementGroup={category:ElementGroupId;label:string;items:ElementItem[];total:number};
export type ElementView={category:ElementCategory;groups:ElementGroup[]};

/** What the panel shows for a category. "All" (and anything that is not a
 *  category) gives every group, in the bar's order, with its first
 *  ALL_PREVIEW elements; a category gives one group with all of them.
 *  Logos come from the brand kit (`logos`; null while it loads).
 *  `forDesign` (inside the editor): only what the editor can add, so every
 *  tile is a button; icons stay, shown but not added yet. */
export function elementsIn(category:unknown,logos?:readonly Pick<BrandLogo,'id'|'name'|'url'>[]|null,{forDesign=false}:{forDesign?:boolean}={}):ElementView{
 const chosen:ElementCategory=isElementCategory(category)?category:'all';
 const keep=(list:readonly ElementItem[])=>forDesign?list.filter(i=>i.kind==='icon'||canvasAddFor(i)!==null):list;
 const lists:Record<ElementGroupId,readonly ElementItem[]>={logos:keep(logoElements(logos)),shapes:keep(SHAPES),lines:keep(LINES),frames:keep(FRAMES),icons:ICONS,text:keep(TEXT_STYLES)};
 const group=(id:ElementGroupId,limit?:number):ElementGroup=>({category:id,label:categoryLabel(id),items:lists[id].slice(0,limit),total:lists[id].length});
 if(chosen==='all')return {category:'all',groups:ELEMENT_CATEGORIES.flatMap(c=>c.id==='all'?[]:[group(c.id,ALL_PREVIEW)])};
 return {category:chosen,groups:[group(chosen)]};
}

/** The brand kit's font to name under a text style, or null (no kit yet, or
 *  the kit keeps the system font). Only a name: no web font is loaded. */
export function textStyleFont(item:Pick<TextElement,'font'>,kit:Pick<BrandKit,'headingFont'|'bodyFont'>|null|undefined):string|null{
 if(!kit)return null;
 const font:unknown=item.font==='heading'?kit.headingFont:kit.bodyFont;
 return typeof font==='string'&&font.trim()&&font!=='System'?font.trim():null;
}

// ── Adding to a design (inside the canvas editor) ────────────────────────
// What a press in a panel hands the editor (lib/editor/doc.ts CanvasAdd; the
// editor places it in the middle of the picture and selects it). Null for
// what the editor can't draw yet, or for an address it must not load.

/** The editor's shape for each shape it draws; the others can't be added yet. */
const SHAPE_ADD:Partial<Record<ShapeId,ShapeKind>>={rectangle:'rect','rounded-rectangle':'rounded',circle:'circle',triangle:'triangle',star:'star',hexagon:'hexagon'};
type LineAdd=Extract<CanvasAdd,{kind:'line'}>;
/** Straight lines the editor draws: plain, dashed, one or two arrowheads.
 *  Curves, elbows, waves, dots and weights can't be added yet. */
const LINE_ADD:Partial<Record<LineId,LineAdd>>={line:{kind:'line'},'dashed-line':{kind:'line',dash:true},'arrow-line':{kind:'line',arrow:'end'},'double-arrow-line':{kind:'line',arrow:'both'}};
/** A frame's corner as a fraction of the picture's short side. The circle asks
 *  for more than any frame has: corners stop at half the frame, so it is round. */
const FRAME_RADIUS:Record<FrameElement['shape'],number>={rect:0,rounded:0.08,circle:0.5};
/** The text styles the editor has (no caption yet). */
const TEXT_ADD:Partial<Record<TextStyleId,TextStyle>>={heading:'heading',subheading:'subheading',body:'body'};
/** The font when the kit keeps the system font (or has not loaded), and the ink without a brand colour. */
export const DESIGN_FONT='Inter',DESIGN_INK='#ffffff';

export type ImageSize={naturalWidth:number;naturalHeight:number};
/** A picture's own size, read from an <img> once it has loaded; nothing before. */
export function imageSize(img:{naturalWidth?:unknown;naturalHeight?:unknown}|null|undefined):ImageSize|undefined{
 const w=img?.naturalWidth,h=img?.naturalHeight;
 return typeof w==='number'&&typeof h==='number'&&Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0?{naturalWidth:w,naturalHeight:h}:undefined;
}
// Only this site's own media goes on a design: /api/brand-kit/logos/<id> for a logo, /api/assets/<id> for an upload.
const LOGO_SRC=/^\/api\/brand-kit\/logos\/[A-Za-z0-9-]{8,80}$/,ASSET_SRC=/^\/api\/assets\/[A-Za-z0-9-]{8,80}$/,ASSET_ID=/^[A-Za-z0-9-]{8,80}$/;
const named=(v:unknown,fallback:string)=>typeof v==='string'&&v.trim()?v.trim():fallback;

/** A brand-kit logo as an image to add (with its own size when known); null without an id or with any other address. */
export function logoCanvasAdd(logo:Pick<BrandLogo,'id'|'name'|'url'>|null|undefined,size?:ImageSize):CanvasAdd|null{
 if(!logo||typeof logo!=='object'||typeof logo.id!=='string'||!logo.id||typeof logo.url!=='string'||!LOGO_SRC.test(logo.url))return null;
 return {kind:'image',src:logo.url,name:named(logo.name,'Logo'),source:'logo',...size};
}
/** One of the person's uploads as an image to add (with its shape when known); null unless the address is their asset's. */
export function uploadCanvasAdd(upload:Pick<Upload,'id'|'src'>|null|undefined,size?:ImageSize):CanvasAdd|null{
 if(!upload||typeof upload!=='object'||typeof upload.id!=='string'||!ASSET_ID.test(upload.id)||upload.src!=='/api/assets/'+upload.id||!ASSET_SRC.test(upload.src))return null;
 return {kind:'image',src:upload.src,assetId:upload.id,name:'Upload',source:'upload',...size};
}

/** Text in the brand's look: the kit's heading font (heading, subheading) or
 *  body font, DESIGN_FONT for the system font or no kit yet; the kit's first
 *  colour, DESIGN_INK without one. */
export function textCanvasAdd(style:TextStyle,kit:Pick<BrandKit,'headingFont'|'bodyFont'|'colours'>|null|undefined):Extract<CanvasAdd,{kind:'text'}>{
 const font:unknown=style==='body'?kit?.bodyFont:kit?.headingFont;
 const colour=Array.isArray(kit?.colours)?kit.colours.map(c=>cleanHex(c?.hex)).find((h):h is string=>!!h):undefined;
 return {kind:'text',style,font:isBrandFont(font)&&font!=='System'?font:DESIGN_FONT,color:colour??DESIGN_INK};
}

/** What pressing an element adds, or null: icons, and what the editor can't draw yet. */
export function canvasAddFor(item:ElementItem,kit?:Pick<BrandKit,'headingFont'|'bodyFont'|'colours'>|null):CanvasAdd|null{
 switch(item.kind){
  case 'shape':{const shape=SHAPE_ADD[item.id];return shape?{kind:'shape',shape}:null}
  case 'line':{const line=LINE_ADD[item.id];return line?{...line}:null}
  case 'frame':return {kind:'frame',ratio:item.ratio[0]/item.ratio[1],radius:FRAME_RADIUS[item.shape]};
  case 'text':{const style=TEXT_ADD[item.id];return style?textCanvasAdd(style,kit):null}
  case 'logo':return logoCanvasAdd(item);
  case 'icon':return null;
 }
}

const ADDED:Record<CanvasAdd['kind'],string>={image:'Picture',text:'Text',shape:'Shape',line:'Line',frame:'Frame'};
/** What the person is told after a press: what was added and to drag it into place, or that no editor is open. */
export function canvasAddSaid(add:CanvasAdd,added:boolean):{message:string;kind:'ok'|'info'}{
 if(!added)return {message:'Open a picture in the editor to add this.',kind:'info'};
 return {message:`${add.kind==='image'&&add.source==='logo'?'Logo':ADDED[add.kind]} added. Drag it into place.`,kind:'ok'};
}
