# The UI harness: `npm run check:ui`

Every Studio screen, in a real browser (Chromium through Playwright), at
**1440 · 1280 · 1024 · 768 · 390 · 360**, in **light and dark**, as each kind of
person, against the **production build** with synthetic data. It runs in CI
(the `ui` job) on every pull request.

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
| Screenshots | 1440 and 390, both themes, with `--shots` (CI artifact, 7 days; never committed) | — |

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
text, blocked server requests). The job fails when one goes up. Timing-dependent
counts (CLS, never quiet) are reported, not ratcheted. `--update` writes the
baseline; Phase 4 brings it to zero.

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
