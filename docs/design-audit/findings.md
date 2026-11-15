# Studio design audit: findings

Phase 1, findings only (nothing here is fixed in this PR). Sources: the UI harness
(`npm run check:ui`, every screen at 1440 · 1280 · 1024 · 768 · 390 · 360, light
and dark, owner / creator / viewer / staff and the plan states; see
[harness.md](harness.md)), its performance baseline, the CRUD matrix
([crud.md](crud.md)), the design guard (`npm run check:design`), and a person
reading every screen.

- **Severity** (NN/g): 0 not a problem · 1 cosmetic · 2 minor · 3 major · 4 catastrophe (fix before clients arrive).
- **Effort**: S under a day · M a few days · L a week or more.
- **Rule**: WCAG 2.2 success criterion, or Nielsen heuristic H1–H10
  (H1 status · H2 real-world words · H3 control and freedom · H4 consistency ·
  H5 error prevention · H6 recognition · H7 flexibility · H8 minimal design ·
  H9 error recovery · H10 help).
- **Where**: the screen (harness id) and, where it matters, viewport and theme.

## Summary

**69 findings** in 18 areas. By severity: 4 · 1, 3 · 19, 2 · 35, 1 · 13, 0 · 1. By effort: S · 41, M · 20, L · 7.

| Area | Findings | Highest severity |
|---|---:|:-:|
| Navigation & shell | 5 | 3 |
| Phones & responsive | 4 | 4 |
| Theme & brand | 3 | 2 |
| Consistency & design system | 4 | 2 |
| Contrast | 1 | 3 |
| Focus & keyboard | 5 | 3 |
| Targets & pointer | 3 | 3 |
| Names & structure | 4 | 3 |
| Text & truncation | 1 | 2 |
| Forms | 2 | 2 |
| Loading, empty & error states | 7 | 3 |
| Long-running AI work | 3 | 2 |
| Destructive actions & recovery | 5 | 3 |
| Library & media | 6 | 3 |
| Plans, upsell & credits | 3 | 3 |
| Roles & staff access | 2 | 2 |
| Words, dates & numbers | 3 | 2 |
| Performance & robustness | 8 | 3 |

The harness (2026-11-15, 260 page checks, 6 widths, both themes, 11 kinds of person):

| Check | Count |
|---|---:|
| Pages that did not load | 0 |
| Page checks with sideways scroll | 12 |
| Console errors / server errors (4xx from `/api`, 5xx) | 32 / 40 |
| axe critical / serious / moderate / minor (nodes) | 88 / 572 / 30 / 40 |
| Focus stops with no visible indicator / hidden by a sticky bar | 187 / 0 |
| Targets under 24 px / under 44 px on phones | 608 / 1896 |
| Controls drawn over | 290 |
| Clipped text: no ellipsis / ellipsis without the full text | 0 / 106 |
| Page checks with CLS over 0.1 | 80 |
| Connections the network guard refused from the server | 0 |

### Top 15 (the order to fix them in)

1. **F-006** · severity 4, effort M · On a phone the top bar runs off the screen: the credit meter, settings and Sign out cannot be reached.
2. **F-051** · severity 3, effort S · An ended Growth company is told its tools are "Available on Growth".
3. **F-034** · severity 3, effort S · A finished image that is still loading says "Creating your visual … keep this page open".
4. **F-065** · severity 3, effort S · One unreadable job row makes the whole library answer 500.
5. **F-042** · severity 3, effort S · The browser's `confirm()` guards "discard unsaved storyboard changes" in Film studio.
6. **F-043** · severity 3, effort S · Removing a provider connection happens at once, with no question and no Undo.
7. **F-045** · severity 3, effort M · Films, swaps and storyboards cannot be deleted at all.
8. **F-025** · severity 3, effort S · The configurator tabs point at panels that are not in the page (axe critical).
9. **F-001** · severity 3, effort M · The top bar does not fit at 1440: brand, Sign out and tool links wrap and spill.
10. **F-002** · severity 3, effort M · Every tool has its own navigation; Usage and Company have none.
11. **F-009** · severity 3, effort M · Sideways scroll on line-up, films, storyboard and swap at 1024 and 768.
12. **F-016** · severity 3, effort M · Text below 4.5:1 contrast on 13 screens.
13. **F-017** · severity 3, effort S · Focus stops with no visible indicator (text boxes, the configurator frame).
14. **F-022** · severity 3, effort M · Hundreds of controls smaller than 24 × 24 px.
15. **F-036** · severity 3, effort M · Layout shift over 0.1 on the library, line-up, Usage and Company.

### Proposed fix order

1. **Phase 2a · quick, before anything else** (severity 4 and wrong information, all S):
   F-006 (phones cannot reach the meter, settings or sign-out), F-051 (an ended plan told to buy the plan it has), F-034 (finished images said to be "creating"), F-065 (one bad row empties the library), F-042, F-043 (no question before discarding or removing), F-025 (broken tab names), F-033 and F-032 (dead-end Usage, needless 403s), F-057 (dates), F-004 (names cut off), F-069 (card actions only on hover).
2. **Phase 2b · shared fixes** (one change, every screen):
   the app shell and phone navigation from the design system (F-001, F-002, F-006, F-007, F-009);
   dialogs, Undo and the 30-day trash (F-042 to F-046);
   the job card everywhere (F-039 to F-041, F-035);
   skeletons and states without layout shift (F-036 to F-038);
   contrast, focus, targets and names (F-016 to F-031);
   performance: polling with backoff, a lighter context per request, the library
   API, route splitting (F-059 to F-063).
3. **Phase 3 · per approved group**: "Home, projects and folders" first (F-003,
   F-047 to F-049, F-052, F-068), then each tool on the editor layout, then Usage and
   Company (F-055 to F-058, F-067), with the Nmesis theme in light and dark (F-010 to F-015).
4. **Phase 4 · guard**: empty the `check:design` baseline (F-013) and the
   `check:ui` baseline.

## Register

| ID | Area | What's wrong | Where | Viewport / theme | Sev | Effort | Rule | Fix |
|---|---|---|---|---|:-:|:-:|---|---|
| F-001 | Navigation & shell | The top bar does not fit: the brand wraps onto two lines, "Sign out" wraps, and the tool links ("Story studio ↗", "Replace car in ad ↗" with their plan chips) sit stacked above and below the bar, half outside it. | workspace, library, lineup, settings | 1440 and below | 3 | M | H4, H8 | The design system's `AppShell` top bar: brand, Home · Library · Projects · Tools, then support status, meter, company. |
| F-002 | Navigation & shell | Every tool has its own navigation. Key visuals shows two links with "↗"; Films shows Story studio · Key visuals · Films · Replace car (NEW) · Video connection; Usage and Company show none. A person cannot tell where they are or how to get back. | workspace, films, swap, storyboard, usage, company | all | 3 | M | H4, H6 | One navigation in the shell; tools listed once on Home and under Tools. |
| F-003 | Navigation & shell | There is no Home and no library page: the library is the bottom of the key-visual page ("Your gallery" scrolls to it). | workspace | all | 3 | L | H6, H7 | Phase 3: Home (approved wireframe) and a Library page. |
| F-004 | Navigation & shell | The company's name is cut off in the top bar with no ellipsis or full name to read ("Example Motors Group Middle East a"); in the switcher it ellipsises without a title. | workspace, films, usage, company-switcher | 1440 | 2 | S | 1.4.10, H1 | `ds-truncate` plus `title`; the switcher lists the whole name. |
| F-005 | Navigation & shell | "↗" on internal links (Story studio, Replace car in ad) says "opens elsewhere"; they open in the same tab. | workspace | all | 1 | S | H4 | Drop the arrow, or open the tool from the navigation. |
| F-006 | Phones & responsive | **On a phone the top bar runs off the screen**: the credit meter, Studio settings and Sign out cannot be reached at all, and the tool links overlap the 85% banner. | workspace, library, lineup, settings, viewer | 390, 360 | 4 | M | 1.4.10, 2.1.1, H3 | The shell's phone layout: compact bar plus bottom navigation; account and settings in a sheet. |
| F-007 | Phones & responsive | No phone navigation: the only way between tools is the links in the overflowing bar. | every signed-in screen | 390, 360 | 3 | M | H3 | `PhoneNav` from the design system. |
| F-008 | Phones & responsive | Controls under 44 × 44 px on phones: 1,896 instances (harness). | every screen | 390, 360 | 2 | M | 2.5.8 (aim) | `--ds-control-h` switches to 44 on touch. |
| F-009 | Phones & responsive | Sideways scroll: line-up +129 px at 1024 and +188 px at 768; films +170 px at 1024; storyboard +56 px and swap +38 px at 1024. | lineup, films, storyboard, swap | 1024, 768 | 3 | M | 1.4.10 | `minmax(0, 1fr)` grid tracks and `min-width: 0`; the editor layout collapses settings below 1024. |
| F-010 | Theme & brand | Signed-in screens ignore light mode; only the sign-in screens follow the system. | all signed-in screens | light | 2 | L | H4 | Phase 3: every screen on the tokens (`.ds-app`), light and dark. |
| F-011 | Theme & brand | The Studio is orange and Arial; the admin is lime, graphite, Inter and Outfit. The two do not read as one product. | everywhere | all | 2 | L | H4 | Phase 3: the Nmesis tokens (already in `app/tokens.css`). |
| F-012 | Theme & brand | Primary buttons come in at least three oranges and shapes (solid "Sign in", brown "Generate film" that looks disabled, light "Renew for 7 days"). | signin, films, company | all | 2 | S | H4 | One `primary` button. |
| F-013 | Consistency & design system | The design guard's baseline: 745 colours written out, 1,340 sizes off the scale, 79 native controls with no class, 68 classes no stylesheet defines (`.studio` on six pages), 2 `confirm()`. | all CSS and components | — | 2 | L | H4 | Move screens onto the tokens; the guard counts down to zero (Phase 4). |
| F-014 | Consistency & design system | In the "Single car · Car lineup" switch, the locked option ("Car lineup [Growth]") is set in a larger size than the open one. | workspace (Starter, ended) | 1440 | 1 | S | H4 | Upsell chip inside a segmented control keeps the control's text size. |
| F-015 | Consistency & design system | Page headers differ on every screen (orange full stop on Key visuals, marketing headline on Films, plain on Usage and Company); no page says in one line what it is for on the tool pages' second level. | all | all | 1 | M | H4 | `PageHeader`. |
| F-016 | Contrast | Text below 4.5:1: 310 nodes on 13 screens, mainly small grey captions ("configurator.example.test", "⌘V / Ctrl+V", "ChatGPT / OpenAI" on library cards, "Optional") and the Generate button. | workspace, library, films, signin, … | all, dark | 3 | M | 1.4.3 | Tokens `--ds-muted` / `--ds-muted-2` are checked at 4.5:1 in both themes. |
| F-017 | Focus & keyboard | 187 focus stops with no visible indicator (harness, real Tab). Mainly the configurator frame and text boxes that show focus only by a faint border change. | workspace, signin, choose-password, company, films, lineup | 1440, 390 | 3 | S | 2.4.7 | One focus ring (`--ds-ring`) on every control. |
| F-018 | Focus & keyboard | The live configurator frame takes keyboard focus with no indicator and no way to tell what it is. | workspace, lineup | all | 2 | S | 2.4.7, 4.1.2 | Ring and an accessible name on the frame; a "Skip the configurator" link. |
| F-019 | Focus & keyboard | The swap steps scroll sideways but cannot be reached by keyboard. | swap | 1440 | 2 | S | 2.1.1 | `tabindex="0"` and a name on the region, or no scroll. |
| F-020 | Focus & keyboard | Two focus rings at once on the paste / upload row (the button and the row). | workspace | all | 1 | S | H8 | Ring on the control only. |
| F-021 | Focus & keyboard | Focus partly under the company switcher's open list (staff). | company-switcher | 1440 | 1 | S | 2.4.11 | The switcher as a dialog (`CompanySwitcher`). |
| F-022 | Targets & pointer | Controls smaller than 24 × 24 px: 608 instances. "Open in a tab", "Your gallery", "Capture options", "Model information & billing", "Ask Nmesis", the tool links, film and line-up tick boxes, "Forgot your password?", "Skip, I'll use email links", "Refresh estimate". | workspace, films, lineup, signin, … | all | 3 | M | 2.5.8 | `--ds-control-h-sm` minimum; tick boxes as `.ds-check` (the sentence is the target). |
| F-023 | Targets & pointer | 290 controls are drawn over by another element where the pointer lands (harness), mostly in the configurator panel and the inspiration panel. | workspace, library | all | 2 | M | 2.5.8, H3 | Review stacking in the editor panels; no invisible overlays above controls. |
| F-024 | Names & structure | The credit meter's accessible name does not contain its visible words ("1,700 used · 300 left"), on every signed-in screen (240 nodes). Voice-control users cannot click it by what they see. | every signed-in screen | all | 2 | S | 2.5.3 | `CreditMeter`: the visible text starts the name. |
| F-025 | Names & structure | The "Captured view / Live configurator" tabs point `aria-controls` at panels that are not in the page (critical, 80 nodes). | workspace, settings, library | all | 3 | S | 4.1.2 | Keep both panels mounted (hidden) or drop `aria-controls`. |
| F-026 | Names & structure | The company switcher opens a dialog with no name. | company-switcher | all | 2 | S | 4.1.2 | Name it "Switch company". |
| F-027 | Names & structure | The 404 page has no main landmark and its content is outside any region; it shows no navigation back. | not-found | all | 1 | S | 1.3.1, H3 | 404 inside the shell with "Back to Home". |
| F-028 | Consistency & design system | The gallery and wireframes have their own axe findings: a list containing a status element (critical), `role="listitem"` on links (car scroller), frames with `tabindex="-1"` holding focusable content, two main landmarks, a heading level skipped. | design-system | all | 2 | S | 1.3.1, 4.1.2 | Fix in the design-system components (staff only today, but they become every screen). |
| F-029 | Text & truncation | Text cut off with an ellipsis and no way to read the rest: 106 (company names, film titles on cards, the company in the switcher). No text is clipped without an ellipsis. | films, company-switcher, workspace | 1440 | 2 | S | 1.4.10 | `ds-truncate` plus `title`. |
| F-030 | Forms | The film approval tick box and line-up tick boxes are native 13 px boxes, separate from their sentence. | films, lineup | all | 2 | S | 2.5.8, H4 | `.ds-check`. |
| F-031 | Forms | Inputs on Company, Films and the sign-in screens show focus by a faint border change only. | company, films, signin | all | 2 | S | 2.4.7 | `ds-input` focus ring. |
| F-032 | Loading, empty & error states | Screens ask the server for what the person may not see, then log an error: a creator's Usage and Company load `/api/usage` and `/api/company/support` (403); Growth loads films, swaps and storyboards (403); an ended company loads both provider connections (403). Thirty-two console errors in the run. | usage, company, films, swap, storyboard, workspace | all | 2 | S | H9 | Decide from the context the page already has; do not fetch. |
| F-033 | Loading, empty & error states | A creator's Usage page is a dead end: the meter and the banner's "Usage" link both lead there, and it says in error red that only owners can see it. | usage (creator) | all | 2 | S | H3, H10 | Meter for non-owners opens a small "used / left" panel; no link to a page they cannot open. |
| F-034 | Loading, empty & error states | **A finished image that has not loaded yet says "Creating your visual … Keep this page open while it renders."** The person is told work is running that is not. | library | 1440, 390 | 3 | S | H1 | `SkeletonTile` while the picture loads; "Creating" only for jobs that are running. |
| F-035 | Loading, empty & error states | Higgsfield cards in progress: "Return within seven days to archive the finished image." Reads as a warning that work will be lost; "archive" is the system's word. | library | all | 2 | S | H2 | Job card: "Rendering · about 2 minutes left. You can leave this page." |
| F-036 | Loading, empty & error states | Layout shift over 0.1 on 80 page checks: the library (0.47–0.57 at 1440), line-up (0.27–0.85), Usage (0.10–0.19), Company (0.10–0.19): content moves down when data arrives. | library, lineup, usage, company | 1440 to 768 | 3 | M | CLS | Skeletons in the shape of what is coming. |
| F-037 | Loading, empty & error states | Loading is plain text ("Loading usage…") and errors are a red sentence with no Try again. | usage, company | all | 2 | S | H1, H9 | `Loading` + skeletons; `State kind="error"` with Try again. |
| F-038 | Loading, empty & error states | When the configurator cannot load, its panel is an empty black box with no message. | workspace, lineup | all | 2 | S | H1, H9 | "The configurator did not load. Open it in a tab, or paste a picture." |
| F-039 | Long-running AI work | Work in progress has no job card: a spinner, no stage, no estimate, no Cancel, no credits held; the page polls each job every 8–12 s. | library, films, swap | all | 2 | M | H1, H3 | `JobCard` everywhere (queued · running with stage · done · failed · cancelled). |
| F-040 | Long-running AI work | "Generate film" is a brown bar that looks disabled whether or not it is; the reason (approve the tick box above) is not next to it. | films | all | 2 | S | H1 | `GenerateButton` with the cost; the reason in its note. |
| F-041 | Long-running AI work | Credits are shown before starting on Films (120 credits), but the key-visual Generate button does not show its cost on the button. | workspace | all | 2 | S | H1 | `GenerateButton` cost on every tool. |
| F-042 | Destructive actions & recovery | The browser's `confirm()` asks "Discard the unsaved storyboard changes?" in Film studio (two places): OK on Enter, nothing named. | films | all | 3 | S | H3, H5 | `useConfirm()`; or keep the changes as a draft and offer Undo. |
| F-043 | Destructive actions & recovery | "Remove" on a provider connection disconnects at once: no question, no Undo; the key has to be typed again. | settings | all | 3 | S | H3, H5 | A dialog naming the provider and the consequence; Cancel focused. |
| F-044 | Destructive actions & recovery | The trash ("Deleted images") never empties and has no permanent delete. | library | all | 2 | M | H3 | 30-day trash with Restore and a confirmed "Delete forever". |
| F-045 | Destructive actions & recovery | Films, swaps and storyboards cannot be deleted at all; every test and draft stays in the list. | films, swap, storyboard | all | 3 | M | H3 | Move to trash with Undo, as visuals. |
| F-046 | Destructive actions & recovery | "Clean empty" archives empty drafts with no word on what it did. | library | all | 1 | S | H1 | Toast: "3 empty drafts removed." |
| F-047 | Library & media | 298 items in a three-column list of large cards (six per screen at 1440), no search, no filters, no sort, no folders. | library | 1440 | 3 | L | H7, H8 | Phase 3: the library view (grid / list, filters, search, sort). |
| F-048 | Library & media | No viewer: clicking a picture selects it into the editor; there is no full-screen view with ← / →, Download, Make a variation, Move to…. | library | all | 2 | M | H7 | `Viewer`. |
| F-049 | Library & media | No bulk select, move, download or delete. | library | all | 2 | L | H7 | `MediaGrid` selection and `BulkBar`. |
| F-050 | Library & media | Every card names the provider and model ("Higgsfield · Marketing Studio · Sunburst 2.5", "ChatGPT / OpenAI"). Owner's decision whether clients should see providers. | library | all | 1 | S | H2 | Decide; if not, show the tool ("Key visual · 4K"). |
| F-051 | Plans, upsell & credits | **An ended Growth company is told its tools are "Available on Growth"**: the upsell names the plan it already has. | workspace (ended) | all | 3 | S | H1 | When the subscription has ended, say so ("Your Studio is paused") instead of upselling. |
| F-052 | Plans, upsell & credits | "Ask Nmesis" is plain text or a 20 px text button that does nothing visible: no address, no request, no confirmation. | workspace, films, swap, storyboard, lineup | all | 2 | M | H3, H10 | "Ask Nmesis" sends the request (with the tool and company) and says so; or opens the account manager's contact. |
| F-053 | Plans, upsell & credits | An ended company has no credit meter, and the editor looks fully usable although new work is paused. | workspace (ended) | all | 2 | S | H1 | Paused state on the shell; Generate disabled with the reason. |
| F-054 | Roles & staff access | Staff viewing a client see an editor that looks editable (fields and buttons enabled); only the banner says read-only. | workspace (staffViewing) | all | 2 | M | H1, H5 | Read-only state: controls disabled with the reason, or hidden. |
| F-055 | Roles & staff access | The support-access log adds an entry for every page load (three in two seconds) and shows raw paths ("/usage"). | company | all | 2 | S | H2, H8 | One entry per visit, with the screen's name. |
| F-056 | Words, dates & numbers | Usage "By person" lists email addresses, not names. | usage | all | 1 | S | H2 | Name, email as the second line. |
| F-057 | Words, dates & numbers | Dates three ways: ISO in sentences ("They reset on 2026-12-05", "Period 2026-11-05 to 2026-12-04"), US with seconds ("11/22/2026, 12:32:56 PM"), and raw on cards. | usage, company, viewing-as banner, workspace | all | 2 | S | H4 | One date format ("5 Dec", "22 Nov, 12:32"), the same as the admin. |
| F-058 | Words, dates & numbers | The credit banner repeats the whole period sentence on every screen (two lines at 1440, five at 390). | all signed-in screens | 390 | 1 | S | H8 | One line with a link; detail on Usage. |
| F-059 | Performance & robustness | `/api/visuals` reads every record from storage on every request: p50 302 ms, p95 328 ms for 298 items in the harness; it grows with the library. | library | — | 2 | M | — | An index (job rows or a manifest) and pagination on the server. |
| F-060 | Performance & robustness | Every API request runs about six database statements for the person's context, the second call as many as the first (the 60 s entitlement cache does not reduce them); Usage runs 14–15. | all APIs | — | 2 | M | — | One context query per request (a single statement or function), cached per request. |
| F-061 | Performance & robustness | Polling without backoff: `/api/status` every 10 s on every workspace, each image job every 8 s, each film every 12 s, for as long as the page is open. | workspace, library, films | — | 2 | S | — | Back off (8 → 16 → 32 s), stop when hidden, one request for all jobs. |
| F-062 | Performance & robustness | Films loads the same picture four times at once (`/api/assets/:id` ×4). | films | — | 1 | S | — | One request per picture. |
| F-063 | Performance & robustness | The company switcher's search (cmdk + Radix, about 37 KB gzipped) ships on every page, including for a person with one company. Route JS: /signin 150 KB, / 281 KB, /lineup 251 KB, /usage 281 KB, /company 281 KB, /films 198 KB, /swap 213 KB, /storyboard 219 KB. | all | — | 1 | S | — | Load the switcher when opened. |
| F-064 | Performance & robustness | Layout shift is the main Web Vitals problem (see F-036). LCP and INP in the harness are within the targets: /signin LCP 308 ms, INP 0 ms; / LCP 1304 ms, INP 64 ms; /lineup LCP 1340 ms, INP 40 ms; /usage LCP 940 ms, INP 0 ms; /company LCP 856 ms, INP 16 ms; /films LCP 300 ms, INP 32 ms; /swap LCP 300 ms, INP 24 ms; /storyboard LCP 288 ms, INP 24 ms. | — | 390 (4× CPU) and 1440 | 0 | — | LCP, INP | Keep; re-measure after Phase 2b. |
| F-065 | Performance & robustness | One job row the server cannot read makes the whole library answer 500 (nothing is shown), where an unreadable stored record is skipped with a warning. | library | — | 3 | S | H9 | Skip the row with the same warning. |
| F-066 | Performance & robustness | The workspace for a company with no provider connected says "Image generation isn't connected on this Studio yet", an operator's sentence, to the client. | settings | all | 1 | S | H2 | "Generation is not available right now. Nmesis has been told." |
| F-067 | Library & media | No rename for visuals or films; no export of Usage; deletes, restores and key changes are not logged for owners. | library, films, usage | — | 2 | M | H3 | See crud.md. |
| F-068 | Library & media | Folders and projects do not exist (the harness lists Home, projects and folders as pending). | — | — | 3 | L | H7 | Phase 3 group "Home, projects and folders". |
| F-069 | Targets & pointer | A library card's actions (Delete, and the rest) appear only when the pointer hovers; otherwise they sit under the picture. On a touch screen there is no hover, so they cannot be found; the harness finds them drawn over on every card. | library, viewer | all, touch | 3 | S | 2.5.8, H6 | Actions always visible on touch (`hover: none`), and on focus; the `MediaTile` menu. |

## Not covered, and why

- The six-digit-code screen: staff in the harness have already passed it (the Studio rightly skips it). It needs a staff session without the code; added when the mock supports MFA enrolment.
- The live configurator itself: it is a third-party page in a frame; the harness blocks it.
- Generating, rendering and upscaling end to end: no provider is reachable, by design. Job states are seeded.
- The 2.5.7 single-pointer alternative for drawing and area selection in the area editor: the harness does not draw; to be checked by hand in Phase 2b with the editor.
- Real devices: harness numbers are comparable run to run, not with a phone in a hand.
