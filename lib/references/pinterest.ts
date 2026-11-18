import type {ReferenceEnv,ReferenceProvider,SearchPage} from './provider.ts';
import {ReferenceProviderError} from './provider.ts';

// Pinterest as a photo library for the References panel: OFF. It makes no
// request of any kind, and nothing here reads Pinterest's web pages (no
// scraping, anywhere). The pin-link import (lib/pinterest.ts) is separate.
//
// TODO(references): turn this on only with official access. Pinterest's API
// (v5, api.pinterest.com) lets an approved app read the boards and pins of the
// account that connected it (OAuth, scopes boards:read and pins:read); a search
// of all of Pinterest is not offered to general apps. If Nmesis is granted an
// access that includes search, implement search() and fetchForUse() against
// api.pinterest.com only (through fetch.ts, like unsplash.ts), read the token
// from PINTEREST_API_TOKEN, and set ENABLED. Until then available() is false
// whatever the environment says. docs/references.md has the owner's side.
const ENABLED=false;
const OFF='Pinterest search isn\'t available in the Studio.';

export const pinterest:ReferenceProvider={
 id:'pinterest',
 label:'Pinterest',
 unavailable:OFF,
 available:(env:ReferenceEnv=process.env)=>ENABLED&&!!env.PINTEREST_API_TOKEN,
 async search():Promise<SearchPage>{return {photos:[],nextPage:null,notice:OFF}},
 async fetchForUse():Promise<never>{throw new ReferenceProviderError(OFF,503)},
};
