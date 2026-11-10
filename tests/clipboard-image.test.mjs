import test from 'node:test';
import assert from 'node:assert/strict';
import {clipboardImage,validateClipboardImage,readClipboardImage} from '../lib/clipboard-image.ts';
const png=()=>new File([new Uint8Array([1,2,3])],'shot.png',{type:'image/png'});
test('paste accepts the image file in a mixed text/image clipboard without modifying bytes',async()=>{const f=png();assert.equal(clipboardImage({items:[{kind:'string',type:'text/plain'},{kind:'file',type:f.type,getAsFile:()=>f}],files:[]}),f);assert.deepEqual(new Uint8Array(await f.arrayBuffer()),new Uint8Array([1,2,3]));});
test('text-only paste stays native and file-list fallback works',()=>{assert.equal(clipboardImage({items:[{kind:'string',type:'text/plain'}],files:[]}),null);const f=png();assert.equal(clipboardImage({items:[],files:[f]}),f)});
test('clipboard rejects empty, unsupported and oversized images',()=>{assert.throws(()=>validateClipboardImage(new File([],'empty.png',{type:'image/png'})));assert.throws(()=>validateClipboardImage(new File(['x'],'a.gif',{type:'image/gif'})));assert.throws(()=>validateClipboardImage(new File([new Uint8Array(40_000_001)],'large.png',{type:'image/png'})));assert.equal(validateClipboardImage(png()).size,3)});
test('paste button reads PNG when clipboard also includes HTML',async()=>{const f=png();const out=await readClipboardImage({read:async()=>[{types:['text/html','image/png'],getType:async type=>{assert.equal(type,'image/png');return f}}]});assert.equal(out.name,'Pasted reference.png');assert.equal(out.type,'image/png');assert.equal(out.size,3)});
test('paste button reports absent images and propagates permission errors for keyboard fallback',async()=>{await assert.rejects(readClipboardImage({read:async()=>[{types:['text/plain']}]}),/No image found/);await assert.rejects(readClipboardImage({read:async()=>{throw new DOMException('Denied','NotAllowedError')}}),{name:'NotAllowedError'})});

test("large screenshots up to 40 MB are accepted unchanged",()=>{const f=new File([new Uint8Array(12_000_000)],"4k.png",{type:"image/png"});assert.equal(validateClipboardImage(f),f)});
