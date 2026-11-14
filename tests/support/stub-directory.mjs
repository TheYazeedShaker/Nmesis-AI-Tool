// Stand-in for '@/lib/accounts/directory' (alias imports only) in the access tests.
import {state} from './state.mjs';
export {UUID} from '../../lib/accounts/directory.ts';
export {ttlCache} from '../../lib/accounts/cache.ts';
export const getDirectory=()=>state.directory;
