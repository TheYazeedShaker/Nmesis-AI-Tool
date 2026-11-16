-- 0007_library_index: the library at scale (Phase 3 group 2).
-- One row per piece of work the company has made (key visuals and line-ups,
-- their area edits and upscales, image jobs, films, car swaps and stories),
-- written by the server whenever that work is saved, changed, deleted or
-- restored, so the library lists, filters, counts and pages from the database
-- alone: no storage read for what is not on screen. `thumb_key` is the small
-- WebP made when the work was saved (null until it exists); `asset_id` is the
-- full picture, opened only in the viewer. scripts/backfill-library.mjs fills
-- it once for work saved before this migration.
-- Client work: environment and row level security exactly as 0004 and 0006.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app.

create table if not exists studio.library_items (
  environment text not null default 'production',
  org_id text not null,
  kind text not null,
  id text not null,
  owner text not null,
  title text not null,
  tool text not null,
  car text,
  status text not null,
  thumb_key text,
  asset_id text,
  width integer,
  height integer,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (environment, kind, id)
);
create index if not exists library_items_env_org_created on studio.library_items (environment, org_id, created_at);
create index if not exists library_items_env_org_deleted on studio.library_items (environment, org_id, deleted_at);

do $$
begin
  alter table studio.library_items alter column environment set default studio.request_env();
  if not exists (select 1 from pg_constraint where conname = 'library_items_environment_ck') then
    alter table studio.library_items add constraint library_items_environment_ck check (environment in ('production', 'preview', 'development'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'library_items_kind_ck') then
    alter table studio.library_items add constraint library_items_kind_ck check (kind in ('visual', 'film', 'swap', 'story'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'library_items_status_ck') then
    alter table studio.library_items add constraint library_items_status_ck check (status in ('ready', 'working', 'failed'));
  end if;
  alter table studio.library_items enable row level security;
  alter table studio.library_items force row level security;
  drop policy if exists member_orgs on studio.library_items;
  create policy member_orgs on studio.library_items for all
    using (environment = (select studio.request_env()) and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), '{}'::text[]))))
    with check (environment = (select studio.request_env()) and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), '{}'::text[]))));
end
$$;

-- Nothing for anyone else (as 0001, 0002 and 0006 for their objects).
revoke all on studio.library_items from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.library_items from %I', api_role);
    end if;
  end loop;
end
$$;
