'use client';
import * as React from 'react';
import {StudioTopBar,type ShellPreview,type StudioPage} from '@/components/studio-topbar';

// The frame of the rebuilt screens (Phase 3): the one top bar, the notices and
// the page, in the design system and following the system's light or dark. On
// phones the top bar's menu holds Home, Library, Projects and the tools (a
// bottom bar would cover the work at the bottom of the screen). The tool
// screens keep their own dark frame until group 2 rebuilds them.
export function WorkspaceFrame({current,notices,children,preview}:{current:StudioPage;notices?:React.ReactNode;children:React.ReactNode;preview?:ShellPreview}){
 return <div className="ds-app ds-shell workspace">
  <a className="ds-skip" href="#main">Skip to content</a>
  <StudioTopBar current={current} theme="system" preview={preview}/>
  {notices}
  <main id="main" className="ds-main" tabIndex={-1}>{children}</main>
 </div>;
}
