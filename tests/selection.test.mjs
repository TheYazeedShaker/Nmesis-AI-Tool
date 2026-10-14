import {test} from 'node:test';
import assert from 'node:assert/strict';
import {combineSelection,selectionBox} from '../lib/selection.ts';

test('detected selections can replace, add, or remove without mutating the undo snapshot',()=>{
 const base=new Uint8Array([0,255,255,64]),next=new Uint8Array([255,255,128,0]);
 assert.deepEqual([...combineSelection(base,next,'replace')],[255,255,128,0]);
 assert.deepEqual([...combineSelection(base,next,'add')],[255,255,255,64]);
 assert.deepEqual([...combineSelection(base,next,'remove')],[0,0,127,64]);
 assert.deepEqual([...base],[0,255,255,64]);
 assert.throws(()=>combineSelection(base,new Uint8Array(1),'add'),/dimensions/);
});

test('a backwards box drag and out-of-frame pointer both map to the right image region',()=>{
 assert.deepEqual(selectionBox({x:.8,y:.9},{x:.2,y:.3}),{x:.2,y:.3,width:.8-.2,height:.9-.3});
 assert.deepEqual(selectionBox({x:-.2,y:-1},{x:1.2,y:1.1}),{x:0,y:0,width:1,height:1});
});
