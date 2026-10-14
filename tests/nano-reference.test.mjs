import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context=vm.createContext({Buffer,AbortSignal,Error,Response,JSON});
const modules=new Map();
async function load(file){if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(ts.transpileModule(readFileSync(new URL('../'+file+'.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context});modules.set(file,m);await m.link(s=>load('lib/'+s.replace('./','')));return m}
const m=await load('lib/nano-reference');await m.evaluate();const n=m.namespace;
const analysis={id:'analysis-123',sourceId:'source-123',moodId:'mood-123',carDetails:['Slim lamps','Silver multi-spoke wheels'],sceneDetails:['Concrete wall','A person to the right'],conflicts:['Higher camera in scene'],captureAdvice:'Raise the configurator camera',createdAt:'',model:'test'};
test('informed approaches give the two references distinct roles and expose the camera tradeoff',()=>{
 const a=n.nanoReferencePrompt('baseline',undefined,'Keep the setting'),b=n.nanoReferencePrompt('identity',analysis,'Keep the setting'),c=n.nanoReferencePrompt('scene',analysis,'Keep the setting');
 assert.match(a,/NANO BANANA REFERENCE LOCK/);assert.match(b,/Retain the same visible side/);assert.match(b,/scene camera must adapt/);assert.match(c,/Use Image 2 as the base photograph/);for(const p of [b,c]){assert.match(p,/Slim lamps/);assert.match(p,/Concrete wall/);assert.doesNotMatch(p,/Image 3 is/)}
 assert.throws(()=>n.nanoReferencePrompt('scene',undefined,''),/Inspect/);assert.throws(()=>n.nanoStrategy('arbitrary'),/supported/);
});
test('reference inspection rejects incomplete or oversized observations',()=>{
 assert.equal(n.parseNanoAnalysis(analysis).carDetails.length,2);
 for(const d of [{},{...analysis,carDetails:[]},{...analysis,conflicts:['a'.repeat(701)]},{...analysis,captureAdvice:123}])assert.throws(()=>n.parseNanoAnalysis(d),/incomplete/);
});
