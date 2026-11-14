// Stand-in for 'next/headers' in the access tests: one cookie jar in shared state.
import {state} from './state.mjs';
export async function cookies(){
 state.cookies??=new Map();const jar=state.cookies;
 return {get:name=>jar.has(name)?{name,value:jar.get(name).value}:undefined,getAll:()=>[...jar].map(([name,c])=>({name,value:c.value})),set:(name,value,options={})=>{jar.set(name,{value,options})},delete:name=>{jar.delete(name)}};
}
export async function headers(){return new Headers()}
