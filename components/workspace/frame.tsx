'use client';
import * as React from 'react';
import {FolderOpen,Home,LayoutGrid,Shapes} from 'lucide-react';
import {PhoneNav,type NavItem} from '@/components/ds/shell';
import {StudioTopBar,type ShellPreview,type StudioPage} from '@/components/studio-topbar';

// The frame of the rebuilt screens (Phase 3): the one top bar, the notices,
// the page and, below 768px, the wireframe's bottom bar (Home · Library ·
// Projects · Tools), in the design system and following the system's light or
// dark. The tool screens keep their own dark frame until group 2 rebuilds them.
const places=(current:StudioPage):NavItem[]=>[
 {href:'/',label:'Home',icon:<Home/>,current:current==='home'},
 {href:'/library',label:'Library',icon:<LayoutGrid/>,current:current==='library'},
 {href:'/projects',label:'Projects',icon:<FolderOpen/>,current:current==='projects'},
 {href:'/#tools',label:'Tools',icon:<Shapes/>},
];
export function WorkspaceFrame({current,notices,children,preview}:{current:StudioPage;notices?:React.ReactNode;children:React.ReactNode;preview?:ShellPreview}){
 return <div className="ds-app ds-shell workspace">
  <a className="ds-skip" href="#main">Skip to content</a>
  <StudioTopBar current={current} theme="system" preview={preview}/>
  {notices}
  <main id="main" className="ds-main" tabIndex={-1}>{children}</main>
  <PhoneNav nav={places(current)}/>
 </div>;
}
