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
--    every studio table. Row level security is enabled on all of them with no
--    policies, which refuses every other role (including the API roles `anon` and
--    `authenticated`), while a table's owner is not subject to its RLS. The studio's
--    server code can therefore read and write its own tables, and nothing else can.
--    PR S2 adds membership-based policies for signed-in client users.
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
