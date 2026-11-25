// Reference photos from an outside photo library, for the References panel.
// Each library is a provider: it says whether it is set up, searches, and hands
// over one photo's bytes when somebody uses it (which is when the library's
// rules may ask to be told). Server only: keys come from the environment and
// never reach a browser; a browser sees ReferencePhoto and nothing else.
// The registry (the providers, in the order the panel offers them) is index.ts;
// the owner's set-up steps are in docs/references.md.
//
// Plain fields and relative .ts imports: tests load these files under Node's
// strip-only TypeScript mode.

export type ProviderId='unsplash'|'pixabay'|'pinterest';
export type ReferenceEnv=Record<string,string|undefined>;

/** Shown with the photo wherever it appears: "Photo by <name> on <source>", both linked.
 *  `page` is the photo's own page on the library (kept with a picture placed on a design). */
export type ReferenceCredit={name:string;href:string;source:string;sourceHref:string;page?:string};

export type ReferencePhoto={
 id:string;provider:ProviderId;
 /** A small picture for the grid, hotlinked from the library's own image host. */thumb:string;
 /** The display-size picture, hotlinked the same way. */src:string;
 width:number;height:number;
 /** The library's description of the photo; may be empty. */alt:string;
 credit:ReferenceCredit;
};

export type SearchQuery={query:string;page:number;perPage:number};
export type SearchPage={photos:ReferencePhoto[];nextPage:number|null;
 /** A plain sentence when the library has nothing to say about this search on purpose (a provider that is off). */notice?:string};
/** Search answers kept for every server of one Studio (the route keeps them in the Studio's own storage), for a
 *  library whose rules ask for answers to be kept (Pixabay: 24 hours). A failure to read or write is a miss. */
export type SearchCache={get(key:string):Promise<unknown>;set(key:string,value:unknown):Promise<void>};
/** What a call may bring: the request's own signal (the person left), the environment, a fetch and a clock (tests), and the shared cache. */
export type ProviderCall={signal?:AbortSignal;env?:ReferenceEnv;fetch?:typeof fetch;now?:()=>number;cache?:SearchCache};
export type PhotoForUse={bytes:Uint8Array;type:string;photo:ReferencePhoto};

export interface ReferenceProvider{
 id:ProviderId;
 label:string;
 /** What the panel and the routes say while available() is false. */
 unavailable:string;
 available(env?:ReferenceEnv):boolean;
 search(query:SearchQuery,call?:ProviderCall):Promise<SearchPage>;
 /** The photo's bytes for the Studio's own storage; tells the library it was used. */
 fetchForUse(id:string,call?:ProviderCall):Promise<PhotoForUse>;
}

/** A failure the person can read, with the HTTP status the route answers. */
export class ReferenceProviderError extends Error{
 status:number;
 constructor(message:string,status=502){super(message);this.status=status;this.name='ReferenceProviderError'}
}

/** A photo id as the providers use them (letters, digits, - and _). */
export const PHOTO_ID=/^[A-Za-z0-9_-]{1,64}$/;
export const MAX_PAGE=50;
