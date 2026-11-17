import {DEMO_CONFIGURATOR} from './configurators.ts';
// Story's one car control (design/finish-pass): with one of the company's
// configurator cars chosen, the car picker is the only car control and the
// story's `vehicle` (the name the planner and every image prompt use) is that
// car's name. Without one (no cars yet, or a story saved on a car that is no
// longer listed), the free-text "Car / trim" field stays.

type Car={id?:string;name:string;url:string};

/** The story's configurator is one of the company's cars (not the demo placeholder). */
export function isCompanyCar(cars:readonly Car[],url:string|undefined){
 return !!url&&url!==DEMO_CONFIGURATOR.url&&cars.some(c=>c.url===url&&c.id!==DEMO_CONFIGURATOR.id);
}

/** The vehicle to save: the chosen car's name, until the shots are planned (a
 *  changed vehicle then resets the story's images, lib/storyboards.ts), and
 *  whatever was typed when there is no company car. */
export function boardVehicle(board:{vehicle:string;configurator:string;shots:readonly unknown[]},cars:readonly Car[]){
 if(board.shots.length||!isCompanyCar(cars,board.configurator))return board.vehicle;
 return cars.find(c=>c.url===board.configurator)?.name||board.vehicle;
}
