import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchDownloadImage,imageFilename} from '../lib/image-download.ts';
test('download filenames match the real format and cannot contain path separators',()=>{
 assert.equal(imageFilename('My car.png','image/jpeg'),'My-car.jpg');
 assert.equal(imageFilename('../../car:final','image/webp'),'car-final.webp');
});
test('authenticated image fetch preserves the original image bytes',async t=>{
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'/api/assets/example');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'follow');return new Response(bytes,{headers:{'Content-Type':'image/png'}})});
 const blob=await fetchDownloadImage('/api/assets/example');assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);
});
for(const [status,message] of [[401,/session expired/],[403,/session expired/],[404,/no longer available/],[502,/could not be downloaded/]])test('download explains HTTP '+status,async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status,headers:{'content-type':'application/json'}}));await assert.rejects(()=>fetchDownloadImage('/api/assets/example'),message);
});
test('a login page or an empty response cannot be saved as a PNG',async t=>{
 const mock=t.mock.method(globalThis,'fetch',async()=>new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}}));await assert.rejects(()=>fetchDownloadImage('/api/assets/example'),/did not return an image/);
 mock.mock.mockImplementation(async()=>new Response('',{headers:{'content-type':'image/png'}}));await assert.rejects(()=>fetchDownloadImage('/api/assets/example'),/empty/);
});
