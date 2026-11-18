'use client';
import * as React from 'react';
import type {ShellPreview,StudioPage} from '@/components/studio-topbar';
import {SideNav} from '@/components/shell/side-nav';
import {ShellPanels} from '@/components/shell/panels';
import {themeAttribute,useTheme} from '@/lib/theme';

// The frame of every Studio screen: the left navigation (Home, Projects,
// References, Brand, Uploads and the account), the side panel it opens, the
// notices and the page, in the design system, light, dark or the system's (the
// account menu's Theme). On phones the navigation is a drawer from a slim bar
// at the top. Nothing is drawn under the page: the frame is the window's
// height and the editor fills it (app/side-nav.css).
export function WorkspaceFrame({current,notices,children,bleed}:{current:StudioPage;notices?:React.ReactNode;children:React.ReactNode;/** Kept for the design-system proposals; the frame reads the account itself. */preview?:ShellPreview;/** No page padding: the editor fills the space. */bleed?:boolean}){
 const theme=useTheme();
 return <div className="ds-app ds-shell workspace studio-frame" data-theme={themeAttribute(theme)}>
  <a className="ds-skip" href="#main">Skip to content</a>
  <SideNav current={current}/>
  <ShellPanels/>
  <div className="studio-frame-page">
   {notices}
   <main id="main" className={bleed?'ds-main bleed':'ds-main'} tabIndex={-1}>{children}</main>
  </div>
 </div>;
}
