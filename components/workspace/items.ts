import type {MediaItem} from '@/components/ds/media';
// One thing in the company's library, whatever made it: a key visual (and its
// line-ups and upscales), a film, a car swap or a story.
export type WorkTool='Key visual'|'Line-up'|'Film'|'Car swap'|'Story';
export type WorkItem=MediaItem&{
 tool:WorkTool;
 car?:string;
 person?:string;
 /** ISO date it was made. */
 at:string;
 folderId?:string|null;
 /** Where it opens (its tool). */
 href?:string;
 deleted?:boolean;
};
export type Folder={id:string;name:string;parentId:string|null;count:number;covers:string[]};
