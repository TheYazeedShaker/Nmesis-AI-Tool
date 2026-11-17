# Nmesis Studio collaboration rules

Agents read `CLAUDE.md` (permanent standards), then `PROGRESS.md` (state), then `BACKLOG.md` (queue).

- Branches: `main` = Production (Vercel). `development` = integration/staging (Vercel Preview). `moaz-playground` = personal sandbox (Vercel Preview). Feature work branches from `development` and opens a PR into `development`; `development` is promoted to `main` by PR only.
- Never push or merge into `main`, change the production branch, or promote a deployment without the owner's explicit request.
- Preserve the image-generation prompts and provider behavior unless the requested task changes them.
- Keep provider credentials server-side. Never commit credentials, real `.env` files, uploaded images, generated media, or private database exports.
- Preview and Production share the main Supabase project. Keep S3 buckets, keys and provider budgets separate per environment: Preview has its own bucket and IAM user, its own provider keys and billing limits, and its own secrets.
- Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` before every push (CI runs the same gate).
- Report once the fast gates pass (lint, typecheck, tests, build and the affected `check:ui`); don't wait for the full sweep (nightly and on PRs into `main`).
- `archive/` (historical pre-Vercel source) is git-ignored and lives only on the owner's machine. Never commit it or overwrite the current app with it.
- The repository is public: no credentials, infrastructure identifiers, real third-party brand names or customer data in source, tests, commits or PR text. Real configurators come from the master list (`accounts.cars`) at run time, never from source.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
