'use client';
import * as React from 'react';
import type {FeatureKey} from '@/lib/accounts/plan';
import type {LibraryPage} from '@/lib/library-page';
import {isDemoConfigurator,useConfiguratorPresets} from '@/lib/configurator-presets';
import {FEATURE_TOOL,toolSample,type SampleWork,type ToolSample} from '@/lib/tool-samples';
import {toWork} from './data';
import type {WorkItem} from './items';

// The library's work as samples (lib/tool-samples.ts): finished means it has a
// picture, is not deleted, and is neither in progress nor failed (data.ts toWork).
export const asSamples=(items:readonly WorkItem[]):SampleWork[]=>items.map(i=>({tool:i.tool,src:i.src,finished:!!i.src&&!i.deleted&&i.status?.kind!=='info'&&i.status?.kind!=='bad'}));

// One tool's sample, for a page about that tool (the plan-upgrade page): the
// company's latest few pieces of that tool's work (one small library page),
// else one of its cars. While it loads, and if it fails, the box keeps its
// shape with the placeholder.
export function useToolSample(feature:FeatureKey):ToolSample{
 const tool=FEATURE_TOOL[feature];
 const cars=useConfiguratorPresets().filter(c=>!isDemoConfigurator(c));
 const [work,setWork]=React.useState<SampleWork[]>([]);
 React.useEffect(()=>{
  if(!tool)return;
  let live=true;
  const p=new URLSearchParams({in:'all',tool,limit:'6',sort:'new'});
  fetch('/api/library?'+p,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15_000)})
   .then(async r=>{if(!r.ok)throw new Error('The library answered '+r.status);return await r.json() as LibraryPage})
   .then(page=>{if(live)setWork(asSamples(page.items.map(toWork)))})
   // A sample is decoration: without the library the page shows a car or the placeholder.
   .catch((e:unknown)=>console.warn('No sample from the library for this tool.',e instanceof Error?e.message:e));
  return ()=>{live=false};
 },[tool]);
 return toolSample(tool,work,cars);
}
