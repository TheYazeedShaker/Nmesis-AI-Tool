// Autosave when the page goes (feat/editor-panel-rules, the owner's ask on #60): the last change is sent
// as the page leaves (hidden, closed, reloaded, another site) with keepalive when it fits the browser's
// limit for that; a larger one, or one that doesn't arrive, stays on this device and comes back the next
// time the design opens here ("Restored your unsaved changes."), told apart from the Studio's draft by
// the editing session and its change count, not by two clocks (lib/editor/autosave.ts).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Autosave,KEEPALIVE_MAX_BYTES,fitsKeepalive,whichCopy} from '../lib/editor/autosave.ts';

const src=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const SESSION='0b4c8a52-6d1e-4f7a-9c3b-2e5f8d7a1c60';
const flushed=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r))};

/** An autosave on a fake page: `studio` is what the Studio holds; `gone()` closes the page (nothing after it runs). */
function page({online=true,answer=null,kept:start=null}={}){
 const sent=[],kept={v:start},timers=new Map(),studio={v:null};let id=0,net=online,closed=false;
 const a=new Autosave({
  send:(doc,rev,leaving)=>{
   sent.push({rev,leaving});
   // The request arrives at the Studio; the page hears back only if it is still open.
   const arrive=()=>{studio.v={doc,rev,session:SESSION,at:5000+rev}};
   if(answer)return answer({doc,rev,leaving,arrive});
   arrive();return closed?new Promise(()=>{}):Promise.resolve();
  },
  keep:{read:()=>kept.v,write:(v)=>{kept.v=v;return true},clear:()=>{kept.v=null}},
  online:()=>net,setTimer:(fn,ms)=>{const t=++id;timers.set(t,{fn,ms});return t},clearTimer:(t)=>timers.delete(t),
  onStatus:()=>{},delay:2000,now:()=>1000,session:SESSION,
 });
 return {a,sent,kept,timers,studio,gone:()=>{closed=true},setOnline:(v)=>{net=v}};
}

test('leaving right after a change sends it at once, as the page’s last request, without its two seconds',async()=>{
 const p=page();
 p.a.change({n:1},1);
 assert.equal(p.timers.size,1,'the change waits for its two seconds');
 p.a.leave();
 assert.deepEqual(p.sent,[{rev:1,leaving:true}],'sent at once, made to outlive the page');
 assert.equal(p.timers.size,0,'its timer is cancelled: it is not sent twice');
 await flushed();
 assert.equal(p.a.status,'saved');assert.equal(p.kept.v,null,'held by the Studio: the device copy is cleared');
});

test('hidden, then closed: the change is sent once; nothing pending sends nothing',async()=>{
 const p=page();
 p.a.leave();assert.equal(p.sent.length,0,'nothing to send');
 p.a.change({n:1},1);p.a.leave();p.a.leave();
 assert.equal(p.sent.length,1,'the second leave (pagehide after visibilitychange) sends nothing new');
 await flushed();p.a.leave();assert.equal(p.sent.length,1,'once held, leaving sends nothing');
});

test('leaving offline sends nothing: the change stays on this device',async()=>{
 const p=page({online:false});
 p.a.change({n:1},1);p.a.leave();
 assert.equal(p.sent.length,0);assert.equal(p.a.status,'offline');assert.deepEqual(p.kept.v.doc,{n:1});
});

test('leaving while an earlier change is on its way: the latest goes beside it at once (a spare, not counted as held), and again in order if the page lives on',async()=>{
 let release;
 const p=page({answer:({rev,leaving,arrive})=>{
  if(rev===1&&!leaving)return new Promise(r=>{release=()=>{arrive();r()}});
  arrive();return Promise.resolve();
 }});
 p.a.change({n:1},1);
 const first=p.a.flush();await flushed();
 p.a.change({n:2},2);p.a.leave();
 assert.deepEqual(p.sent,[{rev:1,leaving:false},{rev:2,leaving:true}],'the latest is not held back by the one on its way');
 assert.deepEqual(p.kept.v.doc,{n:2},'still on this device: the two may arrive in either order');
 // The earlier one arrives last (the Studio now holds change 1): the page lives on and sends change 2 again, in order.
 release();await first;
 assert.equal(p.studio.v.rev,1,'the Studio holds the older change for now');
 assert.equal(p.timers.size,1,'change 2 is sent again after its two seconds');assert.deepEqual(p.kept.v.doc,{n:2});
 for(const [,t] of [...p.timers])t.fn();await flushed();
 assert.deepEqual(p.sent.at(-1),{rev:2,leaving:false});assert.equal(p.studio.v.rev,2);
 assert.equal(p.a.status,'saved');assert.equal(p.kept.v,null);
});

test('closing right after an edit keeps it: in the Studio when the last request arrives, else restored from this device',async()=>{
 // It arrives: the page is gone before the answer, so the device copy stays; the next opening sees the
 // Studio holds that very change (the same session, the same count) and opens the Studio's draft.
 const ok=page();
 ok.a.change({text:'Demo SUV'},1);ok.gone();ok.a.leave();await flushed();
 assert.deepEqual(ok.studio.v.doc,{text:'Demo SUV'},'the Studio holds the change made just before closing');
 assert.ok(ok.kept.v,'the closed page never heard back');
 assert.equal(whichCopy(ok.kept.v,ok.studio.v),'held','opens the Studio’s draft; the device copy has done its job');
 // It doesn't arrive (too large to go with the page, or the network failed as it closed): the Studio still
 // has the change before, and the next opening restores this device's copy.
 const lost=page({answer:({rev})=>rev===1?(lost.studio.v={doc:{text:'Before'},rev:1,session:SESSION,at:5001},Promise.resolve()):new Promise(()=>{})});
 lost.a.change({text:'Before'},1);await lost.a.flush();
 lost.a.change({text:'Demo SUV'},2);lost.gone();lost.a.leave();await flushed();
 assert.deepEqual(lost.studio.v.doc,{text:'Before'});
 assert.deepEqual(lost.kept.v.doc,{text:'Demo SUV'},'kept on this device');
 assert.equal(whichCopy(lost.kept.v,lost.studio.v),'device','the next opening restores it (and autosave sends it)');
});

test('which copy opens: the same session by its change count, whatever the clocks say; otherwise the later one',()=>{
 const kept=(rev,at,session=SESSION)=>({doc:{},rev,at,...(session?{session}:{})});
 assert.equal(whichCopy(null,{at:1,rev:1,session:SESSION}),'studio','no copy on this device');
 assert.equal(whichCopy(kept(1,1),null),'device','no draft on the Studio (or it could not be read)');
 // This device's clock is far behind the Studio's: the count still says the device's is newer.
 assert.equal(whichCopy(kept(4,1000),{at:9_999_999,rev:3,session:SESSION}),'device');
 assert.equal(whichCopy(kept(4,9_999_999),{at:1000,rev:4,session:SESSION}),'held','the Studio has it, whatever the clock');
 assert.equal(whichCopy(kept(4,9_999_999),{at:1000,rev:9,session:SESSION}),'held');
 // Another session (another tab or device), or a copy kept before sessions were: the later one.
 assert.equal(whichCopy(kept(9,2000,'another-session-id'),{at:1000,rev:1,session:SESSION}),'device');
 assert.equal(whichCopy(kept(9,500,'another-session-id'),{at:1000,rev:1,session:SESSION}),'studio');
 assert.equal(whichCopy(kept(1,2000,null),{at:1000,rev:5}),'device');
 assert.equal(whichCopy(kept(1,2000,null),{at:0,rev:5}),'device','a draft with no time');
});

test('keepalive carries the body only within the browser’s limit, counted in bytes',()=>{
 assert.equal(KEEPALIVE_MAX_BYTES<65_536,true,'below the browser’s 64 KiB for every request leaving together');
 assert.equal(fitsKeepalive(JSON.stringify({doc:{layers:{}},rev:1})),true);
 assert.equal(fitsKeepalive('x'.repeat(KEEPALIVE_MAX_BYTES)),true);
 assert.equal(fitsKeepalive('x'.repeat(KEEPALIVE_MAX_BYTES+1)),false);
 assert.equal(fitsKeepalive('é'.repeat(KEEPALIVE_MAX_BYTES/2+1)),false,'two bytes each: bytes count, not characters');
});

test('the editor: leaves with keepalive on hide and on pagehide, asks before closing only when the change can’t go, says what it restored',()=>{
 const hook=src('components/canvas/use-autosave.ts'),page=src('components/canvas/editor-page.tsx');
 assert.match(hook,/document\.addEventListener\('visibilitychange',hidden\)/);
 assert.match(hook,/document\.visibilityState==='hidden'\)s\.leave\(\)/);
 assert.match(hook,/window\.addEventListener\('pagehide',leave\)/);
 assert.match(hook,/keepalive:leaving&&fitsKeepalive\(body\)/,'keepalive only when it fits; a larger draft is sent as usual');
 assert.match(hook,/document\.removeEventListener\('visibilitychange',hidden\);window\.removeEventListener\('pagehide',leave\)/);
 // Leaving within the Studio (another page, another design): the editor unmounts and sends what is left.
 assert.match(hook,/if\(s\.pending\)void s\.flush\(\);s\.stop\(\)/);
 assert.match(hook,/JSON\.stringify\(\{doc,rev,session\}\)/,'the draft carries its session');
 assert.match(page,/if\(!autosave\.atRisk\(\)\)return;e\.preventDefault\(\)/,'the browser asks only when the change can’t go with the page');
 assert.match(page,/message:'Restored your unsaved changes\.'/);
 assert.match(page,/deviceCopy\(id,server\)/);
 assert.match(page,/rev:Number\(d\.draft\.rev\)\|\|0,session:typeof d\.draft\.session==='string'/);
});
