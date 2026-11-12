# PROGRESS

> Read at session start; update at every stop. Refresh _Status_, append _Decisions_ and _Known issues_, rewrite _Next session_. **The repository is public: write this as if a customer will read it.** No credentials, no infrastructure identifiers, nothing about vendors or prospects.

**Last updated:** 2026-11-12

**Latest (2026-11-12, accounts S2):** Client accounts: Supabase Auth sign-in (password, email links, invitation and recovery → "Choose your password"), one server-side context per request (user, company, role, plan, staff), company-scoped library and storage, configurators from the master list, plan features enforced on every route with upsell chips in the workspace, forced row level security. Branch `feat/accounts-access` → PR into `development`. No hosted system was touched; owner steps are in the PR body and `docs/supabase-setup.sql` section 5.

**Earlier (2026-11-11, data layer S1):** Moved the studio from Turso + R2 to Supabase Postgres (own schema and role) + AWS S3, ready for multiple client organizations. Branch `feat/postgres-s3` → PR into `development`. No hosted system was touched; the owner steps are in the PR body, `docs/supabase-setup.sql` and `docs/s3-setup.md`.

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
| Accounts, client configurators, plans | 🟡 | PR S2 into `development`; hosted Supabase Auth settings, grants SQL and Vercel variables are owner steps |

## What was built last session

- **Sign-in** (`lib/auth/`, `app/signin`, `app/auth`, `proxy.ts`): Supabase Auth through `@supabase/ssr`, server-side only (httpOnly cookies; no Supabase client or key in the browser). Password, email link, "Forgot your password?" (one sentence for every address), invitation links from the admin (tokens after the #, handed to `/api/auth/session` once), PKCE callback, sign-out. Invitation and recovery links always stop at "Choose your password" (10+ characters, not the email address, the same twice, Show/Hide eye, "Skip, I'll use email links"); the decision is the server's (a recovery mark in our own cookie when the email is sent, then `app_metadata.nmesis_password_set`, written only with the secret key). After an admin-API password change a fresh password session is started and swapped in. Errors are mapped to plain sentences. Google is built behind `STUDIO_GOOGLE_SIGNIN` (off). NextAuth and the email allow-list are gone.
- **Context** (`lib/studio-context.ts`, `lib/accounts/`): `getStudioContext()` → user, company, role, entitlements (cached 60 s per company), staff, "viewing as". The company cookie is re-checked against active memberships on every request; first arrival marks an invited membership active. Staff open any company: Nmesis's own as owner, a client's read-only with a "Viewing as" banner, logged in `studio.staff_access_log`.
- **Plans** (`lib/accounts/plan.ts`): one route → feature table checked in `context()` for every API route (a test fails if a route is missing), plus line-ups, smart references and adding an object by request body; `studio.max_output` caps sizes and upscales; viewers are read-only; a switched-off or ended Studio pauses new work and keeps the library viewable for 30 days after the end date.
- **Company scoping**: rows keep `org_id` + owner (`orgs/<org>/users/<user>/`, Supabase ids); the library, films, swaps and stories are visible to the whole company, changes to their creator, deletes to the creator or a company owner. Provider keys and the video budget belong to the company (`orgs/<org>/keys/`), managed by owners when the plan has `studio.own_keys`; the `SHARED_OPENAI_*` sponsorship is gone.
- **Configurators**: `/api/configurators` serves the company's live cars (`configurator_access` or, with none, its brands' cars; staff see all), cached 10 minutes, joined to `CONFIGURATOR_ORIGIN`; no add/edit UI; the `s08` rule became an explicit per-car capture template (`studio.car_settings`). `CONFIGURATOR_PRESETS` is gone.
- **Database**: migration `0002_accounts_access.sql` forces row level security on every studio table with membership policies (security-definer helpers reading the accounts views); the adapter sets `studio.user_id` per statement for the signed-in user. `docs/supabase-setup.sql` section 5 adds the read-only views, the accept function and the grants for `studio_app`.
- **Verification**: lint 0 errors (warnings 169 → 162, none new), typecheck, 248/255 tests (7 Postgres tests skipped), production build; route-level cross-company, plan, viewer, staff and configurator tests (`tests/accounts-access.test.mjs`); sign-in flows end to end against a mocked Supabase Auth (`scripts/verify/signin-flow.mjs`, 33/33). **Not run:** anything against Postgres (the new migration, the forced row level security and the accounts views) or a hosted Supabase project; the workspace's account bar and upsell chips were not seen in a browser (they need the database).

## Decisions made (must be remembered)

- **Repository visibility:** stays public; scrub third-party names and infrastructure identifiers before pushing (owner, 2026-10-14). ADR 0001.
- **Data layer (owner, 2026-11-11):** Supabase Postgres in schema `studio` with its own login role `studio_app`; Preview uses a separate staging Supabase project. Media in a private AWS S3 bucket in `eu-central-1` with an IAM user scoped to that bucket; one bucket and IAM user per environment.
- **Multi-client (owner, 2026-11-11):** every row carries `org_id`; every object lives under `orgs/<org>/users/<user>/`. Until S2 all users belong to the studio's own organization (`lib/portable/tenancy.ts`).
- **Configurators (S2):** from the master list per company (staff: all live cars); no client add/edit; `CONFIGURATOR_ORIGIN` joins catalogue paths; capture template per car in `studio.car_settings`.
- **Accounts (S2, owner's task brief, 2026-11-12):** Supabase Auth in the company project, `accounts` read-only for the Studio; Google parked; staff open a client's workspace read-only ("Viewing as", logged) and Nmesis's own as owner; provider keys belong to the company (`studio.own_keys`, owners manage); upsell chips name the smallest plan with the feature (Growth, or Enterprise for film, swap, storyboards and own keys).
- **Branch model:** `main` = Production, `development` = staging, `moaz-playground` = sandbox; feature PRs into `development` (owner, 2026-10-14). ADR 0001.

## Known issues / TODOs

_Waiting on owner_

- S1 and S2 owner steps (exact list in the S2 PR body): Supabase Auth URL configuration and redirect URLs for each Studio address, section 5 of `docs/supabase-setup.sql` in the main and staging projects, `npm run db:migrate`, Vercel variables (`SUPABASE_*`, `CONFIGURATOR_ORIGIN`) and removal of the NextAuth, allow-list, `SHARED_OPENAI_*` and `CONFIGURATOR_PRESETS` values, `STUDIO_URL` on the admin.
- S3 buckets, IAM users and CORS (unchanged from S1).

_Carried_

- Not yet run against Postgres: migration 0002, forced row level security with the per-statement user setting, the accounts views, and `tests/postgres.test.mjs` / `scripts/verify/studio-flow.mjs` after S2 (the flow's stand-in user needs an accounts membership or staff row in that database).
- The accounts views depend on admin tables: re-run section 5 after an admin migration that changes them.
- A teammate's visual can be viewed and downloaded, but not yet used as a reference for new work (references are read from the person's own prefix).
- Companies without `studio.own_keys` have no provider keys until S3 (Nmesis-held keys).
- Lint debt (BACKLOG #4). Zod 3 advisory (GHSA-mrhx-c7xc-m3w5). `docs/VERIFICATION.md` describes the original export.

## Next session — start here

1. Reviewer: run `TEST_DATABASE_URL=… npm test` and migrations 0001–0002 on a disposable Postgres with a stand-in `accounts` schema (section 5 views), and check that `studio_app` sees only member companies' rows.
2. Owner: review the S2 PR; follow its owner steps in the staging project first, then sign in on the Preview as an invited test person (invitation → choose password → workspace).
3. S3 (owner's plan): Nmesis-held provider keys for companies without `studio.own_keys`, credits against `studio.credits_monthly`.
4. Continue the lint-debt queue (BACKLOG #4).
