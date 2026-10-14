# Nmesis Studio

The automotive creative studio, exported as a standard Next.js codebase for GitHub and Vercel. This is a **fresh studio**, with no generated images, uploaded references, saved jobs, user accounts, API keys, or campaign history.

## What is included

- Key visuals with OpenAI, Higgsfield and Google Nano Banana model selection.
- Configurator picker, browser screenshot capture, crop and reference uploads.
- Pinterest inspiration import, reference matching, smart prompt planning and three reference priorities.
- Multiple-car lineup visuals, image comparison, reference reuse, refinements of the selected version, and area editing.
- Object selection, content-aware editing, extra refinement references, Topaz upscaling and external upscale imports.
- Film Studio, car replacement, storyboard creation, shot generation and browser-based film assembly.
- Private media library, soft delete/restore, per-user encrypted provider connections and shared-account budget logic.
- Tests, database migrations, Vercel settings, and GitHub checks.

The existing design and generation logic are retained. Hosting-specific connections have changed: Google sign-in replaces Sites sign-in; Turso replaces the managed D1 database; a private R2 bucket replaces managed media storage. The library starts empty instead of displaying the old campaign examples. Existing configurator URLs remain as selectable presets; they are external sites, not car image files included in this project.

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

### Sign-in: Google OAuth

Create a Google OAuth web application in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Configure its consent screen and permitted test users if it is in testing mode. Add these authorized redirect URIs, replacing the example with your real domain:

- `http://localhost:3000/api/auth/callback/google`
- `https://YOUR-STUDIO.vercel.app/api/auth/callback/google`

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `NEXTAUTH_URL`. Add your email to `STUDIO_ALLOWED_EMAILS`; use commas for multiple users. Only verified Google accounts on the allowlist can access data or generate. Requests cannot authenticate by supplying the old Sites headers. For a non-Google user, add another Auth.js provider before granting access; this export defaults to Google.

Generate two different secrets using `openssl rand -base64 32` twice. Use one as `NEXTAUTH_SECRET` and the other as `KEY_ENCRYPTION_SECRET`. Keep both private. Do not change the encryption secret once you have stored provider keys unless you intend to reconnect those providers.

### Database: Turso

Create a new [Turso](https://turso.tech/) database and an authentication token. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. No previous database export is needed.

From the repository folder, with Node.js 24 installed:

```sh
npm ci
cp .env.example .env.local
# Fill .env.local with your own service settings, then:
npm run check:setup
npm run db:migrate
```

The migration command creates only schema and its migration journal; it does not seed campaign content. It can be rerun safely. It stops if a previously applied migration has changed. Run it against a fresh database, and do not share the production database with Preview deployments.

### Media storage: private Cloudflare R2

Create a private [R2 bucket](https://developers.cloudflare.com/r2/get-started/) and a bucket-scoped S3 API key with object read/write permissions. Set:

- `S3_ENDPOINT`: the S3 API endpoint shown by R2, generally `https://ACCOUNT_ID.r2.cloudflarestorage.com`.
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- `S3_REGION=auto`.

Keep public bucket access disabled. Copy the CORS policy in `docs/r2-cors.example.json` into the bucket's CORS settings, replacing the domain. Add your stable testing/preview domain explicitly. Configure a lifecycle rule to delete objects with prefix `staging/` after one day; these are temporary multipart uploads. Do not apply that expiration to `users/`, which contains saved media and encrypted connections.

Large images and videos upload directly to this private bucket with short-lived signed permissions. The studio authenticates the final request, checks the uploaded size and parses the original form before generation. Image/video downloads use short-lived signed redirects; CORS must allow GET/HEAD for comparison, editing and browser film assembly. [Vercel limits function request/response payloads to 4.5 MB](https://vercel.com/docs/functions/limitations), which is why regular multipart proxy uploads are unsuitable here.

## 3. Import into Vercel

In Vercel, choose **Add New → Project → your GitHub repository**:

- Framework: **Next.js**.
- Root Directory: the folder containing `package.json` (leave the root default if you uploaded its contents).
- Node.js: **24.x**.
- Install: `npm ci`.
- Build: `npm run build`.
- Production branch: **main**.

Use Vercel Pro for this commercial studio and the longer image-generation requests. This code sets 300-second generation route limits. Enable Fluid compute if required by your project settings; availability and platform limits depend on your plan. Add all values from `.env.local` to Vercel's **Production environment variables**, not to GitHub. Set `NEXTAUTH_URL` to your final HTTPS domain and register that same domain's OAuth callback and R2 CORS origin. If you configure variables after the first deployment, redeploy.

For Preview/testing, use separate Turso and R2 resources, separate secrets and a stable preview domain with matching OAuth/CORS configuration. Do not reuse production keys merely to make previews run.

## 4. Connect generators and start fresh

Open the deployed studio, sign in, and connect OpenAI, Google AI Studio, Higgsfield and/or Topaz through the existing connection controls. These provider keys are not included in the archive. Stored keys are encrypted server-side. At least one usable image generator is needed; OpenAI is also used by smart prompt planning.

To share your OpenAI/Higgsfield account, set `SHARED_OPENAI_OWNER_EMAIL` and `SHARED_OPENAI_GUEST_EMAILS`, allow those emails to sign in, then have the owner connect the provider and open the studio. The studio's existing sharing rules apply; Google and Topaz connection handling is unchanged. The new database starts with the code's default budget, not your previous account's saved budget. Set your desired shared daily budget in Film Studio before inviting guests.

Select a configurator or add its URL, capture a car view, paste a Pinterest link or upload an inspiration, and generate. Screen sharing still requires the browser's permission. An iframe may be blocked by the configurator owner's embedding policy. Managed configurators can use `public/integration/nmesis-capture.js` for direct capture (install it from your new studio domain and set `data-studio-origin` to that domain); otherwise use tab capture or an uploaded screenshot. Pinterest must expose a publicly retrievable image; a local inspiration upload remains available if it does not.

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
- `lib/portable/`: Vercel database, storage, upload and sign-in connections.
- `drizzle/`: database schema migrations.
- `scripts/`: setup validation and schema migration.
- `tests/`: automated regression coverage.
- `integration/` and `public/integration/`: configurator capture connector.
- `archive/` (not in Git): the historical pre-Vercel source, kept only on the owner's machine because it contains third-party names. Keep it for source recovery only.

No previous user data is migrated. The archive intentionally excludes generated images, uploaded references, private storage records, database rows, API keys, dependencies, builds and Git credentials.
