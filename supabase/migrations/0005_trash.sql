-- 0005_trash: films, swaps and stories can be deleted and restored (Phase 2b,
-- the CRUD matrix's missing Delete). A deleted row keeps everything it had
-- (its media, its billing, the work that used it); deleted_at only takes it out
-- of the lists. Restoring clears it. Same rule as a library image's tombstone.
-- Idempotent. Run once by scripts/migrate.mjs as studio_app. No change to row
-- level security: the 0004 policies cover every column of these tables.
-- (Plain statements, one per table, so the fast tests' SQLite schema has the
-- column too.)
alter table studio.films add column if not exists deleted_at bigint;
alter table studio.swap_jobs add column if not exists deleted_at bigint;
alter table studio.storyboards add column if not exists deleted_at bigint;

create index if not exists films_org_deleted on studio.films (org_id, deleted_at);
create index if not exists swaps_org_deleted on studio.swap_jobs (org_id, deleted_at);
create index if not exists storyboards_org_deleted on studio.storyboards (org_id, deleted_at);
