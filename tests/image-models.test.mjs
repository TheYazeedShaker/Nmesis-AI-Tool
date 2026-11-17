import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageSettings,higgsImageBody} from '../lib/image-models.ts';
test('2K is accepted for both generators and incompatible sizes fail before charging',()=>{assert.equal(imageSettings('openai','2048x1152').size,'2048x1152');assert.equal(imageSettings('higgsfield','2048x1152').size,'2048x1152');assert.equal(imageSettings('openai','3840x2160').size,'3840x2160');assert.throws(()=>imageSettings('higgsfield','3840x2160'));assert.throws(()=>imageSettings('untrusted','2048x1152'));assert.throws(()=>imageSettings('openai','garbage'))});
test('Higgsfield receives ordered car, atmosphere and previous-visual references at native 2K',()=>{const urls=['https://cdn.example/car.png','https://cdn.example/mood.png','https://cdn.example/previous.png'];const b=higgsImageBody('Keep car identity','2048x1152',urls);assert.deepEqual(b.image_urls,urls);assert.equal(b.resolution,'2k');assert.equal(b.quality,'medium');assert.equal(b.aspect_ratio,'16:9');assert.throws(()=>higgsImageBody('Car','2048x1152',[]))});


for(const model of ['marketing-studio/image/sunburst','marketing-studio/image/flare'])test(model+' accepts 4K with high-quality direct editing',()=>{const b=higgsImageBody('Preserve exact car geometry','3840x2160',['https://cdn.example/car.png','https://cdn.example/mood.png'],model);assert.equal(b.resolution,'4k');assert.equal(b.quality,'high');assert.equal(b.enhance_prompt,false);assert.equal(imageSettings('higgsfield','3840x2160',model).model,model)});
test('unconnected models cannot silently fall back to another paid generator',()=>{assert.throws(()=>imageSettings('higgsfield','3840x2160','nano_banana_2'),/not connected/);assert.throws(()=>higgsImageBody('car','2048x1152',['a','b'],'https://other.example'),/not connected/)});

test('refinement references respect studio and provider limits without silent truncation',async()=>{
 const {refinementReferences,refinementReferenceLimit}=await import('../lib/image-models.ts');
 const ids=Array.from({length:6},(_,i)=>'reference-'+i);
 assert.deepEqual(refinementReferences(ids,true,'openai'),ids);
 assert.equal(refinementReferenceLimit('higgsfield','marketing-studio/image/sunburst'),6);
 assert.throws(()=>refinementReferences(ids,false,'openai'),/saved visual/);
 assert.throws(()=>refinementReferences([...ids,'seventh-ref'],true,'openai'),/up to 6/);
 assert.throws(()=>refinementReferences(['https://foreign/image.png'],true,'openai'),/valid/);
 assert.throws(()=>refinementReferences(['reference-1','reference-1'],true,'openai'),/duplicate/);
 assert.throws(()=>refinementReferences(ids,true,'higgsfield'),/Sunburst or Flare/);
 for(const model of ['marketing-studio/image/sunburst','marketing-studio/image/flare']){
  const urls=Array.from({length:9},(_,i)=>'https://cdn.example/'+i+'.png');
  assert.deepEqual(higgsImageBody('edit','2048x1152',urls,model).image_urls,urls);
  assert.throws(()=>higgsImageBody('edit','2048x1152',Array(17).fill('a'),model),/16/);
 }
});
