// Autosave for the canvas editor: the working draft of the design, kept about
// two seconds after the last change (PUT /api/edits/<picture>/draft). It never
// makes a version: Save does that, and never overwrites the picture.
//
// What the canvas bar says, always (docs/editor-rules.md, rule 9):
//   saving   "Saving…"                a change waits for its two seconds, or is on its way
//   saved    "Saved"                  the draft holds the latest change
//   offline  "Offline, changes kept"  no connection: the change is kept on this device
//                                     and sent when the connection is back
//   error    "Couldn't save, retry"   the Studio refused or failed; Retry sends it again
//
// Every change is also written to this device first (`keep`), so a closed tab,
// a crash or a lost connection loses nothing; it is cleared once the Studio
// holds that change. One request at a time, in order: a change made while one
// is on its way is sent after it. Timers, the connection and the storage are
// passed in, so the tests drive time and the network themselves.
//
// Leaving (the tab is hidden or closed, a reload, another site): leave() sends
// the latest change at once, without waiting for its two seconds, as the page's
// last request (`leaving`: made so it outlives the page, keepalive, when it fits
// the browser's limit for those). It stays on this device until the Studio is
// known to hold it, so whatever didn't arrive comes back the next time the
// design opens here ("Restored your unsaved changes.") and is sent then. Which
// copy is newer, this device's or the Studio's, is told by the editing session
// that wrote each and its change count (whichCopy), not by two clocks.

export type SaveStatus='saving'|'saved'|'offline'|'error';
export const SAVE_WORDS:Record<SaveStatus,string>={saving:'Saving…',saved:'Saved',offline:'Offline, changes kept',error:'Couldn’t save, retry'};
export const AUTOSAVE_DELAY=2000;

/** A failed send: `offline` when the request never reached the Studio (no connection, timed out). */
export class SendError extends Error{offline:boolean;constructor(message:string,offline:boolean){super(message);this.offline=offline}}

/** `session`: the editing session that made the change (one per opened design); with `rev`, it orders two copies of it. */
export type Kept<T>={doc:T;rev:number;at:number;session?:string};
export type AutosaveDeps<T>={
 /** `leaving`: the page is going (leave()): the request must outlive it. */
 send:(doc:T,rev:number,leaving:boolean)=>Promise<void>;
 keep:{read():Kept<T>|null;write(v:Kept<T>):boolean;clear():void};
 online:()=>boolean;
 setTimer:(fn:()=>void,ms:number)=>unknown;
 clearTimer:(t:unknown)=>void;
 onStatus:(s:SaveStatus,detail?:string)=>void;
 now?:()=>number;
 delay?:number;
 /** This editing session, kept with each change on this device. */
 session?:string;
};

/** The browser carries at most 64 KiB in all the requests that outlive a page together (keepalive): this leaves
 *  room for the others leaving with it (presence, a removal waiting for its Undo). A larger draft is sent as usual. */
export const KEEPALIVE_MAX_BYTES=60_000;
export const fitsKeepalive=(body:string)=>new TextEncoder().encode(body).length<=KEEPALIVE_MAX_BYTES;

/** The Studio's draft, as far as choosing between it and this device's copy goes. */
export type HeldDraft={at:number;rev:number;session?:string};
/** Which copy a design opens with: this device's (not known to be on the Studio), the Studio's while the device's
 *  is already held there (`held`: the copy can go), or the Studio's. The same session wrote both: its change count
 *  says which is newer, whatever the two clocks say. Otherwise (another tab or device, or a copy kept before
 *  sessions were): the later of the two. */
export function whichCopy(kept:Kept<unknown>|null,server:HeldDraft|null):'device'|'held'|'studio'{
 if(!kept)return 'studio';
 if(!server)return 'device';
 if(kept.session&&kept.session===server.session)return kept.rev>server.rev?'device':'held';
 return !server.at||kept.at>server.at?'device':'studio';
}

export class Autosave<T>{
 private latest:Kept<T>|null=null;
 private sentRev=-1;
 private timer:unknown=null;
 private inFlight:Promise<void>|null=null;
 /** The latest change leave() has sent: hidden, then closed, sends it once. */
 private leftRev=-1;
 private stopped=false;
 status:SaveStatus='saved';
 private deps:AutosaveDeps<T>;
 constructor(deps:AutosaveDeps<T>,startRev=0){this.deps=deps;this.sentRev=startRev}
 private set(s:SaveStatus,detail?:string){if(this.status===s&&!detail)return;this.status=s;this.deps.onStatus(s,detail)}
 /** A change: kept on this device now, sent after the delay (a newer change restarts it). */
 change(doc:T,rev:number){
  if(this.stopped)return;
  this.latest={doc,rev,at:(this.deps.now||Date.now)(),...(this.deps.session?{session:this.deps.session}:{})};
  const kept=this.deps.keep.write(this.latest);
  if(!this.deps.online()){this.set(kept?'offline':'error',kept?undefined:'This device could not keep the change.');return}
  this.set('saving');this.schedule();
 }
 private schedule(){if(this.timer!==null)this.deps.clearTimer(this.timer);this.timer=this.deps.setTimer(()=>{this.timer=null;void this.flush()},this.deps.delay??AUTOSAVE_DELAY)}
 /** Sends the latest change now, after any on its way (the delay ran out, Retry, the connection came back, before a duplicate or a switch). */
 async flush():Promise<void>{
  if(this.inFlight){await this.inFlight;if(this.latest&&this.latest.rev>this.sentRev)return this.flush();return}
  const job=this.latest;if(!job||job.rev<=this.sentRev){if(!this.stopped&&this.status!=='offline')this.set('saved');return}
  if(this.timer!==null){this.deps.clearTimer(this.timer);this.timer=null}
  if(!this.deps.online()){this.set('offline');return}
  return this.run(job,false);
 }
 /** Leaving: the latest change goes now (see the top of this file). An earlier one still on its way doesn't hold it
  *  back, since the page may not live to send it after: it goes beside it as a spare, which doesn't count as held
  *  (the two may arrive in either order). If the page lives on, it is sent again once that one is back; if not,
  *  it is on this device, and the next opening compares the two. */
 leave(){
  const job=this.latest;
  if(!job||job.rev<=this.sentRev||job.rev<=this.leftRev||!this.deps.online())return;
  this.leftRev=job.rev;
  if(this.inFlight){void this.deps.send(job.doc,job.rev,true).catch(e=>console.warn('[editor] the last change did not go with the page; it is kept on this device',{reason:e instanceof Error?e.name:'unknown'}));return}
  if(this.timer!==null){this.deps.clearTimer(this.timer);this.timer=null}
  void this.run(job,true);
 }
 private async run(job:Kept<T>,leaving:boolean){
  this.set('saving');
  this.inFlight=(async()=>{
   try{
    await this.deps.send(job.doc,job.rev,leaving);
    this.sentRev=Math.max(this.sentRev,job.rev);
    if(this.latest&&this.latest.rev<=this.sentRev){this.deps.keep.clear();this.set('saved')}
   }catch(e){
    const offline=(e instanceof SendError&&e.offline)||!this.deps.online();
    this.set(offline?'offline':'error',e instanceof Error?e.message:undefined);
   }
  })();
  try{await this.inFlight}finally{this.inFlight=null}
  // A change made while that one was on its way.
  if(!this.stopped&&this.pending&&this.status==='saving')this.schedule();
 }
 /** The connection is back: what was kept goes now. */
 reconnect(){if(this.latest&&this.latest.rev>this.sentRev)void this.flush()}
 retry(){return this.flush()}
 /** Changes not yet held by the Studio. */
 get pending(){return !!this.latest&&this.latest.rev>this.sentRev}
 /** The latest change while the Studio doesn't hold it yet. */
 waiting():Kept<T>|null{return this.pending?this.latest:null}
 stop(){this.stopped=true;if(this.timer!==null)this.deps.clearTimer(this.timer);this.timer=null}
}

/** This device's copy of a design's unsent changes (localStorage), by picture. Never throws: false when it could not keep it. */
export function deviceKeep<T>(key:string,storage:()=>Storage|null=()=>{try{return window.localStorage}catch{return null}}):AutosaveDeps<T>['keep']{
 const k='nmesis.editor.draft.'+key;
 return {
  read(){try{const raw=storage()?.getItem(k);return raw?JSON.parse(raw) as Kept<T>:null}catch(e){console.warn('[editor] the copy on this device could not be read',{reason:e instanceof Error?e.name:'unknown'});return null}},
  write(v){try{const s=storage();if(!s)return false;s.setItem(k,JSON.stringify(v));return true}catch(e){console.warn('[editor] this device could not keep the change',{reason:e instanceof Error?e.name:'unknown'});return false}},
  clear(){try{storage()?.removeItem(k)}catch(e){console.warn('[editor] the copy on this device could not be cleared',{reason:e instanceof Error?e.name:'unknown'})}},
 };
}
