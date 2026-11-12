# Nmesis Studio

The automotive creative studio, exported as a standard Next.js codebase for GitHub and Vercel. This is a **fresh studio**, with no generated images, uploaded references, saved jobs, user accounts, API keys, or campaign history.

## What is included

- Key visuals with OpenAI, Higgsfield and Google Nano Banana model selection.
- Configurator picker, browser screenshot capture, crop and reference uploads.
- Pinterest inspiration import, reference matching, smart prompt planning and three reference priorities.
- Multiple-car lineup visuals, image comparison, reference reuse, refinements of the selected version, and area editing.
- Object selection, content-aware editing, extra refinement references, Topaz upscaling and external upscale imports.
- Film Studio, car replacement, storyboard creation, shot generation and browser-based film assembly.
- Private media library, soft delete/restore, per-company encrypted provider connections and company budget logic.
- Tests, database migrations, Vercel settings, and GitHub checks.

The existing design and generation logic are retained. Hosting-specific connections have changed: Supabase Auth with company accounts replaces Sites sign-in; Supabase Postgres replaces the managed D1 database; a private AWS S3 bucket replaces managed media storage. The library starts empty instead of displaying the old campaign examples. Each company's configurators come from the master list; they are external sites, not car image files included in this project.

**Uploading this source alone is not enough to generate images.** The services below must be configured. No deployment or new service account has been created for you. Provider model access, billing and availability depend on your accounts. The original hosted studio is unchanged.

## 1. Put the studio on GitHub

Extract the RAR. The folder containing this README, `package.json` and `app/` is the repository root. The repository is `TheYazeedShaker/Nmesis-AI-Tool`, which is **public**: follow the hygiene rules in `AGENTS.md` (no secrets, no real third-party names in source). Include hidden files such as `.env.example`, `.gitignore` and `.github/`; do not upload the RAR itself as the application.

The archive contains no Git credentials or `.git` history. If using Git locally:

```sh
git init -b main
git add .
git commit -m "Import Nmesis Studio"
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
git switch -c development
git push -u origin development
```

Future development belongs on **`development`** (and the `moaz-playground` sandbox). Keep `main` as the Vercel Production branch. Every other branch gets a Vercel Preview deployment; use separate test resources there. Promote `development` to `main` only through a reviewed pull request.

## 2. Set up the three hosting connections

### Sign-in and company accounts: Supabase Auth

The Studio is sold to client companies and used by Nmesis staff. Who belongs to which company, their role (owner, creator, viewer), which cars each company may use and what its plan includes all live in the company's Supabase project, schema `accounts`, which the Nmesis admin writes and the Studio only reads. People are invited from the admin; the invitation lands on the Studio's address.

- Sign-in is Supabase Auth: email and password, or a link by email. The session lives in httpOnly cookies and every API route verifies it with Supabase. Google sign-in is built but off (`STUDIO_GOOGLE_SIGNIN`).
- Invitation and recovery links always stop at **Choose your password** (at least 10 characters, not the email address, the same twice), with "Skip, I'll use email links".
- Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (all server-only), and `CONFIGURATOR_ORIGIN` (the origin the catalogue's configurator paths are joined to).
- In Supabase Auth's URL configuration, add each Studio address followed by `/**` to the redirect URLs (local: `http://localhost:3000/**`).
- Run section 5 of `docs/supabase-setup.sql` (read-only views and grants for `studio_app`) after the admin's accounts migrations, then `npm run db:migrate`.

Generate a random secret with `openssl rand -base64 32` and use it as `KEY_ENCRYPTION_SECRET`. Keep it private. Do not change it once you have stored provider keys unless you intend to reconnect those providers.

### Database: Supabase Postgres

The studio keeps its job records in its own schema, `studio`, inside a Supabase Postgres project, reached with its own login role `studio_app` that can touch nothing else. Production uses the main project; Preview uses a separate staging project with the same schema (the staging project's users, data and keys never mix with real clients').

In each project, once:

1. Open the SQL editor and run [`docs/supabase-setup.sql`](docs/supabase-setup.sql) after replacing its password placeholder with a new random password (a different one per project). It creates the `studio_app` role and the `studio` schema owned by it.
2. Keep `studio` out of the Data API's exposed schemas.
3. From **Connect**, copy two connection strings and replace the user with `studio_app` (the pooler expects `studio_app.<project ref>`) and the password with the one you chose:
   - `DATABASE_URL`: the **transaction pooler** (port `6543`), used by the running studio.
   - `DATABASE_URL_DIRECT`: the **session pooler** or direct connection (port `5432`), used only by migrations.

From the repository folder, with Node.js 24 installed:

```sh
npm ci
cp .env.example .env.local
# Fill .env.local with your own service settings, then:
npm run db:migrate
npm run check:setup
```

`db:migrate` applies `supabase/migrations/*.sql` as `studio_app`: the tables, row level security (on, with no policies, so only the studio role reads or writes them) and revoked privileges for every other role. It seeds no content, can be rerun safely, and stops if a previously applied migration has changed. `check:setup` connects with `DATABASE_URL` and confirms the schema, the search path, that migrations are current and that the role cannot read schema `public`. Never point Preview deployments at the production project.

### Media storage: private AWS S3

Create one private S3 bucket per environment in `eu-central-1` and an IAM user that can reach only that bucket; [`docs/s3-setup.md`](docs/s3-setup.md) has the exact bucket settings, lifecycle rule, CORS and IAM policy. Set:

- `S3_REGION` (for example `eu-central-1`) and `S3_BUCKET`.
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` of that IAM user.
- Leave `S3_ENDPOINT` unset for AWS. It exists only for a local S3-compatible stand-in during development.

Keep Block Public Access on. Copy the CORS rules in `docs/s3-cors.example.json` into the bucket's CORS configuration, replacing the domain; add your stable testing/preview domain explicitly. The lifecycle rule deletes objects under `staging/` after one day (temporary uploads); never apply it to `orgs/`, which holds saved media and encrypted connections. Every stored object lives under `orgs/<organization>/users/<user>/…`.
Large images and videos upload directly to this private bucket with short-lived signed permissions. The studio authenticates the final request, checks the uploaded size and parses the original form before generation. Image/video downloads use short-lived signed redirects; CORS must allow GET/HEAD for comparison, editing and browser film assembly. [Vercel limits function request/response payloads to 4.5 MB](https://vercel.com/docs/functions/limitations), which is why regular multipart proxy uploads are unsuitable here.

## 3. Import into Vercel

In Vercel, choose **Add New → Project → your GitHub repository**:

- Framework: **Next.js**.
- Root Directory: the folder containing `package.json` (leave the root default if you uploaded its contents).
- Node.js: **24.x**.
- Install: `npm ci`.
- Build: `npm run build`.
- Production branch: **main**.

Use Vercel Pro for this commercial studio and the longer image-generation requests. This code sets 300-second generation route limits. Enable Fluid compute if required by your project settings; availability and platform limits depend on your plan. Add all values from `.env.local` to Vercel's **Production environment variables**, not to GitHub. Add your final HTTPS domain to Supabase Auth's redirect URLs and to the S3 CORS origins, and set `CONFIGURATOR_ORIGIN` (server-only, see `.env.example`). If you configure variables after the first deployment, redeploy.

For Preview/testing, use the staging Supabase project and a separate S3 bucket and IAM user, separate secrets and a stable preview domain with matching OAuth/CORS configuration. Do not reuse production keys merely to make previews run.

## 4. Connect generators and start fresh

Open the deployed studio, sign in, and connect OpenAI, Google AI Studio, Higgsfield and/or Topaz through the existing connection controls. These provider keys are not included in the archive. Stored keys are encrypted server-side. At least one usable image generator is needed; OpenAI is also used by smart prompt planning.

Provider keys belong to the company: an owner of a company whose plan includes its own keys (`studio.own_keys`) connects them, and everyone in that company uses them. The new database starts with the code's default daily budget; a company owner sets it in Film Studio.

Select one of your company's configurators, capture a car view, paste a Pinterest link or upload an inspiration, and generate. Screen sharing still requires the browser's permission. An iframe may be blocked by the configurator owner's embedding policy. Managed configurators can use `public/integration/nmesis-capture.js` for direct capture (install it from your new studio domain and set `data-studio-origin` to that domain); otherwise use tab capture or an uploaded screenshot. Pinterest must expose a publicly retrievable image; a local inspiration upload remains available if it does not.

## Develop and verify

```sh
npm run dev
npm run lint
npm test
npm run typecheck
npm run build
npm start
```

The repository includes provider-request, refinement, selection, budget, storage adapter and direct-upload tests. They use synthetic fixtures and mocked paid endpoints. They do not charge your provider accounts. See `docs/VERIFICATION.md` for what was verified during export and what still requires your configured deployment.

## Source layout and recovery copy

- `app/`: pages and authenticated API routes.
- `components/`: studio controls, frame viewer, selection and reference UI.
- `lib/`: generation prompts, providers, media processing and workflow logic.
- `lib/portable/`: Vercel database, storage and upload connections.
- `lib/auth/`, `lib/accounts/`, `lib/studio-context.ts`: sign-in, company accounts, plans and the per-request context.
- `drizzle/`: database schema migrations.
- `scripts/`: setup validation and schema migration.
- `tests/`: automated regression coverage.
- `integration/` and `public/integration/`: configurator capture connector.
- `archive/` (not in Git): the historical pre-Vercel source, kept only on the owner's machine because it contains third-party names. Keep it for source recovery only.

No previous user data is migrated. The archive intentionally excludes generated images, uploaded references, private storage records, database rows, API keys, dependencies, builds and Git credentials.
