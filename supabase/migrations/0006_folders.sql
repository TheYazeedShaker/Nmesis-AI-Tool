-- 0006_folders: Projects and folders (Phase 3 group 1).
-- A folder belongs to a company and holds any of its work: key visuals
-- (image jobs and saved visuals), films, car swaps and stories. Folders go one
-- level of sub-folders deep (checked by the server). A piece of work sits in at
-- most one folder (folder_items' key); work in no folder is "Not in a folder".
-- Deleting a folder (deleted_at) leaves its work where it was made: its
-- memberships are removed by the server in the same statement batch.
-- Owners and creators change folders; viewers only read (lib/accounts/plan.ts).
-- Client work: environment and row level security exactly as 0004.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app.

create table if not exists studio.folders (
  id text primary key,
  org_id text not null,
  parent_id text,
  name text not null,
  created_by text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  environment text not null default 'production'
);
create index if not exists folders_env_org_parent on studio.folders (environment, org_id, parent_id);

create table if not exists studio.folder_items (
  environment text not null default 'production',
  org_id text not null,
  item_kind text not null,
  item_id text not null,
  folder_id text not null,
  updated_at bigint not null,
  primary key (environment, item_kind, item_id)
);
create index if not exists folder_items_env_org_folder on studio.folder_items (environment, org_id, folder_id);

do $$
declare t text;
begin
  foreach t in array array['folders', 'folder_items'] loop
    -- New rows take the request's environment (null, and so refused, without one).
    execute format('alter table studio.%I alter column environment set default studio.request_env()', t);
    if not exists (select 1 from pg_constraint where conname = t || '_environment_ck') then
      execute format('alter table studio.%I add constraint %I check (environment in (''production'', ''preview'', ''development''))', t, t || '_environment_ck');
    end if;
    execute format('alter table studio.%I enable row level security', t);
    execute format('alter table studio.%I force row level security', t);
    execute format('drop policy if exists member_orgs on studio.%I', t);
    execute format(
      'create policy member_orgs on studio.%I for all using (environment = (select studio.request_env()) and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), ''{}''::text[])))) with check (environment = (select studio.request_env()) and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), ''{}''::text[]))))',
      t);
  end loop;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'folder_items_kind_ck') then
    alter table studio.folder_items add constraint folder_items_kind_ck check (item_kind in ('visual', 'film', 'swap', 'story'));
  end if;
end
$$;

-- Nothing for anyone else (as 0001 and 0002 for their objects).
revoke all on studio.folders from public;
revoke all on studio.folder_items from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.folders from %I', api_role);
      execute format('revoke all on studio.folder_items from %I', api_role);
    end if;
  end loop;
end
$$;
