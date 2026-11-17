-- 0009_library_backfills: the library index fills itself.
-- One row per company and environment: the first time its library is opened
-- after 0007, the server indexes the work saved before 0007 (with thumbnails),
-- once, in the background (lib/library-backfill.ts). `started_at` is the claim
-- (a claim older than 15 minutes may be taken again); `done_at` is set when it
-- finished. Replaces the manual library:backfill step.
-- Client work: environment and row level security exactly as 0004 and 0007.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app.

create table if not exists studio.library_backfills (
  environment text not null default 'production',
  org_id text not null,
  started_at bigint not null,
  done_at bigint,
  primary key (environment, org_id)
);

do $$
begin
  alter table studio.library_backfills alter column environment set default studio.request_env();
  if not exists (select 1 from pg_constraint where conname = 'library_backfills_environment_ck') then
    alter table studio.library_backfills add constraint library_backfills_environment_ck check (environment in ('production', 'preview', 'development'));
  end if;
  alter table studio.library_backfills enable row level security;
  alter table studio.library_backfills force row level security;
  drop policy if exists member_orgs on studio.library_backfills;
  create policy member_orgs on studio.library_backfills for all
    using (environment = (select studio.request_env()) and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), '{}'::text[]))))
    with check (environment = (select studio.request_env()) and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), '{}'::text[]))));
end
$$;

-- Nothing for anyone else (as 0001, 0002, 0006 and 0007 for their objects).
revoke all on studio.library_backfills from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.library_backfills from %I', api_role);
    end if;
  end loop;
end
$$;
