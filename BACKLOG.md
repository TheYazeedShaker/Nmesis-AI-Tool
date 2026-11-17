# BACKLOG

Ordered work queue. The agent takes the **first `queued` task whose dependencies are `done`** and only updates **Status**. Only the owner adds, removes, or reorders tasks.

Status: `queued` · `in-progress` · `blocked` (reason required) · `done` · `awaiting-spec`

| #   | Task ID          | Spec | Depends on | Status        | Notes                                                                                                                   |
| --- | ---------------- | ---- | ---------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | BOOTSTRAP        | —    | —          | done          | Repo, CI, Vercel project, branches. See PROGRESS.md.                                                                    |
| 2   | HOSTED-ENV       | —    | #1         | blocked       | Owner: set Production + Preview env vars in Vercel (README §2–3). Sign-in and generation need them.                     |
| 3   | BRANCH-RULESETS  | —    | #1         | done          | Owner: GitHub ruleset on `main` (PR required, `verify` + `secrets` checks required, no bypass, squash only).            |
| 4   | LINT-DEBT        | —    | #1         | queued        | Remove 80 `no-explicit-any`, 11 `set-state-in-effect`, 2 `refs`, 15 `no-html-link-for-pages`; restore them to `error`. |
| 5   | PLATFORM-VISION  | —    | #1         | awaiting-spec | Owner to describe the target platform; agent turns it into specs and ADRs.                                              |
| 6   | DESIGN-P0        | owner brief 2026-11-15 | —  | done        | Foundations merged (#29); wireframes approved as they are. |
| 7   | DESIGN-P1        | owner brief 2026-11-15 | #6 | done        | Merged (#31): `check:ui`, performance baseline, CRUD matrix, 69 findings. |
| 11  | ENV-SCOPE        | owner 2026-11-15       | —  | done        | Merged (#30). Owner migrates (0004) after the release to `main`. |
| 8   | DESIGN-P2        | owner brief 2026-11-15 | #7 | done        | 2a merged (#32), 2b merged (#33). |
| 9   | DESIGN-P3        | owner brief 2026-11-15 | #8 | in-progress | Group 1 merged (#34), group 2 merged (#35), editor polish merged (#36). Editor cleanup (`design/editor-cleanup`): the editor fills the window, Quality only for clients (engine under Advanced), help under its field, one "can’t generate" notice with Generate disabled — PR waiting for review. |
| 10  | DESIGN-P4        | owner brief 2026-11-15 | #9 | queued      | Empty `check:design` baseline, visual baselines, JS/Lighthouse budgets, the full PR rule in CLAUDE.md. |

## Blocked log

_(agent appends: date · task · reason)_

- 2026-10-14 · HOSTED-ENV · needs the owner's service accounts (Google OAuth, Turso, R2, secrets).
- 2026-10-14 · BRANCH-RULESETS · repository settings are an owner action.

- 2026-11-10 · HOSTED-ENV · configuration remains unverified; the sync preserves environment separation and does not copy hosted credentials.
- 2026-11-14 · HOSTED-ENV · S3 adds Nmesis provider keys (`OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `HIGGSFIELD_API_KEY`, `TOPAZ_API_KEY`) and credit email variables (`EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `NMESIS_ALERT_EMAIL`), per environment; owner steps in the S3 PR body.
- 2026-11-14 · HOSTED-ENV · S2.1 adds `STUDIO_PUBLIC_ORIGIN` (per environment) and corrects the `KEY_ENCRYPTION_SECRET` format (exactly 64 hex characters); owner steps are in the S2.1 PR body.
