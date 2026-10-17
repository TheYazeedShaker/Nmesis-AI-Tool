// Postgres schema (Supabase). Source of truth for `drizzle-kit generate`; the
// runtime uses raw SQL through lib/portable/database.ts. Timestamps are epoch
// milliseconds and money is integer USD millionths, so both are bigint.
// ADR 0002 records the move from SQLite (Turso) to Postgres.
import {sql} from 'drizzle-orm';
import {pgTable,text,bigint,integer,index,uniqueIndex} from 'drizzle-orm/pg-core';
const ms=(name:string)=>bigint(name,{mode:'number'});
export const films=pgTable('films',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),payer:text('payer').notNull(),status:text('status').notNull().default('draft'),
 data:text('data').notNull(),providerId:text('provider_id'),statusUrl:text('status_url'),cancelUrl:text('cancel_url'),resultKey:text('result_key'),
 estimate:bigint('estimate',{mode:'number'}).notNull().default(0),reservedDay:text('reserved_day'),createdAt:ms('created_at').notNull(),updatedAt:ms('updated_at').notNull(),
 lockUntil:ms('lock_until').notNull().default(0),error:text('error'),
},t=>[index('films_owner_created').on(t.owner,t.createdAt),index('films_payer_day').on(t.payer,t.reservedDay)]).enableRLS();
export const filmBudgets=pgTable('film_budgets',{payer:text('payer').primaryKey(),dailyLimit:bigint('daily_limit',{mode:'number'}).notNull().default(10000000),paused:integer('paused').notNull().default(0)}).enableRLS();
export const swaps=pgTable('swap_jobs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),payer:text('payer').notNull(),status:text('status').notNull().default('draft'),
 data:text('data').notNull(),providerId:text('provider_id'),statusUrl:text('status_url'),cancelUrl:text('cancel_url'),resultKey:text('result_key'),
 estimate:bigint('estimate',{mode:'number'}).notNull().default(0),reservedDay:text('reserved_day'),createdAt:ms('created_at').notNull(),updatedAt:ms('updated_at').notNull(),
 lockUntil:ms('lock_until').notNull().default(0),error:text('error'),
},t=>[index('swaps_owner_created').on(t.owner,t.createdAt),index('swaps_payer_day').on(t.payer,t.reservedDay)]).enableRLS();
export const storyboards=pgTable('storyboards',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(1),lockUntil:ms('lock_until').notNull().default(0),lockToken:text('lock_token'),createdAt:ms('created_at').notNull(),updatedAt:ms('updated_at').notNull(),
},t=>[index('storyboards_owner_created').on(t.owner,t.createdAt)]).enableRLS();
export const imageJobs=pgTable('image_jobs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),payer:text('payer').notNull(),status:text('status').notNull().default('draft'),data:text('data').notNull(),providerId:text('provider_id'),estimate:bigint('estimate',{mode:'number'}).notNull().default(0),reservedDay:text('reserved_day'),createdAt:ms('created_at').notNull(),updatedAt:ms('updated_at').notNull(),lockUntil:ms('lock_until').notNull().default(0),error:text('error'),
},t=>[index('image_jobs_owner_created').on(t.owner,t.createdAt),index('image_jobs_payer_day').on(t.payer,t.reservedDay)]).enableRLS();
// At most one active upscale per parent image. SQLite serialised writers made the
// NOT EXISTS insert guard sufficient; under Postgres concurrency the index enforces it.
export const topazJobs=pgTable('topaz_jobs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),parentId:text('parent_id').notNull(),status:text('status').notNull(),data:text('data').notNull(),providerId:text('provider_id'),createdAt:ms('created_at').notNull(),updatedAt:ms('updated_at').notNull(),lockUntil:ms('lock_until').notNull().default(0),error:text('error'),
},t=>[index('topaz_jobs_owner_parent').on(t.owner,t.parentId,t.createdAt),uniqueIndex('topaz_jobs_one_active').on(t.owner,t.parentId).where(sql`status IN ('submitting','unknown','queued','processing','archiving')`)]).enableRLS();
