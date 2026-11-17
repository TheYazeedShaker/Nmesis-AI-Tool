'use client';
import * as React from 'react';
import {cn} from '@/lib/utils';
// Two or three choices that look like tabs but have no tab panels (for example
// "Captured view · Live configurator", which changes the panel below): a radio
// group, so assistive technology hears a choice rather than tabs pointing at
// panels that do not exist (axe aria-valid-attr-value, critical; F-025).
// The look is the shadcn TabsList / TabsTrigger one (components/ui/tabs.tsx),
// with the same data-slot / data-state hooks the Studio's styles use.
// ←/→ (and ↑/↓) move the choice; Home / End jump.
const LIST='group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-0.75 text-muted-foreground h-9 bg-muted';
const ITEM='relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm data-[state=active]:bg-background data-[state=active]:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground';
export type Choice<T extends string>={value:T;label:React.ReactNode;disabled?:boolean};
export function ChoiceTabs<T extends string>({value,onValueChange,choices,label,className}:{value:T;onValueChange:(v:T)=>void;choices:Choice<T>[];label:string;className?:string}){
 const refs=React.useRef<(HTMLButtonElement|null)[]>([]);
 const enabled=choices.map((c,i)=>c.disabled?-1:i).filter(i=>i>=0);
 const move=(to:number)=>{const c=choices[to];if(!c||c.disabled)return;onValueChange(c.value);refs.current[to]?.focus()};
 function onKeyDown(e:React.KeyboardEvent){
  const at=choices.findIndex(c=>c.value===value),pos=enabled.indexOf(at);
  const next=e.key==='ArrowRight'||e.key==='ArrowDown'?enabled[(pos+1)%enabled.length]:e.key==='ArrowLeft'||e.key==='ArrowUp'?enabled[(pos-1+enabled.length)%enabled.length]:e.key==='Home'?enabled[0]:e.key==='End'?enabled[enabled.length-1]:undefined;
  if(next!==undefined){e.preventDefault();move(next)}
 }
 return <div data-slot="tabs" data-orientation="horizontal" className={cn('group/tabs flex gap-2 flex-col',className)}>
  <div role="radiogroup" aria-label={label} data-slot="tabs-list" data-variant="default" className={LIST} onKeyDown={onKeyDown}>
   {choices.map((c,i)=>{const on=c.value===value;return <button key={c.value} ref={el=>{refs.current[i]=el}} type="button" role="radio" aria-checked={on} tabIndex={on?0:-1} disabled={c.disabled} data-slot="tabs-trigger" data-state={on?'active':'inactive'} className={ITEM} onClick={()=>onValueChange(c.value)}>{c.label}</button>})}
  </div>
 </div>;
}
