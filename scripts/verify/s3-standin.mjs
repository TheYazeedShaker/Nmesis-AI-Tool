// Minimal in-memory S3-compatible stand-in (path-style, signatures not verified).
// Supports PUT (If-None-Match:* / If-Match), GET (Range), HEAD, DELETE, ListObjectsV2.
import http from 'node:http';
import {createHash} from 'node:crypto';
export function startS3({port=0}={}){
 const objects=new Map(),log=[];
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x');const [,bucket,...rest]=url.pathname.split('/');const key=decodeURIComponent(rest.join('/'));
  res.setHeader('Access-Control-Allow-Origin','*');
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  log.push(req.method+' /'+bucket+'/'+key+(url.search.includes('X-Amz-Signature')?' (presigned)':''));
  const xml=(code,s)=>{res.writeHead(code,{'content-type':'application/xml'});res.end(s)};
  if(req.method==='GET'&&!key&&url.searchParams.get('list-type')==='2'){
   const prefix=url.searchParams.get('prefix')||'';const items=[...objects].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a<b?-1:1);
   // Delimiter: keys below the next delimiter roll up into CommonPrefixes (S3 semantics).
   const delimiter=url.searchParams.get('delimiter')||'';const common=new Set();const direct=delimiter?items.filter(([k])=>{const i=k.indexOf(delimiter,prefix.length);if(i<0)return true;common.add(k.slice(0,i+delimiter.length));return false}):items;
   return xml(200,`<?xml version="1.0"?><ListBucketResult><Name>${bucket}</Name><Prefix>${prefix}</Prefix><KeyCount>${direct.length+common.size}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${direct.map(([k,o])=>`<Contents><Key>${k}</Key><Size>${o.body.length}</Size><ETag>"${o.etag}"</ETag><LastModified>${o.at.toISOString()}</LastModified></Contents>`).join('')}${[...common].map(c=>`<CommonPrefixes><Prefix>${c}</Prefix></CommonPrefixes>`).join('')}</ListBucketResult>`);
  }
  const current=objects.get(key);
  if(req.method==='PUT'){
   const inm=req.headers['if-none-match'],im=req.headers['if-match'];
   if(inm==='*'&&current)return xml(412,'<Error><Code>PreconditionFailed</Code></Error>');
   if(im&&(!current||im.replace(/"/g,'')!==current.etag))return xml(412,'<Error><Code>PreconditionFailed</Code></Error>');
   const etag=createHash('md5').update(body).digest('hex');const meta={};for(const [h,v] of Object.entries(req.headers))if(h.startsWith('x-amz-meta-'))meta[h]=v;
   objects.set(key,{body,etag,type:req.headers['content-type']||'application/octet-stream',meta,at:new Date()});res.writeHead(200,{ETag:`"${etag}"`});return res.end();
  }
  if(!current)return req.method==='HEAD'?(res.writeHead(404),res.end()):req.method==='DELETE'?(res.writeHead(204),res.end()):xml(404,'<Error><Code>NoSuchKey</Code></Error>');
  if(req.method==='DELETE'){objects.delete(key);res.writeHead(204);return res.end()}
  const headers={'content-type':current.type,ETag:`"${current.etag}"`,'last-modified':current.at.toUTCString(),'accept-ranges':'bytes',...current.meta};
  let data=current.body,code=200;const range=/^bytes=(\d+)-(\d+)?$/.exec(req.headers.range||'');
  if(range){const a=Number(range[1]),b=Math.min(range[2]?Number(range[2]):data.length-1,data.length-1);data=data.subarray(a,b+1);code=206;headers['content-range']=`bytes ${a}-${b}/${current.body.length}`}
  res.writeHead(code,{...headers,'content-length':data.length});res.end(req.method==='HEAD'?undefined:data);
 });
 return new Promise(r=>server.listen(port,'127.0.0.1',()=>r({server,objects,log,url:'http://127.0.0.1:'+server.address().port})));
}
