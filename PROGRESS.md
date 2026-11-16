# PROGRESS

> Read at session start; update at every stop. Refresh _Status_, append _Decisions_ and _Known issues_, rewrite _Next session_. **The repository is public: write this as if a customer will read it.** No credentials, no infrastructure identifiers, nothing about vendors or prospects.

**Last updated:** 2026-11-16 (Design Phase 3 editor polish: brands, car pictures, the drop zone)

**Latest (2026-11-16, design programme Phase 3 editor polish, `design/editor-polish`):**
- Clients work as their brand. The brands come from `accounts.organisation_brands` through a new read-only view, `accounts.studio_brands` (setup SQL, section 5; until the owner re-runs it, they are worked out from each company's cars).
  - The brand's logo and name replace the company's name in the top bar, the switcher, Home and the notices.
  - A company with several brands switches between them. The choice is remembered (`studio_brand` cookie, re-checked on every request) and narrows the cars, Home and the library.
  - Staff see "Brand · Company". The legal name stays in Company settings, Usage and billing.
- Car names never repeat the brand ("IM 6", not "IM IM 6"), and old work is mended when it is shown or filtered.
- Home and the car picker show each car's real picture: the configurator's opening frame. The server fetches it once, only for the company's own cars, keeps a small WebP in the company's storage and serves it on a signed link. A new frame makes a new picture. Brand logos work the same way (`/api/cars/<id>/picture`, `/api/brands/<id>/logo`).
- One design-system drop zone wherever a picture is added. Inspiration is one card. The capture wording is plain, and the screen-share prompt is explained only just before the browser asks. Area edit, upscale and the provider connection dialogs are on the design system.
- Phones: the editor is a full-screen column, so nothing is ever under the Generate bar.
- `check:ui`:
  - fails on a fixed-position control over the settings panel (`fixedOverSettings`);
  - takes screenshots of screens in given states;
  - runs a local stand-in configurator;
  - its ratchet holds the #35 counts.
- The round "≡" button seen at the right edge on Preview is not the Studio's: it is the Vercel Toolbar, which Vercel adds to protected Preview deployments for signed-in team members. Owner step: turn it off for Preview in the Vercel project's settings.
- No hosted system was touched.

**Earlier (2026-11-16, design programme Phase 3 group 2):**
- The library at scale:
  - migration `0007_library_index.sql`: `studio.library_items`, one row per piece of work, kept up to date on every save, delete and restore, with the environment rule and row level security as 0004;
  - small WebP thumbnails are made when work is saved; `npm run library:backfill -- --env <production|preview> --staff <uuid>` indexes existing work and makes its thumbnails (once per environment, after 0007);
  - `/api/library` lists from the database only, 40 at a time with infinite scroll ("Load more" too), and signs thumbnail links; full images load only in the viewer through short-lived signed links. Until 0007 runs, the group 1 feed is used (`indexReady`);
  - `check:ui` seeds 1,000 items: on the phone profile (4x CPU, throttled network) first paint 332 ms, thumbnails only for the tiles on screen, no full image and no storage read for work.
- The one editor for key visual, line-up, film, swap and story, built from the approved editor screens, inside the 2b shell, light and dark: the canvas or preview, the history of versions under it, one settings panel (car, view, prompt, quality as Standard / High detail), Generate with its credit cost, the credits used on every result, Save to project. Each screen keeps its old behaviour.
- The configurator sits behind one adapter (`components/editor/configurator.ts`: getOptions, setColour, setTrim, setView, setFrame, capture). Today's adapter (`iframe-configurator.ts`) drives the in-iframe capture flow; remote control will be a new adapter, with no editor change.
- Responsive root fix (owner's review of the editor screens): on phones and touch screens the control tokens are 44px; text controls grow with their words (min sizes only, never a fixed width); buttons, chips, badges and segmented controls never shrink and their rows wrap; the editor fills the height left with flex. Guarded by a test (no size token as a fixed width on a control with text) and `check:ui` `controlsSpilling` (0, ratcheted). Checked at 390, 768, 1024, 1280 and 1440.
- Home: the tool cards are all the same width and height.
- Branch `design/editor` → PR into `development`. No hosted system was touched.

**Earlier (2026-11-15, design programme Phase 3 group 1):**
- Built new from the approved wireframes, in the design system, light and dark, inside the 2b top bar:
  - Home at `/` (what to make, the tools, recent work, the company's cars);
  - the one shared library at `/library` (every kind of work, folders on the left, search, filters, grid or list, select several, Move to…, Delete with Undo, Deleted with Restore, the viewer);
  - Projects at `/projects` and a folder at `/projects/<id>`.
- The key-visual tool moved to `/key-visual`; it reads `?car=` and `?brief=` from Home.
- The top bar's navigation is Home · Library · Projects · Tools (a menu of the five tools). It follows the system's light or dark on the new screens and stays dark on the tool screens until group 2.
- Migration `0006_folders.sql`: `studio.folders` and `studio.folder_items`, with the environment rule and row level security as 0004. Folders have one level of sub-folders, each piece of work is in at most one folder, and deleting a folder can be undone. Until 0006 runs, the library shows everything and folder changes say they are not available yet (`foldersReady`).
- `/api/library`: one feed of key visuals, line-ups, films, swaps and stories. It carries no provider, model, cost, error or other person's address.
- Branch `design/home-library` → PR into `development`. No hosted system was touched.

**Earlier (2026-11-15, design programme Phase 2b, shared fixes):**
- F-050 everywhere: a client without its own keys reads no provider or model name on any page (tool pages, cost lines, cards, pickers, progress, errors, recovery messages, notices). Pickers are quality choices (Standard / High detail / Fast, or the tool's plain names: Studio, Reference match, Campaign look). Server errors, job errors and diagnostics are rewritten per request (`lib/provider-scope.ts`, opened by `context()` before its first await); the original stays in the server log. Staff and own-key companies keep the names. `check:ui` reads every client page as a no-own-key client (text, `aria-label`, `title`, `alt`): `providerNamesShown` is 0 and ratcheted.
- One top bar on every screen (`components/studio-topbar.tsx`, design-system classes, dark like the screens): one shared navigation, the credit meter, the company switcher (a modal), the account; below 768px one menu with 44px rows. Replaces eight different headers and `app/topbar-phone.css`.
- The design system's dialog in place of `confirm()` (none left); toasts with Undo on every screen (`components/studio-providers.tsx`).
- Removing a provider key (OpenAI, Google, Topaz, video) waits for Undo; sent when the toast closes, or on leaving the page (keepalive).
- Films, swaps and stories: Delete with Undo, and a Deleted view with Restore (migration `0005_trash.sql`, `lib/trash.ts`; creator or owner; running work cannot be deleted; a deleted row takes no changes). Until 0005 runs, everything works as before and only Delete says it is not available yet (`lib/trash-ready.ts`).
- Visible focus on text boxes, choices, disclosure rows and the configurator frame; 24px minimum for the small text and corner buttons; the card "…" menu 44px on touch; no sideways scroll at any width; no layout shift from the notices, Films or Line-up loading.
- Job polling backs off while nothing changes (`lib/use-backoff-poll.ts`), not while the tab is hidden. The resolved context is reused 10 s per person, company choice and sign-in level (`CONTEXT_REUSE_MS`); the session is still verified on every request.
- Branch `design/shell` → PR into `development`. No hosted system was touched.

**Earlier (2026-11-15, design programme Phase 2a, quick fixes):**
- Fixes (`design/quick`):
  - the phone top bar keeps the company, credits, settings and Sign out on screen at 390 / 360 (`app/topbar-phone.css`, tokens only; F-006);
  - an ended plan says "Plan ended … ask Nmesis to renew it" instead of "Available on Growth" (F-051);
  - only the person who started a job is asked to keep the page open (F-034, corrected: Phase 1 had misread seeded work in progress);
  - plainer Higgsfield wording (F-035), no "↗" on internal links (F-005), no operator sentences (F-066);
  - the meter and banner link to Usage only for those who may open it (F-033);
  - library cards say the tool and Standard / High detail, never the provider or model; "Made with …" appears in the card's details only for staff and own-key companies (F-050);
  - one unreadable job row is skipped and logged and the rest of the library shows (F-065);
  - the configurator's "Captured view / Live configurator" switch is a radio group, and the gallery's list fixed (critical axe → 0, F-025, F-028).
- The tokens, the .ds- components and the fonts now load app-wide (no visual change outside .ds-).
- `check:ui` allows ±5 on focus-without-indicator.
- Branch `design/quick` → PR into `development`. No hosted system was touched.

**Earlier (2026-11-15, design programme Phase 1, audit — findings only):** `npm run check:ui` runs every Studio screen in Chromium (Playwright + axe) at 1440 / 1280 / 1024 / 768 / 390 / 360, light and dark, as owner, creator, viewer, staff (own workspace, "Viewing as", refused) and the Starter / ended / Enterprise states, against the production build with CI's Postgres, a mocked Supabase Auth and the S3 stand-in, seeded with a synthetic world (`scripts/ui/seed.mjs`: 5 companies, 300 visuals, films, swaps, storyboards, 85% / 100% credits, long names, zero and huge numbers). The Studio server runs with `scripts/ui/no-network.mjs` (every non-local connection refused) and no provider key. A CI job `ui` runs it on every PR with `--perf --shots` and uploads `ui-report` (7 days); `scripts/ui-baseline.json` ratchets the counts. Docs: `docs/design-audit/harness.md` (checks and the harness's own mistakes), `crud.md`, `findings.md` (69 findings in 18 areas, top 15, fix order). Branch `design/audit` → PR into `development`. No hosted system was touched; nothing in the Studio was changed.

**Earlier (2026-11-15, environment scope):** Production and Preview share the main Supabase project, so client work now carries its environment. Migration `0004_environment.sql` adds `environment` to films, swap_jobs, storyboards, image_jobs, topaz_jobs and film_budgets (existing rows → `production`; new rows default to the request's), and their row level security requires `environment = studio.request_env()`. The adapter (`lib/portable/database.ts`) sets `studio.env` from `VERCEL_ENV` (`lib/portable/environment.ts`; `development` locally; a production server without it refuses) on every statement with `studio.user_id`. No route changed. credit_holds and staff_access_log record the environment but stay shared (one company balance; owners see every staff opening); credit_accounts, support_grants and car_settings are unchanged. Saved keys and media were already per environment (S3). Separate `KEY_ENCRYPTION_SECRET`s kept. Branch `fix/env-scope` → PR into `development`. No hosted system was touched.

**Earlier (2026-11-15, design programme Phase 0, foundations):** The Studio has a design system: tokens (`app/tokens.css`: spacing on a 4px base, 10 text sizes with line heights, 4 weights, tabular figures, 6 corners, 3 elevations, 3 durations and one easing, 7 layers, 6 breakpoints, 36/44px controls, every colour a light/dark token in the admin's Nmesis palette), components (`app/design-system.css` + `components/ds/`: app shell with credit meter, company switcher, support-access status, "Viewing as" and phone navigation; page header, section, remembered fold; field and every control; buttons; confirm dialog; Undo toasts; job card; media tile, grid, bulk bar and viewer; menu; empty/no results/error; upsell; skeletons; tabs in the URL; modal, drawer, bottom sheet; the editor layout), `docs/design-system.md` (measurements, scales, old → new mapping, rules), a staff-only gallery at `/design-system` with wireframes of Home, Projects and folders, Library and the editor at 1440 and 390, and the guard `npm run check:design` in CI (baseline 2,209; counts may only go down). No existing screen changed: the system loads only on the gallery routes. CLAUDE.md, AGENTS.md, README and the setup SQL now say Preview and Production share the main Supabase project, with separate S3 buckets, keys and provider budgets. Branch `design/foundations` → PR into `development`. No hosted system was touched.

**Earlier (2026-11-14, S3 credits and opt-in support access):** Nmesis pays the AI providers with its own server-side keys (`OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `HIGGSFIELD_API_KEY`, `TOPAZ_API_KEY`); companies spend credits. Every paid action quotes or looks up its cost, converts it (`ceil(cost ÷ credit_basis)`), reserves a hold atomically against `accounts.credits_balance` (`studio.credit_holds`, a company row lock plus one conditional insert), calls the provider, then settles into `accounts.usage_ledger` through `accounts.record_usage` (setup SQL section 6) or releases the hold. The per-payer daily budget is gone. 80% / 100% emails to the owners (once per period) and a banner; at 100% paid actions stop. A Usage page (owners, staff with access), a top-bar meter, costs in credits before actions and credits used on results; no provider cost reaches a page. Own keys only with `studio.own_keys` (0 credits, "own key"); a key saved earlier is ignored, not deleted. A client with no active subscription has no Studio. Staff open a client only while its owner grants support access (`studio.support_grants`, 7 days, read-only, every opening listed for the owner). Branch `feat/credits` → PR into `development`. No hosted system was touched.

**Earlier (2026-11-14, S2.1 hosted-run fixes and the staff portal):** Fixes from the owner's first hosted run on the Preview: sign-in links return to one stable Studio address (`STUDIO_PUBLIC_ORIGIN`, else Vercel's production or branch address); `KEY_ENCRYPTION_SECRET` is checked once per process (exactly 64 hex characters; a wrong value answers 503 "Secure key storage is misconfigured." and logs the rule, never the value; also in `check:setup`); `docs/supabase-setup.sql` runs as hosted Supabase's non-superuser `postgres` (CI runs it twice as a CREATEROLE non-superuser); a provider account with no credit fails the job at once with one sentence and keeps no budget reserved (OpenAI, Google, Higgsfield, Topaz). Staff portal: staff need the six-digit code (Supabase AAL2, the admin's own factor) on every request, the switcher has Nmesis and Clients sections with search over 8, the last company is remembered across sign-out, a "Nmesis staff?" note on the sign-in page, and a server-checked deep link `/?org=<id>`. Branch `fix/s2-hosted` → PR into `development`. No hosted system was touched.

**Earlier (2026-11-12, accounts S2):** Client accounts: Supabase Auth sign-in (password, email links, invitation and recovery → "Choose your password"), one server-side context per request (user, company, role, plan, staff), company-scoped library and storage, configurators from the master list, plan features enforced on every route with upsell chips in the workspace, forced row level security. Branch `feat/accounts-access` → PR into `development`. No hosted system was touched; owner steps are in the PR body and `docs/supabase-setup.sql` section 5.

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
| Accounts, client configurators, plans | ✅ | S2 merged into `development`; running on the Preview against the main Supabase project and S3 |
| S2.1 hosted fixes, staff portal | ✅ | Merged into `development` and released to `main` (#22) |
| S3 credits, own keys, support access | ✅ | Merged into `development` (#28); owner steps (setup SQL section 6, provider accounts and limits, Vercel variables, plans per client) in the PR body |
| Design programme | 🟡 | Phases 0 (#29), 1 (#31), 2a (#32), 2b (#33), Phase 3 group 1 (#34) and group 2 (#35) merged; editor polish PR `design/editor-polish`; owner migrates 0007, runs the backfill, re-runs setup SQL section 5 |
| Environment scope | 🟡 | Merged (#30); owner runs `npm run db:migrate` (0004) only after the change is live on Preview **and** Production |

## What was built last session (Design Phase 0)

- **Measured first** (`npm run design:inventory`): 34 text sizes, 39 paddings, 40 margins, 23 gaps, 16 radii, 9 shadows, 15 breakpoints, 647 colours written out across 7 stylesheets and 98 components. Scales and the old → new mapping are in `docs/design-system.md` section 2.
- **Tokens** (`app/tokens.css`): `--ds-` prefix because Tailwind owns `--text-*`, `--radius-*` and the rest; steps and brand names match the admin's. Colour tokens are `light-dark()` pairs declared on `:root`, `.ds-app` and `[data-theme]` (Lightning CSS turns `light-dark()` into variables resolved where declared; on `:root` alone the themes never switched).
- **Components** (`components/ds/`, React; `app/design-system.css`, every selector `.ds-`): listed in `docs/design-system.md` section 3. Native `<dialog>` for modal, drawer, sheet and viewer; `useConfirm()` replaces `confirm()`; `useToast().undo()`; the job card's words in `lib/ds/words.ts`.
- **Gallery** (`/design-system`, `/design-system/wireframes/<screen>?theme=`): staff only (server check, else 404), rendered per request. Locally without Supabase: `STUDIO_DESIGN_GALLERY=open npx next dev` (development only). Inter and Outfit through `next/font` with preload off, on these routes only.
- **Guard** (`scripts/check-design.mjs`, `scripts/design-baseline.json`, CI step after Typecheck): classes nothing styles (ours plus Tailwind's own compiler), `confirm/alert/prompt`, raw colours, sizes off the scale, controls with no class. Baseline: 68 · 2 · 745 · 1,340 · 79 = 2,209.
- **Tests** `tests/design-system.test.mjs` (19): token scales, no Tailwind name clash, CSS scoped to `.ds-`, keyframes only transform/opacity, six breakpoints, job and meter words, gallery access and per-request rendering, component markup (labels, ARIA, every class styled), no browser dialogs, the guard passes.
- **Verification**: lint 0 errors (169 warnings, none in the new files), typecheck, 305 tests (293 pass, 12 Postgres skipped locally), production build. Gallery and wireframes checked in a browser at 1440 and 390, light and dark: no sideways scroll at 390.

## What was built in S3

- **Credits engine** (`lib/credits/`): `pricing.ts` (cost table in USD micros, price-book overrides `credit_basis` and `studio_cost.<key>`, `creditsFor`, the meter), `words.ts` (client-safe key names and sentences; no prices), `store.ts` (the SQL: company lock `LOCK_CREDITS_SQL`, `RESERVE_CREDITS_SQL` that inserts the hold only when `credits_total(org) − live holds ≥ credits`, settle = lock + `record_usage` + mark settled in one transaction, release; reads through the `accounts.studio_*` views), `charge.ts` (reserve → run → settle / release; billing `credits` | `own key` | `internal`; a provider's no-credit refusal on Nmesis's key becomes "<provider> is unavailable for the Studio right now. Nmesis has been told…" and alerts Nmesis), `alerts.ts` (one JSON HTTP email API; mockable), `usage.ts` (the credits overview and the Usage page).
- **Database**: migration `0003_credits.sql` — `credit_accounts` (lock + last warning per period), `credit_holds`, `support_grants` (owner-write RLS via `studio.request_owner_orgs()`), `hold_id` and `credits` on the four job tables, wrappers `studio.credits_total`, `studio.credits_balance`, `studio.record_usage` (closed when section 6 is missing). Setup SQL section 6: `accounts.record_usage` (security definer, validated, idempotent per reference, allowance then packs soonest-expiring first), the views `studio_usage`, `studio_credit_packs`, `studio_people`, `studio_price_book` (no provider or cost columns), grants, and `accounts.studio_support_access(org, staff)` for the admin's button.
- **Every paid route**: OpenAI key visuals, line-ups and area edits; Google Nano Banana generate, analyse and area edits; directions, smart prompts and checks, story plans and frames; Higgsfield films, swaps and images (credits at the estimate, reserved with the job's quoted → submitting change in one transaction, settled on acceptance, released on refusal, kept while uncertain); Topaz upscales (settled when saved, released if Topaz fails).
- **Context**: `studioEntitlements` turns a client's "legacy" answer into "no plan" (Studio off, "Your Studio isn't part of your plan yet. Ask Nmesis."; Nmesis's own workspace exempt). Staff see and open a client only with a live grant (`directory.supportGrants`); `/?org=` answers `?opened=support` and the switcher "Support access not granted".
- **Pages**: `/usage`, `/company` (support access and the openings log), the top-bar meter and 80% / 100% banner, cost labels before actions and "Used N credits" on results; Connections show "Nmesis provides the AI for your plan" and the balance without own keys; film, swap and storyboard approvals are in credits.
- **Verification**: see the PR body (V0–V9). Lint 0 errors (163 warnings, none new in the files this branch touched), typecheck, tests (fast suites locally; the Postgres ones in CI), production build.

## What was built in S2.1

- **Sign-in link address** (`lib/auth/origin.ts`): `STUDIO_PUBLIC_ORIGIN` (validated: https, no path) → `VERCEL_PROJECT_PRODUCTION_URL` on Production → `VERCEL_BRANCH_URL` on a Preview → the request origin locally. README and the setup SQL header list the redirect URLs each Studio needs and the Preview Deployment Protection caveat.
- **Key secret** (`lib/secret-crypto.ts`): `keySecretState()` checks `KEY_ENCRYPTION_SECRET` once per process; `requireKeySecret()` before every save/open answers 503 "Secure key storage is misconfigured."; upload tickets use the same check; `check:setup` checks the rule and `STUDIO_PUBLIC_ORIGIN`.
- **Setup SQL**: `create role studio_app login noinherit;` and `alter role … with login password …;` only (a non-superuser may run them); `tests/postgres.test.mjs` now runs the file twice as a CREATEROLE non-superuser owning the accounts fixture.
- **No credit** (`lib/provider-credit.ts`): each provider's billing codes and words; OpenAI (`providerError`, smart references), Google, Higgsfield (films, swaps, image jobs: failed at once, `reserved_day` cleared) and Topaz answer 402 with "Your <provider> account has no credit left. Add credit …, then try again. Nothing was charged here." The OpenAI connection notes that verification can't see the credit balance.
- **Staff portal**: `verifiedUser()` reads the AAL of the token Supabase just verified; `resolveContext` refuses staff below AAL2 (`mfa_required`, 401 on every API route); `/auth/code` (six-digit code, or enrolment with the QR as an encoded SVG data URL and the typed key), `/api/auth/mfa`, `/api/auth/mfa/enrol`; the password route sends staff to the code; the switcher (Popover + Command) shows Nmesis and Clients for staff with search from 9 companies; `/?org=<id>` → `/auth/open` (server-checked, refused links land on the own workspace with a notice).
- **Verification**: lint 0 errors (162 warnings, none new), typecheck, tests (see the PR body), production build.

## What was built in S2

- **Sign-in** (`lib/auth/`, `app/signin`, `app/auth`, `proxy.ts`): Supabase Auth through `@supabase/ssr`, server-side only (httpOnly cookies; no Supabase client or key in the browser). Password, email link, "Forgot your password?" (one sentence for every address), invitation links from the admin (tokens after the #, handed to `/api/auth/session` once), PKCE callback, sign-out. Invitation and recovery links always stop at "Choose your password" (10+ characters, not the email address, the same twice, Show/Hide eye, "Skip, I'll use email links"); the decision is the server's (a recovery mark in our own cookie when the email is sent, then `app_metadata.nmesis_password_set`, written only with the secret key). After an admin-API password change a fresh password session is started and swapped in. Errors are mapped to plain sentences. Google is built behind `STUDIO_GOOGLE_SIGNIN` (off). NextAuth and the email allow-list are gone.
- **Context** (`lib/studio-context.ts`, `lib/accounts/`): `getStudioContext()` → user, company, role, entitlements (cached 60 s per company), staff, "viewing as". The company cookie is re-checked against active memberships on every request; first arrival marks an invited membership active. Staff open any company: Nmesis's own as owner, a client's read-only with a "Viewing as" banner, logged in `studio.staff_access_log`.
- **Plans** (`lib/accounts/plan.ts`): one route → feature table checked in `context()` for every API route (a test fails if a route is missing), plus line-ups, smart references and adding an object by request body; `studio.max_output` caps sizes and upscales; viewers are read-only; a switched-off or ended Studio pauses new work and keeps the library viewable for 30 days after the end date.
- **Company scoping**: rows keep `org_id` + owner (`orgs/<org>/users/<user>/`, Supabase ids); the library, films, swaps and stories are visible to the whole company, changes to their creator, deletes to the creator or a company owner. Provider keys and the video budget belong to the company (`orgs/<org>/keys/`), managed by owners when the plan has `studio.own_keys`; the `SHARED_OPENAI_*` sponsorship is gone.
- **Configurators**: `/api/configurators` serves the company's live cars (`configurator_access` or, with none, its brands' cars; staff see all), cached 10 minutes, joined to `CONFIGURATOR_ORIGIN`; no add/edit UI; the `s08` rule became an explicit per-car capture template (`studio.car_settings`). `CONFIGURATOR_PRESETS` is gone.
- **Database**: migration `0002_accounts_access.sql` forces row level security on every studio table with membership policies (security-definer helpers reading the accounts views); the adapter sets `studio.user_id` per statement for the signed-in user. `docs/supabase-setup.sql` section 5 adds the read-only views, the accept function and the grants for `studio_app`.
- **Verification**: lint 0 errors (warnings 169 → 162, none new), typecheck, 257/257 tests including the Postgres tests (local Postgres 17; CI now runs them against a Postgres 17 service container), production build; route-level cross-company, plan, viewer, staff and configurator tests (`tests/accounts-access.test.mjs`); sign-in flows end to end against a mocked Supabase Auth (`scripts/verify/signin-flow.mjs`, 33/33). Review fix (2026-11-13): the 0002 policies compared `org_id` to a subquery of arrays (`text = text[]` on Postgres 16/17); now `any (coalesce((select studio.request_orgs()), '{}'::text[]))`. `tests/postgres.test.mjs` loads a synthetic accounts schema (`tests/fixtures/accounts-schema.sql`), runs the setup SQL and both migrations twice, and checks forced RLS: a member sees and changes only their company, invited-only and no user see nothing, staff see all. **Not run:** a hosted Supabase project; the workspace's account bar and upsell chips in a browser.

## Decisions made (must be remembered)

- **Provider names (owner, F-050, 2026-11-15):** clients never see provider or model names on cards or in the library: the tool ("Key visual") and at most "Standard" / "High detail". Staff, and companies using their own keys, see the provider in the item's details.
- **Design direction (owner, 2026-11-15):** every change uses the Phase 0 design system and the approved wireframes, in the Nmesis theme. Phase 2b builds the new app shell and moves every screen to the new components, without re-laying out Home, the library or the tool screens (only their safety, accessibility and behaviour findings). Phase 3 group 1 rebuilds Home, projects and folders and the library to the wireframes; group 2 rebuilds the editor for all tools. Before each Phase 3 group, post the screens at 1440 and 390 next to the matching wireframe.
- **check:ui ratchet (owner, 2026-11-15):** focus-without-indicator stays in the ratchet with a tolerance of ±5.
- **Phase 3 group 1 (owner, 2026-11-15):** don't fix old screens. Group 1 builds Home, projects and folders (`studio.folders`, migration 0006) and the one shared library new from the approved wireframes, in the Nmesis theme, inside the 2b shell, light and dark. Every 2b gain is kept. The screens were posted next to the wireframes and approved ("Yes, build it"), with these decisions:
  - Home at `/`, the key-visual tool at `/key-visual`, `/library`, `/projects` and `/projects/<id>`;
  - the navigation is Home · Library · Projects · Tools;
  - Home shows the five tools that have screens;
  - deleted work goes to "Deleted" with no automatic purge;
  - "Not in a folder" replaces "Unsorted";
  - one level of sub-folders, and at most one folder per piece of work.
  The wireframe's bottom bar on phones was dropped while building: it covered the work at the bottom of the screen (`check:ui` overlapped), so phones use the top bar's menu.
- **Phase 3 group 2 (owner, 2026-11-16):** the library lists from the database only (about 40 at a time), thumbnails made on save plus a one-off backfill, full images only in the viewer through short-lived signed links; tested with 1,000 items (first paint under 1.5 s on the phone profile, no storage reads for work off screen). One editor for all five tools; the configurator behind one adapter with the remote-control protocol's functions, implemented today with the in-iframe capture. The editor screens were approved with one correction: fix mobile responsiveness at its cause in the grid/flex system and test small laptops too. Rule kept since: touch sizes come from the tokens as min sizes; a fixed width only for square icon controls.
- **Brands (owner, 2026-11-16, editor polish):** clients work as their brand (`accounts.organisation_brands`). The company's legal name appears only in Company settings, Usage and billing. A company with several brands switches between them, and the choice narrows the cars, Home and the library and is remembered. Staff see "Brand · Company".
- **Car names and pictures (owner, 2026-11-16):** the brand is never repeated in front of a model name that starts with it. A car's picture is the configurator's opening exterior frame, fetched once by the server, kept small in the Studio's storage and refreshed when the configurator changes; a neutral placeholder is shown only when the car has no frames.
- **Configurator adapter (owner, 2026-11-16):** keep it exactly as it is; the admin is starting remote control.
- **F-050 everywhere (owner, 2026-11-15, Phase 2b brief):** no provider or model name anywhere for a client without own keys: tool pages, cost lines, cards, pickers, progress, errors, recovery messages, notices. Model pickers are quality choices; provider errors are rewritten in plain words with the original in the server log; own-key Enterprise texts and staff views keep the names. A test renders every client page as a no-own-key client and fails on any provider name in the visible text or `aria-label` / `title` / `alt`.

- **Environment scope (owner, 2026-11-15):** every studio table holding client work carries `environment` (production / preview / development, from `VERCEL_ENV`); existing rows are Production's; every read and write is filtered in the database layer (RLS + `studio.env`), not per route; separate `KEY_ENCRYPTION_SECRET`s. Shared on purpose: credit holds and the company lock (one balance), support grants, the staff-access log, car settings.
- **Wireframes (owner, 2026-11-15):** approved as they are.
- **Shared records and Preview testing (owner, 2026-11-15, review of #30):** credit holds and the staff-access log stay shared (agreed). Preview is tested with Nmesis's own workspace or a test company, so its credits are never a client's; no admin change needed.

- **Environments (owner, 2026-11-15):** Preview and Production share the main Supabase project; S3 buckets, keys and provider budgets stay separate per environment. Written into CLAUDE.md, AGENTS.md, README and the setup SQL.
- **Design programme (owner's brief, 2026-11-15):** five phases, one PR each, stop after each for review: 0 foundations, 1 audit (findings only), 2a quick fixes, 2b shared fixes, 3 per approved group ("Home, projects and folders" first), 4 guard. Target: a Canva-style workspace in the Nmesis theme (the admin's tokens), light and dark. The Studio's tokens use the admin's step and colour names with a `--ds-` prefix.

- **Credits (owner's S3 brief, 2026-11-14):** Nmesis pays OpenAI, Google, Higgsfield and Topaz with its own accounts; companies spend credits (plan allowance, then packs). An action costs `ceil(provider cost USD ÷ credit_basis)`; fixed-cost actions use the Studio's cost table, overridable per action from the price book. The Studio writes the ledger only through `accounts.record_usage`. Own keys only with `studio.own_keys` (recorded with 0 credits as "own key").
- **No plan, no Studio (owner, 14 Nov):** a client without an active subscription has `studio.enabled` off in the Studio; "legacy = allow everything" stays for configurators only; the internal organisation is exempt.
- **Support access is opt-in (owner, 14 Nov):** replaces the always-on "Viewing as". A client owner allows it for 7 days (renewable) with an optional note; staff open it read-only; every opening is logged and shown to the owner.
- **Credit warnings:** one email per level (80%, 100%) per company per billing period to its owners; a jump straight to 100% sends only the "used" email.

- **Staff sign-in (owner's S2.1 brief, 2026-11-14):** staff use their admin account (same Supabase user, same TOTP factor) and need AAL2 on every request; client people stay password-only (MFA for clients may come later as a plan option). Staff land in Nmesis's own workspace as owner; clients open read-only. The company choice survives sign-out (it is re-checked for whoever signs in next).
- **Sign-in link address (S2.1):** `STUDIO_PUBLIC_ORIGIN` → Vercel production / branch address → request origin; never the Host header.
- **No provider credit (S2.1):** a billing refusal is final: the job fails at once, no retry, the day's budget reservation is released.

- **Repository visibility:** stays public; scrub third-party names and infrastructure identifiers before pushing (owner, 2026-10-14). ADR 0001.
- **Data layer (owner, 2026-11-11):** Supabase Postgres in schema `studio` with its own login role `studio_app`; Preview uses a separate staging Supabase project. Correction (owner, 2026-11-15): there is no staging project; Preview and Production both use the main project, so setup SQL and migrations run once. Media in a private AWS S3 bucket in `eu-central-1` with an IAM user scoped to that bucket; one bucket and IAM user per environment.
- **Multi-client (owner, 2026-11-11):** every row carries `org_id`; every object lives under `orgs/<org>/users/<user>/`. Until S2 all users belong to the studio's own organization (`lib/portable/tenancy.ts`).
- **Configurators (S2):** from the master list per company (staff: all live cars); no client add/edit; `CONFIGURATOR_ORIGIN` joins catalogue paths; capture template per car in `studio.car_settings`.
- **Accounts (S2, owner's task brief, 2026-11-12):** Supabase Auth in the company project, `accounts` read-only for the Studio; Google parked; staff open a client's workspace read-only ("Viewing as", logged) and Nmesis's own as owner; provider keys belong to the company (`studio.own_keys`, owners manage); upsell chips name the smallest plan with the feature (Growth, or Enterprise for film, swap, storyboards and own keys).
- **Branch model:** `main` = Production, `development` = staging, `moaz-playground` = sandbox; feature PRs into `development` (owner, 2026-10-14). ADR 0001.

## Known issues / TODOs

_Waiting on owner_

- Phase 3 group 1: `npm run db:migrate` applies `0006_folders.sql`, together with 0004 and 0005 after the next release to `main`. Before it runs, the library and Home work and folders say they are not available yet; within a minute after it, they work, with no redeploy.

- Phase 2b: run `npm run db:migrate` once to apply `0005_trash.sql` (with 0004, after the release to `main`, as planned). Before it runs, films, swaps and stories work as before and Delete answers "Deleting isn't available yet"; within a minute after it, Delete and Deleted work, with no redeploy.

- S2.1 owner steps (exact list in the PR body): `STUDIO_PUBLIC_ORIGIN` per Vercel environment, the bare address and `/**` (and the Preview wildcard) in Supabase Auth's redirect URLs, a `KEY_ENCRYPTION_SECRET` of exactly 64 hex characters, and section 1 of the corrected `docs/supabase-setup.sql` where it failed.

- S1 and S2 owner steps (exact list in the S2 PR body): Supabase Auth URL configuration and redirect URLs for each Studio address, section 5 of `docs/supabase-setup.sql` in the main project, `npm run db:migrate`, Vercel variables (`SUPABASE_*`, `CONFIGURATOR_ORIGIN`) and removal of the NextAuth, allow-list, `SHARED_OPENAI_*` and `CONFIGURATOR_PRESETS` values, `STUDIO_URL` on the admin.
- S3 buckets, IAM users and CORS (unchanged from S1).

- S3 owner steps (exact list in the PR body): setup SQL section 6 once in the main project (Preview and Production share it), then `npm run db:migrate` once (0003); Nmesis's provider accounts with billing limits; Vercel variables `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `HIGGSFIELD_API_KEY`, `TOPAZ_API_KEY`, `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `NMESIS_ALERT_EMAIL`; a plan (and allowance) for every client in the admin, since clients without one lose the Studio.

- Environment scope: run `npm run db:migrate` (0004) once, **after** this change is live on both Preview and Production (old code does not send the environment, so against the migrated database it reads nothing). Keep Vercel's system environment variables on (`VERCEL_ENV`).

_Carried_

- Phase 3 group 1:
  - the library's "Person" filter is "You" or "A teammate": names are not in the Studio's data, and teammates' addresses are not shown to creators and viewers;
  - the feed reads every saved visual from storage (F-059) and lists the latest 200 films, swaps and stories each;
  - toasts are dark in both themes;
  - the staff-only preview at `/design-system/proposals/<screen>` keeps the synthetic version of the four screens.

- Phase 2b: the top bar, dialogs, toasts and menu are dark like the screens; light mode for signed-in screens comes with Phase 3 (F-010). A change of membership, role or support access reaches an open session within 10 s (the context reuse); signing out is immediate.
- Phase 2b: the Home library's own 15 s check of pending OpenAI renders still runs on a fixed interval (it stops when nothing is pending); the job polls back off.

- The admin's "Open in Studio" button still links unconditionally; it should call `accounts.studio_support_access(org, staff)` and say "Support access not granted" (admin repository). The Studio itself refuses such links with that sentence.
- Grok (Higgsfield's fixed-price image model) in key visuals is priced by Higgsfield as it starts (one click), so its credits show on the card, not before; films, swaps, Topaz, OpenAI and Google show them before.
- A settlement that cannot be written (twice) is logged and its hold expires unsettled: the action is not charged. Watch the log line "Credit settlement failed".
- `accounts.record_usage` takes a pack's last day in UTC; the admin's balance uses its business day, so a spend in the hours between may come out of the allowance instead.
- To confirm with the admin: for a subscription that starts on the 29th–31st, `accounts.credits_balance`'s month arithmetic (`age()`) appears to leave the renewal day of a shorter month outside both periods (the Studio's SQLite stand-in, which follows the same arithmetic, shows it). The Studio simply follows the admin's balance.

- The Postgres tests (including the setup SQL as a non-superuser) ran only in CI for S2.1; starting a local Postgres was not permitted on the dev machine.
- Screenshots of S2.1 were taken from a local preview harness (the real components with fixture data, not committed); the hosted flow with a real authenticator app is still to be tried by the owner on the Preview.

- `scripts/verify/studio-flow.mjs` against Postgres needs its stand-in user to be an active member in that database's `accounts` (the Postgres test's fixture makes the same synthetic user and company members, so run it after `tests/postgres.test.mjs`).
- The accounts views depend on admin tables: re-run section 5 after an admin migration that changes them.
- A teammate's visual can be viewed and downloaded, but not yet used as a reference for new work (references are read from the person's own prefix).
- Lint debt (BACKLOG #4). Zod 3 advisory (GHSA-mrhx-c7xc-m3w5). `docs/VERIFICATION.md` describes the original export.

## Next session — start here

1. Owner: review PR `design/editor-polish`.
2. Owner:
   - re-run section 5 of `docs/supabase-setup.sql` (adds `accounts.studio_brands`);
   - set `CONFIGURATOR_ORIGIN` if it isn't already set, per environment (it is already used for the configurator links);
   - turn off the Vercel Toolbar for Preview.
3. Owner, after the release to `main` (unchanged): `npm run db:migrate` once (0004 to 0007), then the library backfill per environment.
4. Then Phase 4 (BACKLOG #10).
5. Follow-ups:
   - toasts in the browser's top layer, so Undo can be reached while a dialog is open;
   - the remote-control configurator adapter when the protocol is ready (keep the current adapter as it is until then).
6. Admin repository: "Open in Studio" uses `accounts.studio_support_access` ("Support access not granted").
