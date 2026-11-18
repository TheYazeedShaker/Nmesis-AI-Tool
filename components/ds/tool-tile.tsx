import * as React from 'react';
import Link from 'next/link';
import {Lock} from 'lucide-react';
import {Badge} from './feedback';

// One tile for a tool: its picture, its name (one line, never wrapping; the
// full name is its title when it has to be cut), one line about it, and a small
// badge. Active is a link; locked (Coming soon, or not on the plan) is the
// same size and shape, not a link, with its badge saying why. A row of tiles
// is a .ds-tools grid with equal tracks, so every tile is the same size.
export type ToolTileProps={
 name:string;line:string;art:React.ReactNode;
 /** Active: where it opens. */href?:string;
 /** Locked: why ("Coming soon", "On Pro"). */locked?:string;
 /** A plan lock shows a padlock; Coming soon does not. */soon?:boolean;
 /** What it costs, for an active tool ("From 8 credits"). */cost?:string;
};

export function ToolTile({name,line,art,href,locked,soon,cost}:ToolTileProps){
 const body=<>
  <span className="ds-tool-art-box">{art}</span>
  <span className="ds-tool-text">
   <span className="ds-tool-name" title={name}>{name}</span>
   <span className="ds-tool-line">{line}</span>
  </span>
  {(locked||cost)&&<span className="ds-tool-foot">{locked?<Badge icon={soon?undefined:<Lock aria-hidden="true"/>}>{locked}</Badge>:<Badge>{cost}</Badge>}</span>}
 </>;
 if(locked||!href)return <span className="ds-tool" data-locked="true" data-soon={soon||undefined} aria-disabled="true">{body}</span>;
 return <Link className="ds-tool" href={href}>{body}</Link>;
}
