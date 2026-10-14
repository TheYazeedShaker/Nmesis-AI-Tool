# Nmesis Studio collaboration rules

Agents read `CLAUDE.md` (permanent standards), then `PROGRESS.md` (state), then `BACKLOG.md` (queue).

- Branches: `main` = Production (Vercel). `development` = integration/staging (Vercel Preview). `moaz-playground` = personal sandbox (Vercel Preview). Feature work branches from `development` and opens a PR into `development`; `development` is promoted to `main` by PR only.
- Never push or merge into `main`, change the production branch, or promote a deployment without the owner's explicit request.
- Preserve the image-generation prompts and provider behavior unless the requested task changes them.
- Keep provider credentials server-side. Never commit credentials, real `.env` files, uploaded images, generated media, or private database exports.
- Use independent preview/test storage, database, encryption secret, and provider budgets. Preview jobs must not use production data by default.
- Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` before every push (CI runs the same gate).
- `archive/` (historical pre-Vercel source) is git-ignored and lives only on the owner's machine. Never commit it or overwrite the current app with it.
- The repository is public: no credentials, infrastructure identifiers, real third-party brand names or customer data in source, tests, commits or PR text. Real configurator presets live in the `NEXT_PUBLIC_CONFIGURATOR_PRESETS` Vercel variable.
