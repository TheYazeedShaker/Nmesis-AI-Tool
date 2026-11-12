-- Nmesis Studio: one-time database setup, run by the owner in each Supabase
-- project that hosts the studio (the main project and the staging project).
-- Run it in the project's SQL editor as the default `postgres` user.
--
-- Before running, replace REPLACE_WITH_A_LONG_RANDOM_PASSWORD with a new random
-- password (40+ characters, letters and digits only so it needs no URL escaping).
-- Use a different password in each project. Never commit it; it goes only into
-- the Vercel variables DATABASE_URL and DATABASE_URL_DIRECT.
-- Re-running is safe; to rotate the password later, run only the ALTER ROLE ... PASSWORD line.

-- 1. The studio's own login role. It inherits nothing, cannot bypass row level
--    security, cannot create roles or databases.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'studio_app') then
    create role studio_app login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$$;
alter role studio_app with login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  password 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';

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
revoke all on all tables in schema public from studio_app;

-- 4. Keep the schema out of the project's HTTP API: in the dashboard, under the
--    Data API settings, `studio` must NOT be listed among the exposed schemas.

-- Check (expect: studio_app | f | f | f, and studio's owner is studio_app):
select rolname, rolsuper, rolbypassrls, rolinherit from pg_roles where rolname = 'studio_app';
select nspname, pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'studio';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Client accounts (PR S2). Run AFTER the Nmesis admin's accounts migrations
--    (0006 and 0007) exist in this project, and again whenever the admin
--    changes accounts.members, accounts.staff, accounts.organisations,
--    accounts.organisation_brands, accounts.cars or accounts.configurator_access
--    (these views depend on them). Re-running is safe.
--
--    The studio reads the master list and never writes it, through five narrow
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
  accounts.studio_cars, accounts.studio_live_cars from public, anon, authenticated;
grant select on accounts.studio_memberships, accounts.studio_staff, accounts.studio_organisations,
  accounts.studio_cars, accounts.studio_live_cars to studio_app;
revoke all on function accounts.studio_accept_membership(uuid) from public, anon, authenticated;
grant execute on function accounts.studio_accept_membership(uuid) to studio_app;
-- The plan document (the admin's own function).
grant execute on function accounts.entitlements(uuid) to studio_app;

-- Check (expect five `t` and two `t`):
select has_table_privilege('studio_app', v, 'select')
  from unnest(array['accounts.studio_memberships', 'accounts.studio_staff', 'accounts.studio_organisations',
                    'accounts.studio_cars', 'accounts.studio_live_cars']) as v;
select has_function_privilege('studio_app', 'accounts.entitlements(uuid)', 'execute'),
       has_function_privilege('studio_app', 'accounts.studio_accept_membership(uuid)', 'execute');
