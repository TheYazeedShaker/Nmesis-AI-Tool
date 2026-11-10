import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLineup,lineupImageIds,lineupPrompt,lineupCapacity,arrangeCars} from '../lib/lineup.ts';
const car=(i,count=1)=>({id:'car-id-0'+i,name:'Model '+i,configurator:'https://example.com/car/'+i,finish:'Pearl white',views:Array.from({length:count},(_,j)=>({id:`capture-${i}-${j}`,label:j?'Rear detail':'Front three-quarter'})),x:20+i*10,y:65,scale:30});
const draft=(counts=[1,1])=>({cars:counts.map((c,i)=>car(i,c)),layout:'inspiration',heroId:'car-id-00'});
test('grouped references keep exact order, with inspiration and parent after every car',()=>{const l=parseLineup(draft([2,1,2,1]));assert.deepEqual(lineupImageIds(l,'inspiration','previous'),['capture-0-0','capture-0-1','capture-1-0','capture-2-0','capture-2-1','capture-3-0','inspiration','previous']);const p=lineupPrompt({...l,targetCarId:'car-id-02'},'Golden hour',true,'Correct wheels');assert.match(p,/CAR 2: Model 1. Identity evidence only: input Image 3/);assert.match(p,/Input Image 7 is the original inspiration/);assert.match(p,/Input Image 8 is the CURRENT SELECTED/);assert.match(p,/Change ONLY CAR 3 \(Model 2\)/);assert.match(p,/Preserve every prior edit/)});
test('rejects missing, duplicate, foreign and oversized reference inputs',()=>{for(const mutate of [d=>d.cars.pop(),d=>d.cars[0].views=[],d=>d.cars[1].views=d.cars[0].views,d=>d.cars[1].id=d.cars[0].id,d=>d.cars[0].views[0].id='https://foreign.example/image',d=>d.heroId='missing-hero',d=>d.targetCarId='foreign-car',d=>d.cars[0].x=NaN,d=>d.cars[0].scale=100,d=>d.layout='unsafe']){const d=draft();mutate(d);assert.throws(()=>parseLineup(d))}assert.throws(()=>parseLineup(draft([3,1])));assert.throws(()=>parseLineup(draft([1,1,1,1,1,1,1])))});
test('capacity includes inspiration and prior visual; never silently drops a car',()=>{const l=parseLineup(draft());assert.doesNotThrow(()=>lineupCapacity(l,3));assert.throws(()=>lineupCapacity(l,3,true),/cannot fit/);assert.doesNotThrow(()=>lineupCapacity(parseLineup(draft([2,2,2,2])),16,true))});
test('presets remain valid with 2 to 6 cars and any hero',()=>{for(let n=2;n<=6;n++)for(const layout of ['hero','straight','staggered','inspiration'])for(let hero=0;hero<n;hero++){const d=draft(Array(n).fill(1));d.layout=layout;d.heroId=d.cars[hero].id;d.cars=arrangeCars(d.cars,layout,d.heroId);assert.doesNotThrow(()=>parseLineup(d));if(layout==='hero'){assert.equal(d.cars[hero].x,50);assert.equal(d.cars[hero].scale,48)}}});
test('strict reference matching replaces creative rules rather than appending contradictory placement',()=>{const l=parseLineup({...draft([2,1,2]),strictReference:true,layout:'hero'});assert.equal(l.layout,'inspiration');assert.equal(l.strictReference,true);const p=lineupPrompt(l,'Move the sun to the opposite side');assert.match(p,/Input Image 1 is the LOCKED INSPIRATION SHOT/);assert.match(p,/These locks override conflicting brief text/);assert.match(p,/manual percentage placement must NOT override/);assert.match(p,/Reorient each product/);assert.match(p,/same number|counts match/);assert.doesNotMatch(p,/Position: center x|HERO CAR\.|Preserve body geometry and primary reference yaw|inspiration only:/)});
test('strict matching validates its flag and persists through a refinement round trip',()=>{const l=parseLineup({...draft(),strictReference:true});assert.equal(parseLineup(JSON.parse(JSON.stringify({...l,targetCarId:l.cars[1].id}))).strictReference,true);assert.throws(()=>parseLineup({...draft(),strictReference:'false'}),/whether to lock/);assert.equal(parseLineup(draft()).strictReference,false)});

test('strict editing sends the base inspiration first and keeps every car identity reference grouped',()=>{const l=parseLineup({...draft([2,1]),strictReference:true});assert.deepEqual(lineupImageIds(l,'mood-reference','prior-lineup'),['mood-reference','capture-0-0','capture-0-1','capture-1-0','prior-lineup']);const p=lineupPrompt(l,'',true);assert.match(p,/CAR 1: Model 0. Identity evidence only: input Image 2 and Image 3/);assert.match(p,/CAR 2: Model 1. Identity evidence only: input Image 4/);assert.match(p,/Input Image 5 is the CURRENT SELECTED LINEUP/)});
test('six cars retain twelve references plus inspiration and the current refined image',()=>{
 for(const strictReference of [false,true]){
 const l=parseLineup({...draft(Array(6).fill(2)),strictReference});
 const ids=lineupImageIds(l,'inspiration','current-edit');assert.equal(ids.length,14);assert.equal(new Set(ids).size,14);assert.equal(ids.at(-1),'current-edit');
 assert.doesNotThrow(()=>lineupCapacity(l,16,true));assert.throws(()=>lineupCapacity(l,13,true),/cannot fit/);assert.throws(()=>lineupCapacity(l,3),/cannot fit/);
 assert.match(lineupPrompt(l,'Sunset'),/EXACTLY 6/);
 const prompt=lineupPrompt({...l,targetCarId:l.cars[5].id},'Sunset',true,'Correct the sixth car wheels');assert.match(prompt,/Input Image 14 is the CURRENT SELECTED LINEUP/);assert.match(prompt,/Change ONLY CAR 6/);
 assert.match(prompt,strictReference?/CAR 6: Model 5. Identity evidence only: input Image 12 and Image 13/:/CAR 6: Model 5. Identity evidence only: input Image 11 and Image 12/);
 }
});
test('five- and six-car placement fits the frame without overlaps within each row',()=>{
 for(const n of [5,6])for(const layout of ['straight','staggered','hero'])for(let hero=0;hero<n;hero++){
 const cars=draft(Array(n).fill(1)).cars;const arranged=arrangeCars(cars,layout,cars[hero].id);
 for(const car of arranged){assert.ok(car.x-car.scale/2>=2.99);assert.ok(car.x+car.scale/2<=97.01)}
 for(const y of new Set(arranged.map(c=>c.y))){const row=arranged.filter(c=>c.y===y).sort((a,b)=>a.x-b.x);for(let i=1;i<row.length;i++)assert.ok(row[i].x-row[i].scale/2>row[i-1].x+row[i-1].scale/2)}
 }
});
