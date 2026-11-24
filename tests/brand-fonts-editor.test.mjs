// The editor's side of the company's own fonts (lib/editor/fonts.ts): an
// uploaded family follows the catalogue's weight and italic rules, comes first
// under Brand fonts, is drawn from its own signed address, and is a "Missing
// font" once removed (never another font). Plus the two Phase 3 follow-ups:
// recents kept with the account (lib/editor/recent.ts) and curved Arabic that
// keeps its letters joined (lib/editor/curve-shaping.ts).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('../scripts/verify/hooks.mjs',import.meta.url);
const F=await import('../lib/editor/fonts.ts');
const R=await import('../lib/editor/recent.ts');
const C=await import('../lib/editor/curve-shaping.ts');

const file=(id,o={})=>({id,family:'Demo Sans',style:'Regular',weight:400,italic:false,weightRange:null,kind:'sans',arabic:false,format:'ttf',size:30000,embedding:'installable',status:'ready',reason:null,createdAt:1,url:`/api/brand-fonts/${id}/font`,previewUrl:`/api/brand-fonts/${id}/preview`,...o});
const doc=(...fonts)=>({layers:Object.fromEntries(fonts.map((font,i)=>[`t${i}`,{kind:'text',font,fontWeight:400,italic:false}]))});

test('an uploaded family (Regular, Bold, Italic) follows the catalogue’s rules: its weights, italic only where it has one, its own files',()=>{
 F.setBrandFonts([file('f-reg'),file('f-bold',{style:'Bold',weight:700}),file('f-it',{style:'Italic',italic:true}),file('f-refused',{status:'refused',url:null,previewUrl:null,style:'Black',weight:900})]);
 const f=F.fontByName('brand:Demo Sans');
 assert.ok(f);assert.equal(f.label,'Demo Sans');assert.equal(F.fontLabel('brand:Demo Sans'),'Demo Sans');
 assert.deepEqual(f.weights,[400,700],'a refused file adds nothing');
 assert.equal(f.italic,true);assert.equal(f.variable,null);
 assert.deepEqual(F.weightsOf('brand:Demo Sans'),[400,700]);
 assert.equal(F.nearestWeight('brand:Demo Sans',650),700);
 assert.equal(F.fileFor(f,700,false).src,'/api/brand-fonts/f-bold/font');
 assert.equal(F.fileFor(f,400,true).src,'/api/brand-fonts/f-it/font');
 assert.match(F.canvasFontFamily('brand:Demo Sans'),/^"nm-brand-[a-z0-9]+", "nm-inter", sans-serif$/,'drawn in its own face, never a device font of the same name');
 assert.equal(F.brandRole('brand:Demo Sans',null),'Uploaded · Installable');
 assert.equal(F.isKnownFont('brand:Demo Sans'),true);
});

test('a variable upload gets the weight slider (its axis) like the catalogue’s variable fonts',()=>{
 F.setBrandFonts([file('v-1',{family:'Demo Variable',weightRange:[100,900]})]);
 const f=F.fontByName('brand:Demo Variable');
 assert.deepEqual(f.variable,{min:100,max:900});
 assert.deepEqual(f.weights,[100,200,300,400,500,600,700,800,900]);
 assert.equal(F.nearestWeight('brand:Demo Variable',1000),900);
 assert.equal(F.fileFor(f,550,false).weight.join('-'),'100-900');
});

test('uploaded fonts come first under Brand fonts, then the brand kit’s; All fonts stays the catalogue; a search finds them',()=>{
 F.setBrandFonts([file('a'),file('b',{family:'Acme Display',kind:'display'})]);
 const sections=F.fontSections({kit:{headingFont:'Outfit',bodyFont:'Inter'},doc:doc('Inter'),recent:[],query:''});
 assert.deepEqual(sections[0].fonts.map(f=>f.family),['brand:Acme Display','brand:Demo Sans','Outfit','Inter']);
 assert.ok(!sections.find(s=>s.id==='all').fonts.some(f=>f.brand),'All fonts is the catalogue');
 assert.deepEqual(F.fontSections({kit:null,doc:doc(),recent:[],query:'acme'}).flatMap(s=>s.fonts.map(f=>f.family)),['brand:Acme Display']);
 assert.ok(F.fontSections({kit:null,doc:doc(),recent:[],query:'brand'})[0].fonts.length===2,'“brand” finds the uploads');
 // Another company's name in a design (or one not listed yet) is not one of these.
 assert.equal(F.fontByName('brand:Other Company Sans'),null);
});

test('a removed font is a missing font: not known, drawn in the fallback, named without its prefix in the notices',async()=>{
 F.setBrandFonts([file('a')]);
 assert.equal(F.isKnownFont('brand:Demo Sans'),true);
 const versionBefore=F.brandFontsVersion();let told=0;const stop=F.onBrandFonts(()=>told++);
 F.setBrandFonts([]);stop();
 assert.equal(told,1,'the canvas is told the list changed');assert.ok(F.brandFontsVersion()>versionBefore);
 assert.equal(F.fontByName('brand:Demo Sans'),null);assert.equal(F.brandFontsLoaded(),true);
 assert.equal(F.canvasFontFamily('brand:Demo Sans'),F.fallbackFamily(),'the fallback, and the editor says so');
 const {failed}=await F.settleFonts(doc('brand:Demo Sans','Inter'),async n=>F.fontByName(n.font)?{ok:true}:{ok:false,reason:'unknown'});
 assert.deepEqual(failed,['brand:Demo Sans']);
 assert.match(F.fallbackNotice(failed),/^Missing font: Demo Sans couldn’t load/);
 assert.equal(F.exportFallbackNotice(failed),'Made with Inter in place of Demo Sans, which couldn’t load.');
});

test('export uses the uploaded font: it is loaded before the picture is drawn, and nothing is said to be missing',async()=>{
 F.setBrandFonts([file('a')]);
 const order=[];
 const r=await F.exportWithFonts(doc('brand:Demo Sans'),{load:async n=>{order.push('load '+n.font);return {ok:true}},ready:async()=>{order.push('ready')},draw:async()=>{order.push('draw');return 'png'}});
 assert.deepEqual(order,['load brand:Demo Sans','ready','draw']);assert.deepEqual(r,{file:'png',failed:[]});
});

test('recents with the account: a value goes first, each once, capped; colours and font names checked; never an address',()=>{
 assert.deepEqual(R.withValue(['a','b'],'b','fonts'),['b','a']);
 assert.deepEqual(R.withValue(Array.from({length:8},(_,i)=>'f'+i),'new','fonts').length,8);
 assert.equal(R.cleanValue('colours','#0a84ff'),'#0A84FF');assert.equal(R.cleanValue('colours','blue'),null);
 assert.equal(R.cleanValue('fonts','brand:Demo Sans'),'brand:Demo Sans');
 for(const bad of ['https://example.test/font.woff2','//x','a?X-Amz-Signature=1','x'.repeat(61),'',7])assert.equal(R.cleanValue('fonts',bad),null,String(bad));
 assert.deepEqual(R.readRecent('{"fonts":["Inter","https://x.test/a"],"colours":["#FFFFFF","nope"]}'),{fonts:['Inter'],colours:['#FFFFFF']});
 assert.deepEqual(R.readRecent('not json'),{fonts:[],colours:[]});
 assert.deepEqual(R.mergeLists(['A','B'],['B','C'],'fonts'),['A','B','C'],'the account’s first, then what only this device has');
});

test('recents across two browsers: both adding at once keep both values (a conditional write, tried again on a clash)',async()=>{
 // A store with S3's conditional writes: one object, an ETag per version.
 let object=null,version=0;
 const store={
  async get(){return object&&{etag:object.etag,text:async()=>object.text}},
  async put(_key,text,{onlyIf}={}){
   await new Promise(r=>setTimeout(r,1));
   if(onlyIf?.etagDoesNotMatch==='*'&&object)return null;
   if(onlyIf?.etagMatches&&object?.etag!==onlyIf.etagMatches)return null;
   object={etag:'v'+(++version),text};return {etag:object.etag};
  },
 };
 await Promise.all([R.addRecent(store,'orgs/o/users/u/','fonts','Inter'),R.addRecent(store,'orgs/o/users/u/','fonts','brand:Demo Sans')]);
 const kept=R.readRecent(object.text).fonts;
 assert.deepEqual([...kept].sort(),['Inter','brand:Demo Sans'],'neither browser’s pick is lost');
 await R.addRecent(store,'orgs/o/users/u/','colours','#0A84FF');
 assert.deepEqual(R.readRecent(object.text),{fonts:kept,colours:['#0A84FF']});
 assert.equal(R.recentKey('orgs/o/users/u/'),'orgs/o/users/u/settings/editor-recent.json','the person’s own folder');
});

test('curved Arabic keeps its letters joined: each letter drawn with the joiners its neighbours give it, lam-alef as one',()=>{
 const show=s=>C.shapePieces(s).map(p=>p.draw.replace(/‍/g,'~'));
 assert.deepEqual(show('محمد'),['م~','~ح~','~م~','~د'],'initial, medial, medial, final');
 assert.deepEqual(show('سلام'),['س~','~لا','م'],'lam-alef is one ligature; alef doesn’t join the next letter');
 assert.deepEqual(show('دار'),['د','ا','ر'],'letters that join only to the right');
 assert.deepEqual(show('بَيت'),['بَ~','~ي~','~ت'],'a mark stays with its letter and doesn’t break the join');
 assert.deepEqual(show('Demo SUV'),['D','e','m','o',' ','S','U','V'],'Latin is unchanged');
 assert.equal(C.hasArabic('Demo SUV'),false);assert.equal(C.hasArabic('سيارة'),true);
 // Laid out right to left; Latin and digits inside keep their own order.
 assert.equal(C.visualOrder(C.shapePieces('سلام GT 2026')).map(p=>p.text).join(''),'2026 GT ملاس');
});

test('the shaped pieces sit on the same arc as the curve, centred, turned with it',()=>{
 const pieces=C.shapePieces('ساس'),widths=[10,10,10];
 const flat=C.placeOnArc(pieces,{widths,letterSpacing:0,fontSize:40,curve:0,boxWidth:200,height:40,radius:Infinity});
 assert.deepEqual(flat.map(p=>[p.x,p.y,p.rotation,p.width]),[[90,20,0,10],[100,20,0,10],[110,20,0,10]]);
 assert.equal(flat[1].piece,pieces[1],'each place keeps its piece');
 const up=C.placeOnArc(pieces,{widths,letterSpacing:0,fontSize:40,curve:50,boxWidth:200,height:60,radius:100});
 assert.equal(up[1].x,100);assert.equal(up[1].rotation,0);assert.ok(up[0].rotation<0&&up[2].rotation>0,'over the top: turned outwards');
 assert.ok(up[0].y>up[1].y&&up[2].y>up[1].y,'the middle is highest');
 const down=C.placeOnArc(pieces,{widths,letterSpacing:0,fontSize:40,curve:-50,boxWidth:200,height:60,radius:100});
 assert.ok(down[0].y<down[1].y&&down[2].y<down[1].y,'under: the middle is lowest');
});

// What the browsers measured for one word, محمد, at 100 px (Chromium and WebKit, 2026-11-22): the joiner is exact in
// Chromium; in WebKit, in a font without one, the letters come out in another font (narrower); the tatweel's width taken
// off is exact in such a font, while a font that lengthens it beside a letter comes out wider.
const ZWJ='‍',T='ـ';
const font=({zwjOff=0,tatweelOff=0}={})=>{
 const letter={'م':60,'ح':70,'د':55};
 return s=>{
  if(s==='محمد')return 245;
  if(s===T)return 25;
  const chars=[...s],own=chars.filter(c=>letter[c]).reduce((a,c)=>a+letter[c],0);
  const joins=chars.filter(c=>c===ZWJ).length,tatweels=chars.filter(c=>c===T).length;
  return own+(joins?zwjOff:0)+tatweels*25+(tatweels?tatweelOff:0);
 };
};
test('curved Arabic: the joiner this browser draws exactly in this font is used, measured against the word drawn whole',()=>{
 const pieces=C.shapePieces('محمد');
 assert.deepEqual(pieces.map(p=>[p.joinsPrev,p.joinsNext]),[[false,true],[true,true],[true,true],[true,false]]);
 assert.deepEqual(pieces.map(p=>C.withJoiner(p,'tatweel')),['م'+T,T+'ح'+T,T+'م'+T,T+'د']);
 assert.deepEqual(pieces.map(p=>C.withJoiner(p,'zwj')),pieces.map(p=>p.draw));
 // Both exact (Chromium): the joiner, as before.
 const both=C.joinPieces(pieces,'محمد',font());
 assert.equal(both.joiner,'zwj');assert.deepEqual(both.widths,[60,70,60,55]);
 // WebKit, a font without a joiner: each joined letter measures 4 px narrow (drawn in another font) → the tatweel.
 const webkit=C.joinPieces(pieces,'محمد',font({zwjOff:-4}));
 assert.equal(webkit.joiner,'tatweel');assert.deepEqual(webkit.widths,[60,70,60,55],'the tatweels’ width is taken off');assert.equal(webkit.tatweel,25);
 // A font that lengthens the tatweel beside a letter: the joiner.
 assert.equal(C.joinPieces(pieces,'محمد',font({tatweelOff:15})).joiner,'zwj');
 // Within half a pixel is a tie: the joiner.
 assert.equal(C.joinPieces(pieces,'محمد',font({zwjOff:-0.1})).joiner,'zwj');
 // Nothing joins (Latin, or letters that join only to the right): the joiner, never measured against the line.
 const latin=C.joinPieces(C.shapePieces('GT'),'GT',s=>{if(s==='GT')throw new Error('the line was measured');return 10});
 assert.equal(latin.joiner,'zwj');assert.deepEqual(latin.widths,[10,10]);
 // Each string is measured in the direction it is drawn in (measured left to right, Chromium shapes an edge joiner apart).
 const asked=[];C.joinPieces(C.visualOrder(C.shapePieces('محمد GT')),'محمد GT',(s,rtl)=>{asked.push([s,rtl]);return 10});
 for(const [s,rtl] of asked)assert.equal(rtl,!/^[GT ]$/.test(s),`${JSON.stringify(s)} measured ${rtl?'right to left':'left to right'}`);
});
test('curved Arabic drawn with tatweels: the letter centred on its place, the tatweels cut away, a free side never cut',()=>{
 const [first,mid,,last]=C.shapePieces('محمد');
 // Right to left, [tatweel][letter][tatweel] from left to right; the letter's own width is 70, a tatweel 25.
 assert.deepEqual(C.drawTatweel(mid,70,25,1),{x:0,left:-36,right:36});
 // The first letter joins only the next (on its left): drawn 12.5 to the left, cut on the left only.
 assert.deepEqual(C.drawTatweel(first,60,25,1),{x:-12.5,left:-31,right:Infinity});
 // The last joins only the one before (on its right): drawn 12.5 to the right, a tail on its left kept.
 assert.deepEqual(C.drawTatweel(last,55,25,1),{x:12.5,left:-Infinity,right:28.5});
});
