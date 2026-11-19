import type {Metadata} from 'next';
import {Suspense} from 'react';
import {EditorPage} from '@/components/canvas/editor-page';
export const metadata:Metadata={title:'Editor · Nmesis Studio'};
// The canvas editor for a saved picture (/editor?visual=<id>); the page reads its address on the client.
export default function Page(){return <Suspense><EditorPage/></Suspense>}
