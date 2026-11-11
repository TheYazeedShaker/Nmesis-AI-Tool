-- 0001_studio: the studio schema, its migration ledger and the six job tables.
-- Idempotent and environment-agnostic: run by scripts/migrate.mjs as the
-- studio's own role (studio_app), which owns the schema (docs/supabase-setup.sql).
-- Times are epoch milliseconds (bigint); money is integer USD millionths (bigint);
-- flags are integer 0/1. Every row belongs to one client organization (org_id).

-- Created here only when absent (local databases); hosted projects create it in
-- the one-time setup so the studio role never needs CREATE on the database.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'studio') then
    create schema studio;
  end if;
end
$$;

create table if not exists studio.__studio_migrations (
  name text primary key,
  sha256 text not null,
  applied_at text not null
);

create table if not exists studio.film_budgets (
  payer text primary key,
  org_id text not null,
  daily_limit bigint not null default 10000000,
  paused integer not null default 0
);
create index if not exists film_budgets_org on studio.film_budgets (org_id, payer);

create table if not exists studio.films (
  id text primary key,
  org_id text not null,
  owner text not null,
  payer text not null,
  status text not null default 'draft',
  data text not null,
  provider_id text,
  status_url text,
  cancel_url text,
  result_key text,
  estimate bigint not null default 0,
  reserved_day text,
  created_at bigint not null,
  updated_at bigint not null,
  lock_until bigint not null default 0,
  error text
);
create index if not exists films_org_owner_created on studio.films (org_id, owner, created_at);
create index if not exists films_payer_day on studio.films (payer, reserved_day);

create table if not exists studio.swap_jobs (
  id text primary key,
  org_id text not null,
  owner text not null,
  payer text not null,
  status text not null default 'draft',
  data text not null,
  provider_id text,
  status_url text,
  cancel_url text,
  result_key text,
  estimate bigint not null default 0,
  reserved_day text,
  created_at bigint not null,
  updated_at bigint not null,
  lock_until bigint not null default 0,
  error text
);
create index if not exists swaps_org_owner_created on studio.swap_jobs (org_id, owner, created_at);
create index if not exists swaps_payer_day on studio.swap_jobs (payer, reserved_day);

create table if not exists studio.storyboards (
  id text primary key,
  org_id text not null,
  owner text not null,
  data text not null,
  revision integer not null default 1,
  lock_until bigint not null default 0,
  lock_token text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists storyboards_org_owner_created on studio.storyboards (org_id, owner, created_at);

create table if not exists studio.image_jobs (
  id text primary key,
  org_id text not null,
  owner text not null,
  payer text not null,
  status text not null default 'draft',
  data text not null,
  provider_id text,
  estimate bigint not null default 0,
  reserved_day text,
  created_at bigint not null,
  updated_at bigint not null,
  lock_until bigint not null default 0,
  error text
);
create index if not exists image_jobs_org_owner_created on studio.image_jobs (org_id, owner, created_at);
create index if not exists image_jobs_payer_day on studio.image_jobs (payer, reserved_day);

create table if not exists studio.topaz_jobs (
  id text primary key,
  org_id text not null,
  owner text not null,
  parent_id text not null,
  status text not null,
  data text not null,
  provider_id text,
  created_at bigint not null,
  updated_at bigint not null,
  lock_until bigint not null default 0,
  error text
);
create index if not exists topaz_jobs_org_owner_parent on studio.topaz_jobs (org_id, owner, parent_id, created_at);
-- At most one active upscale per source image, even for concurrent requests
-- (SQLite serialized writers; Postgres needs the constraint).
create unique index if not exists topaz_jobs_one_active on studio.topaz_jobs (owner, parent_id)
  where status in ('submitting', 'unknown', 'queued', 'processing', 'archiving');

-- Row level security on, with no policies: only the owning studio role (which
-- RLS does not apply to) reads or writes. PR S2 adds membership-based policies.
alter table studio.__studio_migrations enable row level security;
alter table studio.film_budgets enable row level security;
alter table studio.films enable row level security;
alter table studio.swap_jobs enable row level security;
alter table studio.storyboards enable row level security;
alter table studio.image_jobs enable row level security;
alter table studio.topaz_jobs enable row level security;

-- Nothing for anyone else, including the API roles of a Supabase project.
revoke all on schema studio from public;
revoke all on all tables in schema studio from public;
revoke all on all sequences in schema studio from public;
revoke all on all functions in schema studio from public;
alter default privileges in schema studio revoke all on tables from public;
alter default privileges in schema studio revoke all on sequences from public;
alter default privileges in schema studio revoke all on functions from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on schema studio from %I', api_role);
      execute format('revoke all on all tables in schema studio from %I', api_role);
      execute format('revoke all on all sequences in schema studio from %I', api_role);
      execute format('revoke all on all functions in schema studio from %I', api_role);
      execute format('alter default privileges in schema studio revoke all on tables from %I', api_role);
      execute format('alter default privileges in schema studio revoke all on sequences from %I', api_role);
      execute format('alter default privileges in schema studio revoke all on functions from %I', api_role);
    end if;
  end loop;
end
$$;
