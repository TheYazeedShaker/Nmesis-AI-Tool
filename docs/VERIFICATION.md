# Export verification — 14 October 2026

This is a studio-only export. No existing campaign media, references, saved records or provider keys are included.

## Verified locally

- Production Next.js 16.4.0 build completed successfully, including all pages and API routes.
- TypeScript check passed.
- All 161 automated tests passed with synthetic fixtures and mocked paid endpoints. The final run includes direct-upload, database, storage, identity, provider-request and refinement tests.
- The five SQL migrations applied successfully to an empty local libSQL database; a second run detected every migration as already applied.
- All six primary pages returned HTTP 200 from the production server: single key visual, lineup, films, storyboard, car swap and smart reference lab.
- The browser displayed the existing studio layout with an empty library and sign-in prompt.
- Private status, media, library and upload endpoints returned HTTP 401 without a session, including requests supplying forged legacy Sites authentication headers.
- Direct-upload tests passed for a multipart body over 5 MB, expired/tampered tickets, different owners, wrong target routes and size limits.
- SQL tests confirmed conditional job reservation cannot reserve the same job twice.
- npm audit of production dependencies reported zero known advisories at export time. This is not a security certification and should be rerun as dependencies evolve.
- Source credential-pattern scan found no known API-token/private-key patterns. No .env values, Git credentials, database files or raster/video files are included.
- The original working checkout and live Sites deployment were not modified.

## Requires your configured deployment

Google OAuth, live Turso and R2 access, bucket CORS, browser-to-R2 transfers, paid model requests and completion within Vercel's function limits were not tested against new live accounts. No new accounts were created and no paid generation was run for this export. The README describes the required setup and a smoke test below.

## Deployment smoke test

1. Sign in with an allowed verified Google account; confirm a different account is denied.
2. Connect one generator, upload a configurator screenshot and an inspiration image, then produce one visual.
3. Download it at full resolution and open the comparison view.
4. Refine that result twice; verify the second refinement starts from the first refinement.
5. Upload an image larger than 4.5 MB, perform an area edit and confirm the canvas stays readable (storage CORS).
6. If using video, upload an MP4 over 4.5 MB, generate a clip and download it. If using stories, assemble and save the film.
7. Confirm generated assets survive a refresh, users only see their own library, and shared spending follows your chosen budget.

The generator/model account must have access and billing enabled. Only run paid smoke tests within the budget you choose.
