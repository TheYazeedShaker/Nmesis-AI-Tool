'use client';
import * as React from 'react';
import {usePathname} from 'next/navigation';
import type {ShellPreview,StudioPage} from '@/components/studio-topbar';
import {SideNav} from '@/components/shell/side-nav';
import {ShellPanels} from '@/components/shell/panels';
import {navigated} from '@/components/shell/shell-state';
import {toolOf} from '@/lib/shell-nav';
import {themeAttribute,useTheme} from '@/lib/theme';

// The one shell of every Studio screen: the left navigation, the one
// secondary-panel slot (References, Brand, Elements, Uploads; inside a tool's
// view only), the work area with its notices, and, on tool pages, the editor's
// settings panel on the right. Light, dark or the system's (the account
// menu's Theme). On phones the navigation is a drawer from a slim bar at the
// top. Navigating closes the secondary panel (lib/shell-nav.ts has the rules).
// Nothing is drawn under the page: the frame is the window's height and the
// editor fills it (app/side-nav.css).
export function WorkspaceFrame({current,notices,children,bleed}:{current:StudioPage;notices?:React.ReactNode;children:React.ReactNode;/** Kept for the design-system proposals; the frame reads the account itself. */preview?:ShellPreview;/** No page padding: the editor fills the space. */bleed?:boolean}){
 const theme=useTheme(),path=usePathname();
 React.useEffect(()=>{navigated(path,toolOf(current))},[path,current]);
 return <div className="ds-app ds-shell workspace studio-frame" data-theme={themeAttribute(theme)}>
  <a className="ds-skip" href="#main">Skip to content</a>
  <SideNav current={current}/>
  <ShellPanels current={current}/>
  <div className="studio-frame-page">
   {notices}
   <main id="main" className={bleed?'ds-main bleed':'ds-main'} tabIndex={-1}>{children}</main>
  </div>
 </div>;
}
