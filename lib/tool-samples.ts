import {tidyCarText} from './car-names.ts';
import type {FeatureKey} from './accounts/plan';
// The picture a tool shows (Home's tool cards, the "needs a plan upgrade"
// page): one fixed picture per tool, always. It never follows the company's
// latest work (a new generation or edit used to replace Key visual's picture
// on Home); recent work belongs in the library and Home's Recent work list.
// The repository is public, so it never ships a picture of a real car: the
// picture is one of the company's cars (/api/cars/<id>/picture), the same one
// for a tool every time (its fixed place, TOOL_SLOT), else the neutral
// design-system placeholder. Car lineup draws several cars (Home's LineupArt).

/** The library's names for the tools (lib/library-page.ts). */
export type SampleTool='Key visual'|'Line-up'|'Story'|'Film'|'Car swap';
export const FEATURE_TOOL:Partial<Record<FeatureKey,SampleTool>>={
 'studio.key_visuals':'Key visual','studio.lineups':'Line-up','studio.storyboards':'Story','studio.film':'Film','studio.swap':'Car swap',
 // Smart references make key visuals.
 'studio.smart_reference':'Key visual',
};
export type SampleCar={name:string;picture?:string|null;brandId?:string};
export type ToolSample={from:'car'|'none';src?:string};
/** Each tool's fixed place among the company's cars, so the cards don't all show the same car and a
 *  tool's picture never depends on the order of Home's row. */
export const TOOL_SLOT:Record<SampleTool,number>={'Key visual':0,'Line-up':1,'Story':2,'Film':3,'Car swap':4};

/** A tool's one picture: the company's car in the tool's fixed place, else none (the placeholder). */
export function toolSample(tool:SampleTool|undefined,cars:readonly SampleCar[]):ToolSample{
 const pictured=cars.filter(c=>!!c.picture);
 if(!tool||!pictured.length)return {from:'none'};
 return {from:'car',src:pictured[TOOL_SLOT[tool]%pictured.length].picture!};
}

/** Home's prompt placeholder: the brand's first car, else the first car, else a line without a car. */
export function briefPlaceholder(cars:readonly SampleCar[],brandId?:string|null){
 const car=(brandId?cars.find(c=>c.brandId===brandId):undefined)||cars[0];
 const name=tidyCarText(car?.name)?.trim();
 return name?`${name} on a coast road at dusk…`:'Your car on a coast road at dusk…';
}
