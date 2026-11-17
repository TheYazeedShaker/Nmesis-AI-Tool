import type {Metadata} from 'next';
import {FolderPage} from '@/components/workspace/pages';
import {getStudioContext} from '@/lib/studio-context';
import {getDatabase} from '@/lib/portable/database';
import {validId} from '@/lib/studio-server';
type Params={params:Promise<{id:string}>};
// "<folder name> · Nmesis Studio": the name is read as the signed-in person, from
// their own company's folders (row level security), and never guessed. Anything
// that cannot be read (signed out, another company's folder, folders not
// switched on yet) is simply "Folder".
async function folderName(id:string):Promise<string|null>{
 if(!validId(id))return null;
 const got=await getStudioContext();
 if(!got.ok)return null;
 const db=getDatabase()?.forUser(got.ctx.user.id);
 if(!db)return null;
 try{
  const row=await db.prepare('SELECT name FROM folders WHERE id=? AND org_id=? AND deleted_at IS NULL').bind(id,got.ctx.org.id).first<{name:unknown}>();
  return row&&typeof row.name==='string'&&row.name.trim()?row.name.trim().slice(0,80):null;
 }catch(e){console.warn('Folder title not read',e instanceof Error?e.name:'UnknownError');return null}
}
export async function generateMetadata({params}:Params):Promise<Metadata>{
 const name=await folderName((await params).id).catch((e:unknown)=>{console.warn('Folder title not read',e instanceof Error?e.name:'UnknownError');return null});
 return {title:`${name||'Folder'} · Nmesis Studio`};
}
export default async function Page({params}:Params){return <FolderPage id={(await params).id}/>}
