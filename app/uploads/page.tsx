import type {Metadata} from 'next';
import {UploadsPage} from '@/components/shell/uploads-page';
export const metadata:Metadata={title:'Uploads · Nmesis Studio'};
export default function Page(){return <UploadsPage/>}
