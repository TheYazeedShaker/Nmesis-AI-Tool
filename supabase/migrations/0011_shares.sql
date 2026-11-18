-- 0011_shares: who can see a piece of work, and its public view link (lib/shares.ts).
--
-- work_access: one row per piece of work whose creator (or a company owner)
-- chose who sees it. 'private' (Only me): listed and opened for its creator
-- alone (and Nmesis staff viewing with support access); 'view' (Company can
-- view): everyone in the company, as before this migration; 'edit' (Company can
-- edit): the same, and owners and creators may organise it. No row means 'view'.
--
-- share_links: a public view link, off unless someone turns it on. Only the
-- SHA-256 of its token is stored (the token is shown once, to the person who
-- made it). A link works until expires_at (1, 7 or 30 days) unless revoked_at
-- is set; making a new link revokes the item's previous one.
--
-- The public page (/view/<token>) has no signed-in user, so row level security
-- would show it nothing. studio.public_share(hash, env) is the one way in: it
-- sets `studio.share_hash` for its own statement, which the public_link
-- policies below accept for exactly the link with that hash and its one piece
-- of work, and answers only while the link is on, unexpired and the work is
-- not deleted. Granted to studio_app only.
--
-- Client work: environment and row level security exactly as 0004 and 0006.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app.

create table if not exists studio.work_access (
  environment text not null default 'production',
  org_id text not null,
  item_kind text not null,
  item_id text not null,
  access text not null,
  updated_by text not null,
  updated_at bigint not null,
  primary key (environment, item_kind, item_id)
);
create index if not exists work_access_env_org_access on studio.work_access (environment, org_id, access);

create table if not exists studio.share_links (
  id text primary key,
  environment text not null default 'production',
  org_id text not null,
  item_kind text not null,
  item_id text not null,
  token_hash text not null,
  expires_at bigint not null,
  revoked_at bigint,
  created_by text not null,
  created_at bigint not null
);
create unique index if not exists share_links_token_hash on studio.share_links (token_hash);
create index if not exists share_links_env_org_item on studio.share_links (environment, org_id, item_kind, item_id);

do $$
declare t text;
begin
  foreach t in array array['work_access', 'share_links'] loop
    -- New rows take the request's environment (null, and so refused, without one).
    execute format('alter table studio.%I alter column environment set default studio.request_env()', t);
    if not exists (select 1 from pg_constraint where conname = t || '_environment_ck') then
      execute format('alter table studio.%I add constraint %I check (environment in (''production'', ''preview'', ''development''))', t, t || '_environment_ck');
    end if;
    if not exists (select 1 from pg_constraint where conname = t || '_kind_ck') then
      execute format('alter table studio.%I add constraint %I check (item_kind in (''visual'', ''film'', ''swap'', ''story''))', t, t || '_kind_ck');
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
  if not exists (select 1 from pg_constraint where conname = 'work_access_access_ck') then
    alter table studio.work_access add constraint work_access_access_ck check (access in ('private', 'view', 'edit'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'share_links_hash_ck') then
    alter table studio.share_links add constraint share_links_hash_ck check (token_hash ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

-- The public page's two reads, for the one link whose hash its statement set
-- (nothing at all when `studio.share_hash` is unset, as on every other request).
drop policy if exists public_link on studio.share_links;
create policy public_link on studio.share_links for select
  using ((select nullif(current_setting('studio.share_hash', true), '')) is not null
    and environment = (select studio.request_env())
    and token_hash = (select nullif(current_setting('studio.share_hash', true), '')));
drop policy if exists public_link on studio.library_items;
create policy public_link on studio.library_items for select
  using ((select nullif(current_setting('studio.share_hash', true), '')) is not null
    and environment = (select studio.request_env())
    and exists (select 1 from studio.share_links s
                 where s.token_hash = (select nullif(current_setting('studio.share_hash', true), ''))
                   and s.environment = library_items.environment and s.org_id = library_items.org_id
                   and s.item_kind = library_items.kind and s.item_id = library_items.id));

-- The public page's lookup: the work behind a link, only while the link is on.
-- Answers no row for a malformed hash, an unknown environment, a revoked or
-- expired link, or deleted work. The settings it uses are put back before it ends.
create or replace function studio.public_share(p_hash text, p_env text)
returns table (org_id text, item_kind text, item_id text, owner text, title text, asset_id text, expires_at bigint)
language plpgsql volatile security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  was_hash text := coalesce(current_setting('studio.share_hash', true), '');
  was_env text := coalesce(current_setting('studio.env', true), '');
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_env is null or p_env not in ('production', 'preview', 'development') then
    return;
  end if;
  perform set_config('studio.share_hash', p_hash, true);
  perform set_config('studio.env', p_env, true);
  return query
    select s.org_id, s.item_kind, s.item_id, li.owner, li.title, li.asset_id, s.expires_at
      from studio.share_links s
      join studio.library_items li
        on li.environment = s.environment and li.org_id = s.org_id and li.kind = s.item_kind and li.id = s.item_id
     where s.token_hash = p_hash and s.environment = p_env
       and s.revoked_at is null
       and s.expires_at > (extract(epoch from clock_timestamp()) * 1000)::bigint
       and li.deleted_at is null and li.status = 'ready'
     limit 1;
  perform set_config('studio.share_hash', was_hash, true);
  perform set_config('studio.env', was_env, true);
end
$fn$;

-- Nothing for anyone else (as 0001, 0002, 0006 and 0007 for their objects).
revoke all on function studio.public_share(text, text) from public;
revoke all on studio.work_access from public;
revoke all on studio.share_links from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.work_access from %I', api_role);
      execute format('revoke all on studio.share_links from %I', api_role);
      execute format('revoke all on function studio.public_share(text, text) from %I', api_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'studio_app') then
    grant execute on function studio.public_share(text, text) to studio_app;
  end if;
end
$$;
