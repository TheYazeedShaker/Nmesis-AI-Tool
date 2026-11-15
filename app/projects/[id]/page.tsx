import type {Metadata} from 'next';
import {FolderPage} from '@/components/workspace/pages';
export const metadata:Metadata={title:'Folder · Nmesis Studio'};
export default async function Page({params}:{params:Promise<{id:string}>}){return <FolderPage id={(await params).id}/>}
