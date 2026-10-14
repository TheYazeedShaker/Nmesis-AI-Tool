import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageSettings,higgsImageBody,imageBudgetIssue} from '../lib/image-models.ts';
import {RESERVE_IMAGE_SQL,RESERVE_FILM_SQL,RESERVE_SWAP_SQL} from '../lib/film-policy.ts';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
test('2K is accepted for both generators and incompatible sizes fail before charging',()=>{assert.equal(imageSettings('openai','2048x1152').size,'2048x1152');assert.equal(imageSettings('higgsfield','2048x1152').size,'2048x1152');assert.equal(imageSettings('openai','3840x2160').size,'3840x2160');assert.throws(()=>imageSettings('higgsfield','3840x2160'));assert.throws(()=>imageSettings('untrusted','2048x1152'));assert.throws(()=>imageSettings('openai','garbage'))});
test('Higgsfield receives ordered car, atmosphere and previous-visual references at native 2K',()=>{const urls=['https://cdn.example/car.png','https://cdn.example/mood.png','https://cdn.example/previous.png'];const b=higgsImageBody('Keep car identity','2048x1152',urls);assert.deepEqual(b.image_urls,urls);assert.equal(b.resolution,'2k');assert.equal(b.quality,'medium');assert.equal(b.aspect_ratio,'16:9');assert.throws(()=>higgsImageBody('Car','2048x1152',[]))});
test('image, film and swap reservations share one atomic daily limit',()=>{const db=new DatabaseSync(':memory:');for(const name of ['0000_nebulous_adam_warlock.sql','0001_groovy_jigsaw.sql','0002_oval_shiva.sql','0003_vengeful_havok.sql'])db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));db.prepare('INSERT INTO film_budgets(payer,daily_limit) VALUES(?,?)').run('payer',100);for(const table of ['films','swap_jobs','image_jobs'])db.prepare(`INSERT INTO ${table}(id,owner,payer,status,data,estimate,created_at,updated_at) VALUES(?,?,?,'quoted','{}',60,1,1)`).run(table,'owner','payer');const day='2026-10-06';assert.equal(db.prepare(RESERVE_IMAGE_SQL).run(day,2,'image_jobs','owner',day,day,day).changes,1);assert.equal(db.prepare(RESERVE_IMAGE_SQL).run(day,2,'image_jobs','owner',day,day,day).changes,0);assert.equal(db.prepare(RESERVE_FILM_SQL).run(day,2,100,'films','owner',day,day,day).changes,0);assert.equal(db.prepare(RESERVE_SWAP_SQL).run(day,2,100,'swap_jobs','owner',day,day,day).changes,0);db.close()});

test('budget guidance distinguishes pause, exhausted allowance and available funds',()=>{assert.match(imageBudgetIssue({dailyLimit:10e6,used:9937000,paused:false},110000),/needs \$0.11.*\$0.063.*\$10.00/);assert.match(imageBudgetIssue({dailyLimit:50e6,used:0,paused:true},110000),/spending is paused/);assert.equal(imageBudgetIssue({dailyLimit:50e6,used:9937000,paused:false},110000),'');assert.equal(imageBudgetIssue({dailyLimit:110000,used:0,paused:false},110000),'')});

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
