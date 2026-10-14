import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const films=sqliteTable('films',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),payer:text('payer').notNull(),status:text('status').notNull().default('draft'),
 data:text('data').notNull(),providerId:text('provider_id'),statusUrl:text('status_url'),cancelUrl:text('cancel_url'),resultKey:text('result_key'),
 estimate:integer('estimate').notNull().default(0),reservedDay:text('reserved_day'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
 lockUntil:integer('lock_until').notNull().default(0),error:text('error'),
},t=>[index('films_owner_created').on(t.owner,t.createdAt),index('films_payer_day').on(t.payer,t.reservedDay)]);
export const filmBudgets=sqliteTable('film_budgets',{payer:text('payer').primaryKey(),dailyLimit:integer('daily_limit').notNull().default(10000000),paused:integer('paused').notNull().default(0)});
export const swaps=sqliteTable('swap_jobs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),payer:text('payer').notNull(),status:text('status').notNull().default('draft'),
 data:text('data').notNull(),providerId:text('provider_id'),statusUrl:text('status_url'),cancelUrl:text('cancel_url'),resultKey:text('result_key'),
 estimate:integer('estimate').notNull().default(0),reservedDay:text('reserved_day'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
 lockUntil:integer('lock_until').notNull().default(0),error:text('error'),
},t=>[index('swaps_owner_created').on(t.owner,t.createdAt),index('swaps_payer_day').on(t.payer,t.reservedDay)]);
export const storyboards=sqliteTable('storyboards',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(1),lockUntil:integer('lock_until').notNull().default(0),lockToken:text('lock_token'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('storyboards_owner_created').on(t.owner,t.createdAt)]);
export const imageJobs=sqliteTable('image_jobs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),payer:text('payer').notNull(),status:text('status').notNull().default('draft'),data:text('data').notNull(),providerId:text('provider_id'),estimate:integer('estimate').notNull().default(0),reservedDay:text('reserved_day'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),lockUntil:integer('lock_until').notNull().default(0),error:text('error'),
},t=>[index('image_jobs_owner_created').on(t.owner,t.createdAt),index('image_jobs_payer_day').on(t.payer,t.reservedDay)]);
export const topazJobs=sqliteTable('topaz_jobs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),parentId:text('parent_id').notNull(),status:text('status').notNull(),data:text('data').notNull(),providerId:text('provider_id'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),lockUntil:integer('lock_until').notNull().default(0),error:text('error'),
},t=>[index('topaz_jobs_owner_parent').on(t.owner,t.parentId,t.createdAt)]);
