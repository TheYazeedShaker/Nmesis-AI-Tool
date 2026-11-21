'use client';
import * as React from 'react';
import {Button} from '@/components/ds/button';
import {Dialog} from '@/components/ds/dialog';

// Every key the editor knows (docs/editor-rules.md, rule 10), opened with "?"
// on the canvas or the Shortcuts button under it. Each control also names its
// key in its tooltip.

type Row=[keys:string,what:string];
const groups=(mod:string):{title:string;rows:Row[]}[]=>[
 {title:'Selecting',rows:[['Click','Select a layer (a layer in a group selects the group)'],['Shift+click','Add a layer to the selection, or take it out'],[`${mod}A`,'Select everything on the page'],['Esc','Select nothing']]},
 {title:'Moving',rows:[['Drag','Move, snapping to the page, other layers and even spacing'],[`Hold ${mod.replace('+','')} while dragging`,'Move without snapping'],['Arrow keys','Nudge by 1 px'],['Shift+arrow keys','Nudge by 10 px'],['Alt+drag','Leave a copy where it was']]},
 {title:'Layers',rows:[[`${mod}D`,'Duplicate'],[`${mod}G`,'Group'],[`${mod}Shift+G`,'Ungroup'],[`${mod}]`,'Forward one place'],[`${mod}[`,'Backward one place'],[`${mod}Shift+]`,'To the front'],[`${mod}Shift+[`,'To the back'],['Delete','Delete']]},
 {title:'Text',rows:[['T','Add a heading'],['Enter or double-click','Type in the selected text'],['Esc','Finish typing']]},
 {title:'History',rows:[[`${mod}Z`,'Undo'],[`${mod}Shift+Z`,'Redo'],['?','This list']]},
 {title:'In the Layers list',rows:[['Up and Down','Move between layers'],['Enter or Space','Select one'],['Shift+Up or Down','Add the next one'],[`${mod}Space`,'Add or take out one'],['Alt+Up or Down','Move it one place'],['F2','Rename']]},
];

export function ShortcutsDialog({open,mod,onClose}:{open:boolean;mod:string;onClose:()=>void}){
 return <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" wide footer={<Button kind="primary" onClick={onClose}>Done</Button>}>
  <div className="canvas-shortcuts">
   {groups(mod).map(g=><section key={g.title} className="canvas-shortcuts-group" aria-labelledby={'keys-'+g.title.replace(/\W+/g,'-')}>
    <h3 className="ds-inspector-title" id={'keys-'+g.title.replace(/\W+/g,'-')}>{g.title}</h3>
    <dl className="canvas-shortcuts-list">{g.rows.map(([keys,what])=><div key={keys} className="canvas-shortcut"><dt><kbd>{keys}</kbd></dt><dd>{what}</dd></div>)}</dl>
   </section>)}
  </div>
 </Dialog>;
}
