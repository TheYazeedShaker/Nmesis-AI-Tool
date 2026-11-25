import type {ReferenceProvider} from './provider.ts';
import {unsplash} from './unsplash.ts';
import {pixabay} from './pixabay.ts';
import {pinterest} from './pinterest.ts';

// The photo libraries the References panel can search, in the order it offers
// them. The first is the one a search uses when it names none. Server only.
// A library is one file implementing ReferenceProvider (./provider.ts) and one
// entry here; nothing else changes to add one.
export const REFERENCE_PROVIDERS:readonly ReferenceProvider[]=[unsplash,pixabay,pinterest];

/** The libraries the editor's Photos panel searches together (every one of them that is switched on).
 *  Pinterest has no search the Studio may use, so it is not one of them. */
export const PHOTO_LIBRARIES:readonly ReferenceProvider[]=REFERENCE_PROVIDERS.filter(p=>p.id!=='pinterest');

/** The provider with this id, or null (ids from a request are checked here). */
export function referenceProvider(id:unknown):ReferenceProvider|null{
 return REFERENCE_PROVIDERS.find(p=>p.id===id)??null;
}
