import * as React from 'react';
import Link from 'next/link';
import {PenLine} from 'lucide-react';
import {VISUAL_ID,type WorkKind} from '@/lib/work-ref';

/** The canvas editor's address for a piece of work, from its kind and its own id (never the library's
 *  "visual:<id>" key). The only place that builds it (tests/library-edit.test.mjs fails on any other).
 *  Only a visual, a key visual or a line-up, opens in the editor: any other kind, or an id that is not
 *  one, has no address, so nothing offers to edit it. */
export function editorHref(kind:WorkKind,id:string):string|null{
 return kind==='visual'&&VISUAL_ID.test(id)?'/editor?visual='+encodeURIComponent(id):null;
}

// A finished result, clickable: it opens the picture in the canvas editor
// (components/canvas/editor-page.tsx). One wrapper for every tool's result
// (Key visual, Car lineup), with a visible "Edit" hint on hover and focus.
export function OpenInEditor({visualId,title,children}:{visualId:string;title:string;children:React.ReactNode}){
 const href=editorHref('visual',visualId);
 if(!href)return <>{children}</>;
 return <Link className="editor-result-open" href={href} aria-label={`Edit ${title} in the editor`} title="Edit in the editor">
  {children}
  <span className="editor-result-hint" aria-hidden="true"><PenLine/>Edit</span>
 </Link>;
}
