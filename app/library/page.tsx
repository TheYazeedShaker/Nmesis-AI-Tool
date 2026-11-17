import type {Metadata} from 'next';
import {LibraryPage} from '@/components/workspace/pages';
export const metadata:Metadata={title:'Library · Nmesis Studio'};
// The one shared library: ?in=<folder|unsorted|deleted>, ?open=<kind:id>.
export default function Page(){return <LibraryPage/>}
