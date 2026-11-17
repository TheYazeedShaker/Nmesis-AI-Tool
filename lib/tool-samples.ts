import {tidyCarText} from './car-names.ts';
import type {FeatureKey} from './accounts/plan';
// The picture a tool shows (Home's tool cards, the "needs a plan upgrade"
// page). The repository is public, so it never ships a picture of a real car:
// the sample is the company's own material, in this order —
//  1. its latest finished work made with that tool (the library feed);
//  2. else a picture of one of its cars (/api/cars/<id>/picture);
//  3. else nothing: the neutral design-system placeholder.

/** The library's names for the tools (lib/library-page.ts). */
export type SampleTool='Key visual'|'Line-up'|'Story'|'Film'|'Car swap';
export const FEATURE_TOOL:Partial<Record<FeatureKey,SampleTool>>={
 'studio.key_visuals':'Key visual','studio.lineups':'Line-up','studio.storyboards':'Story','studio.film':'Film','studio.swap':'Car swap',
 // Smart references make key visuals.
 'studio.smart_reference':'Key visual',
};
/** A piece of work: which tool made it, its thumbnail, and whether it is finished (ready, not deleted). */
export type SampleWork={tool:string;src?:string|null;finished:boolean};
export type SampleCar={name:string;picture?:string|null;brandId?:string};
export type ToolSample={from:'work'|'car'|'none';src?:string};

/** `index` spreads the cars over several tools, so Home's cards don't all show the same car. */
export function toolSample(tool:SampleTool|undefined,work:readonly SampleWork[],cars:readonly SampleCar[],index=0):ToolSample{
 const made=tool?work.find(w=>w.tool===tool&&w.finished&&!!w.src):undefined;
 if(made?.src)return {from:'work',src:made.src};
 const pictured=cars.filter(c=>!!c.picture);
 if(pictured.length)return {from:'car',src:pictured[Math.abs(index)%pictured.length].picture!};
 return {from:'none'};
}

/** Home's prompt placeholder: the brand's first car, else the first car, else a line without a car. */
export function briefPlaceholder(cars:readonly SampleCar[],brandId?:string|null){
 const car=(brandId?cars.find(c=>c.brandId===brandId):undefined)||cars[0];
 const name=tidyCarText(car?.name)?.trim();
 return name?`${name} on a coast road at dusk…`:'Your car on a coast road at dusk…';
}
