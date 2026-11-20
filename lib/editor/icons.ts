// Icons on the canvas: the Studio's own icon set (lucide, the icons the app
// already draws), kept on a design as vector paths so they stay sharp at any
// size and in the full-resolution export. An icon is read from the SVG the
// Elements panel already shows (lucide draws paths, circles, rects, lines,
// polylines, polygons and ellipses on a 24 x 24 grid); each shape becomes one
// path. Search runs over the icon names (and a few plain words for the ones
// suggested for cars). Plain module: the panel, the canvas and the tests share it.
import {ICON_PATHS_MAX,ICON_PATH_MAX} from './doc';

export type SvgShape={tag:string;attrs:Record<string,string|null|undefined>};

const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:0};
const f=(x:number)=>String(Math.round(x*1000)/1000);
const pointsOf=(v:unknown)=>String(v||'').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);

/** One SVG shape as path data on its own grid; null for anything that draws nothing (or isn't a shape). */
export function shapeToPath({tag,attrs:a}:SvgShape):string|null{
 switch(tag){
  case 'path':{const d=String(a.d||'').trim();return d||null}
  case 'circle':case 'ellipse':{
   const cx=n(a.cx),cy=n(a.cy),rx=tag==='circle'?n(a.r):n(a.rx),ry=tag==='circle'?n(a.r):n(a.ry);
   if(!(rx>0&&ry>0))return null;
   return `M${f(cx-rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx*2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx*2)} 0Z`;
  }
  case 'rect':{
   const x=n(a.x),y=n(a.y),w=n(a.width),h=n(a.height);if(!(w>0&&h>0))return null;
   // A missing rx takes ry's value and the other way round (SVG), each at most half the side.
   let rx=a.rx!=null?n(a.rx):a.ry!=null?n(a.ry):0,ry=a.ry!=null?n(a.ry):rx;rx=Math.min(Math.max(0,rx),w/2);ry=Math.min(Math.max(0,ry),h/2);
   if(!rx||!ry)return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
   return `M${f(x+rx)} ${f(y)}h${f(w-2*rx)}a${f(rx)} ${f(ry)} 0 0 1 ${f(rx)} ${f(ry)}v${f(h-2*ry)}a${f(rx)} ${f(ry)} 0 0 1 ${f(-rx)} ${f(ry)}h${f(-(w-2*rx))}a${f(rx)} ${f(ry)} 0 0 1 ${f(-rx)} ${f(-ry)}v${f(-(h-2*ry))}a${f(rx)} ${f(ry)} 0 0 1 ${f(rx)} ${f(-ry)}Z`;
  }
  case 'line':return `M${f(n(a.x1))} ${f(n(a.y1))}L${f(n(a.x2))} ${f(n(a.y2))}`;
  case 'polyline':case 'polygon':{
   const p=pointsOf(a.points);if(p.length<4)return null;
   let d=`M${f(p[0])} ${f(p[1])}`;for(let i=2;i+1<p.length;i+=2)d+=`L${f(p[i])} ${f(p[i+1])}`;
   return tag==='polygon'?d+'Z':d;
  }
  default:return null;
 }
}

/** An icon's shapes as the paths a design keeps (within the document's limits); empty when nothing can be drawn. */
export function iconPaths(shapes:readonly SvgShape[]):string[]{
 return shapes.map(shapeToPath).filter((d):d is string=>!!d&&d.length<=ICON_PATH_MAX).slice(0,ICON_PATHS_MAX);
}

/** The shapes of a rendered icon (<svg> from lucide-react), read from the page. */
export function shapesOf(svg:{children:ArrayLike<{tagName:string;getAttribute:(n:string)=>string|null}>}):SvgShape[]{
 const keys=['d','cx','cy','r','rx','ry','x','y','width','height','x1','y1','x2','y2','points'];
 return Array.from(svg.children).map(el=>({tag:el.tagName.toLowerCase(),attrs:Object.fromEntries(keys.map(k=>[k,el.getAttribute(k)]))}));
}

/** "CarFront" → "car-front", "Axis3d" → "axis-3d" (the icon set's own names). */
export const iconName=(pascal:string)=>pascal.replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/([A-Z])([A-Z][a-z])/g,'$1-$2').replace(/([a-zA-Z])(\d)/g,'$1-$2').toLowerCase();
/** "car-front" → "Car front": how a person reads it. */
export const iconLabel=(name:string)=>{const w=name.replace(/-/g,' ').trim();return w.charAt(0).toUpperCase()+w.slice(1)};

/** Plain words a person may search for, for the icons suggested for cars (lib/elements.ts ICONS). */
export const ICON_WORDS:Record<string,string>={
 zap:'electric ev power',
 'battery-charging':'electric ev charge range',
 'plug-zap':'electric ev charge plug',
 gauge:'speed speedometer performance',
 fuel:'petrol gas diesel',
 'key-round':'key keys',
 'shield-check':'safety safe secure warranty',
 wrench:'service repair maintenance',
 tag:'price offer sale',
 percent:'offer discount finance',
 leaf:'eco green hybrid',
 'map-pin':'location dealer showroom',
 route:'trip journey drive',
 timer:'time fast quick',
};

export const ICON_RESULTS_MAX=60;
/**
 * The icons whose names (or plain words) match what was typed, best first: a
 * name that is the word, then names starting with it, then a word of the name
 * starting with it, then anywhere. At most `limit`; `total` says how many match.
 */
export function searchIcons(names:readonly string[],query:string,limit=ICON_RESULTS_MAX):{names:string[];total:number}{
 const words=query.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g,' ').split(/[\s-]+/).filter(Boolean);
 if(!words.length)return {names:[],total:0};
 const scored:{name:string;score:number}[]=[];
 for(const name of names){
  const hay=(name.replace(/-/g,' ')+' '+(ICON_WORDS[name]||'')).split(' ');
  let score=0;
  for(const w of words){
   const best=hay.reduce((s,h)=>Math.max(s,h===w?4:h.startsWith(w)?3:h.includes(w)?1:0),0);
   if(!best){score=0;break}
   score+=best;
  }
  if(score)scored.push({name,score:score*100-name.length});
 }
 scored.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
 return {names:scored.slice(0,limit).map(s=>s.name),total:scored.length};
}
