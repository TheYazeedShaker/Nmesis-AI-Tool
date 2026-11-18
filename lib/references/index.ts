import type {ReferenceProvider} from './provider.ts';
import {unsplash} from './unsplash.ts';
import {pinterest} from './pinterest.ts';

// The photo libraries the References panel can search, in the order it offers
// them. The first is the one a search uses when it names none. Server only.
export const REFERENCE_PROVIDERS:readonly ReferenceProvider[]=[unsplash,pinterest];

/** The provider with this id, or null (ids from a request are checked here). */
export function referenceProvider(id:unknown):ReferenceProvider|null{
 return REFERENCE_PROVIDERS.find(p=>p.id===id)??null;
}
