-- 0003_credits: Studio credits (holds against the company's balance), the
-- company's support-access grant, and the job columns that point at a hold.
-- Idempotent. Run by scripts/migrate.mjs as studio_app, after the owner's setup
-- (docs/supabase-setup.sql), whose section 6 creates accounts.record_usage and
-- grants accounts.credits_balance. Without section 6 the balance reads as 0 and
-- every paid action is refused: closed, never open.

-- One row per company: the lock every reservation and settlement takes first
-- (so two actions never both spend the last credits), and the last credit
-- warning sent this billing period (so each warning is sent once).
create table if not exists studio.credit_accounts (
  org_id text primary key,
  alert_period text,
  alert_level integer not null default 0,
  updated_at bigint not null default 0
);

-- Credits set aside for one paid action, from before the provider call until it
-- is settled into accounts.usage_ledger or released. A hold that is never
-- settled stops counting at expires_at.
-- billing: 'credits' (Nmesis's keys, counted against the balance), 'own key'
-- (the company's own provider key: recorded with 0 credits) or 'internal'
-- (Nmesis's own workspace: recorded with 0 credits, never limited).
create table if not exists studio.credit_holds (
  id text primary key,
  org_id text not null,
  actor text not null,
  tool text not null,
  action text not null,
  provider text not null,
  billing text not null,
  credits bigint not null,
  cost_micros bigint not null default 0,
  status text not null default 'held',
  charged bigint,
  ref text,
  created_at bigint not null,
  updated_at bigint not null,
  expires_at bigint not null
);
create index if not exists credit_holds_org_status on studio.credit_holds (org_id, status, expires_at);

-- A client owner's "Allow Nmesis support access": one row per company, until a
-- moment in time (7 days, renewable). Off by default (no row), off again once
-- `until` has passed or the owner turns it off (until = the moment they did).
create table if not exists studio.support_grants (
  org_id text primary key,
  granted_by text not null,
  granted_at bigint not null,
  until bigint not null,
  note text
);

-- Which hold a provider job reserved its credits in (replaces the daily budget),
-- and its credits: what the quote converts to, then what was actually charged.
alter table studio.films add column if not exists hold_id text;
alter table studio.swap_jobs add column if not exists hold_id text;
alter table studio.image_jobs add column if not exists hold_id text;
alter table studio.topaz_jobs add column if not exists hold_id text;
alter table studio.films add column if not exists credits bigint not null default 0;
alter table studio.swap_jobs add column if not exists credits bigint not null default 0;
alter table studio.image_jobs add column if not exists credits bigint not null default 0;
alter table studio.topaz_jobs add column if not exists credits bigint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credit_holds_status_ck') then
    alter table studio.credit_holds add constraint credit_holds_status_ck check (status in ('held', 'settled', 'released'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credit_holds_billing_ck') then
    alter table studio.credit_holds add constraint credit_holds_billing_ck check (billing in ('credits', 'own key', 'internal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'credit_holds_credits_ck') then
    alter table studio.credit_holds add constraint credit_holds_credits_ck check (credits >= 0 and (charged is null or charged >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_grants_until_ck') then
    alter table studio.support_grants add constraint support_grants_until_ck check (until >= granted_at);
  end if;
end
$$;

-- The company's credits available now (allowance left this period plus unexpired
-- packs), from the admin's accounts.credits_balance. 0 when the function is not
-- installed or not granted yet, so nothing is spent on a guess. Called unqualified
-- (search_path is studio) by the reservation statement in lib/credits/sql.ts.
create or replace function studio.credits_total(p_org text) returns numeric
language plpgsql volatile
set search_path = ''
as $fn$
declare
  balance jsonb;
begin
  if p_org is null or p_org !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or to_regprocedure('accounts.credits_balance(uuid)') is null then
    return 0;
  end if;
  execute 'select accounts.credits_balance($1::uuid)' into balance using p_org;
  return coalesce((balance ->> 'total')::numeric, 0);
end
$fn$;

-- The whole balance document (period, allowance, used, packs, total) as JSON
-- text; '{}' when accounts.credits_balance is not installed or not granted.
create or replace function studio.credits_balance(p_org text) returns text
language plpgsql volatile
set search_path = ''
as $fn$
declare
  balance jsonb;
begin
  if p_org is null or p_org !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or to_regprocedure('accounts.credits_balance(uuid)') is null then
    return '{}';
  end if;
  execute 'select accounts.credits_balance($1::uuid)' into balance using p_org;
  return coalesce(balance, '{}'::jsonb)::text;
end
$fn$;

-- Settles one action into the ledger through accounts.record_usage (section 6),
-- the only way the Studio writes there. Raises when it is not installed, so the
-- settlement's transaction rolls back and the hold stays held.
create or replace function studio.record_usage(p_org text, p_actor text, p_feature text, p_credits numeric,
  p_provider text, p_cost_usd numeric, p_ref text, p_details text) returns numeric
language plpgsql volatile
set search_path = ''
as $fn$
declare
  charged numeric;
begin
  if to_regprocedure('accounts.record_usage(uuid,text,text,numeric,text,numeric,text,jsonb)') is null then
    raise exception 'accounts.record_usage is not installed (docs/supabase-setup.sql section 6)';
  end if;
  execute 'select accounts.record_usage($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)'
    into charged using p_org, p_actor, p_feature, p_credits, p_provider, p_cost_usd, p_ref, p_details;
  return charged;
end
$fn$;

-- The companies the asking user owns (active owner memberships). Support access
-- is granted and withdrawn by a company's owner only.
create or replace function studio.request_owner_orgs() returns text[]
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
  execute 'select coalesce(array_agg(org_id::text), ''{}''::text[]) from accounts.studio_memberships where user_id = $1 and status = ''active'' and role = ''owner'''
    into found using who;
  return found;
end
$fn$;

revoke all on function studio.credits_total(text) from public;
revoke all on function studio.credits_balance(text) from public;
revoke all on function studio.record_usage(text, text, text, numeric, text, numeric, text, text) from public;
revoke all on function studio.request_owner_orgs() from public;

-- Row level security, forced as in 0002: credits rows belong to one company.
do $$
declare t text;
begin
  foreach t in array array['credit_accounts', 'credit_holds'] loop
    execute format('alter table studio.%I enable row level security', t);
    execute format('alter table studio.%I force row level security', t);
    execute format('drop policy if exists member_orgs on studio.%I', t);
    execute format(
      'create policy member_orgs on studio.%I for all using ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), ''{}''::text[]))) with check ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), ''{}''::text[])))',
      t);
  end loop;
end
$$;

-- The grant: its company's members and Nmesis staff may read it (staff need it to
-- know which clients they may open); only the company's owners may write it.
alter table studio.support_grants enable row level security;
alter table studio.support_grants force row level security;
drop policy if exists member_orgs on studio.support_grants;
drop policy if exists read_grant on studio.support_grants;
drop policy if exists owners_write on studio.support_grants;
drop policy if exists owners_change on studio.support_grants;
drop policy if exists owners_remove on studio.support_grants;
create policy read_grant on studio.support_grants for select
  using ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), '{}'::text[])));
create policy owners_write on studio.support_grants for insert
  with check (org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])));
create policy owners_change on studio.support_grants for update
  using (org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])))
  with check (org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])));
create policy owners_remove on studio.support_grants for delete
  using (org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])));

-- Nothing for anyone else (same as 0001 and 0002 for the new objects).
revoke all on studio.credit_accounts, studio.credit_holds, studio.support_grants from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.credit_accounts, studio.credit_holds, studio.support_grants from %I', api_role);
      execute format('revoke all on function studio.credits_total(text) from %I', api_role);
      execute format('revoke all on function studio.credits_balance(text) from %I', api_role);
      execute format('revoke all on function studio.record_usage(text, text, text, numeric, text, numeric, text, text) from %I', api_role);
      execute format('revoke all on function studio.request_owner_orgs() from %I', api_role);
    end if;
  end loop;
end
$$;
