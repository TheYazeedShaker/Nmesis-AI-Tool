-- 0008_alert_recipients: who gets the company's 80% and 100% credit emails
-- (Company settings → Notifications). One row per chosen person. No rows: the
-- company's owners get them, as before this migration (lib/credits/recipients.ts).
-- A chosen person who has since left the company is skipped when sending.
-- One choice per company, shared by Production and Preview like support_grants
-- (the warnings are about the one company balance both spend from).
-- Members read it; only the company's owners change it (row level security,
-- forced, as in 0003's support_grants).
-- Idempotent. Run once by scripts/migrate.mjs as studio_app.

create table if not exists studio.alert_recipients (
  org_id text not null,
  user_id text not null,
  chosen_by text not null,
  chosen_at bigint not null,
  primary key (org_id, user_id)
);

alter table studio.alert_recipients enable row level security;
alter table studio.alert_recipients force row level security;
drop policy if exists read_recipients on studio.alert_recipients;
drop policy if exists owners_add on studio.alert_recipients;
drop policy if exists owners_change on studio.alert_recipients;
drop policy if exists owners_remove on studio.alert_recipients;
create policy read_recipients on studio.alert_recipients for select
  using ((select studio.request_is_staff()) or org_id = any (coalesce((select studio.request_orgs()), '{}'::text[])));
create policy owners_add on studio.alert_recipients for insert
  with check (org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])));
create policy owners_change on studio.alert_recipients for update
  using (org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])))
  with check (org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])));
create policy owners_remove on studio.alert_recipients for delete
  using (org_id = any (coalesce((select studio.request_owner_orgs()), '{}'::text[])));

-- Nothing for anyone else (as 0001–0003 for their objects).
revoke all on studio.alert_recipients from public;
do $$
declare api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on studio.alert_recipients from %I', api_role);
    end if;
  end loop;
end
$$;
