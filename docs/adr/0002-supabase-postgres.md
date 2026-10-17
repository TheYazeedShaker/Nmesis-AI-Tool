# 0002 — Supabase Postgres replaces Turso (SQLite)

**Status:** accepted — 2026-10-17 (owner, in session).

## Context

The exported studio ran on SQLite (Cloudflare D1, then Turso via libSQL) only because that is what the original hosting used. The platform this repository is becoming needs Postgres: row-level security for tenant isolation, private definer functions, database-enforced constraints and branch databases per preview. No hosted database had been created yet, so no data or applied migration existed.

Options: (A) stay on Turso and migrate later; (B) Supabase Postgres now; (C) another managed Postgres (Neon, RDS).

## Decision

1. **B.** One Supabase project per environment (Production; Preview/staging). Auth stays on NextAuth and media stays on R2 for now; adopting Supabase Auth/Storage is a separate decision.
2. **Driver:** `postgres` (postgres.js) through the Supabase transaction pooler (`DATABASE_URL`, port 6543) with `prepare: false`; migrations may use the session pooler (`MIGRATION_DATABASE_URL`).
3. **Adapter kept.** `lib/portable/database.ts` keeps the D1-style `prepare().bind().first/all/run()` surface so the ~75 existing queries changed only where SQLite syntax differed (`json_set` → `jsonb_set`, typed `INSERT … SELECT` parameters). `bigint`/`numeric` are parsed to JS numbers.
4. **Fresh baseline.** The five SQLite migrations were never applied to any hosted database, so `drizzle/` was regenerated for Postgres (`0000_baseline`) instead of translated. Timestamps (ms) and money (USD millionths) are `bigint`.
5. **Concurrency.** SQLite serialised writers; Postgres does not. Two invariants relied on that:
   - the shared daily budget (a `SUM` across three tables): reservation statements carry `/*serialize:budget*/`, and the adapter runs them in a transaction after `pg_advisory_xact_lock`. The lock is global, not per payer: reservations are rare (one per paid generation) and the payer is not known before the statement runs.
   - one active upscale per parent image: now a partial unique index `topaz_jobs_one_active`.
6. **Exposure.** Every table has RLS enabled with no policies, and `0001_lock_down_client_roles` revokes table privileges from `anon`/`authenticated`. The server connects as the owner role, which bypasses RLS.
7. **Tests.** Unit tests run the real SQL on PGlite (in-process Postgres). `tests/integration/postgres.int.mjs` runs against a real server in CI: migrations idempotent, client roles locked out, and concurrent reservations/inserts. Both concurrency tests were mutation-checked: removing the lock or the index makes them fail.

## Consequences

- Owner setup changes: Supabase projects and `DATABASE_URL` replace Turso and its two variables.
- Ownership scoping is still enforced in application SQL (`WHERE owner=?`), not by RLS policies; per-tenant RLS comes with the platform's tenancy model.
- The global budget lock serialises all reservations across payers. Revisit if generation volume grows (per-payer lock keyed after reading the job's payer).
- PGlite is single-connection, so concurrency is only proven by the CI `postgres` job.
