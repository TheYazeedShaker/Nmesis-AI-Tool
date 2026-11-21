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
| 9   | DESIGN-P3        | owner brief 2026-11-15 | #8 | in-progress | Group 1 merged (#34), group 2 merged (#35), editor polish merged (#36), editor cleanup merged (#37). Finish pass (`design/finish-pass`): faster CI and pages, brand logos, the Library, dialogs, Company settings, Usage, Projects, titles, upgrade page, Home, Story — PR waiting for review. |
| 13  | STUDIO-EDITOR      | owner brief 2026-11-19 | #12 | done        | `feat/studio-editor`: Konva canvas editor (Brand, Elements, Text, Uploads; save as a new version, duplicate, full-size download, share), one shared reference list, choice groups on the label grid, the Key visual band fixed at its root. PR waiting for review.  Merged (#53). |
| 14  | STUDIO-EDITOR-FIXES | owner brief 2026-11-19 | #13 | done        | Merged (#54). `feat/studio-editor` (follow-up to #53): the band at its root (document = shell; check at Retina 1191 x 786 and 90/100/110 % zoom), capture says why and leads to the image address, own-key wording, fixed Home tool pictures, editor design pass. Open: confirm the capture step on a real configurator. |
| 15  | LIBRARY-EDIT       | owner brief 2026-11-19 | #13 | in-review   | `fix/library-edit`: Edit from Projects opens the editor (one `editorHref`, raw ids from `lib/work-ref.ts`, a guard test), Edit on line-ups, the editor's way back opens the picture, separate can't-open messages, three check:ui Edit journeys. |
| 16  | EDITOR-PART-3      | owner brief 2026-11-20 | #15 | in-review   | `feat/editor-part-3`: brand fonts on the canvas and in exports, reopen saved designs with their layers, type on the canvas, icons, narrow-laptop rail, View choices on one line, Projects opens older linked work, Safari (WebKit) check. |
| 17  | EDITOR-CORE-V2     | owner brief 2026-11-21 | #16 | done        | `feat/editor-core-v2` (PR A): `docs/editor-rules.md` and the check:ui editor rules, design format v2 with the v1 upgrade, undo on immer patches, autosave with its four states, version history with Restore, duplicate (layer, page, design in place), pages and Download all, soft lock. Merged (#59); 0012 applied. |
| 18  | EDITOR-PANEL-RULES | owner brief 2026-11-21 | #17 | in-review   | `feat/editor-panel-rules` (PR B), from `development` after PR A merged: the right panel rebuilt to the twelve rules, layers list, align/distribute/snapping, shortcuts sheet, first-use and empty states, critique and accessibility passes; the editor rule counts gate in check:ui. |
| 12  | STUDIO-FOUNDATIONS | owner brief 2026-11-18 | — | done        | `feat/studio-foundations`: cool palette and contrast test, button tokens, one shell (nav model, panel slot, layers), one field and tool tile, Brand and Elements panels, Account page. Merged (#44). |
| 10  | DESIGN-P4        | owner brief 2026-11-15 | #9 | queued      | Empty `check:design` baseline, visual baselines, JS/Lighthouse budgets, the full PR rule in CLAUDE.md. |

## Blocked log

_(agent appends: date · task · reason)_

- 2026-10-14 · HOSTED-ENV · needs the owner's service accounts (Google OAuth, Turso, R2, secrets).
- 2026-10-14 · BRANCH-RULESETS · repository settings are an owner action.

- 2026-11-10 · HOSTED-ENV · configuration remains unverified; the sync preserves environment separation and does not copy hosted credentials.
- 2026-11-14 · HOSTED-ENV · S3 adds Nmesis provider keys (`OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `HIGGSFIELD_API_KEY`, `TOPAZ_API_KEY`) and credit email variables (`EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `NMESIS_ALERT_EMAIL`), per environment; owner steps in the S3 PR body.
- 2026-11-14 · HOSTED-ENV · S2.1 adds `STUDIO_PUBLIC_ORIGIN` (per environment) and corrects the `KEY_ENCRYPTION_SECRET` format (exactly 64 hex characters); owner steps are in the S2.1 PR body.
- 2026-11-18 · HOSTED-ENV · the Studio shell adds `UNSPLASH_ACCESS_KEY` (References panel; per environment, `docs/references.md`) and migrations 0010 and 0011 (`npm run db:migrate`); owner steps in the PR body.
