# PROGRESS

> Read at session start; update at every stop. Refresh _Status_, append _Decisions_ and _Known issues_, rewrite _Next session_. **The repository is public: write this as if a customer will read it.** No credentials, no infrastructure identifiers, nothing about vendors or prospects.

**Last updated:** 2026-10-14

**Latest (2026-10-14, bootstrap):** Imported the exported studio into Git, applied the bootstrap fixes below, set up CI, the Vercel project and the `development` / `moaz-playground` branches.

## The plan

Grow Nmesis Studio from a single-team creative tool into a full platform. The platform scope is not yet specified (BACKLOG `PLATFORM-VISION`).

## Status

| Track                         | Status | Notes                                                                 |
| ----------------------------- | ------ | --------------------------------------------------------------------- |
| Source in Git                 | ✅     | `main`, `development`, `moaz-playground`                              |
| CI (`verify`, `secrets`)      | ✅     | `.github/workflows/ci.yml`                                            |
| Vercel project + Git deploys  | ✅     | `main` → Production, other branches → Preview                         |
| Hosted env vars               | ⏳     | Owner (BACKLOG #2). App builds and serves pages without them; sign-in and generation need them. |
| Branch rulesets on `main`     | ⏳     | Owner (BACKLOG #3)                                                    |
| Lint debt                     | 🟡     | Enforced; legacy rules downgraded to warnings (BACKLOG #4)            |

## What was built last session

- **Analysis against the engineering bootstrap guide.** Findings: no Git history; repository is public but the export assumed private and carried real brand names, hosted configurator URLs and a historical source archive; no lint gate (113 errors); CI used tag-pinned actions, no permissions block, no secret scan, wrong branch (`testing`); no `.gitattributes`/`.nvmrc`; no living files (`CLAUDE.md`, `PROGRESS.md`, `BACKLOG.md`), CODEOWNERS or Dependabot; all files carried executable mode from Windows.
- **Fixes:** configurator presets moved to `NEXT_PUBLIC_CONFIGURATOR_PRESETS` with validation and tests; synthetic test fixtures; `archive/` and the export checksum list kept out of Git; CI rewritten (SHA-pinned actions, least-privilege token, lint + typecheck + test + build, gitleaks over full history, pinned and checksummed); lint script added, 5 real lint errors fixed (a function misnamed as a hook, `prefer-const`, reassigned `module` in tests), legacy rules downgraded as tracked debt; `.gitattributes` (LF), `.nvmrc` (24), hardened `.gitignore`, CODEOWNERS, Dependabot; README/AGENTS updated for the new branch model.
- **Verified locally:** `npm ci`, lint (0 errors), typecheck, 162/162 tests, production build; gitleaks over the source tree found nothing.

## Decisions made (must be remembered)

- **Repository visibility:** stays public; scrub third-party names and infrastructure identifiers before pushing (owner, 2026-10-14). ADR 0001.
- **Branch model:** `main` = Production, `development` = staging, `moaz-playground` = sandbox; feature PRs into `development` (owner, 2026-10-14). ADR 0001.

## Known issues / TODOs

_Waiting on owner_

- Vercel env vars for Production and Preview (separate resources per environment), including `NEXT_PUBLIC_CONFIGURATOR_PRESETS`.
- GitHub ruleset on `main`; required checks `verify` and `secrets`.
- Google OAuth redirect URIs and R2 CORS for the Vercel domains.

_Carried_

- Lint debt (BACKLOG #4).
- `docs/VERIFICATION.md` describes the original export; it predates this repository.

## Next session — start here

State: the studio is in Git, CI is green, Vercel deploys every branch. Nothing works end to end until hosted env vars exist.

0. Check whether the owner finished BACKLOG #2 and #3.
1. Take the owner's platform vision and write the first spec(s) and ADRs (BACKLOG #5).
