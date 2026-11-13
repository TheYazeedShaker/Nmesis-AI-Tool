"use client";
import {ExternalLink} from 'lucide-react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import type {Configurator} from '@/lib/configurators';
// The company's configurators come from Nmesis (the master list); clients pick, never add.
export function ConfiguratorPicker({items,value,onSelect,disabled}:{items:Configurator[];value:Configurator;onSelect:(v:Configurator)=>void;disabled:boolean}){
 return <><div className="configurator-picker"><div><label className="field-label" id="configurator-label">Your configurator</label><Select value={value.id} onValueChange={id=>{const v=items.find(x=>x.id===id);if(v)onSelect(v)}} disabled={disabled}><SelectTrigger aria-labelledby="configurator-label"><SelectValue/></SelectTrigger><SelectContent>{items.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div></div>
 <div className="configurator-address"><span>{new URL(value.url).hostname}</span><a href={value.url} target="_blank" rel="noreferrer">Open in a tab <ExternalLink size={13}/></a></div></>;
}
