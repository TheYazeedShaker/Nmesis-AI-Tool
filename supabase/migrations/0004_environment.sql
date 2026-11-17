-- 0004_environment: Production and Preview share one Supabase project, so every
-- row of client work says which environment wrote it, and row level security
-- shows a request only its own environment's rows.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app (one database, so
-- once covers both environments).
--
-- The environment comes from the server (VERCEL_ENV through
-- lib/portable/environment.ts), set per statement as `studio.env` next to
-- `studio.user_id` (lib/portable/database.ts). Rows that exist when this runs
-- were written by Production, so they become 'production'. New rows take the
-- environment of the request by default; a request with no environment can
-- neither read nor write: closed, never open.
--
-- Scoped (client work):            films, swap_jobs, storyboards, image_jobs,
--                                  topaz_jobs, film_budgets.
-- Shared on purpose, environment
-- recorded but not filtered:       credit_holds (holds count against the one
--                                  company balance in `accounts`, which both
--                                  environments spend from; hiding one
--                                  environment's holds from the other would let
--                                  the last credits be spent twice) and
--                                  staff_access_log (every staff opening stays
--                                  in front of the company's owners).
-- Shared, no client work:          credit_accounts (the company's lock),
--                                  support_grants (one switch per company, read
--                                  by the admin), car_settings (the catalogue).
-- Saved provider keys and media live in S3, one bucket per environment.

create or replace function studio.request_env() returns text
language plpgsql stable
set search_path = ''
as $fn$
declare
  raw text := nullif(current_setting('studio.env', true), '');
begin
  if raw in ('production', 'preview', 'development') then
    return raw;
  end if;
  return null;
end
$fn$;
revoke all on function studio.request_env() from public;

-- Existing rows are Production's: ADD COLUMN with a constant default fills them
-- without rewriting the table. (Plain statements, one per table, so the fast
-- tests' SQLite schema, built from these files, has the column too.)
alter table studio.films add column if not exists environment text not null default 'production';
alter table studio.swap_jobs add column if not exists environment text not null default 'production';
alter table studio.storyboards add column if not exists environment text not null default 'production';
alter table studio.image_jobs add column if not exists environment text not null default 'production';
alter table studio.topaz_jobs add column if not exists environment text not null default 'production';
alter table studio.film_budgets add column if not exists environment text not null default 'production';
alter table studio.credit_holds add column if not exists environment text not null default 'production';
alter table studio.staff_access_log add column if not exists environment text not null default 'production';

do $$
declare t text;
begin
  foreach t in array array['films', 'swap_jobs', 'storyboards', 'image_jobs', 'topaz_jobs', 'film_budgets', 'credit_holds', 'staff_access_log'] loop
    -- From now on, the request's own environment (null, and so refused, when
    -- the request has none).
    execute format('alter table studio.%I alter column environment set default studio.request_env()', t);
    if not exists (select 1 from pg_constraint where conname = t || '_environment_ck') then
      execute format('alter table studio.%I add constraint %I check (environment in (''production'', ''preview'', ''development''))', t, t || '_environment_ck');
    end if;
  end loop;
end
$$;

-- Row level security for client work: the 0002 membership rule, and the row's
-- environment is the request's.
do $$
declare t text;
begin
  foreach t in array array['films', 'swap_jobs', 'storyboards', 'image_jobs', 'topaz_jobs', 'film_budgets'] loop
    execute format('drop policy if exists member_orgs on studio.%I', t);
    execute format(
      'create policy member_orgs on studio.%I for all using (environment = (select studio.request_env()) and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), ''{}''::text[])))) with check (environment = (select studio.request_env()) and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), ''{}''::text[]))))',
      t);
  end loop;
end
$$;

-- Keys and indexes with the environment in front, so each environment's rows
-- are found without reading the other's, and the same id in two environments
-- never collides.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'film_budgets_pkey'
             and pg_get_constraintdef(oid) = 'PRIMARY KEY (payer)') then
    alter table studio.film_budgets drop constraint film_budgets_pkey;
    alter table studio.film_budgets add constraint film_budgets_pkey primary key (environment, payer);
  end if;
end
$$;
drop index if exists studio.film_budgets_org;
create index if not exists film_budgets_env_org on studio.film_budgets (environment, org_id, payer);

drop index if exists studio.films_org_owner_created;
create index if not exists films_env_org_owner_created on studio.films (environment, org_id, owner, created_at);
drop index if exists studio.swaps_org_owner_created;
create index if not exists swaps_env_org_owner_created on studio.swap_jobs (environment, org_id, owner, created_at);
drop index if exists studio.storyboards_org_owner_created;
create index if not exists storyboards_env_org_owner_created on studio.storyboards (environment, org_id, owner, created_at);
drop index if exists studio.image_jobs_org_owner_created;
create index if not exists image_jobs_env_org_owner_created on studio.image_jobs (environment, org_id, owner, created_at);
drop index if exists studio.topaz_jobs_org_owner_parent;
create index if not exists topaz_jobs_env_org_owner_parent on studio.topaz_jobs (environment, org_id, owner, parent_id, created_at);
-- At most one active upscale per source image, per environment.
drop index if exists studio.topaz_jobs_one_active;
create unique index if not exists topaz_jobs_env_one_active on studio.topaz_jobs (environment, owner, parent_id)
  where status in ('submitting', 'unknown', 'queued', 'processing', 'archiving');

do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on function studio.request_env() from %I', api_role);
    end if;
  end loop;
end
$$;
