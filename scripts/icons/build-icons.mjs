// Builds the editor's icon sets (the Icons panel), served by the Studio itself:
//
//   node --experimental-strip-types scripts/icons/build-icons.mjs
//
// From the open icon sets' packaged data (the @iconify-json/* dev dependencies,
// read from this machine; nothing is fetched from an icon service, and the
// browser never asks one), for each set in SETS:
//   public/icons/<id>.json          its icons: [name, 1 when filled, [path data…]] on its grid
//   public/icons/<id>.LICENSE.txt   its licence, as published by the set
// then lib/editor/icon-sets.json (the panel's list: id, name, licence, count,
// grid, file and size) and docs/icons.md.
//
// Only sets whose licence lets the Studio use them commercially without
// attribution: MIT, Apache 2.0, ISC or CC0 (ALLOWED); the build stops on any
// other. Each icon becomes the path data a design keeps (lib/editor/icons.ts
// shapeToPath): lines (stroke) or solid (fill), never both; an icon that needs
// more than that (masks, transforms, opacity, even-odd fills, mixed lines and
// fills) is left out and counted.
import {register} from 'node:module';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

register('../verify/hooks.mjs',{parentURL:import.meta.url,data:{stubs:{}}});
const {shapeToPath}=await import('@/lib/editor/icons.ts');
const {ICON_PATHS_MAX,ICON_PATH_MAX}=await import('@/lib/editor/doc.ts');

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(ROOT,'package.json'));
const ALLOWED=new Set(['MIT','Apache-2.0','ISC','CC0-1.0']);

/** The sets, in the panel's order. `pick` chooses which of a set's names to keep and under what name. */
const SETS=[
 {id:'lucide',pkg:'@iconify-json/lucide',label:'Lucide',style:'Line',licenceFile:'node_modules/lucide-react/LICENSE',
  pick:names=>names.map(n=>[n,n])},
 {id:'tabler',pkg:'@iconify-json/tabler',label:'Tabler',style:'Line and solid',licenceUrl:'https://raw.githubusercontent.com/tabler/tabler-icons/main/LICENSE',
  pick:names=>names.map(n=>[n,n])},
 {id:'phosphor',pkg:'@iconify-json/ph',label:'Phosphor',style:'Regular and solid',licenceUrl:'https://raw.githubusercontent.com/phosphor-icons/core/main/LICENSE',
  // Regular and fill only (bold, light, thin and duotone are left out; duotone needs transparency).
  pick:names=>names.filter(n=>!/-(bold|duotone|light|thin)$/.test(n)).map(n=>[n,n])},
 {id:'material',pkg:'@iconify-json/material-symbols',label:'Material Symbols',style:'Outline',licenceUrl:'https://raw.githubusercontent.com/google/material-design-icons/master/LICENSE',
  // One of each: its outline drawing where it has one, else its only one, under the plain name.
  pick:names=>{const all=new Set(names);return names.filter(n=>!/-(outline|rounded|sharp|outline-rounded|outline-sharp)$/.test(n)).map(n=>[n,all.has(n+'-outline')?n+'-outline':n])}},
];

// Companies' own logos are left out of every set: a logo is its owner's trademark (not the set's to licence),
// and this public repository holds no third-party brand names. By name: a set's logo naming (brand-…, …-logo)
// and the words of the logos the sets carry.
const BRAND=/^brand-|^pixel-[0-9]|(^|-)logo(-|$)|(^|-)(google|googler|googleone|android|youtube|chrome|chromium|chromecast|chromebook|facebook|instagram|twitter|github|gitlab|linkedin|slack|figma|codepen|codesandbox|dribbble|framer|trello|twitch|pocket|microsoft|amazon|whatsapp|discord|tiktok|paypal|spotify|dropbox|reddit|pinterest|snapchat|telegram|skype|bitcoin|ethereum|xbox|playstation|steam|nintendo|lego|nest|fitbit|stadia|gmail)(-|$)/;
const ATTR=/([a-zA-Z-]+)="([^"]*)"/g;
const SHAPES=new Set(['path','circle','ellipse','rect','line','polyline','polygon']);
/** One icon's body (SVG markup) as [filled, paths], or the reason it is left out. */
function convert(body){
 if(/<(defs|use|mask|clipPath|linearGradient|radialGradient|text|image)\b/.test(body))return 'markup';
 if(/transform=|opacity=|evenodd/.test(body))return 'effect';
 const lines=/stroke="currentColor"/.test(body),solid=/fill="currentColor"/.test(body);
 if(lines===solid)return 'mixed';
 if(lines&&/stroke-width="(?!2")/.test(body))return 'weight';
 const paths=[];
 for(const m of body.matchAll(/<(\w+)\b([^>]*?)\/?>/g)){
  const tag=m[1];if(tag==='g'||tag==='svg')continue;
  if(!SHAPES.has(tag))return 'markup';
  const attrs=Object.fromEntries([...m[2].matchAll(ATTR)].map(a=>[a[1],a[2]]));
  // A shape that draws nothing (no fill and no line) is a set's own spacer.
  if(attrs.fill==='none'&&(attrs.stroke===undefined||attrs.stroke==='none')&&!lines)continue;
  if(attrs.stroke==='none'&&attrs.fill==='none')continue;
  const d=shapeToPath({tag,attrs});
  if(d)paths.push(d.replace(/\s+/g,' ').trim());
 }
 if(!paths.length)return 'empty';
 if(paths.length>ICON_PATHS_MAX||paths.some(d=>d.length>ICON_PATH_MAX))return 'size';
 if(paths.some(d=>!/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/.test(d)))return 'data';
 return [solid,paths];
}

async function licenceText(set){
 if(set.licenceFile)return fs.readFileSync(path.join(ROOT,set.licenceFile),'utf8');
 const r=await fetch(set.licenceUrl,{signal:AbortSignal.timeout(20_000)});
 if(!r.ok)throw new Error(`${set.id}: the licence did not download (${r.status})`);
 return r.text();
}

const out=path.join(ROOT,'public/icons');
fs.mkdirSync(out,{recursive:true});
const manifest=[];
for(const set of SETS){
 const data=JSON.parse(fs.readFileSync(require.resolve(set.pkg+'/icons.json'),'utf8'));
 const info=JSON.parse(fs.readFileSync(require.resolve(set.pkg+'/info.json'),'utf8'));
 const spdx=info.license?.spdx;
 if(!ALLOWED.has(spdx))throw new Error(`${set.id}: licence ${spdx} is not one the Studio may use without attribution`);
 const grid=data.width||data.height||16;
 if((data.height||grid)!==grid)throw new Error(`${set.id}: the grid is not square`);
 const skipped={};const icons=[];
 for(const [name,from] of set.pick(Object.keys(data.icons)).sort((a,b)=>a[0].localeCompare(b[0]))){
  const icon=data.icons[from];
  if((icon.width&&icon.width!==grid)||(icon.height&&icon.height!==grid)||icon.left||icon.top){skipped.grid=(skipped.grid||0)+1;continue}
  if(!/^[a-z0-9-]{1,60}$/.test(name)){skipped.name=(skipped.name||0)+1;continue}
  if(BRAND.test(name)||BRAND.test(from)){skipped.logo=(skipped.logo||0)+1;continue}
  const c=convert(icon.body);
  if(typeof c==='string'){skipped[c]=(skipped[c]||0)+1;continue}
  icons.push([name,c[0]?1:0,c[1]]);
 }
 const file=`${set.id}.json`,json=JSON.stringify({id:set.id,grid,icons});
 fs.writeFileSync(path.join(out,file),json);
 fs.writeFileSync(path.join(out,`${set.id}.LICENSE.txt`),await licenceText(set));
 manifest.push({id:set.id,label:set.label,style:set.style,licence:info.license.title,spdx,licenceUrl:info.license.url,version:info.version||require(set.pkg+'/package.json').version,
  count:icons.length,grid,file:`/icons/${file}`,licenceFile:`/icons/${set.id}.LICENSE.txt`,bytes:Buffer.byteLength(json)});
 console.log(`${set.id}: ${icons.length} icons, ${(Buffer.byteLength(json)/1e6).toFixed(2)} MB; left out ${JSON.stringify(skipped)}`);
}
fs.writeFileSync(path.join(ROOT,'lib/editor/icon-sets.json'),JSON.stringify(manifest,null,1)+'\n');

const rows=manifest.map(s=>`| ${s.label} | ${s.style} | ${s.count.toLocaleString('en')} | ${s.licence} (\`${s.spdx}\`) | ${s.version} | [\`public${s.licenceFile}\`](../public${s.licenceFile}) |`).join('\n');
fs.writeFileSync(path.join(ROOT,'docs/icons.md'),`# Icons: the editor's icon sets

The editor's Icons panel offers these open icon sets. Every one is under a licence
that lets the Studio and its clients use the icons commercially **without
attribution** (MIT, Apache 2.0, ISC or CC0; \`scripts/icons/build-icons.mjs\`
refuses any other). Each set's licence file is served beside its icons.

| Set | Style | Icons | Licence | Version | Licence file |
|---|---|---|---|---|---|
${rows}

Left out on purpose:

- **Remix Icon**: its current releases are under its own "Remix Icon License",
  not one of the four above, so it is not offered.
- **Companies' logos** in any set (Tabler's \`brand-…\`, Phosphor's \`…-logo\`, and the
  like): a logo is its owner's trademark, not the set's to licence, and this
  repository holds no third-party brand names.

How it works:

- The icon data ships with the Studio (\`public/icons/<set>.json\`, built from the
  sets' published data by \`node --experimental-strip-types scripts/icons/build-icons.mjs\`).
  No request goes to an icon service, from the server or the browser.
- A set's file loads only when its category opens in the panel.
- An icon goes on a design as its own vector paths on its set's grid
  (\`lib/editor/doc.ts\` IconLayer: \`grid\`, and \`fill\` for a solid icon), so
  it stays sharp at any size, recolours from the right panel and needs nothing
  else to reopen.
- Icons that need more than plain lines or solid shapes (masks, transforms,
  transparency, even-odd fills, lines and fills mixed) are left out by the build.
`);
console.log('wrote public/icons, lib/editor/icon-sets.json and docs/icons.md');
