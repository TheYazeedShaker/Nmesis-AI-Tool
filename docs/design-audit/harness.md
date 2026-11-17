# The UI harness: `npm run check:ui`

Every Studio screen, in a real browser (Chromium through Playwright), at
**1440 · 1280 · 1024 · 768 · 390 · 360**, in **light and dark**, as each kind of
person, against the **production build** with synthetic data. In CI a pull
request checks the screens its change can affect, in parallel shards; the
full sweep runs nightly and before Production (see "In CI" below).

## In CI

| When | What runs | Wall time (estimate) |
|---|---|---|
| A pull request into anything but `main`; a push to `development` or `moaz-playground` | the fast gates in parallel (`lint, typecheck, design` · `test` with Postgres · `build`), and `check:ui` for the **affected screens**, cut into **1 to 4 shards** (`--only=… --shard=i/n --shots`), each with its own Postgres | about 4 to 5 minutes |
| A change that touches no screen (docs, tests only) | the fast gates; the shards are skipped and `ui` passes at once | about 2 minutes |
| A change to the shell or design system (a full fallback) | the fast gates, and every screen in 4 shards (no `--perf`) | about 4 to 5 minutes |
| Nightly at 02:30 UTC on `development`, a pull request into `main`, a push to `main`, or `workflow_dispatch` with `full` | the **full sweep** in one job: `npm run check:ui -- --perf --shots`, as before | about 10 minutes |
| `workflow_dispatch` with `update_baseline` | every screen with `--shots --update`; uploads `scripts/ui-baseline.json` as the `ui-baseline` artifact | about 5 minutes |

Agents report once the fast gates pass (lint, typecheck, tests, build, the
affected `check:ui`); they do not wait for the full sweep.

The jobs: `ui plan` decides; `ui shard i/n` runs a part; `ui` (the check
branch protection requires) merges the parts and compares them with the
baseline (`node scripts/ui/merge.mjs`), or passes the full sweep's result, or
passes when no screen was affected. `verify` is the same for the fast gates:
it passes when lint, typecheck, design, tests and build all passed. The merged
report and every screenshot are the `ui-report` artifact (7 days); each
shard's own report is `ui-report-shard-i` (1 day).

Caches: npm (setup-node), the Playwright browser (`~/.cache/ms-playwright`,
keyed on the Playwright version; only the headless shell is installed, which
is what `chromium.launch()` runs), and the Next.js build cache (`.next/cache`).

The nightly schedule is read from the copy of `ci.yml` on the default branch
(`main`), so it starts once this workflow reaches `main`; it checks out
`development`.

### Which screens a pull request checks (`scripts/ui/affected.mjs`)

`npm run ui:affected` lists them for your branch (against
`origin/development`; `-- --base=origin/main`, `-- --diff=A..B` or a list of
files also work). In CI the change is the pull request's merge commit against
its base. Each changed file maps like this, in order:

1. **Every screen** for the shell, the design system and what every request
   uses: `app/layout.tsx`, `app/tokens.css`, `app/design-system.css`,
   `app/studio-shell.css`, `app/workspace.css`, `app/globals.css`,
   `components/ds/**`, `components/studio-topbar.tsx`,
   `components/studio-account.tsx`, `components/credits.tsx`,
   `components/studio-providers.tsx`, `components/workspace/frame.tsx`,
   `lib/accounts/**`, `lib/studio-context.ts`, `lib/studio-server.ts`,
   `lib/portable/**`, `lib/provider-words.ts`, `proxy.ts`, `app/api/auth/**`
   (the harness signs everyone in through it); the build (`next.config.*`,
   `package.json`, the lockfile, `tsconfig.json`, `postcss.config.*`,
   `.nvmrc`, `vendor/`); and the harness itself (`scripts/check-ui.mjs`,
   `scripts/ui/**`, `scripts/ui-baseline.json`, `scripts/verify/**`, the
   backfill and migrate scripts, `supabase/**`, `docs/supabase-setup.sql`, the
   accounts fixture, `.github/workflows/**`).
2. **No screen** for docs and tests (`*.md`, `docs/**`, `tests/**`), other
   `.github/` files and tooling that never reaches a page (`check:design`,
   ESLint, Vercel and shadcn configuration).
3. **The screens that reach it** for app code (`app/`, `components/`, `lib/`,
   `hooks/`, `public/`, `integration/`). A screen reaches its page and the
   layouts above it, everything they import (followed through `@/` and
   relative imports, CSS included), and every API route its code calls
   (`/api/<name>`) with what those routes import. A URL built at run time
   (`/api/${PATH[kind]}/…`) counts as calling the routes its file (or what it
   imports) names in quotes, and every route if it names none. A file under a
   screen's own route folder (`app/usage/**`) is that screen's; the deepest
   folder wins (`app/projects/[id]/**` is the folder screen). A file in
   `public/` is reached by its URL. So `components/editor/*` maps to the
   editor screens (workspace, settings, lineup, films, swap, storyboard) and
   `components/workspace/*` to home, library, viewer, projects, folder and the
   company switcher.
4. **Every screen** for anything else: a file the map does not know, app code
   no screen reaches, deleted app code, or a change git cannot list.

A screen added to `SCREENS` (`scripts/ui/screens.mjs`) is mapped from its
`path` without further work.

### Shards (`--shard=i/n`)

The page checks are grouped by screen and person (a screen and person never
splits) and dealt out largest first, each to the lightest shard (a check at
1440 or 390 weighs three: axe and the keyboard walk run there). Every shard
computes the same cut from the same `--only`, so no list is passed around.
The plan gives one shard per 80 checks, at most four (each shard pays about
two minutes of setup). `npm run check:ui -- --plan [--only=…] [--shard=i/n]`
prints what a run would check without starting anything. A shard takes the
state screenshots whose screen and person it checks.

### The ratchet on a subset

`scripts/ui-baseline.json` holds `counts` (the totals of a full run) and
`byScreen` (each screen's counts: every person, viewport and theme; a count
left out is 0). A run that checks some screens compares **each screen with
its own counts**; a full run compares the totals as well. The keyboard
walk's tolerance (+5) applies to the totals and to each screen. Refused
server hosts are counted for the whole Studio process, so a subset compares
them with the full total. Shards are compared after `scripts/ui/merge.mjs`
joins them (a screen can span shards). `--quick` is not compared (it skips
viewports the baseline counts).

While a screen has no counts of its own yet, the counts of those screens are
summed and compared with the full totals (lenient), and the run prints a
note. To record every screen's counts:

1. Actions → CI → Run workflow, on `development` (or the branch to measure),
   with **update_baseline** ticked (or
   `gh workflow run ci.yml --ref development -f update_baseline=true`).
2. When the `ui full sweep` job is done, download the `ui-baseline` artifact
   (`gh run download <run id> -n ui-baseline -D scripts/`).
3. Check the diff of `scripts/ui-baseline.json` (the totals should match the
   last full run), commit it on a branch and open a pull request.

`--update` on a full run writes the totals and every screen; with `--only` it
writes those screens and keeps the totals; with `--quick` or `--shard` it
refuses (merge shards with `node scripts/ui/merge.mjs <dir> --update`).

## What it runs against

| Piece | Here | Why |
|---|---|---|
| The Studio | `next start` (the build CI just made) | what Vercel serves |
| Database | CI's Postgres 17 service: the accounts fixture, the owner's setup SQL, every migration | the real SQL and row level security |
| Sign-in | the Supabase Auth mock (`scripts/verify/auth-mock.mjs`); staff sessions carry the six-digit-code level | no hosted project |
| Media | the in-memory S3 stand-in (`scripts/verify/s3-standin.mjs`), signed URLs included | no bucket |
| Providers | **none.** No provider key is set, and the server runs with `scripts/ui/no-network.mjs`, which refuses every connection to anything but this machine and logs it | no OpenAI, Google, Higgsfield or Topaz call can happen |
| The browser | may load only the Studio and its stand-ins; anything else is aborted and listed | no third-party request |

### The synthetic world (`scripts/ui/seed.mjs`)

| Company | Plan | State | People |
|---|---|---|---|
| Nmesis | internal | staff land here | staff (code passed) |
| Demo Company | Growth | **85%** of 2,000 credits used; **300 visuals** (some failed, some in progress, 5 in the trash); three Higgsfield jobs (queued, running, failed); grants Nmesis support access | owner, creator, viewer |
| Sample Auto | Starter | **100%** of 500 used; film, swap, storyboards, line-ups, area edit… **locked** | owner |
| Example Motors Group Middle East and North Africa Regional Marketing Department | Enterprise | **long name**; 10,000,000 a month, none used (**zero**); a **1,250,000** pack (**huge**); films (draft, queued, failed, quoted), a failed swap, three storyboards (one untitled) | owner; also the Demo owner as viewer (**two companies**) |
| Ended Motors Demo | Growth | subscription **ended** five days ago | owner |
| — | — | a person in **no company** | — |

Folders, projects, a 30-day trash with expiry, and Home do not exist yet
(Phase 3). The harness lists them as *pending* so the report says so.

## The matrix

Each screen has a list of people. For the person it is mainly about (`full`),
every width and both themes; for the others, 1440 and 390 in both themes. The
phone widths (≤ 480) use a touch, mobile browser context.

## The checks, per page

| Check | How | Rule |
|---|---|---|
| Ready | the load event, then no request in flight and **400 ms without a DOM change** (12 s at most; a page that never goes quiet is reported) | — |
| Sideways scroll | `documentElement.scrollWidth − innerWidth > 0` | 1.4.10 |
| Console errors | `console.error` and uncaught exceptions, except the browser's own report of a request the harness blocked | — |
| Server errors | any 5xx, and any 4xx from `/api/` other than 401 | — |
| axe | `@axe-core/playwright`, WCAG 2.0/2.1/2.2 A and AA plus best practice; **every** violation is reported with its impact; serious and critical are counted | WCAG 2.2 AA |
| Focus | a **real Tab** up to 40 stops: each stop has an outline or a box shadow; how many of five points on it a fixed or sticky element covers (all of them = hidden) | 2.4.7, **2.4.11** |
| Targets | every visible control smaller than **24 × 24** (a link inside a sentence is excepted); at 390 and 360 also under **44** | **2.5.8** |
| Drawn over | pointing at the centre of each control on screen: is it what the pointer reaches? | — |
| Clipped text | a box narrower than its own text with overflow hidden: **without an ellipsis**, or **with an ellipsis but no title** holding the whole text | — |
| Layout shift | CLS by session window (as web-vitals counts it) | CLS < 0.1 |
| Screenshots | 1440, 1280, 1024 and 390, both themes, with `--shots` (CI artifact, 7 days; never committed); in CI only the screens that ran | — |

States opened by clicking (the library, the viewer, Studio settings, the company
switcher) are opened by the harness and checked after they open.

## The performance baseline (`--perf`)

Measured in the same harness, so it is comparable from run to run, not with a
real phone: per route at **390 with 4× CPU slowdown and 9 / 1.5 Mbit/s, 60 ms**
and at **1440** unthrottled, LCP, CLS, INP from scripted interactions (opening
folds, typing), JS and total bytes; the library at 300 items (cards drawn,
images, lazy loading, sizes, long tasks while scrolling); p50 / p95 of the main
APIs (15 calls each); **database statements per request** on the first and
second call (so the 60 s company-context cache and the 10-minute configurator
cache show); the first request to the heaviest route after the server starts;
what pages with work in progress ask for over 30 s; the largest chunks.

## The ratchet

`scripts/ui-baseline.json` holds the counts that do not depend on timing (page
errors, sideways scroll, console and server errors, axe serious and critical,
focus without an indicator or hidden, targets under 24, drawn over, clipped
text, blocked server requests, words spilling, fixed controls over the
settings, the band under the editor, pages a phone zooms out), in total and
per screen ("The ratchet on a subset" above). The job fails when one goes up.
Timing-dependent counts (CLS, never quiet) are reported, not ratcheted.
`--update` writes the baseline; Phase 4 brings it to zero.

## The harness's own time

Per page: the load event, then ready (no request in flight and 400 ms with no
DOM change, polled every 100 ms, 12 s at most), the layout checks, and at 1440
and 390 axe and a keyboard walk of up to 40 Tab stops. Three pages run at a
time. Setup signs in only the people the run needs, in parallel (one session
at a time per account), then seeds and backfills. The layout checks read each
element's box and style once per call (an element "hidden on purpose" is
remembered with its ancestors) and run the cheap DOM tests before layout and
style reads; the checks and their results are the same. In the full sweep the
`--perf` baseline is most of the time (its database-statement count waits
about 11 s around each call for Postgres to publish its statistics, about
4 minutes, and the polling watch is 60 s); it runs only in the full sweep.

## Mistakes the harness makes about itself

Automated checks find part of the problems; the findings register adds what a
person sees. Known limits, and what the harness gets wrong:

- **Ready** is a heuristic. A page that polls never goes quiet; it is checked
  after 12 s anyway and listed as "never quiet".
- **Focus indicator** looks for an outline or a box shadow on the focused
  element. A design that shows focus only through a colour change, or on a
  parent, is reported as missing (false positive); a 1 px outline the same
  colour as the background passes (false negative).
- **Hidden by a sticky bar** samples five points. A sliver can be missed.
- **Drawn over** (corrected in Phase 2b): until 2b it counted the controls
  inside a closed `<details>` (a card's "…" menu) as drawn over by the picture;
  they are not drawn at all, so they are now left out. Part of F-069 was this.
- **Drawn over** (corrected in Phase 3 group 2): "on screen" now means inside
  the window *and* inside every box that scrolls or clips the control. Until
  then a setting scrolled below the editor's settings panel, or a version card
  past the end of the history strip, counted as drawn over by whatever lay
  beyond the box (Generate, the settings panel); a person reaches those by
  scrolling that box, as the page.
- **Words spill** (Phase 3 group 2, `controlsSpilling`): a control with words
  whose text is wider than its box, or that may not wrap and does not fit.
- **Drawn over** checks only what is on screen when the page is ready, from the
  centre of each control. Transparent overlays that pass clicks through (for
  example `pointer-events: none` badges) are reported as covering.
- **Targets** count the box of the element. An icon button whose padding makes
  it bigger than it looks passes; spacing between small targets (the 2.5.8
  spacing exception) is not credited, so some small targets are allowed in fact.
- **Clipped text** looks at elements with their own text. Text clipped inside a
  canvas, an image or a pseudo-element is not seen.
- **axe** cannot judge meaning (alt text that is wrong but present, a label that
  is unclear), and colour contrast over images or gradients comes out
  "incomplete", not as a violation.
- **Touch**: phone widths use a touch context, but the harness clicks rather
  than taps, so hover-only controls are not caught by the clicks; the target
  check and screenshots are how they show.
- **Themes**: most existing screens are dark whatever the system asks; the light
  runs of those screens are near-duplicates. The 2b top bar, dialogs and toasts
  are dark too, to match, until Phase 3 moves the screens onto the tokens.
- **Provider names** (F-050, Phase 2b): every client page is read as a client
  without its own keys (owner, creator, viewer, Starter, ended, no company,
  signed out): visible text plus `aria-label`, `title` and `alt`. The names
  are `PROVIDER_NAMES` in `lib/provider-words.ts`; the count must stay 0.
- **Company switcher** (Phase 2b): below 768px it lives in the menu, so the
  harness opens the menu there.
- The run's own list of what it could not open is in `summary.md` under
  "Mistakes the harness made about itself".
