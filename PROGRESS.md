# PROGRESS

> Read at session start; update at every stop. Refresh _Status_, append _Decisions_ and _Known issues_, rewrite _Next session_. **The repository is public: write this as if a customer will read it.** No credentials, no infrastructure identifiers, nothing about vendors or prospects.

**Last updated:** 2026-11-11

**Latest (2026-11-11, data layer S1):** Moved the studio from Turso + R2 to Supabase Postgres (own schema and role) + AWS S3, ready for multiple client organizations. Branch `feat/postgres-s3` → PR into `development`. No hosted system was touched; the owner steps are in the PR body, `docs/supabase-setup.sql` and `docs/s3-setup.md`.

**Earlier (2026-11-10, studio sync):** Synced the current studio feature updates into a feature branch from `development`, retaining the repository’s authentication, database and private-media adapters. The owner authorized feature PR → `development` → promotion PR → `main`. No hosted settings, production data, generated media or archives are included.

**Earlier (2026-10-14, pipeline test):** End-to-end pipeline check: this change went `ci/pipeline-smoke` → PR into `development` → CI on the PR + Vercel Preview → merge → `development` Preview deploy.

**Earlier (2026-10-14, bootstrap):** Imported the exported studio into Git, applied the bootstrap fixes below, set up CI and the `development` / `moaz-playground` branches. The owner created the Vercel project (Git-linked); the first Production deploy from `main` succeeded and the studio shell loads on the production domain.

## The plan

Grow Nmesis Studio from a single-team creative tool into a full platform. The platform scope is not yet specified (BACKLOG `PLATFORM-VISION`).

## Status

| Track                         | Status | Notes                                                                 |
| ----------------------------- | ------ | --------------------------------------------------------------------- |
| Source in Git                 | ✅     | `main`, `development`, `moaz-playground`                              |
| CI (`verify`, `secrets`)      | ✅     | `.github/workflows/ci.yml`                                            |
| Vercel project + Git deploys  | ✅     | `main` → Production, other branches → Preview                         |
| Hosted env vars               | ⏳     | Owner (BACKLOG #2). App builds and serves pages without them; sign-in and generation need them. |
| Branch rulesets on `main`     | ✅     | Active; PRs, required `verify` / `secrets`, squash only, no bypass (verified 2026-11-10). |
| Lint debt                     | 🟡     | Enforced; legacy rules downgraded to warnings (BACKLOG #4)            |
| Data layer (Postgres + S3)    | 🟡     | PR S1 into `development`; hosted Supabase/S3 setup is an owner step   |
| Accounts, client configurators, plans | ⏳ | PR S2 (owner's platform plan)                                |

## What was built last session

- **Database adapter** (`lib/portable/database.ts`): the same D1-style `prepare().bind().first/all/run` surface (plus D1 `batch` as one transaction) over the `postgres` client through the Supabase transaction pooler: small per-instance pool, no prepared statements, TLS, `search_path` = `studio`. `?` placeholders become `$1…$n` once per statement, skipping string literals, quoted identifiers and comments. Bigint values return as numbers.
- **Schema and migrations**: `supabase/migrations/0001_studio.sql` (idempotent) creates the six job tables with `org_id`, bigint time and money columns, RLS on with no policies, and revoked privileges for every other role; `scripts/migrate.mjs` applies it through `DATABASE_URL_DIRECT` with the same checksum guard and an advisory lock. `docs/supabase-setup.sql` is the owner's one-time role and schema setup. Drizzle, `db/`, `drizzle/` and `@libsql/client` were removed.
- **SQLite→Postgres fixes**: budget reservations now lock the payer's budget row first (Postgres runs writers concurrently); one active upscale per image is a partial unique index; bigint sums are cast back to numbers; untyped `SELECT ?` values are cast; the SQLite-only `json_set` became a compare-and-swap; a non-integer storyboard revision no longer reaches a numeric comparison.
- **Organizations**: one helper builds every storage prefix (`orgs/<org>/users/<user>/`); inserts carry `org_id`; list queries filter by it; shared-account pointers stay inside the organization.
- **Storage**: AWS S3 by default (`S3_REGION` required, no endpoint, virtual-hosted addresses), timeouts, conditional writes verified by tests; `docs/s3-setup.md` and `docs/s3-cors.example.json`.
- **Configurator presets** moved out of the browser bundle to `/api/configurators` (server-only `CONFIGURATOR_PRESETS`; the `s08` first-preset rule still works).
- `npm run check:setup` now checks the live database (schema, search path, migrations, no access to `public`) and bucket (probe put/conditional put/get/delete under `staging/`).
- Local verification: lint (0 errors; warnings identical to `development`), typecheck, 235/235 tests (7 Postgres tests skipped without `TEST_DATABASE_URL`), production build. See the S1 PR for what ran against a real Postgres.

## Decisions made (must be remembered)

- **Repository visibility:** stays public; scrub third-party names and infrastructure identifiers before pushing (owner, 2026-10-14). ADR 0001.
- **Data layer (owner, 2026-11-11):** Supabase Postgres in schema `studio` with its own login role `studio_app`; Preview uses a separate staging Supabase project. Media in a private AWS S3 bucket in `eu-central-1` with an IAM user scoped to that bucket; one bucket and IAM user per environment.
- **Multi-client (owner, 2026-11-11):** every row carries `org_id`; every object lives under `orgs/<org>/users/<user>/`. Until S2 all users belong to the studio's own organization (`lib/portable/tenancy.ts`).
- **Configurator presets:** server-only `CONFIGURATOR_PRESETS`, served to signed-in users by `/api/configurators`, no longer in the browser bundle.
- **Branch model:** `main` = Production, `development` = staging, `moaz-playground` = sandbox; feature PRs into `development` (owner, 2026-10-14). ADR 0001.

## Known issues / TODOs

_Waiting on owner_

- Supabase setup in the main and staging projects, S3 buckets and IAM users, then Vercel variables for Production and Preview: `DATABASE_URL`, `DATABASE_URL_DIRECT`, `S3_*`, `CONFIGURATOR_PRESETS` (exact steps in the S1 PR). Remove the old `TURSO_*`, `S3_ENDPOINT` and `NEXT_PUBLIC_CONFIGURATOR_PRESETS` values.
- Confirm hosted Preview and Production service configuration before running paid end-to-end generation tests.
- Google OAuth redirect URIs and S3 CORS for the Vercel domains.

_Carried_

- The deployment connection can now read deployment status and build logs (verified during the feature sync). The feature Preview built successfully and the signed-out workspace renders; authenticated provider flows remain unverified.

- Lint debt (BACKLOG #4).
- Dependency audit still reports the existing Zod 3 constrained-collection advisory (GHSA-mrhx-c7xc-m3w5). The available fix requires a major-version upgrade, which is outside this feature sync. Next.js critical advisories were resolved.
- `docs/VERIFICATION.md` describes the original export; it predates this repository.

## Next session — start here

1. Owner: review the S1 PR into `development`; follow its owner steps (Supabase SQL in the main and staging projects, S3 buckets, IAM users, CORS, lifecycle, Vercel variables), then run `npm run db:migrate` and `npm run check:setup` against each environment.
2. Smoke-test sign-in, an upload and the library on the Preview deployment once its variables are set.
3. PR S2 (accounts, sign-in, configurator assignment, plan features): replace `currentOrg()` in `lib/portable/tenancy.ts` with the signed-in member's organization, add membership-based RLS policies, and narrow `/api/configurators` to the client's presets.
4. Continue the lint-debt queue (BACKLOG #4).
