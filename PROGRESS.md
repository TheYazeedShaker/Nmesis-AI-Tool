# PROGRESS

> Read at session start; update at every stop. Refresh _Status_, append _Decisions_ and _Known issues_, rewrite _Next session_. **The repository is public: write this as if a customer will read it.** No credentials, no infrastructure identifiers, nothing about vendors or prospects.

**Last updated:** 2026-11-10

**Latest (2026-11-10, studio sync):** Synced the current studio feature updates into a feature branch from `development`, retaining the repository’s authentication, database and private-media adapters. The owner authorized feature PR → `development` → promotion PR → `main`. No hosted settings, production data, generated media or archives are included.

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

## What was built last session

- Synced the simpler key-visual workspace, progressive gallery, clipboard references, improved Pinterest import, safer isolated configurator capture, six-car lineups, image-model and area-edit choices, and stalled-generation handling.
- Retained Google sign-in, the allow-list, Turso/Drizzle, encrypted provider credentials and owner-scoped private R2 media. Shared Google and Topaz connections use the existing configured sponsorship rules; image and job ownership stays separate.
- Adapted full-resolution originals (up to 40 MB) to signed direct R2 uploads. Prepared references and originals both avoid the hosting request-body limit; originals remain immutable and authenticated.
- Included the film-model choice and optional driving-motion controls; no paid generation ran during this sync.
- Updated Next.js and its matching ESLint configuration from 16.4.0 to 16.4.6 after the production build blocked the older version for security advisories.
- Local verification: lint (0 errors, existing warnings), typecheck, 230/230 tests, and production build passed. Browser review confirmed the compiled workspace, model switching, and six-car limit. Authenticated generation was not tested in the clean local checkout because it has no hosted credentials or data.
- Source and fixtures are synthetic. No credentials, uploaded references, generated media, private infrastructure identifiers or archive updates are part of the sync.

## Decisions made (must be remembered)

- **Repository visibility:** stays public; scrub third-party names and infrastructure identifiers before pushing (owner, 2026-10-14). ADR 0001.
- **Branch model:** `main` = Production, `development` = staging, `moaz-playground` = sandbox; feature PRs into `development` (owner, 2026-10-14). ADR 0001.

## Known issues / TODOs

_Waiting on owner_

- Vercel env vars for Production and Preview (separate resources per environment), including `NEXT_PUBLIC_CONFIGURATOR_PRESETS`.
- Confirm hosted Preview and Production service configuration before running paid end-to-end generation tests.
- Google OAuth redirect URIs and R2 CORS for the Vercel domains.

_Carried_

- The deployment connection can now read deployment status and build logs (verified during the feature sync). The feature Preview built successfully and the signed-out workspace renders; authenticated provider flows remain unverified.

- Lint debt (BACKLOG #4).
- Dependency audit still reports the existing Zod 3 constrained-collection advisory (GHSA-mrhx-c7xc-m3w5). The available fix requires a major-version upgrade, which is outside this feature sync. Next.js critical advisories were resolved.
- `docs/VERIFICATION.md` describes the original export; it predates this repository.

## Next session — start here

1. Confirm the feature sync and promotion PR checks/deployments in GitHub before further releases.
2. Verify separate Preview and Production service configuration (BACKLOG #2); this session did not change or copy hosted credentials.
3. Run authenticated upload and generation smoke tests against an isolated Preview account when configured.
4. Continue the existing lint-debt queue and request the platform specification before new architecture work.
