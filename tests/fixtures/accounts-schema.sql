-- A minimal, synthetic stand-in for the Nmesis admin's `accounts` schema
-- (its migrations 0006 and 0007) and Supabase's `auth.users`, for the Postgres
-- tests only. Same table and column names the Studio's views read; nothing else.
-- Idempotent. The hosted project has the real schema; never run this there.
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create schema if not exists accounts;
create table if not exists accounts.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'client' check (kind in ('client', 'internal')),
  status text not null default 'active' check (status in ('active', 'trial', 'paused', 'ended'))
);
create table if not exists accounts.organisation_brands (
  org_id uuid not null references accounts.organisations (id) on delete cascade,
  brand_id text not null,
  primary key (org_id, brand_id)
);
create table if not exists accounts.members (
  org_id uuid not null references accounts.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'creator', 'viewer')),
  status text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  invited_by text,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (org_id, user_id)
);
create table if not exists accounts.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null,
  active boolean not null default true
);
create table if not exists accounts.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references accounts.organisations (id) on delete cascade,
  email text not null,
  role text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists accounts.cars (
  brand_id text not null,
  model_id text not null,
  brand_name text,
  model_name text,
  configurator_url text,
  live boolean not null default true,
  primary key (brand_id, model_id)
);
create table if not exists accounts.configurator_access (
  org_id uuid not null references accounts.organisations (id) on delete cascade,
  brand_id text not null,
  model_id text not null,
  primary key (org_id, brand_id, model_id)
);
-- The admin's answer for a company with no plan yet ("legacy": everything allowed).
-- A company's unexpired overrides (below) show among its features, as the
-- admin's do (the team tests set `studio.seats` that way).
create table if not exists accounts.overrides (
  org_id uuid not null references accounts.organisations (id) on delete cascade,
  feature_key text not null,
  value jsonb,
  expires_on date,
  primary key (org_id, feature_key)
);
create or replace function accounts.entitlements(org uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('org', o.id, 'org_name', o.name, 'managed', false, 'legacy', true,
                            'status', null, 'plan_id', null, 'plan_name', null,
                            'features', coalesce((select jsonb_object_agg(ov.feature_key, ov.value) from accounts.overrides ov
                                                   where ov.org_id = o.id and (ov.expires_on is null or ov.expires_on >= current_date)), '{}'::jsonb))
    from accounts.organisations o where o.id = org;
$fn$;
-- As in the admin: row level security on, no policies, nothing for the API roles.
do $$
declare t text;
begin
  foreach t in array array['organisations', 'organisation_brands', 'members', 'staff', 'invitations', 'cars', 'configurator_access'] loop
    execute format('alter table accounts.%I enable row level security', t);
    execute format('revoke all on accounts.%I from public', t);
  end loop;
end
$$;
revoke all on function accounts.entitlements(uuid) from public;

-- Credits (the admin's migration that adds subscriptions, plan features, the price
-- book, packs, the append-only usage ledger and accounts.credits_balance), reduced
-- to what the Studio reads. The balance follows the admin's rules: the period runs
-- from the subscription's start date (month arithmetic clamps), the allowance is
-- the plan's studio.credits_monthly (an unexpired override wins), packs are spent
-- after it and expire on their own date. Its "today" is UTC, or the test.today
-- setting when a test moves the clock.
create table if not exists accounts.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references accounts.organisations (id) on delete cascade,
  plan_id text,
  status text not null default 'active',
  billing_cycle text not null default 'monthly',
  starts_on date,
  created_at timestamptz not null default now()
);
create table if not exists accounts.plan_features (
  plan_id text not null,
  feature_key text not null,
  value jsonb,
  primary key (plan_id, feature_key)
);
create table if not exists accounts.overrides (
  org_id uuid not null references accounts.organisations (id) on delete cascade,
  feature_key text not null,
  value jsonb,
  expires_on date,
  primary key (org_id, feature_key)
);
create table if not exists accounts.price_book (
  key text primary key,
  value jsonb not null,
  label text not null default ''
);
create table if not exists accounts.credit_packs (
  id bigint generated always as identity primary key,
  org_id uuid not null references accounts.organisations (id) on delete cascade,
  credits numeric(16, 4) not null,
  price numeric(12, 2),
  bought_on date not null default current_date,
  expires_on date not null
);
create table if not exists accounts.usage_ledger (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  org_id uuid references accounts.organisations (id) on delete set null,
  product_key text,
  feature_key text,
  actor text,
  quantity numeric(16, 4),
  unit text,
  credits numeric(16, 4),
  pack_id bigint references accounts.credit_packs (id) on delete set null,
  provider text,
  provider_cost_usd numeric(16, 6),
  ref text,
  details jsonb
);
create or replace function accounts.refuse_change() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  raise exception 'accounts.usage_ledger is append-only; % is not allowed on it', tg_op using errcode = 'restrict_violation';
end
$fn$;
drop trigger if exists usage_ledger_append_only on accounts.usage_ledger;
create trigger usage_ledger_append_only before update or delete on accounts.usage_ledger
  for each row execute function accounts.refuse_change();

create or replace function accounts.credits_balance(org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  sub record; has_sub boolean := false;
  today date := coalesce(nullif(current_setting('test.today', true), '')::date, (now() at time zone 'utc')::date);
  anchor date; step integer; elapsed integer; n integer;
  period_from date; period_to date;
  allowance numeric := 0; over_ride numeric; used numeric := 0; in_packs numeric := 0;
begin
  if not exists (select 1 from accounts.organisations o where o.id = org) then return null; end if;
  select s.* into sub from accounts.subscriptions s where s.org_id = org and s.status not in ('ended', 'cancelled') limit 1;
  has_sub := found;
  if has_sub then
    anchor := coalesce(sub.starts_on, sub.created_at::date);
    step := case when sub.billing_cycle = 'yearly' then 12 else 1 end;
    elapsed := (extract(year from age(today, anchor)) * 12 + extract(month from age(today, anchor)))::integer;
    if elapsed < 0 then elapsed := 0; end if;
    n := (elapsed / step) * step;
    period_from := (anchor + (n || ' months')::interval)::date;
    period_to := (anchor + ((n + step) || ' months')::interval)::date - 1;
    if sub.plan_id is not null then
      select (pf.value)::text::numeric into allowance from accounts.plan_features pf
       where pf.plan_id = sub.plan_id and pf.feature_key = 'studio.credits_monthly' and jsonb_typeof(pf.value) = 'number';
      allowance := coalesce(allowance, 0);
    end if;
    select (ov.value)::text::numeric into over_ride from accounts.overrides ov
     where ov.org_id = org and ov.feature_key = 'studio.credits_monthly' and jsonb_typeof(ov.value) = 'number'
       and (ov.expires_on is null or ov.expires_on >= today);
    if over_ride is not null then allowance := over_ride; end if;
    select greatest(coalesce(-sum(l.credits), 0), 0) into used from accounts.usage_ledger l
     where l.org_id = org and l.pack_id is null and l.credits is not null
       and l.at >= (period_from::timestamp at time zone 'utc') and l.at < ((period_to + 1)::timestamp at time zone 'utc');
  end if;
  select coalesce(sum(p.credits + coalesce(spent.credits, 0)), 0) into in_packs
    from accounts.credit_packs p
    left join (select l.pack_id, sum(l.credits) as credits from accounts.usage_ledger l where l.pack_id is not null group by l.pack_id) spent on spent.pack_id = p.id
   where p.org_id = org and p.expires_on >= today;
  return jsonb_build_object('period_from', period_from, 'period_to', period_to, 'monthly', allowance, 'used', used,
    'monthly_left', greatest(allowance - used, 0), 'packs', greatest(in_packs, 0),
    'total', greatest(allowance - used, 0) + greatest(in_packs, 0));
end
$fn$;
do $$
declare t text;
begin
  foreach t in array array['subscriptions', 'plan_features', 'overrides', 'price_book', 'credit_packs', 'usage_ledger'] loop
    execute format('alter table accounts.%I enable row level security', t);
    execute format('revoke all on accounts.%I from public', t);
  end loop;
end
$$;
revoke all on function accounts.credits_balance(uuid) from public;
