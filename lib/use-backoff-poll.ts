'use client';
import {useEffect,useRef} from 'react';
// Checks on work in progress, slowing down while nothing changes (F-061): the
// first check after `base`, then each wait 1.6× longer up to `max`, back to
// `base` as soon as something changed. Nothing while the tab is hidden; one
// check as soon as it is shown again. One check at a time. Only while
// `enabled` (there is something to wait for).
export type PollResult='changed'|'same'|'idle';
export const nextDelay=(delay:number,result:PollResult,base:number,max:number)=>result==='changed'?base:Math.min(max,Math.round(delay*1.6));
export function useBackoffPoll(tick:()=>Promise<PollResult>,{base,max=base*5,enabled=true}:{base:number;max?:number;enabled?:boolean}){
 const latest=useRef(tick);
 useEffect(()=>{latest.current=tick});
 useEffect(()=>{
  if(!enabled)return;
  let delay=base,live=true,running=false,timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=(ms:number)=>{clearTimeout(timer);timer=setTimeout(()=>void run(),ms)};
  async function run(){
   if(!live||document.hidden)return;
   if(running){schedule(delay);return}
   running=true;let result:PollResult='same';
   try{result=await latest.current()}catch{result='same'}finally{running=false}
   if(!live||result==='idle')return;
   delay=nextDelay(delay,result,base,max);schedule(delay);
  }
  const shown=()=>{if(!document.hidden){delay=base;schedule(0)}};
  document.addEventListener('visibilitychange',shown);
  schedule(base);
  return()=>{live=false;clearTimeout(timer);document.removeEventListener('visibilitychange',shown)};
 },[base,max,enabled]);
}
