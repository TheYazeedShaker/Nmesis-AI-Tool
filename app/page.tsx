import type {Metadata} from 'next';
import {HomePage} from '@/components/workspace/pages';
export const metadata:Metadata={title:'Home · Nmesis Studio'};
// Home (Phase 3 group 1): what to make, the tools, recent work, the company's cars.
// The key-visual tool is at /key-visual.
export default function Page(){return <HomePage/>}
