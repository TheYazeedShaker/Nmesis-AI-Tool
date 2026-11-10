import {imageDimensions} from './image-dimensions.ts';
import {MAX_REFERENCE_BYTES} from './reference-policy.ts';
const domains=new Set(['pinterest.com','pinterest.co.uk','pinterest.fr','pinterest.de','pinterest.it','pinterest.es','pinterest.ca','pinterest.com.au','pinterest.jp','pinterest.co.kr','pinterest.com.mx','pinterest.pt','pinterest.ch','pinterest.at','pinterest.se','pinterest.dk','pinterest.nl','pinterest.cl','pinterest.ie','pinterest.nz','pin.it']);
export function checkedPinterestUrl(value:string,image=false,redirect=false){
 let u:URL;try{u=new URL(value)}catch{throw new Error('Paste a complete Pinterest pin link.')}
 const shortRedirect=redirect&&u.hostname==='api.pinterest.com'&&/^\/url_shortener\/[A-Za-z0-9_-]+\/redirect\/?$/.test(u.pathname);
 const host=u.hostname.replace(/^(www|[a-z]{2})\./,'');
 if(u.protocol!=='https:'||u.username||u.password||u.port||(image?!/^(?:[a-z0-9-]+\.)*pinimg\.com$/.test(u.hostname):!domains.has(host)&&!shortRedirect))throw new Error('Use a public Pinterest pin or pin.it link.');
 return u;
}
export function pinterestPinUrl(value:string){
 const u=checkedPinterestUrl(value.trim());
 if(u.hostname==='pin.it')return u;
 const pin=u.pathname.match(/^\/pin\/([\w-]+)(?:\/sent)?\/?$/);
 if(!pin)throw new Error('Open a specific Pinterest pin and paste its link, or paste its screenshot.');
 u.pathname='/pin/'+pin[1]+'/';u.search='';u.hash='';return u;
}
function decode(value:string){return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(_,v)=>{const names:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};if(v[0]!=='#')return names[v.toLowerCase()]||'';const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''})}
export function pinMetadata(html:string){
 const values:Record<string,string>={};
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const attrs:Record<string,string>={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))attrs[m[1].toLowerCase()]=decode(m[3]);const key=attrs.property||attrs.name;if(key&&attrs.content)values[key]=attrs.content;}
 if(!values['og:image'])throw new Error('This pin is not publicly accessible. Try another pin, or paste or upload its image.');
 return {image:checkedPinterestUrl(values['og:image'],true).href,title:(values['og:title']||'Pinterest inspiration').replace(/<[^>]*>/g,'').slice(0,200)};
}
export async function publicFetch(url:string,image=false,fetcher:typeof fetch=fetch){
 let target=checkedPinterestUrl(url,image);
 for(let n=0;n<6;n++){
  const r=await fetcher(target.href,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Mozilla/5.0','Accept':image?'image/*':'text/html'}});
  if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();const location=r.headers.get('location');if(!location)break;target=checkedPinterestUrl(new URL(location,target).href,image,true);continue;}
  if(!r.ok){await r.body?.cancel();throw new Error('Pinterest could not open this pin. Try a public image pin, or paste or upload its image.');}
  return {response:r,url:target.href};
 }
 throw new Error('This Pinterest link redirects too many times. Paste the full pin link instead.');
}
export async function boundedBytes(response:Response,limit:number){
 if(Number(response.headers.get('content-length')||0)>limit){await response.body?.cancel();throw new Error('This Pinterest response exceeds the supported download size.');}
 const reader=response.body?.getReader();if(!reader)throw new Error('This pin returned an empty image.');const chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>limit)throw new Error('The reference is too large. Choose another pin.');chunks.push(value)}}finally{await reader.cancel();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
}
// Pinterest's public embed feed is independent of the full HTML page fetch.
// Match the exact requested pin; never import a suggested or board thumbnail.
export function widgetPinMetadata(value:unknown,id:string){
 const payload=value as {status?:unknown;data?:unknown};
 if(payload?.status!=='success'||!Array.isArray(payload.data))throw new Error('Pinterest did not return this public pin. Paste its screenshot instead.');
 const pin=payload.data.find((p:unknown)=>p&&typeof p==='object'&&String((p as {id?:unknown}).id)===id) as {images?:Record<string,{url?:unknown;width?:unknown}>;title?:unknown;description?:unknown}|undefined;
 const images=Object.values(pin?.images||{}).filter(v=>v&&typeof v.url==='string').sort((a,b)=>(Number(b.width)||0)-(Number(a.width)||0));
 if(!images.length)throw new Error('This pin has no public image. Paste its screenshot instead.');
 const image=checkedPinterestUrl(images[0].url as string,true).href;
 const title=typeof pin?.title==='string'?pin.title:typeof pin?.description==='string'&&pin.description.trim()?pin.description:'Pinterest inspiration';
 return {image,title:title.replace(/<[^>]*>/g,'').trim().slice(0,200)};
}
export async function pinterestReference(value:string,fetcher:typeof fetch=fetch){
 const input=pinterestPinUrl(value);let pin=input;
 try{
  const page=await publicFetch(input.href,false,fetcher);
  try{pin=pinterestPinUrl(page.url);if(pin.hostname==='pin.it')throw new Error('This short link did not resolve to a pin.');}catch(e){await page.response.body?.cancel();throw e}
  const meta=pinMetadata(new TextDecoder().decode(await boundedBytes(page.response,2_000_000)));
  return {...meta,pin:pin.href};
 }catch(error){
  const id=pin.pathname.match(/^\/pin\/(\d+)\/$/)?.[1];if(!id)throw error;
  const response=await fetcher('https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids='+id,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  if(!response.ok){await response.body?.cancel();throw error}
  const data=JSON.parse(new TextDecoder().decode(await boundedBytes(response,1_000_000)));
  return {...widgetPinMetadata(data,id),pin:pin.href};
 }
}
export function pinterestImageCandidates(image:string){
 const source=checkedPinterestUrl(image,true);
 if(!/^\/(?:\d+x[^/]*|originals)\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\//.test(source.pathname))return [source.href];
 const supplied=Number(source.pathname.split('/')[1].match(/^\d+/)?.[0])||0;
 const sizes=['originals',...[1200,736].filter(n=>n>supplied).map(n=>n+'x')];
 return [...new Set([...sizes.map(size=>{const u=new URL(source);u.pathname=u.pathname.replace(/^\/[^/]+\//,'/'+size+'/');return u.href}),source.href])];
}
export async function highestPinterestImage(image:string,fetcher:typeof fetch=fetch){
 let last:unknown;
 for(const candidate of pinterestImageCandidates(image)){
  try{
   const asset=await publicFetch(candidate,true,fetcher);
   const bytes=await boundedBytes(asset.response,MAX_REFERENCE_BYTES);
   const dimensions=imageDimensions(bytes);
   return {bytes,url:asset.url,...dimensions,original:new URL(asset.url).pathname.startsWith('/originals/')};
  }catch(error){last=error}
 }
 throw last instanceof Error?last:new Error('This pin has no downloadable image. Paste or upload its image.');
}
export async function pinterestImage(image:string,fetcher:typeof fetch=fetch){return (await highestPinterestImage(image,fetcher)).bytes}
