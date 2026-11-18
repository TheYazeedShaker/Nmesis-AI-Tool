'use client';
import {useSyncExternalStore} from 'react';
// Light, dark or the system's: the person's choice in the account menu, kept in
// this browser (localStorage). The Studio's frame sets data-theme from it; with
// "system" it sets nothing and the tokens follow the system (app/tokens.css).
export type ThemeChoice='light'|'dark'|'system';
export const THEME_CHOICES:{id:ThemeChoice;label:string}[]=[{id:'light',label:'Light'},{id:'dark',label:'Dark'},{id:'system',label:'System'}];
const KEY='studio-theme';
const listeners=new Set<()=>void>();
function read():ThemeChoice{try{const v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:'system'}catch{return 'system'}}
export function setTheme(choice:ThemeChoice){
 try{if(choice==='system')localStorage.removeItem(KEY);else localStorage.setItem(KEY,choice)}catch{/* private mode: the choice lasts for this page */}
 current=choice;for(const l of listeners)l();
}
let current:ThemeChoice|null=null;
const snapshot=()=>current??=read();
export function useTheme():ThemeChoice{
 return useSyncExternalStore(l=>{listeners.add(l);const storage=(e:StorageEvent)=>{if(e.key===KEY){current=read();l()}};window.addEventListener('storage',storage);return()=>{listeners.delete(l);window.removeEventListener('storage',storage)}},snapshot,()=>'system');
}
/** data-theme for the frame: none for "system". */
export const themeAttribute=(t:ThemeChoice)=>t==='system'?undefined:t;
