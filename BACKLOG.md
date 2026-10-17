# BACKLOG

Ordered work queue. The agent takes the **first `queued` task whose dependencies are `done`** and only updates **Status**. Only the owner adds, removes, or reorders tasks.

Status: `queued` · `in-progress` · `blocked` (reason required) · `done` · `awaiting-spec`

| #   | Task ID          | Spec | Depends on | Status        | Notes                                                                                                                   |
| --- | ---------------- | ---- | ---------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | BOOTSTRAP        | —    | —          | done          | Repo, CI, Vercel project, branches. See PROGRESS.md.                                                                    |
| 2   | HOSTED-ENV       | —    | #1         | blocked       | Owner: set Production + Preview env vars in Vercel (README §2–3). Sign-in and generation need them.                     |
| 3   | BRANCH-RULESETS  | —    | #1         | blocked       | Owner: GitHub ruleset on `main` (PR required, `verify` + `secrets` checks required, no bypass, squash only).            |
| 4   | LINT-DEBT        | —    | #1         | queued        | Remove 80 `no-explicit-any`, 11 `set-state-in-effect`, 2 `refs`, 15 `no-html-link-for-pages`; restore them to `error`. |
| 5   | PLATFORM-VISION  | —    | #1         | awaiting-spec | Owner to describe the target platform; agent turns it into specs and ADRs.                                              |

## Blocked log

_(agent appends: date · task · reason)_

- 2026-10-14 · HOSTED-ENV · needs the owner's service accounts (Google OAuth, Supabase, R2, secrets).
- 2026-10-14 · BRANCH-RULESETS · repository settings are an owner action.
