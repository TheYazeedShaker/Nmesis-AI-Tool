import test from 'node:test';import assert from 'node:assert/strict';
import {checkedPinterestUrl,pinMetadata,publicFetch,boundedBytes} from '../lib/pinterest.ts';
import {captureBounds} from '../lib/live-capture.ts';
import {encode} from 'fast-png';
const fixture=encode({width:4,height:2,data:new Uint8Array(32).fill(200),channels:4});
function element(parent=null){let style=null;return{parentElement:parent,isConnected:true,getAttribute:()=>style,setAttribute:(k,v)=>style=v,removeAttribute:()=>style=null,style:{setProperty:(k,v)=>{style=(style||'')+k+':'+v+';'}},getBoundingClientRect:()=>({left:0,top:0,width:1000,height:800})}}
test('pin metadata accepts attribute order and escaped image links',()=>{const m=pinMetadata(`<meta content="https://i.pinimg.com/736x/test.jpg?a=1&amp;b=2" name="og:image"><meta property='og:title' content='Light &amp; Shadow'>`);assert.equal(m.title,'Light & Shadow');assert.equal(m.image,'https://i.pinimg.com/736x/test.jpg?a=1&b=2')});
test('pin fetch rejects private hosts, credentials, ports and deceptive domains',()=>{for(const u of ['http://pinterest.com/pin/1/','https://pinterest.com.evil.test/pin/1','https://127.0.0.1','https://user@pinterest.com','https://pinterest.com:444/pin/1'])assert.throws(()=>checkedPinterestUrl(u));assert.throws(()=>pinMetadata('<meta property="og:image" content="https://localhost/secret">'));assert.equal(checkedPinterestUrl('https://www.pinterest.co.uk/pin/1/').hostname,'www.pinterest.co.uk')});
test('redirect destination is revalidated before requesting',async()=>{let calls=0;await assert.rejects(publicFetch('https://pin.it/example',false,async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/secret'}})}));assert.equal(calls,1)});
test('stream size is enforced without content length',async()=>{await assert.rejects(boundedBytes(new Response(new Uint8Array(100)),50));assert.equal((await boundedBytes(new Response(new Uint8Array(10)),50)).length,10)});
test('capture crop matches scaled video coordinates and rejects clipped views',()=>{assert.deepEqual(captureBounds({left:100,top:50,width:600,height:400},{width:1000,height:800},{width:2000,height:1600}),{x:200,y:100,w:1200,h:800});assert.throws(()=>captureBounds({left:0,top:-10,width:600,height:400},{width:1000,height:800},{width:2000,height:1600}))});
test('Pinterest shortlink follows its specific API redirect before reaching the pin',async()=>{
 const urls=[];const fetcher=async url=>{urls.push(url);return urls.length===1?new Response(null,{status:308,headers:{location:'https://api.pinterest.com/url_shortener/39YYRhN0f/redirect/'}}):urls.length===2?new Response(null,{status:302,headers:{location:'https://www.pinterest.com/pin/123456/'}}):new Response('<html>pin</html>')};
 const result=await publicFetch('https://pin.it/39YYRhN0f',false,fetcher);assert.equal(result.url,'https://www.pinterest.com/pin/123456/');assert.equal(urls.length,3);
});
test('API redirect exception cannot fetch other API paths or arbitrary image hosts',async()=>{
 for(const destination of ['https://api.pinterest.com/settings','https://api.pinterest.com/url_shortener/x/redirect/extra','https://api.pinterest.com.evil.test/url_shortener/x/redirect/','https://user@api.pinterest.com/url_shortener/x/redirect/']){let calls=0;await assert.rejects(publicFetch('https://pin.it/x',false,async()=>{calls++;return new Response(null,{status:302,headers:{location:destination}})}));assert.equal(calls,1)}
 await assert.rejects(publicFetch('https://i.pinimg.com/a.jpg',true,async()=>new Response(null,{status:302,headers:{location:'https://api.pinterest.com/url_shortener/x/redirect/'}})));
 assert.throws(()=>checkedPinterestUrl('https://api.pinterest.com/url_shortener/x/redirect/'));
});
test('shared pin URLs normalize and boards/login destinations do not count as a pin',async()=>{
 const {pinterestPinUrl}=await import('../lib/pinterest.ts');assert.equal(pinterestPinUrl('https://www.pinterest.com/pin/123456/sent/?invite_code=abc#top').href,'https://www.pinterest.com/pin/123456/');assert.equal(pinterestPinUrl('https://pin.it/39YYRhN0f').href,'https://pin.it/39YYRhN0f');assert.equal(pinterestPinUrl('https://www.pinterest.com.au/pin/123/').hostname,'www.pinterest.com.au');for(const url of ['https://www.pinterest.com/login/','https://www.pinterest.com/user/board/'])assert.throws(()=>pinterestPinUrl(url));
});
test('blocked HTML uses public widget data for exactly the requested pin',async()=>{
 const {pinterestReference}=await import('../lib/pinterest.ts');const calls=[];
 const result=await pinterestReference('https://www.pinterest.com/pin/123456789012345678/',async url=>{calls.push(url);return calls.length===1?new Response('blocked',{status:403}):Response.json({status:'success',data:[{id:'different',images:{x:{url:'https://i.pinimg.com/wrong.jpg'}}},{id:'123456789012345678',images:{'236x':{width:236,url:'https://i.pinimg.com/small.jpg'},'564x':{width:564,url:'https://i.pinimg.com/right.jpg'}},description:'Demo SUV'}]})});
 assert.equal(result.image,'https://i.pinimg.com/right.jpg');assert.equal(result.title,'Demo SUV');assert.equal(calls[1],'https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=123456789012345678');
});
test('widget fallback rejects other pins, external images and redirects',async()=>{
 const {widgetPinMetadata,pinterestReference}=await import('../lib/pinterest.ts');assert.throws(()=>widgetPinMetadata({status:'success',data:[{id:'2',images:{x:{url:'https://i.pinimg.com/wrong.jpg'}}}]},'1'));
 assert.throws(()=>widgetPinMetadata({status:'success',data:[{id:'1',images:{x:{url:'https://localhost/secret'}}}]},'1'));
 let calls=0;await assert.rejects(pinterestReference('https://www.pinterest.com/pin/1/',async()=>{calls++;return calls===1?new Response(null,{status:403}):new Response(null,{status:302,headers:{location:'https://localhost'}})}));assert.equal(calls,2);
});
test('pin import prefers original image bytes and falls back when unavailable',async()=>{
 const {pinterestImage}=await import('../lib/pinterest.ts');const url='https://i.pinimg.com/564x/ac/e3/05/ace3058a7d8450ebd551290c98795330.jpg';const calls=[];
 const bytes=await pinterestImage(url,async u=>{calls.push(u);return new Response(fixture)});assert.equal(bytes.length,fixture.length);assert.equal(calls.length,1);assert.match(calls[0],/\/originals\//);
 const retry=[];await pinterestImage(url,async u=>{retry.push(u);return retry.length<4?new Response(null,{status:404}):new Response(fixture)});assert.equal(retry[3],url);assert.equal(retry.length,4);
});

test('Pinterest keeps a large original instead of silently falling back at 8 MB',async()=>{
 const {highestPinterestImage}=await import('../lib/pinterest.ts');const bytes=new Uint8Array(9_000_000);bytes.set(fixture);let calls=0;
 const result=await highestPinterestImage('https://i.pinimg.com/564x/ac/e3/05/test.png',async()=>{calls++;return new Response(bytes)});assert.equal(result.bytes.length,9_000_000);assert.equal(result.original,true);assert.equal(result.width,4);assert.equal(calls,1);
});
test('Pinterest validates image bytes and tries a large derivative before the thumbnail',async()=>{
 const {highestPinterestImage}=await import('../lib/pinterest.ts');const calls=[];const result=await highestPinterestImage('https://i.pinimg.com/236x/ac/e3/05/test.png',async u=>{calls.push(u);return calls.length===1?new Response('<html>not an image</html>'):new Response(fixture)});assert.match(result.url,/1200x/);assert.equal(result.original,false);assert.equal(calls.length,2);
});
