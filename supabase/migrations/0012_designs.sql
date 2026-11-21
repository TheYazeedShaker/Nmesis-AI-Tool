-- 0012_designs: the canvas editor's version history and its soft lock (editor format v2).
--
-- design_versions: one row per picture saved from the editor (lib/editor/versions.ts):
-- a new version (kind 'save'), a restored version (kind 'restore', `restored_from` the
-- version it copies) or the first picture of a duplicated design (kind 'copy'). The
-- pictures themselves stay in storage as before; this only says which design each
-- belongs to, so the editor lists a design's versions without reading the library.
-- Nothing here is ever updated or deleted by the Studio: restoring makes a new row.
--
-- design_presence: who has a design open, for the soft lock ("Being edited by …",
-- lib/editor/presence.ts). One row per person and design, refreshed every 20 s while
-- the editor is open (`seen_at`) and removed when it closes; a row older than 45 s
-- is ignored. `person` is the person's storage prefix and `name` their own display
-- name, both from the server's context, never from the request.
--
-- Client work: environment and row level security exactly as 0006 and 0007.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app.

create table if not exists studio.design_versions (
  environment text not null default 'production',
  org_id text not null,
  design_id text not null,
  version_id text not null,
  owner text not null,
  kind text not null,
  parent_id text,
  restored_from text,
  created_at bigint not null,
  primary key (environment, version_id)
);
create index if not exists design_versions_env_org_design on studio.design_versions (environment, org_id, design_id, created_at);

create table if not exists studio.design_presence (
  environment text not null default 'production',
  org_id text not null,
  design_id text not null,
  person text not null,
  name text not null,
  editing integer not null default 0,
  seen_at bigint not null,
  primary key (environment, org_id, design_id, person)
);
create index if not exists design_presence_env_org_design on studio.design_presence (environment, org_id, design_id, seen_at);

do $$
declare t text;
begin
  foreach t in array array['design_versions', 'design_presence'] loop
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
  if not exists (select 1 from pg_constraint where conname = 'design_versions_kind_ck') then
    alter table studio.design_versions add constraint design_versions_kind_ck check (kind in ('save', 'restore', 'copy'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'design_presence_editing_ck') then
    alter table studio.design_presence add constraint design_presence_editing_ck check (editing in (0, 1));
  end if;
end
$$;

-- Nothing for anyone else (as 0001, 0002, 0006 and 0007 for their objects).
revoke all on studio.design_versions from public;
revoke all on studio.design_presence from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.design_versions from %I', api_role);
      execute format('revoke all on studio.design_presence from %I', api_role);
    end if;
  end loop;
end
$$;
