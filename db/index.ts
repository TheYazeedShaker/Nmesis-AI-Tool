import {drizzle} from 'drizzle-orm/postgres-js';
import {createPostgresClient} from '@/lib/portable/database';
import * as schema from './schema';
// Typed query builder for new platform code. Existing studio code uses getDatabase().
export function getDb(){if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL.');return drizzle(createPostgresClient(process.env.DATABASE_URL),{schema});}
