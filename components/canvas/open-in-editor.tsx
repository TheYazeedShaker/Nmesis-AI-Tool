import * as React from 'react';
import Link from 'next/link';
import {PenLine} from 'lucide-react';

/** The canvas editor's address for a saved picture. */
export const editorHref=(visualId:string)=>'/editor?visual='+encodeURIComponent(visualId);

// A finished result, clickable: it opens the picture in the canvas editor
// (components/canvas/editor-page.tsx). One wrapper for every tool's result
// (Key visual, Car lineup), with a visible "Edit" hint on hover and focus.
export function OpenInEditor({visualId,title,children}:{visualId:string;title:string;children:React.ReactNode}){
 return <Link className="editor-result-open" href={editorHref(visualId)} aria-label={`Edit ${title} in the editor`} title="Edit in the editor">
  {children}
  <span className="editor-result-hint" aria-hidden="true"><PenLine/>Edit</span>
 </Link>;
}
