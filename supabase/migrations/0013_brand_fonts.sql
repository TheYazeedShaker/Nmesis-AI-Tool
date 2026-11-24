-- 0013_brand_fonts: the company's own font files (the Brand page's Fonts, and the
-- font list's Brand fonts in the editor; lib/brand-fonts/).
--
-- brand_fonts: one row per uploaded font file. A family is the files that share
-- its `family` name (read from the font's own name table), so a Regular, a Bold
-- and an Italic uploaded together or apart join one family. Each row says:
--   - what the file is: its family and style names, weight (100–1000), italic,
--     whether it is variable (`axes`, its axes as JSON; `weight_min`/`weight_max`,
--     the weight axis's range when it has one), its kind for the font list (sans,
--     serif, display, script or mono, from its own OS/2 classification), whether
--     it writes Arabic (its character map), its original format and size and
--     a SHA-256 of the original (the same file twice is one font);
--   - where it is: storage keys under orgs/<org>/brand/fonts/ for the original
--     (kept for PDF export), the sanitised WOFF2 the browsers load and the small
--     preview of the family's name. Browsers only ever get the sanitised files;
--   - the licence confirmation: who (`licence_by`, the person's user id), when,
--     the wording's version and the exact words shown;
--   - the font's own embedding permission (OS/2 fsType, kept as read and as one
--     of installable / editable / preview-print / restricted) and its status:
--     `ready`, or `refused` with a plain reason (no file is kept for it);
--   - who uploaded it and when; `deleted_at`/`deleted_by` when an owner removes
--     it (designs that use it then show "Missing font"; nothing is swapped).
--
-- Everyone in the company reads; only the company's owners add or change a font
-- (studio.request_owner_orgs, as support access in 0003 and the credit-email
-- recipients in 0008), checked again by every route (lib/accounts/can.ts). There
-- is no delete policy: the Studio removes a font by setting deleted_at, never by
-- deleting its row, so the licence record stays.
-- Client work: environment and row level security as 0004, 0006 and 0010.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app.

create table if not exists studio.brand_fonts (
  id text primary key,
  environment text not null default 'production',
  org_id text not null,
  family text not null,
  style text not null,
  weight integer not null,
  italic integer not null default 0,
  variable integer not null default 0,
  axes text not null default '[]',
  weight_min integer,
  weight_max integer,
  kind text not null default 'sans',
  arabic integer not null default 0,
  format text not null,
  size bigint not null,
  sha256 text not null,
  original_key text not null,
  woff2_key text,
  preview_key text,
  licence_by text not null,
  licence_at bigint not null,
  licence_version text not null,
  licence_text text not null,
  fs_type integer not null,
  embedding text not null,
  status text not null,
  reason text,
  created_by text not null,
  created_at bigint not null,
  deleted_at bigint,
  deleted_by text
);
create index if not exists brand_fonts_env_org_family on studio.brand_fonts (environment, org_id, family, created_at);
-- The same file twice in one company is one font (the upload answers that it is already there).
create unique index if not exists brand_fonts_env_org_file on studio.brand_fonts (environment, org_id, sha256) where deleted_at is null and status = 'ready';

do $$
begin
  -- New rows take the request's environment (null, and so refused, without one).
  alter table studio.brand_fonts alter column environment set default studio.request_env();
  alter table studio.brand_fonts enable row level security;
  alter table studio.brand_fonts force row level security;
end
$$;

drop policy if exists member_orgs on studio.brand_fonts;
drop policy if exists members_read on studio.brand_fonts;
drop policy if exists owners_add on studio.brand_fonts;
drop policy if exists owners_change on studio.brand_fonts;
create policy members_read on studio.brand_fonts for select
  using (environment = (select studio.request_env())
    and ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), '{}'::text[]))));
create policy owners_add on studio.brand_fonts for insert
  with check (environment = (select studio.request_env())
    and org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])));
create policy owners_change on studio.brand_fonts for update
  using (environment = (select studio.request_env())
    and org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])))
  with check (environment = (select studio.request_env())
    and org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])));

-- What the server checks, held by the database as well. A check that comes out
-- NULL passes in Postgres, so every nullable column a branch needs is named
-- "is not null" in it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_environment_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_environment_ck check (environment in ('production', 'preview', 'development'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_names_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_names_ck check (char_length(family) between 1 and 120 and char_length(style) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_shape_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_shape_ck check (
      weight between 1 and 1000 and italic in (0, 1) and variable in (0, 1) and arabic in (0, 1)
      and kind in ('sans', 'serif', 'display', 'script', 'mono')
      and ((weight_min is null and weight_max is null)
        or (variable = 1 and weight_min is not null and weight_max is not null
          and weight_min between 1 and 1000 and weight_max between weight_min and 1000)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_file_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_file_ck check (
      format in ('otf', 'ttf', 'woff', 'woff2') and size between 1 and 10485760 and sha256 ~ '^[0-9a-f]{64}$');
  end if;
  -- Every key is inside the company's own font folder.
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_keys_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_keys_ck check (
      starts_with(original_key, 'orgs/' || org_id || '/brand/fonts/')
      and (woff2_key is null or starts_with(woff2_key, 'orgs/' || org_id || '/brand/fonts/'))
      and (preview_key is null or starts_with(preview_key, 'orgs/' || org_id || '/brand/fonts/')));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_licence_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_licence_ck check (
      char_length(licence_by) between 1 and 64 and licence_at > 0
      and char_length(licence_version) between 1 and 32 and char_length(licence_text) between 1 and 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_embedding_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_embedding_ck check (
      fs_type between 0 and 65535 and embedding in ('installable', 'editable', 'preview-print', 'restricted'));
  end if;
  -- A ready font has its sanitised files; a refused one has a reason and no file for browsers.
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_status_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_status_ck check (
      (status = 'ready' and woff2_key is not null and preview_key is not null and reason is null and embedding <> 'restricted')
      or (status = 'refused' and woff2_key is null and preview_key is null and reason is not null and char_length(reason) between 1 and 300));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_fonts_deleted_ck') then
    alter table studio.brand_fonts add constraint brand_fonts_deleted_ck check ((deleted_at is null) = (deleted_by is null));
  end if;
end
$$;

-- Nothing for anyone else (as 0001, 0002, 0006 and 0010 for their objects).
revoke all on studio.brand_fonts from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.brand_fonts from %I', api_role);
    end if;
  end loop;
end
$$;
