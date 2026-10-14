import {S3Client,GetObjectCommand,HeadObjectCommand,PutObjectCommand,DeleteObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
const missing=(e:unknown)=>typeof e==='object'&&e!==null&&'$metadata' in e&&(e as {$metadata:{httpStatusCode?:number}}).$metadata.httpStatusCode===404;
const status=(e:unknown)=>typeof e==='object'&&e!==null&&'$metadata' in e?(e as {$metadata:{httpStatusCode?:number}}).$metadata.httpStatusCode:undefined;
const etag=(s?:string)=>(s||'').replace(/^"|"$/g,'');
const quoted=(s:string)=>s==='*'?s:'"'+etag(s)+'"';
export class StudioBucket {
 constructor(public client:S3Client,public name:string){}
 async head(key:string){try{const r=await this.client.send(new HeadObjectCommand({Bucket:this.name,Key:key}));return {key,size:r.ContentLength||0,etag:etag(r.ETag),uploaded:r.LastModified||new Date(),httpMetadata:{contentType:r.ContentType},customMetadata:r.Metadata||{}}}catch(e){if(missing(e))return null;throw e}}
 async get(key:string,options?:{range?:{offset:number;length:number}}){try{
  const range=options?.range;const r=await this.client.send(new GetObjectCommand({Bucket:this.name,Key:key,...range?{Range:`bytes=${range.offset}-${range.offset+range.length-1}`}:{}}));
  if(!r.Body)return null;const body=r.Body.transformToWebStream();const response=new Response(body);
  return {key,size:r.ContentLength||0,etag:etag(r.ETag),uploaded:r.LastModified||new Date(),httpMetadata:{contentType:r.ContentType},customMetadata:r.Metadata||{},body:response.body!,arrayBuffer:()=>response.arrayBuffer(),text:()=>response.text(),json:<T>()=>response.json() as Promise<T>};
 }catch(e){if(missing(e))return null;throw e}}
 async put(key:string,value:string|ArrayBuffer|ArrayBufferView|Blob|ReadableStream<Uint8Array>,options?:{httpMetadata?:{contentType?:string};customMetadata?:Record<string,string>;onlyIf?:{etagMatches?:string;etagDoesNotMatch?:string}}){
  let body:Uint8Array|string;
  if(typeof value==='string')body=value;
  else if(value instanceof Blob)body=new Uint8Array(await value.arrayBuffer());
  else if(value instanceof ReadableStream){const reader=value.getReader();const chunks:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>128_000_000)throw new Error('Media exceeds storage limit');chunks.push(part.value)}}finally{await reader.cancel()}body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}}
  else if(ArrayBuffer.isView(value))body=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  else body=new Uint8Array(value);
  try{const r=await this.client.send(new PutObjectCommand({Bucket:this.name,Key:key,Body:body,ContentType:options?.httpMetadata?.contentType,Metadata:options?.customMetadata,...options?.onlyIf?.etagMatches?{IfMatch:quoted(options.onlyIf.etagMatches)}:{},...options?.onlyIf?.etagDoesNotMatch?{IfNoneMatch:quoted(options.onlyIf.etagDoesNotMatch)}:{}}));return {key,etag:etag(r.ETag),size:typeof body==='string'?Buffer.byteLength(body):body.byteLength}}catch(e){if(status(e)===412||status(e)===409)return null;throw e}
 }
 async delete(key:string|string[]){for(const item of Array.isArray(key)?key:[key])await this.client.send(new DeleteObjectCommand({Bucket:this.name,Key:item}));}
 async list(options:{prefix?:string;limit?:number;cursor?:string}={}){const r=await this.client.send(new ListObjectsV2Command({Bucket:this.name,Prefix:options.prefix,MaxKeys:options.limit||1000,ContinuationToken:options.cursor}));return {objects:(r.Contents||[]).map(o=>({key:o.Key!,size:o.Size||0,etag:etag(o.ETag),uploaded:o.LastModified||new Date()})),truncated:!!r.IsTruncated,cursor:r.NextContinuationToken};}
 async downloadUrl(key:string,filename?:string){return getSignedUrl(this.client,new GetObjectCommand({Bucket:this.name,Key:key,...filename?{ResponseContentDisposition:`attachment; filename="${filename.replace(/[^a-z0-9._-]/gi,'-')}"`}:{}}),{expiresIn:900});}
 async uploadUrl(key:string,type:string,size:number){return getSignedUrl(this.client,new PutObjectCommand({Bucket:this.name,Key:key,ContentType:type,ContentLength:size}),{expiresIn:900});}
}
let storage:StudioBucket|undefined;
export function getStorage(){if(!process.env.S3_BUCKET||!process.env.S3_ACCESS_KEY_ID||!process.env.S3_SECRET_ACCESS_KEY)return undefined;return storage??=new StudioBucket(new S3Client({region:process.env.S3_REGION||'auto',endpoint:process.env.S3_ENDPOINT,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='true',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'}),process.env.S3_BUCKET);}
export async function mediaRedirect(key:string,filename?:string){const store=getStorage();if(!store)throw new Error('Storage is not configured');if(!await store.head(key))return Response.json({error:'Media not found.'},{status:404});return new Response(null,{status:307,headers:{Location:await store.downloadUrl(key,filename),'Cache-Control':'private, no-store'}});}
