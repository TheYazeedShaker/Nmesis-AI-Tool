// The words and paths for delete and restore (browser-safe; lib/trash.ts is the
// server side).
export type TrashKind='films'|'swaps'|'storyboards';
export const TRASH_WORDS:Record<TrashKind,{one:string;many:string;path:string}>={
 films:{one:'film',many:'films',path:'films'},
 swaps:{one:'swap',many:'swaps',path:'swaps'},
 storyboards:{one:'story',many:'stories',path:'storyboards'},
};
