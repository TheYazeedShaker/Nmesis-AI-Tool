-- 0010_brand_kits: the company's brand kit (the Brand page, lib/brand-kit.ts).
-- One kit per company and environment: up to 8 colours (JSON text, as the
-- studio's other `data` columns), a heading and a body font (names from a
-- curated list) and a one-line brand voice. Its logos are rows of their own;
-- each logo's picture lives in storage under orgs/<org>/brand/logos/<id>.
-- Removing a logo sets deleted_at and deletes the stored picture.
-- Everyone in the company reads; owners and creators change it (lib/accounts/can.ts,
-- checked again by every write route).
-- Client work: environment and row level security exactly as 0004 and 0006.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app.

create table if not exists studio.brand_kits (
  environment text not null default 'production',
  org_id text not null,
  colours text not null default '[]',
  heading_font text not null default 'System',
  body_font text not null default 'System',
  voice text not null default '',
  updated_by text not null,
  updated_at bigint not null,
  primary key (environment, org_id)
);

create table if not exists studio.brand_logos (
  id text primary key,
  org_id text not null,
  name text not null,
  content_type text not null,
  size bigint not null,
  created_by text not null,
  created_at bigint not null,
  deleted_at bigint,
  environment text not null default 'production'
);
create index if not exists brand_logos_env_org_created on studio.brand_logos (environment, org_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['brand_kits', 'brand_logos'] loop
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

-- What the server checks, held by the database as well: a logo is a PNG, JPEG
-- or WebP picture, and the voice is one line of at most 200 characters.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_logos_type_ck') then
    alter table studio.brand_logos add constraint brand_logos_type_ck check (content_type in ('image/png', 'image/jpeg', 'image/webp'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_kits_voice_ck') then
    alter table studio.brand_kits add constraint brand_kits_voice_ck check (char_length(voice) <= 200);
  end if;
end
$$;

-- Nothing for anyone else (as 0001, 0002 and 0006 for their objects).
revoke all on studio.brand_kits from public;
revoke all on studio.brand_logos from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.brand_kits from %I', api_role);
      execute format('revoke all on studio.brand_logos from %I', api_role);
    end if;
  end loop;
end
$$;
