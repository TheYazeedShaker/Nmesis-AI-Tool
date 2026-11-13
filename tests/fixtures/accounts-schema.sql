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
create or replace function accounts.entitlements(org uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('org', o.id, 'org_name', o.name, 'managed', false, 'legacy', true,
                            'status', null, 'plan_id', null, 'plan_name', null, 'features', '{}'::jsonb)
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
