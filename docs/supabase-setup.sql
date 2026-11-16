-- Nmesis Studio: one-time database setup, run by the owner in the Supabase
-- project that hosts the studio: the main project, which Production and
-- Preview share.
-- Run it in the project's SQL editor as the default `postgres` user. On hosted
-- Supabase that user is not a superuser (it has CREATEROLE), so this file uses
-- only statements such a user may run. CI runs it twice as a role like that.
--
-- Before running, replace the placeholder REPLACE_WITH_A_LONG_RANDOM_PASSWORD
-- in section 1 with a new random password (40+ characters, letters and digits
-- only so it needs no URL escaping). Use a different password in each project.
-- Never commit it; it goes only into the Vercel variables DATABASE_URL and
-- DATABASE_URL_DIRECT.
-- Re-running is safe. To rotate the password later, run only the one
-- `alter role studio_app with login password '...';` line.
--
-- Sign-in addresses are set in the dashboard, not here: Authentication → URL
-- Configuration → Redirect URLs. Every Studio address needs two entries,
--   https://<studio address>        the bare address (the admin invites with it)
--   https://<studio address>/**     every sign-in, invitation and recovery link
-- and Preview deployments need one wildcard that covers all of them:
--   https://<project>-*-<team>.vercel.app/**
-- Each Vercel environment also sets STUDIO_PUBLIC_ORIGIN to its own Studio
-- address (README, "Sign-in and company accounts").

-- 1. The studio's own login role. It inherits nothing. A new role is already
--    no superuser, no createdb, no createrole, no replication and no bypassrls
--    (the Postgres defaults); only a superuser may name those attributes, so
--    they are left out. The check after section 4 confirms them.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'studio_app') then
    create role studio_app login noinherit;
  end if;
end
$$;
alter role studio_app with login password 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';

-- Defaults for every session of the role. The search path is also requested by the
-- studio's connection settings; the role default covers connection poolers that do
-- not pass that setting through. Timeouts bound runaway statements and transactions.
alter role studio_app set search_path = studio;
alter role studio_app set statement_timeout = '15s';
alter role studio_app set idle_in_transaction_session_timeout = '30s';

-- 2. The schema, owned by the studio role.
--    Why the role owns it: the migrations run as studio_app, so studio_app owns
--    every studio table. No other role (including the API roles `anon` and
--    `authenticated`) has any privilege on them. Row level security is enabled
--    and forced (migration 0002), so even this owning role sees a row only when
--    its org_id is one of the signed-in user's active companies (section 5).
--    The grant lets this setup user create the schema on the role's behalf.
grant studio_app to current_user;
create schema if not exists studio authorization studio_app;
alter schema studio owner to studio_app;

-- 3. Usage on only its own schema: nothing on the studio schema for anyone else,
--    and no grants for the studio role anywhere else.
revoke all on schema studio from public;
revoke all on schema studio from anon, authenticated;
revoke create on schema public from studio_app;
-- One relation at a time: "revoke ... on all tables in schema public" fails as a
-- whole for a role that is not a superuser when public holds a table it doesn't
-- own. A relation this role cannot touch is skipped with a notice (studio_app
-- holds nothing there unless that relation's owner granted it; check:setup reports it).
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
  loop
    begin
      execute format('revoke all on table public.%I from studio_app', r.relname);
    exception when insufficient_privilege then
      raise notice 'Skipped public.%: this role cannot change its privileges.', r.relname;
    end;
  end loop;
end
$$;

-- 4. Keep the schema out of the project's HTTP API: in the dashboard, under the
--    Data API settings, `studio` must NOT be listed among the exposed schemas.

-- Check (expect: studio_app | f | f | f, that is rolsuper=f, rolbypassrls=f and
-- rolinherit=f; and studio's owner is studio_app):
select rolname, rolsuper, rolbypassrls, rolinherit from pg_roles where rolname = 'studio_app';
select nspname, pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'studio';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Client accounts (PR S2). Run AFTER the Nmesis admin's accounts migrations
--    (0006 and 0007) exist in this project, and again whenever the admin
--    changes accounts.members, accounts.staff, accounts.organisations,
--    accounts.organisation_brands, accounts.cars or accounts.configurator_access
--    (these views depend on them). Re-running is safe.
--
--    The studio reads the master list and never writes it, through six narrow
--    views and two functions. Nothing else in `accounts` is granted to it. The
--    views run with their owner's rights (this setup user), which is how they
--    reach tables that have row level security and no policies.
-- ═══════════════════════════════════════════════════════════════════════════
grant usage on schema accounts to studio_app;

-- A user's companies and role in each (invited or active; removed rows never show).
create or replace view accounts.studio_memberships with (security_invoker = false) as
select m.org_id, m.user_id, m.role, m.status, o.name as org_name, o.kind as org_kind
  from accounts.members m
  join accounts.organisations o on o.id = m.org_id
 where m.status in ('invited', 'active');

-- Who is Nmesis staff (no names, no emails).
create or replace view accounts.studio_staff with (security_invoker = false) as
select s.user_id, s.role, s.active from accounts.staff s;

-- Company names for the switcher and the "Viewing as" banner.
create or replace view accounts.studio_organisations with (security_invoker = false) as
select o.id, o.name, o.kind from accounts.organisations o where o.status <> 'ended';

-- The live cars each company may use: its configurator_access rows when it has
-- any, otherwise every live car of the brands it owns.
create or replace view accounts.studio_cars with (security_invoker = false) as
select o.id as org_id, c.brand_id, c.model_id, c.brand_name, c.model_name, c.configurator_url
  from accounts.organisations o
  join accounts.cars c on c.live
 where (exists (select 1 from accounts.configurator_access a where a.org_id = o.id)
        and exists (select 1 from accounts.configurator_access a
                     where a.org_id = o.id and a.brand_id = c.brand_id and a.model_id = c.model_id))
    or (not exists (select 1 from accounts.configurator_access a where a.org_id = o.id)
        and exists (select 1 from accounts.organisation_brands b where b.org_id = o.id and b.brand_id = c.brand_id));

-- The brands each company owns, with the brand's name from its cars (Phase 3
-- polish: clients work as their brand, and a company with several brands
-- switches between them). A brand with no car in the list shows its id.
create or replace view accounts.studio_brands with (security_invoker = false) as
select b.org_id, b.brand_id,
       coalesce((select max(c.brand_name) from accounts.cars c where c.brand_id = b.brand_id), b.brand_id) as brand_name
  from accounts.organisation_brands b;

-- Every live car (staff see them all).
create or replace view accounts.studio_live_cars with (security_invoker = false) as
select c.brand_id, c.model_id, c.brand_name, c.model_name, c.configurator_url from accounts.cars c where c.live;

-- First arrival after an invitation: the person's invited memberships become
-- active (joined now) and their open invitations to those companies are marked
-- accepted, so the admin's People tab stops showing "Invited, not arrived".
-- Takes only the user id, which the studio reads from the verified session.
create or replace function accounts.studio_accept_membership(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  n integer;
begin
  update accounts.members
     set status = 'active', joined_at = coalesce(joined_at, now())
   where user_id = p_user and status = 'invited';
  get diagnostics n = row_count;
  update accounts.invitations i
     set accepted_at = now(), accepted_by = p_user
   where i.accepted_at is null
     and i.org_id is not null
     and lower(i.email) = (select lower(u.email::text) from auth.users u where u.id = p_user)
     and exists (select 1 from accounts.members m
                  where m.org_id = i.org_id and m.user_id = p_user and m.status = 'active');
  return n;
end
$fn$;

revoke all on accounts.studio_memberships, accounts.studio_staff, accounts.studio_organisations,
  accounts.studio_cars, accounts.studio_live_cars, accounts.studio_brands from public, anon, authenticated;
grant select on accounts.studio_memberships, accounts.studio_staff, accounts.studio_organisations,
  accounts.studio_cars, accounts.studio_live_cars, accounts.studio_brands to studio_app;
revoke all on function accounts.studio_accept_membership(uuid) from public, anon, authenticated;
grant execute on function accounts.studio_accept_membership(uuid) to studio_app;
-- The plan document (the admin's own function).
grant execute on function accounts.entitlements(uuid) to studio_app;

-- Check (expect six `t` and two `t`):
select has_table_privilege('studio_app', v, 'select')
  from unnest(array['accounts.studio_memberships', 'accounts.studio_staff', 'accounts.studio_organisations',
                    'accounts.studio_cars', 'accounts.studio_live_cars', 'accounts.studio_brands']) as v;
select has_function_privilege('studio_app', 'accounts.entitlements(uuid)', 'execute'),
       has_function_privilege('studio_app', 'accounts.studio_accept_membership(uuid)', 'execute');

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Credits and support access (PR S3). Run AFTER section 5, in the main
--    project, once the admin's accounts migration that creates
--    accounts.usage_ledger, accounts.credit_packs, accounts.price_book and
--    accounts.credits_balance(org) exists there. Re-run it whenever the admin
--    changes those tables (the views below depend on them). Re-running is safe.
--
--    Nmesis pays the AI providers; companies spend credits. The Studio reads the
--    balance with accounts.credits_balance(org) and writes the ledger only
--    through accounts.record_usage(...) below. Nothing here shows a provider's
--    cost to the Studio's pages: the views leave provider_cost_usd out.
-- ═══════════════════════════════════════════════════════════════════════════

-- The balance (the admin's own function).
grant execute on function accounts.credits_balance(uuid) to studio_app;

-- Settles one Studio action into the append-only ledger. Called by the Studio's
-- server only (studio.record_usage in migration 0003), inside the transaction
-- that also marks the action's hold as settled.
--   p_credits   whole credits to spend (0 for the company's own key and for
--               Nmesis's own workspace);
--   p_provider  'openai' | 'google' | 'higgsfield' | 'topaz' | 'own key';
--   p_ref       the hold's id: a second call with the same ref records nothing
--               and answers what the first one charged.
-- The allowance is spent first, then unexpired packs, soonest-expiring first
-- (the order accounts.credits_balance counts them in). If the actual cost was
-- more than was left, the rest is booked against the allowance and marked
-- "over" in details. A pack's last day is taken in UTC here; the admin's
-- balance uses its own business day, so a spend in the few hours between the
-- two may come out of the allowance instead of an expiring pack.
create or replace function accounts.record_usage(
  p_org uuid, p_actor text, p_feature text, p_credits numeric, p_provider text,
  p_provider_cost_usd numeric, p_ref text, p_details jsonb)
returns numeric
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  today   date := (now() at time zone 'utc')::date;
  balance jsonb;
  rest    numeric;
  part    numeric;
  pack    record;
  details jsonb := coalesce(p_details, '{}'::jsonb);
  cost    numeric;
begin
  if p_org is null or not exists (select 1 from accounts.organisations o where o.id = p_org) then
    raise exception 'record_usage: unknown organisation' using errcode = '22023';
  end if;
  if p_actor is null or p_actor !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'record_usage: the actor must be a user id' using errcode = '22023';
  end if;
  if p_feature is null or p_feature !~ '^studio\.[a-z_]{2,40}$' then
    raise exception 'record_usage: the feature must be a studio.* key' using errcode = '22023';
  end if;
  if p_credits is null or p_credits < 0 or p_credits > 100000 or p_credits <> trunc(p_credits) then
    raise exception 'record_usage: credits must be a whole number from 0 to 100000' using errcode = '22023';
  end if;
  if p_provider is null or p_provider not in ('openai', 'google', 'higgsfield', 'topaz', 'own key') then
    raise exception 'record_usage: unknown provider' using errcode = '22023';
  end if;
  if p_provider = 'own key' and p_credits <> 0 then
    raise exception 'record_usage: an action on the company''s own key costs 0 credits' using errcode = '22023';
  end if;
  if p_provider_cost_usd is not null and (p_provider_cost_usd < 0 or p_provider_cost_usd > 1000) then
    raise exception 'record_usage: provider cost out of range' using errcode = '22023';
  end if;
  if p_ref is null or p_ref !~ '^[A-Za-z0-9:_-]{8,120}$' then
    raise exception 'record_usage: invalid reference' using errcode = '22023';
  end if;
  if jsonb_typeof(details) <> 'object' or length(details::text) > 2000 then
    raise exception 'record_usage: details must be a small JSON object' using errcode = '22023';
  end if;

  -- One settlement per company at a time, and one per reference.
  perform pg_advisory_xact_lock(hashtextextended('accounts.record_usage:' || p_org::text, 0));
  if exists (select 1 from accounts.usage_ledger l where l.org_id = p_org and l.ref = p_ref) then
    return coalesce((select -sum(l.credits) from accounts.usage_ledger l where l.org_id = p_org and l.ref = p_ref), 0);
  end if;

  if p_credits = 0 then
    insert into accounts.usage_ledger (org_id, product_key, feature_key, actor, quantity, unit, credits, pack_id, provider, provider_cost_usd, ref, details)
    values (p_org, 'studio', p_feature, p_actor, 1, 'action', 0, null, p_provider, p_provider_cost_usd, p_ref, details);
    return 0;
  end if;

  balance := accounts.credits_balance(p_org);
  rest := p_credits;
  part := least(rest, greatest(coalesce((balance ->> 'monthly_left')::numeric, 0), 0));
  if part > 0 then
    cost := case when p_provider_cost_usd is null then null else round(p_provider_cost_usd * part / p_credits, 6) end;
    insert into accounts.usage_ledger (org_id, product_key, feature_key, actor, quantity, unit, credits, pack_id, provider, provider_cost_usd, ref, details)
    values (p_org, 'studio', p_feature, p_actor, 1, 'action', -part, null, p_provider, cost, p_ref, details);
    rest := rest - part;
  end if;

  for pack in
    select p.id, p.credits + coalesce((select sum(l.credits) from accounts.usage_ledger l where l.pack_id = p.id), 0) as left_credits
      from accounts.credit_packs p
     where p.org_id = p_org and p.expires_on >= today
     order by p.expires_on, p.id
  loop
    exit when rest <= 0;
    if pack.left_credits > 0 then
      part := least(rest, pack.left_credits);
      cost := case when p_provider_cost_usd is null then null else round(p_provider_cost_usd * part / p_credits, 6) end;
      insert into accounts.usage_ledger (org_id, product_key, feature_key, actor, quantity, unit, credits, pack_id, provider, provider_cost_usd, ref, details)
      values (p_org, 'studio', p_feature, p_actor, 1, 'action', -part, pack.id, p_provider, cost, p_ref, details);
      rest := rest - part;
    end if;
  end loop;

  if rest > 0 then
    cost := case when p_provider_cost_usd is null then null else round(p_provider_cost_usd * rest / p_credits, 6) end;
    insert into accounts.usage_ledger (org_id, product_key, feature_key, actor, quantity, unit, credits, pack_id, provider, provider_cost_usd, ref, details)
    values (p_org, 'studio', p_feature, p_actor, 1, 'action', -rest, null, p_provider, cost, p_ref, details || '{"over": true}'::jsonb);
  end if;
  return p_credits;
end
$fn$;

-- What a company's Usage page shows: its Studio actions, with no provider and no
-- provider cost.
create or replace view accounts.studio_usage with (security_invoker = false) as
select l.id, l.at, l.org_id, l.feature_key, l.actor, l.credits, l.pack_id, l.ref,
       left(coalesce(l.details ->> 'action', ''), 80) as action,
       (l.provider = 'own key') as own_key
  from accounts.usage_ledger l
 where l.product_key = 'studio';

-- A company's packs: size, what is left, when bought and when they expire (no price).
create or replace view accounts.studio_credit_packs with (security_invoker = false) as
select p.id, p.org_id, p.credits,
       greatest(p.credits + coalesce(s.spent, 0), 0) as left_credits,
       p.bought_on, p.expires_on
  from accounts.credit_packs p
  left join (select l.pack_id, sum(l.credits) as spent from accounts.usage_ledger l
              where l.pack_id is not null group by l.pack_id) s on s.pack_id = p.id;

-- The people of each company with their email, for "by person" on the Usage page
-- and the 80% warning to the company's owners.
create or replace view accounts.studio_people with (security_invoker = false) as
select m.org_id, m.user_id, m.role, m.status, u.email::text as email
  from accounts.members m
  join auth.users u on u.id = m.user_id
 where m.status in ('invited', 'active');

-- The price book entries the Studio's server uses: what one credit may cost
-- (credit_basis, USD) and per-action provider costs that override the Studio's
-- own table (keys `studio_cost.<action>`, USD). Never sent to a browser.
create or replace view accounts.studio_price_book with (security_invoker = false) as
select b.key, b.value from accounts.price_book b
 where b.key = 'credit_basis' or left(b.key, 12) = 'studio_cost.';

revoke all on accounts.studio_usage, accounts.studio_credit_packs, accounts.studio_people,
  accounts.studio_price_book from public, anon, authenticated;
grant select on accounts.studio_usage, accounts.studio_credit_packs, accounts.studio_people,
  accounts.studio_price_book to studio_app;
revoke all on function accounts.record_usage(uuid, text, text, numeric, text, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function accounts.record_usage(uuid, text, text, numeric, text, numeric, text, jsonb) to studio_app;

-- For the admin's "Open in Studio" button: whether a client has granted Nmesis
-- support access now, asked as the member of staff who would open it (the
-- grant is protected by row level security; staff may read it). Answers
-- {"granted": false} before the Studio's migration 0003 has run.
create or replace function accounts.studio_support_access(p_org uuid, p_staff uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  until_ms bigint;
begin
  if p_org is null or p_staff is null or to_regclass('studio.support_grants') is null then
    return jsonb_build_object('granted', false);
  end if;
  perform set_config('studio.user_id', p_staff::text, true);
  execute 'select until from studio.support_grants where org_id = $1 and until > $2'
    into until_ms using p_org::text, (extract(epoch from clock_timestamp()) * 1000)::bigint;
  perform set_config('studio.user_id', '', true);
  if until_ms is null then
    return jsonb_build_object('granted', false);
  end if;
  return jsonb_build_object('granted', true, 'until', to_timestamp(until_ms / 1000.0));
end
$fn$;
revoke all on function accounts.studio_support_access(uuid, uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function accounts.studio_support_access(uuid, uuid) to service_role;
  end if;
end
$$;

-- Check (expect four `t`, then three `t`):
select has_table_privilege('studio_app', v, 'select')
  from unnest(array['accounts.studio_usage', 'accounts.studio_credit_packs', 'accounts.studio_people',
                    'accounts.studio_price_book']) as v;
select has_function_privilege('studio_app', 'accounts.credits_balance(uuid)', 'execute'),
       has_function_privilege('studio_app', 'accounts.record_usage(uuid, text, text, numeric, text, numeric, text, jsonb)', 'execute'),
       not has_table_privilege('studio_app', 'accounts.usage_ledger', 'insert');
