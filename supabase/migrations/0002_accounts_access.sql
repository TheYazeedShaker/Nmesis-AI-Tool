-- 0002_accounts_access: client accounts reach the database.
-- Idempotent. Run by scripts/migrate.mjs as studio_app, after the owner's one-time
-- setup (docs/supabase-setup.sql), which creates the read-only accounts views this
-- file's helpers read. Without those views the helpers answer "nobody", so every
-- studio table reads as empty: closed, never open.

-- Staff opening a client's workspace ("Viewing as"), one row per opening.
create table if not exists studio.staff_access_log (
  id text primary key,
  org_id text not null,
  staff_user text not null,
  path text,
  at bigint not null
);
create index if not exists staff_access_log_org_at on studio.staff_access_log (org_id, at);

-- Per car (from accounts.cars), how the capture panel starts. Studio data, not
-- client data: the admin's catalogue stays read-only for the studio.
-- 'capture'     : an empty view that asks for a capture (the default);
-- 'choose-view' : the "Choose a car view" template.
create table if not exists studio.car_settings (
  brand_id text not null,
  model_id text not null,
  capture_template text not null default 'capture',
  primary key (brand_id, model_id)
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'car_settings_template_ck') then
    alter table studio.car_settings add constraint car_settings_template_ck
      check (capture_template in ('capture', 'choose-view'));
  end if;
end
$$;

-- Who is asking. The studio server sets studio.user_id inside each statement's
-- transaction from the verified Supabase session (lib/portable/database.ts); a
-- Supabase API request carries the user in request.jwt.claims instead.
create or replace function studio.request_user() returns uuid
language plpgsql stable
set search_path = ''
as $fn$
declare
  raw text := nullif(current_setting('studio.user_id', true), '');
begin
  if raw is null then
    raw := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  end if;
  if raw is null or raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return raw::uuid;
end
$fn$;

-- The organizations whose rows the asking user may see: their active
-- memberships in accounts.members. Security definer so that it also works for a
-- role that cannot read the accounts views itself.
create or replace function studio.request_orgs() returns text[]
language plpgsql stable security definer
set search_path = ''
as $fn$
declare
  who uuid := studio.request_user();
  found text[];
begin
  if who is null or to_regclass('accounts.studio_memberships') is null then
    return '{}'::text[];
  end if;
  execute 'select coalesce(array_agg(org_id::text), ''{}''::text[]) from accounts.studio_memberships where user_id = $1 and status = ''active'''
    into found using who;
  return found;
end
$fn$;

-- Nmesis staff may open any organization (the studio logs it).
create or replace function studio.request_is_staff() returns boolean
language plpgsql stable security definer
set search_path = ''
as $fn$
declare
  who uuid := studio.request_user();
  yes boolean;
begin
  if who is null or to_regclass('accounts.studio_staff') is null then
    return false;
  end if;
  execute 'select exists (select 1 from accounts.studio_staff where user_id = $1 and active)' into yes using who;
  return coalesce(yes, false);
end
$fn$;

revoke all on function studio.request_user() from public;
revoke all on function studio.request_orgs() from public;
revoke all on function studio.request_is_staff() from public;

-- Row level security, enforced even for the studio's own role (which owns the
-- tables and would otherwise skip it): a row is visible and writable only where
-- its org_id is one of the asking user's active memberships, or the user is staff.
-- The server checks the same thing first; this is the second lock.
-- `any (coalesce((select …), '{}'))`: the scalar subquery is evaluated once and
-- compared as an array. Written as `any ((select …))`, Postgres reads the
-- subquery form of ANY (a set of text[] rows) and the policy does not compile.
do $$
declare t text;
begin
  foreach t in array array['film_budgets', 'films', 'swap_jobs', 'storyboards', 'image_jobs', 'topaz_jobs', 'staff_access_log'] loop
    execute format('alter table studio.%I enable row level security', t);
    execute format('alter table studio.%I force row level security', t);
    execute format('drop policy if exists member_orgs on studio.%I', t);
    execute format(
      'create policy member_orgs on studio.%I for all using ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), ''{}''::text[]))) with check ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), ''{}''::text[])))',
      t);
  end loop;
end
$$;

-- The car settings hold no client data: readable by any signed-in request,
-- written only by the owner through SQL (no policy for writes).
alter table studio.car_settings enable row level security;
alter table studio.car_settings force row level security;
drop policy if exists read_signed_in on studio.car_settings;
create policy read_signed_in on studio.car_settings for select using ((select studio.request_user()) is not null);

-- Nothing for anyone else (same as 0001 for the new objects).
revoke all on studio.staff_access_log from public;
revoke all on studio.car_settings from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.staff_access_log from %I', api_role);
      execute format('revoke all on studio.car_settings from %I', api_role);
      execute format('revoke all on function studio.request_user() from %I', api_role);
      execute format('revoke all on function studio.request_orgs() from %I', api_role);
      execute format('revoke all on function studio.request_is_staff() from %I', api_role);
    end if;
  end loop;
end
$$;
