"use client";
import {useState} from 'react';
import {Plus,ExternalLink} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {normalizeConfiguratorUrl,type Configurator} from '@/lib/configurators';
export function ConfiguratorPicker({items,value,onSelect,onAdd,disabled}:{items:Configurator[];value:Configurator;onSelect:(v:Configurator)=>void;onAdd:(v:Configurator)=>void;disabled:boolean}){
 const [open,setOpen]=useState(false);const [name,setName]=useState('');const [url,setUrl]=useState('');const [error,setError]=useState('');
 function add(){try{
  if(!name.trim())throw new Error('Add a vehicle name so the visual uses the right model.');
  const normalized=normalizeConfiguratorUrl(url);const existing=items.find(x=>x.url===normalized);
  onAdd(existing||{id:crypto.randomUUID(),name:name.trim().slice(0,100),url:normalized});setOpen(false);setName('');setUrl('');setError('');
 }catch(e){setError((e as Error).message)}}
 return <><div className="configurator-picker"><div><label className="field-label" id="configurator-label">Your configurator</label><Select value={value.id} onValueChange={id=>{const v=items.find(x=>x.id===id);if(v)onSelect(v)}} disabled={disabled}><SelectTrigger aria-labelledby="configurator-label"><SelectValue/></SelectTrigger><SelectContent>{items.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div><button className="secondary" onClick={()=>setOpen(true)} disabled={disabled}><Plus size={16}/>Add configurator</button></div>
 <div className="configurator-address"><span>{new URL(value.url).hostname}</span><a href={value.url} target="_blank" rel="noreferrer">Open in a tab <ExternalLink size={13}/></a></div>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="capture-dialog"><DialogTitle>Add your configurator</DialogTitle><DialogDescription>Paste an interactive configurator page. Choose the angle, color and trim there, then capture the view for your key visual.</DialogDescription><form className="configurator-form" onSubmit={e=>{e.preventDefault();add()}}><label className="field-label" htmlFor="vehicle-name">Vehicle name</label><input id="vehicle-name" className="text-input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Demo SUV 12" maxLength={100} required/><label className="field-label" htmlFor="configurator-url">Configurator page URL</label><input id="configurator-url" className="text-input" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-configurator.com/model/" maxLength={2000} required/>{error&&<p className="field-error" role="alert">{error}</p>}<p className="helper">If a page does not allow embedding, open it in a separate tab and capture a screenshot. Links are remembered in this browser.</p><button className="generate" type="submit">Add & open configurator</button></form></DialogContent></Dialog></>;
}
