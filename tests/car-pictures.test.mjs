import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {configuratorApiOrigin,openingFrame,brandIcon,unsigned,pictureKey,storeSmall,readCar,forgetConfigurators,configuratorAssets,assetObjectKey,s3AssetReader} from '../lib/car-pictures.ts';

// Car pictures and brand logos from the configurator (Phase 3 polish): which
// address the server may call, the configurator's own frame rule, and what it
// refuses to fetch or keep. tests/accounts-access.test.mjs (V7) runs the routes.
const ORIGIN='https://configurator.test',CDN='https://cdn.configurator.test';
const config=(over={})=>({grades:[{id:'g1',folder:'G1',colorIds:['c1','c2'],_colorCdnLinks:{c1:{Indoor:CDN+'/Brand/G1/c1'},c2:{Indoor:CDN+'/Brand/G1/c2'}}}],
 colors:[{id:'c1',available:false,lightingFolders:{Indoor:'C1'}},{id:'c2',available:true,lightingFolders:{Indoor:'C2'}}],defaults_lighting:'Indoor',defaults:{gradeId:'g1',frameIndex:3},
 assetSignaturesHost:'cdn.configurator.test',assetSignatures:{Brand:'Policy=p&Signature=s&Key-Pair-Id=k'},availableIcons:{brandName:'/Brand/logo.svg'},...over});
const manifest={G1:{Indoor:{C2:['01.avif','02.avif','03.avif'],C1:['x.avif']}}};

test('the server calls the configurator only over https (plain http only on this machine)',()=>{
 assert.equal(configuratorApiOrigin({CONFIGURATOR_ORIGIN:'https://configurator.example.com/some/path'}),'https://configurator.example.com');
 assert.equal(configuratorApiOrigin({CONFIGURATOR_ORIGIN:'https://a.example.com',CONFIGURATOR_API_ORIGIN:'http://localhost:4000'}),'http://localhost:4000');
 for(const bad of ['http://configurator.example.com','https://user:pw@configurator.example.com','ftp://x','not a url'])assert.equal(configuratorApiOrigin({CONFIGURATOR_ORIGIN:bad}),null,bad);
 assert.equal(configuratorApiOrigin({}),null);
});

test('the opening frame follows the configurator: default grade, first available colour, lighting folder, frame index, its own signing',()=>{
 const f=openingFrame(config(),manifest,ORIGIN);
 assert.equal(f,CDN+'/Brand/G1/c2/03.avif?Policy=p&Signature=s&Key-Pair-Id=k');
 assert.equal(unsigned(f),CDN+'/Brand/G1/c2/03.avif','the stored name is made from the address without its signature');
 assert.equal(openingFrame(config({defaults:{gradeId:'g1',frameIndex:99}}),manifest,ORIGIN),CDN+'/Brand/G1/c2/01.avif?Policy=p&Signature=s&Key-Pair-Id=k','past the end: the first frame');
 assert.equal(openingFrame(config(),{},ORIGIN),null,'no frames: no picture');
 assert.equal(openingFrame(config({grades:[]}),manifest,ORIGIN),null);
 assert.equal(openingFrame(config(),{G1:{Indoor:{C2:['../../secret.json']}}},ORIGIN),null,'only picture files');
 assert.equal(openingFrame(config({grades:[{id:'g1',folder:'G1',_colorCdnLinks:{c2:{Indoor:'http://elsewhere.example/x'}}}]}),manifest,ORIGIN),null,'never plain http');
 assert.equal(brandIcon(config(),ORIGIN),ORIGIN+'/Brand/logo.svg','a relative icon is on the configurator itself (not the signing host)');
 assert.equal(brandIcon(config({availableIcons:{}}),ORIGIN),null);
});

test('stored pictures are the company’s, named by car and frame; a new frame is a new picture',()=>{
 const a=pictureKey('org-1','demo','suv',CDN+'/a/01.avif?Signature=x'),b=pictureKey('org-1','demo','suv',CDN+'/a/01.avif?Signature=y'),c=pictureKey('org-1','demo','suv',CDN+'/a/02.avif');
 assert.match(a,/^orgs\/org-1\/cars\/demo\/suv\/[0-9a-f]{16}\.webp$/);
 assert.equal(a,b,'a new signature is the same picture');assert.notEqual(a,c,'a changed configurator makes a new one');
});

test('only pictures are kept: other answers are refused, and nothing is fetched twice',async()=>{
 const kept=new Map(),store={head:async k=>kept.has(k)?{key:k}:null,put:async(k,v)=>{kept.set(k,v)}};
 const html=async()=>new Response('<html>',{headers:{'content-type':'text/html'}});
 await assert.rejects(storeSmall(store,'k1','https://x.test/a.png',{fetchImpl:html,box:{width:640}}),/not a picture/);
 const big=async()=>new Response('x',{headers:{'content-type':'image/png','content-length':String(50_000_000)}});
 await assert.rejects(storeSmall(store,'k1','https://x.test/a.png',{fetchImpl:big,box:{width:640}}),/too large/);
 assert.equal(kept.size,0);
 kept.set('k2',Buffer.from('kept'));let calls=0;
 assert.equal(await storeSmall(store,'k2','https://x.test/a.png',{fetchImpl:async()=>{calls++;return html()},box:{width:640}}),'k2');assert.equal(calls,0,'already kept: not fetched');
 // The configurator's answers are remembered for a while: one read per car.
 forgetConfigurators();let reads=0;
 const f=async u=>{reads++;return Response.json(String(u).includes('/api/config')?config():manifest)};
 await readCar('demo','suv',{origin:ORIGIN,fetchImpl:f,now:1000});await readCar('demo','suv',{origin:ORIGIN,fetchImpl:f,now:2000});
 assert.equal(reads,2,'config and manifest once');
 await assert.rejects(readCar('../x','suv',{origin:ORIGIN,fetchImpl:f}),/Invalid car/);
 forgetConfigurators();
});

test('the routes check the car and brand are the company’s before anything is fetched; every call has a timeout',()=>{
 const pic=readFileSync(new URL('../app/api/cars/[id]/picture/route.ts',import.meta.url),'utf8');
 assert.ok(pic.indexOf('cars.some(c=>c.brandId===brandId&&c.modelId===modelId)')<pic.indexOf('readCar('),'ownership before the fetch');
 const logo=readFileSync(new URL('../app/api/brands/[id]/logo/route.ts',import.meta.url),'utf8');
 assert.ok(logo.indexOf('if(!mine)')<logo.indexOf('readCar('),'ownership before the fetch');
 const lib=readFileSync(new URL('../lib/car-pictures.ts',import.meta.url),'utf8');
 assert.equal((lib.match(/AbortSignal\.timeout/g)||[]).length,3,'both fetches and the bucket read have a timeout');
 assert.match(lib,/redirect:'error'/);
});

// The configurator's asset bucket is private (finish pass): a brand icon the
// configurator did not sign is read from the bucket with the Studio's own signed
// access, configured from the environment only. No network: the read is injected.
const SOURCE={bucket:'demo-assets.example',region:'eu-central-1',hosts:['cdn.assets.example']};
test('the asset bucket comes from the environment only, checked; nothing is read without it',()=>{
 assert.deepEqual(configuratorAssets({CONFIGURATOR_ASSET_BUCKET:'demo-assets.example',CONFIGURATOR_ASSET_REGION:'eu-central-1',CONFIGURATOR_ASSET_HOSTS:'https://CDN.assets.example/, not a host ,x'}),SOURCE);
 assert.equal(configuratorAssets({}),null,'unset: links are fetched as before');
 for(const bad of [{CONFIGURATOR_ASSET_BUCKET:'Bad_Bucket',CONFIGURATOR_ASSET_REGION:'eu-central-1'},{CONFIGURATOR_ASSET_BUCKET:'demo..assets',CONFIGURATOR_ASSET_REGION:'eu-central-1'},{CONFIGURATOR_ASSET_BUCKET:'demo-assets',CONFIGURATOR_ASSET_REGION:'europe'},{CONFIGURATOR_ASSET_BUCKET:'demo-assets'}])assert.equal(configuratorAssets(bad),null,JSON.stringify(bad));
});
test('an icon address is an object of the bucket only when it names that bucket (or its CDN), and only a picture',()=>{
 const key='Demo/Demo_SUV/Icons/Brand.avif';
 assert.equal(assetObjectKey('https://s3.eu-central-1.amazonaws.com/demo-assets.example/'+key,SOURCE),key,'path-style');
 assert.equal(assetObjectKey('https://demo-assets.example.s3.eu-central-1.amazonaws.com/'+key,SOURCE),key,'virtual-host');
 assert.equal(assetObjectKey('https://demo-assets.example.s3.amazonaws.com/'+key,SOURCE),key);
 assert.equal(assetObjectKey('https://cdn.assets.example/'+key+'?x=1',SOURCE),key,'its CDN, query dropped');
 assert.equal(assetObjectKey('https://cdn.assets.example/Demo/Icons/Brand%20Mark.png',SOURCE),'Demo/Icons/Brand Mark.png','decoded');
 for(const other of ['https://s3.eu-central-1.amazonaws.com/another-bucket/'+key,'https://another-bucket.s3.eu-central-1.amazonaws.com/'+key,'https://demo-assets.example.s3.eu-central-1.amazonaws.com.evil.example/'+key,'http://cdn.assets.example/'+key,'https://cdn.assets.example/Demo/config.json','https://cdn.assets.example/Demo%2F..%2Fsecret.png','https://user:pw@cdn.assets.example/'+key,'not a url'])assert.equal(assetObjectKey(other,SOURCE),null,other);
});
test('a bucket icon is read signed, with a timeout and a size limit; a signed configurator link is fetched as it is; a failed read keeps nothing',async()=>{
 const png=await (await import('sharp')).default({create:{width:200,height:80,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
 const reads=[];const getObject=async(input,signal)=>{reads.push({input,signal});return {ContentType:'image/png',ContentLength:png.length,Body:{transformToByteArray:async()=>new Uint8Array(png)}}};
 const assets={source:SOURCE,read:s3AssetReader(SOURCE,{getObject})};
 const kept=new Map(),store={head:async k=>kept.has(k)?{key:k}:null,put:async(k,v,o)=>{kept.set(k,{v,o})}};
 const noFetch=async()=>{throw new Error('fetched')};
 assert.equal(await storeSmall(store,'logo-1','https://s3.eu-central-1.amazonaws.com/demo-assets.example/Demo/Icons/Brand.png',{fetchImpl:noFetch,box:{height:96},assets}),'logo-1');
 assert.deepEqual(reads[0].input,{Bucket:'demo-assets.example',Key:'Demo/Icons/Brand.png'});assert.ok(reads[0].signal instanceof AbortSignal,'the read has a timeout');
 assert.equal(kept.get('logo-1').o.httpMetadata.contentType,'image/webp');
 // A link the configurator signed (its CDN, its signature) is fetched, not read from the bucket.
 let fetched=0;const fetchPng=async()=>{fetched++;return new Response(png,{headers:{'content-type':'image/png'}})};
 await storeSmall(store,'logo-2','https://cdn.assets.example/Demo/Icons/Brand.png?Policy=p&Signature=s&Key-Pair-Id=k',{fetchImpl:fetchPng,box:{height:96},assets});assert.equal(fetched,1);assert.equal(reads.length,1);
 // Elsewhere: fetched as before.
 await storeSmall(store,'logo-3','https://other.example/Brand.png',{fetchImpl:fetchPng,box:{height:96},assets});assert.equal(fetched,2);
 // Refused, too large, not a picture, no credentials: an error (the route answers 204), nothing kept.
 const failing=(answer)=>({source:SOURCE,read:s3AssetReader(SOURCE,{getObject:async()=>answer()})});
 const url='https://cdn.assets.example/Demo/Icons/Brand.png';
 await assert.rejects(storeSmall(store,'x1',url,{fetchImpl:noFetch,box:{height:96},assets:failing(()=>{const e=new Error('Access Denied');e.name='AccessDenied';throw e})}),/Access Denied/);
 await assert.rejects(storeSmall(store,'x2',url,{fetchImpl:noFetch,box:{height:96},assets:failing(()=>({ContentType:'image/png',ContentLength:50_000_000,Body:{transformToByteArray:async()=>new Uint8Array(1)}}))}),/too large/);
 await assert.rejects(storeSmall(store,'x3',url,{fetchImpl:noFetch,box:{height:96},assets:failing(()=>({ContentType:'text/html',Body:{transformToByteArray:async()=>new Uint8Array(1)}}))}),/not a picture/);
 await assert.rejects(s3AssetReader(SOURCE,{env:{}})('Demo/Icons/Brand.png'),/no AWS credentials/);
 assert.equal(['x1','x2','x3'].some(k=>kept.has(k)),false);
});
