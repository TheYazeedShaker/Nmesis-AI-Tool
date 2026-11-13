// Stand-in for '@/lib/portable/database' in the access tests (SQLite, in memory).
import {state} from './state.mjs';
export const getDatabase=()=>state.db;
export class StudioDatabase{}
