'use client';
import * as React from 'react';
import {createPortal} from 'react-dom';
import {themeAttribute,useTheme} from '@/lib/theme';

// A layer over the page: menus and non-modal drawers render here, in a portal at
// the end of <body>, so no panel's own stacking (a sticky column with its own
// z-index) can hold them under another panel. The host carries the Studio's
// theme scope (.ds-app with data-theme) so tokens resolve as on the page; its
// children place themselves (position: fixed) at a layer from the z-index
// scale in app/tokens.css (--ds-z-dropdown for menus, --ds-z-drawer for drawers).
// Native modal dialogs (components/ds/dialog.tsx) need none: they open in the
// browser's top layer.

const subscribe=()=>()=>{};
/** True once mounted in the browser (a portal needs document.body). */
export function useMounted(){return React.useSyncExternalStore(subscribe,()=>true,()=>false)}

export function Layer({children}:{children:React.ReactNode}){
 const theme=useTheme(),mounted=useMounted();
 if(!mounted)return null;
 return createPortal(<div className="ds-app ds-layer" data-theme={themeAttribute(theme)}>{children}</div>,document.body);
}

/** Where a menu opens next to its button: above it, aligned to its left edge, kept inside the window. */
export function anchorAbove(button:HTMLElement|null,gap=8):React.CSSProperties{
 if(!button)return {};
 const r=button.getBoundingClientRect();
 return {left:Math.max(gap,r.left),bottom:Math.max(gap,window.innerHeight-r.top+gap)};
}
