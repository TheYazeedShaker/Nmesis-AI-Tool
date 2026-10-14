# 0001 — Public repository and branch model

**Status:** accepted — 2026-10-14 (owner, bootstrap session).

## Context

The studio was exported for a private repository, but the target repository `TheYazeedShaker/Nmesis-AI-Tool` is public. The export contained real vehicle brand names and hosted configurator URLs in source and tests, plus an archive of the pre-Vercel source. Anything pushed to a public repository stays in its history. Options: (A) make the repository private; (B) keep it public and scrub before the first push; (C) push unchanged.

## Decision

1. **B: keep public, scrub first.** Configurator presets moved from `lib/configurators.ts` into the build-time variable `NEXT_PUBLIC_CONFIGURATOR_PRESETS` (JSON, validated, invalid entries dropped, synthetic demo fallback). Test fixtures use synthetic names. `archive/` and the export checksum list are git-ignored and stay on the owner's machine.
2. **Branches:** `main` → Vercel Production; `development` → Preview (integration/staging); `moaz-playground` → Preview (sandbox). Feature branches come from `development`; `main` changes only by PR from `development`.
3. **CI** (`.github/workflows/ci.yml`) runs on pushes to those three branches and on every PR: `verify` (install, lint, typecheck, test, build) and `secrets` (gitleaks over full history, pinned and checksummed). Actions are pinned to commit SHAs.

## Consequences

- Preset values are public in the browser bundle anyway (they are client-side); keeping them out of Git only keeps names out of history and search.
- The capture-template flow expects the first preset's id to be `s08`; documented in `.env.example`.
- Lint is enforced with legacy rules downgraded to warnings (BACKLOG `LINT-DEBT`).
- Branch rulesets and required checks are an owner action (BACKLOG `BRANCH-RULESETS`).
