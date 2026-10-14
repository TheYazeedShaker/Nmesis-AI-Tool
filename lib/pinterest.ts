const domains=new Set(['pinterest.com','pinterest.co.uk','pinterest.fr','pinterest.de','pinterest.it','pinterest.es','pinterest.ca','pinterest.com.au','pinterest.jp','pinterest.co.kr','pinterest.com.mx','pinterest.pt','pinterest.ch','pinterest.at','pinterest.se','pinterest.dk','pinterest.nl','pinterest.cl','pinterest.ie','pinterest.nz','pin.it']);
export function checkedPinterestUrl(value:string,image=false){
 let u:URL;try{u=new URL(value)}catch{throw new Error('Paste a complete Pinterest pin link.')}
 const host=u.hostname.replace(/^(www|[a-z]{2})\./,'');
 if(u.protocol!=='https:'||u.username||u.password||u.port||(image?!/^(?:[a-z0-9-]+\.)*pinimg\.com$/.test(u.hostname):!domains.has(host)))throw new Error('Use a public Pinterest pin or pin.it link.');
 return u;
}
function decode(value:string){return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(_,v)=>{const names:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};if(v[0]!=='#')return names[v.toLowerCase()]||'';const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''})}
export function pinMetadata(html:string){
 const values:Record<string,string>={};
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const attrs:Record<string,string>={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))attrs[m[1].toLowerCase()]=decode(m[3]);const key=attrs.property||attrs.name;if(key&&attrs.content)values[key]=attrs.content;}
 if(!values['og:image'])throw new Error('This pin is not publicly accessible. Try another pin, or add its image in More options.');
 return {image:checkedPinterestUrl(values['og:image'],true).href,title:(values['og:title']||'Pinterest inspiration').replace(/<[^>]*>/g,'').slice(0,200)};
}
export async function publicFetch(url:string,image=false,fetcher:typeof fetch=fetch){
 let target=checkedPinterestUrl(url,image);
 for(let n=0;n<6;n++){
  const r=await fetcher(target.href,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Mozilla/5.0','Accept':image?'image/*':'text/html'}});
  if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();const location=r.headers.get('location');if(!location)break;target=checkedPinterestUrl(new URL(location,target).href,image);continue;}
  if(!r.ok){await r.body?.cancel();throw new Error('Pinterest could not open this pin. Try a public image pin, or upload the image in More options.');}
  return {response:r,url:target.href};
 }
 throw new Error('This Pinterest link redirects too many times. Paste the full pin link instead.');
}
export async function boundedBytes(response:Response,limit:number){
 if(Number(response.headers.get('content-length')||0)>limit){await response.body?.cancel();throw new Error('The reference is too large. Choose an image under 8 MB.');}
 const reader=response.body?.getReader();if(!reader)throw new Error('This pin returned an empty image.');const chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>limit)throw new Error('The reference is too large. Choose another pin.');chunks.push(value)}}finally{await reader.cancel();}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
}
