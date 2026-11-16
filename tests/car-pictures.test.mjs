import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {configuratorApiOrigin,openingFrame,brandIcon,unsigned,pictureKey,storeSmall,readCar,forgetConfigurators} from '../lib/car-pictures.ts';

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
 assert.equal((lib.match(/AbortSignal\.timeout/g)||[]).length,2,'both fetches have a timeout');
 assert.match(lib,/redirect:'error'/);
});
