# The Studio design system

Everything the Studio is built from: the sizes, the colours and each component.
One place, so two screens meant to look the same actually do, and the Studio
and the Nmesis admin read as one product.

- **Tokens:** [`app/tokens.css`](../app/tokens.css). The only file where a size,
  colour, duration or layer is a number.
- **Components:** [`app/design-system.css`](../app/design-system.css) (classes
  prefixed `.ds-`) and [`components/ds/`](../components/ds) (React).
- **See them:** `/design-system`, staff only. Every component in every state,
  light and dark side by side, and the wireframes of the target experience.
- **The guard:** `npm run check:design` (below).

Phase 0 changes no existing screen. The tokens and components load only on the
design-system routes; screens move onto them group by group from Phase 2b.

---

## 1 · Why: what was measured

`npm run design:inventory` on `development`, 15 November 2026, across the 7
stylesheets and 98 components of the Studio (vendor CSS excluded):

| Kind | Different values | Uses | Scale proposed |
|---|---:|---:|---:|
| Text sizes | 34 | 420 | 10 |
| Font weights | 4 | 53 | 4 |
| Line heights | 12 | 61 | 10 (one per size) |
| Letter spacing | 24 | 42 | 2 |
| Paddings | 39 | 370 | 11 (spacing) |
| Margins | 40 | 271 | 11 (spacing) |
| Gaps | 23 | 275 | 11 (spacing) |
| Corner radii | 16 | 167 | 6 + round |
| Shadows | 9 | 10 | 3 + focus |
| Durations | 4 | 7 | 3 + loop |
| Layers (z-index) | 6 | 6 | 7 |
| Breakpoints | 15 | 26 | 6 |
| Colours written out | 647 | 826 | ~45 tokens, light and dark |

Nobody did anything wrong: there was no scale to use, so every screen invented
one. Today's baseline for the guard is 2,209 things to fix (see section 8).

---

## 2 · The scales

Studio tokens carry a `--ds-` prefix: the Studio also runs Tailwind, whose theme
already owns `--text-*`, `--radius-*`, `--shadow-*`, `--font-*`, `--leading-*`
and `--spacing`. Reusing those names would quietly restyle every shadcn
component. After the prefix, every step has the admin's name and value
(`--ds-space-12` here is the admin's `--space-12`), and the brand accent keeps
the admin's own name (`--nm-lime`).

### Colour: cool neutrals and one accent (feat/studio-foundations)

The neutrals are one cool scale, `--ds-neutral-bg` → `card` → `surface` →
`hover` → `pressed`, with `border`, `border-strong`, `ink`, `muted` and `faint`
(light and dark). The old green-grey brand neutrals (`--nm-background` …
`--nm-graphite`) are retired. The lime is for the main action and for
selection marks only, never an area: a selected item is `--ds-selected-bg` with
the `--ds-selected-mark`. Buttons read only `--ds-btn-*` (each kind's fill,
label and edge at rest, hover, pressed and unavailable; unavailable is a
quiet surface with the muted ink, never a faded button).

Every text and background pair and every button label is at least 4.5:1 in
both themes, checked by `tests/contrast.test.mjs` from the tokens themselves;
`node scripts/design/contrast.mjs` prints the table.

### Layers

`--ds-z-base` < `raised` < `sticky` < `panel` (the navigation, the secondary
panel) < `dropdown` (menus) < `drawer` < `modal` < `toast`. Menus and
non-modal drawers render in a portal at the end of the page
(`components/ds/layer.tsx`), so a panel's own stacking can never hold them
under another panel; check:ui counts any open menu that is covered
(`menusUnderPanels`, zero).

### Spacing: a 4px base

`--ds-space-2` `-4` `-8` `-12` `-16` `-20` `-24` `-32` `-40` `-48` `-64`
(named by pixels). 2 is a hairline; everything else is a multiple of 4.

| Step | For |
|---|---|
| 2, 4 | icon to its word; inside a badge |
| 8, 12 | between buttons in a row; inside a control; label to box |
| 16, 20 | inside a card; between cards |
| 24, 32 | section to section |
| 40, 48, 64 | around an empty state; the page's top and bottom |

**Old → new:** round to the nearest step; a tie takes the smaller one.
1–3 → 2 · 4–6 → 4 · 7–10 → 8 · 11–14 → 12 · 15–18 → 16 · 19–22 → 20 ·
23–28 → 24 · 29–36 → 32 · 37–44 → 40 · 45–56 → 48 · 57 and over → 64.
(10px, the most common gap today, becomes 8; if a screen looks cramped after
moving, take 12, not 10.)

### Type

| Token | Size | Line height | For | Old sizes that map here |
|---|---:|---:|---|---|
| `--ds-text-2xs` | 10 | 1.4 | a tiny chart label, the phone nav | 8, 9, 10 |
| `--ds-text-xs` | 11 | 1.45 | the small uppercase label, badges | 11 |
| `--ds-text-sm` | 12 | 1.5 | a caption, help line, count | 12 |
| `--ds-text-base` | 13 | 1.55 | **body**: buttons, inputs, sentences | 13 |
| `--ds-text-md` | 14 | 1.5 | a sub-heading; first cell on a phone | 14, 15 |
| `--ds-text-lg` | 16 | 1.5 | a section heading | 16, 17, 18 |
| `--ds-text-xl` | 20 | 1.35 | a page title on a phone | 19–22 |
| `--ds-text-2xl` | 24 | 1.25 | a page title | 23–28, the `clamp()` headings on phones |
| `--ds-text-3xl` | 32 | 1.15 | the Home question; a big figure | 29–35, the `clamp()` headings on desktop |
| `--ds-text-display` | 44 | 1.05 | the one number a page is about | — |

Size and line height go together: `font-size: var(--ds-text-base); line-height: var(--ds-leading-base)`.
Headings and big figures: **Outfit** (`--ds-font-display`). Everything else:
**Inter** (`--ds-font-sans`). Both come from `next/font` (self-hosted at build).
Weights: 400, 500, 600, 700 (`--ds-weight-*`; the one `bold` becomes 700).
Letter spacing: `--ds-tracking-label` for uppercase labels,
`--ds-tracking-tight` for display text; the other 22 values go to none.
**Every figure a person reads** (credits, counts, money, times) gets
`font-variant-numeric: var(--ds-numeric)` (tabular), or the `.ds-num` class.

### Corners

| Token | px | For | Old |
|---|---:|---|---|
| `--ds-radius-xs` | 4 | an inline focus ring, a tick box | 2, 3, 4 |
| `--ds-radius-sm` | 6 | a menu item, a thumbnail | 5, 6, 7 |
| `--ds-radius-md` | 10 | an input, a menu, a small panel | 8, 9, 10, 12 |
| `--ds-radius` | 14 | a tile, a toast, a job card | — |
| `--ds-radius-lg` | 20 | **a card**, a dialog (the brand's radius) | 20 |
| `--ds-radius-pill` | 999 | buttons, badges, chips, switches | 999 |
| `--ds-radius-round` | 50% | avatars, dots | 50% |

### Colour

Every colour is a token with a light and a dark value (`light-dark()`).
`.ds-app` follows the system; `data-theme="light"` or `"dark"` on any element
fixes it for everything inside. The colour tokens are declared on `:root`,
`.ds-app` and `[data-theme]`, because the CSS pipeline (Lightning CSS) turns
`light-dark()` into variables resolved where the token is declared.

| Token | Use | Old Studio colours it replaces |
|---|---|---|
| `--ds-bg` | the page | `#121416`, `#111416`, `#10171c`, `#0d1317` |
| `--ds-panel` | cards, bars, inputs | `#191c1f`, `#192227`, `#182226`, `#181d20` |
| `--ds-panel-2`, `--ds-panel-hover`, `--ds-panel-3` | raised, hover, tracks | `#202428`, `#252a2e`, `#30363b`, `#353d42` |
| `--ds-border`, `--ds-border-strong` | lines; input edges | `#33383e`, `#2c3034`, `#3b4147`, `#3c4851` |
| `--ds-text`, `--ds-text-strong` | words; titles | `#eef0f2`, `#f0f1f2`, `#fff` |
| `--ds-muted`, `--ds-muted-2` | second lines; placeholders | `#a7adb3`, `#929ba2`, `#9ca4ac`, `#858d94` |
| `--ds-accent` (+ `-hover`, `-ink`, `-text`, `-edge`, `-soft`) | the brand | the orange `#ff713e`, `#ff713b`, `#ff8956`, `#ff865b` → **lime** |
| `--ds-danger`, `--ds-warn`, `--ds-success`, `--ds-info` (+ `-soft`) | states | `#f17474`; the auth error and note tints |
| `--ds-scrim`, `--ds-media-shade`, `--ds-viewer-bg` | behind dialogs; over pictures | `#0008`, `#0007`, `#000a` |
| `--ds-ring` | the focus ring | `#ff713e` outlines |

Three rules, the same as the admin's:
- **The lime is a fill, never text on a light background** (1.1:1). Words in
  the brand colour use `--ds-accent-text` (graphite on light, lime on dark).
- **Words on the lime are `--ds-accent-ink`**, the same dark ink in both themes.
- **A lime fill that means something also gets `--ds-accent-edge`**: the fill
  alone is not a 3:1 signal.

States are never a colour alone: always a word, and a mark where there is room.

### Elevation

`--ds-shadow-1` (a card resting), `--ds-shadow-2` (a menu, a hovered tile, the
ask bar), `--ds-shadow-3` (a dialog, a toast, the bulk bar), `--ds-shadow-focus`
(the halo around a focused input). The old `0 0 0 2000px` "shadow as a scrim"
becomes a real `::backdrop` with `--ds-scrim`.

### Motion

`--ds-dur-fast` 120ms (hover, ticks) · `--ds-dur` 200ms (opening) ·
`--ds-dur-slow` 320ms (progress) · `--ds-dur-loop` 1.4s (shimmer, spinner),
one easing, `--ds-ease`. **Keyframes move only `transform` and `opacity`**;
a hover may fade a colour (paint only), never a size or a position. Reduced
motion is honoured once, at the end of `design-system.css`.
Old: 180ms and 200ms → `--ds-dur`; 1400ms and 1600ms → `--ds-dur-loop`.

### Layers

`--ds-z-base` 1 · `--ds-z-raised` 2 · `--ds-z-sticky` 20 · `--ds-z-dropdown` 40
· (Tailwind's `z-50`: shadcn popovers) · `--ds-z-overlay` 60 · `--ds-z-modal` 70
· `--ds-z-toast` 80. Never write a z-index number in a rule.
Old: 1, 2, 20, 40, 60 keep their places; 100 → `--ds-z-modal`.

### Widths the layout changes at

**1440 · 1280 · 1024 · 768 · 480 · 360**, the same on every screen. Media
queries cannot read a token, so these six numbers are written out, and only
these (a test holds `design-system.css` to them).

| Width | What changes |
|---|---|
| 1440 | the design width |
| 1280 | a laptop; gallery specimens stack |
| 1024 | navigation words hide (icons stay); the library's folder column hides |
| **768** | **the phone layout:** bottom navigation, editors' settings in a bottom sheet, toasts and the bulk bar above the navigation |
| 480 | dialogs, drawers and modals become the whole screen; grids go to two columns |
| 360 | the smallest phone that must work |

Old: 390 → 360 · 480, 520, 580, 600 → 480 · 640–900 → 768 · 1000, 1100 → 1024 ·
1200 → 1280 · 1500 → 1440.

### Controls

Every input, select and button is `--ds-control-h`: **36px with a mouse, 44px
on touch** (switched by `pointer: coarse`), so a row lines up without
measuring. `--ds-tap-min` (24px) is WCAG 2.2's floor (2.5.8), not the aim.

---

## 3 · The components

All in [`components/ds/`](../components/ds); each has a section in the gallery.

| Component | File | Use it for |
|---|---|---|
| `AppShell`, `TopBar`, `PhoneNav` | `shell.tsx` | every signed-in screen: brand, Home · Library · Projects · Tools, then the support status, the credit meter and the company switcher; a skip link; the phone navigation under 768 |
| `CreditMeter` | `shell.tsx` | used / left this period, always in the top bar, one click to Usage; warns at 80%, stops at 100% |
| `CompanySwitcher` | `shell.tsx` | more than one company; staff see Nmesis and Clients; over eight, a search |
| `SupportStatus` | `shell.tsx` | whether Nmesis support access is on (S3's opt-in rule); owners click through to Company |
| `ViewingAs`, `Banner` | `shell.tsx` | staff inside a client (read-only, logged); 80% / 100% credits; an ended subscription |
| `PageHeader` | `layout.tsx` | the title, **one line saying what the page is for**, the actions |
| `Section` | `layout.tsx` | the card everything sits in; `count` is "6 of 41" |
| `Fold` | `layout.tsx` | a section that folds; **closed, it still says what is inside** (`summary`); remembers per `name` |
| `Field` | `field.tsx` | label, control, then help **or** error; "(required)" in words; units in `AffixInput`; a count |
| `Input`, `Textarea`, `Select`, `AffixInput` | `field.tsx` | text, numbers, choices of eight or fewer |
| `Combobox` | `combobox.tsx` | more than eight choices: types to filter, ↑ ↓ Enter Escape |
| `Checkbox`, `Radio`/`RadioGroup` | `field.tsx` | a sentence with a box in front; the whole sentence is the target |
| `Switch` | `field.tsx` | takes effect **the moment it moves** (if it needs Save, it is a Checkbox); says On / Off |
| `Slider` | `field.tsx` | a range; prints its value in words ("6 s") |
| `Button`, `IconButton` | `button.tsx` | `primary` (one per screen) · `secondary` · `quiet` · `danger` (never the default) · `danger-quiet` · `sm` · `busy` (the words stay) · an icon alone always has a `label` |
| `useConfirm()` / `ConfirmProvider` | `dialog.tsx` | the dialog that asks; replaces `confirm()` (section 4) |
| `Dialog` (`modal` · `drawer` · `sheet`) | `dialog.tsx` | modal: finish or abandon; drawer: work beside the list; sheet: an editor's settings on a phone. Keyboard stays inside, the page does not scroll, focus returns |
| `useToast()` / `ToastProvider` | `toast.tsx` | one stack, polite, six seconds, held while pointed at or focused; `undo(message, run)` |
| `JobCard` | `job-card.tsx` | every long-running AI job (section 5) |
| `MediaTile`, `MediaGrid`, `BulkBar` | `media.tsx` | the library and every list of results |
| `Viewer` | `media.tsx` | one item full screen: ← →, Escape, Download, Make a variation, Move to…, Move to trash |
| `Menu`, `MenuItem`, `MenuSeparator` | `menu.tsx` | the "…" menu and Move to…; delete last, below a line |
| `State` | `feedback.tsx` | `empty` (offer the first one) · `no-results` (Clear filters) · `error` (what broke, Try again). Never one message for all three |
| `Upsell` | `feedback.tsx` | a tool not on the plan: "Available on Growth · Ask Nmesis" |
| `Badge` | `feedback.tsx` | a state, always a word |
| `SkeletonTile`, `SkeletonRow`, `SkeletonPanel`, `Loading` | `feedback.tsx` | the shape of what is coming, where it will be; `Loading` says "Loading …" once |
| `Tabs` | `tabs.tsx` | the open tab is in the address (`#tab=`), ← → between tabs |
| `EditorLayout`, `GenerateButton` | `editor.tsx` | every tool: rail left, canvas centre, settings right (collapsible, remembered), one Generate with its credit cost on it |

---

## 4 · Destructive actions: the ladder

Match the friction to what is lost and whether it comes back. Friction that is
everywhere is friction nobody reads.

| | Example | What happens |
|---|---|---|
| **Can be undone** | move a visual or a folder to the trash, move items, remove from a folder | **Do it at once.** A toast says what happened and offers **Undo**; the trash keeps it **30 days** with Restore. |
| **Cannot be undone** | delete forever from the trash, revoke support access early | **Ask** with `useConfirm()`: the title names the object, the body says the consequence, the button carries the verb ("Delete forever"), **Cancel has focus**, Escape cancels, **Enter does not confirm**. |
| **Takes everything with it** | delete a folder and all it holds forever | Ask, **and type the name** (`typeToConfirm`). Only here. |

`confirm()`, `alert()` and `prompt()` are never used (the guard counts them).

---

## 5 · Long-running AI work: the job card

Generation, film, swap, upscale, storyboards. The card is drawn from the job
record on the server, so it survives a reload.

- **Progress that tells the truth.** Queued (with the place in line when
  known) → running with **the provider's own stage** and a percentage **only
  when the provider reports one**; otherwise a moving band that says "In
  progress". An estimate only when there is an honest one; else "The provider
  has not said how long".
- **Cancel only where the provider allows it** (`cancellable`). No fake Cancel.
- **Credits before starting:** the Generate button carries the cost
  ("Generate · 4 credits"). While running: "120 credits held".
- **The end:** "Used 40 credits" · failed: what happened in one sentence, then
  **"Nothing was charged"** or what was · cancelled: the same.
- Failed has **Try again**; done has **Open**.

---

## 6 · Forms

- Every box has a `<label>`; a placeholder is not a label. `Field` does this.
- Required is said in words: "(required)".
- An error is a sentence under its box saying what to do, with an icon, and it
  replaces the help line. The red edge is never alone.
- Validate when somebody leaves a box, not on every keystroke.
- Units and currencies go in `AffixInput`, not the placeholder.
- **Accessible authentication (WCAG 3.3.8):** never ask anybody to retype a
  password, an email or a code from elsewhere on the page; paste always works;
  "Show" on password boxes.

---

## 7 · Responsive and accessibility rules

- Test at **1440, 1280, 1024, 768, 390 and 360**, light and dark.
- `document.documentElement.scrollWidth === innerWidth`. The usual cause of a
  sideways scroll is a grid track or flex child that will not shrink: use
  `minmax(0, 1fr)` and `min-width: 0`.
- Targets: never under 24px (2.5.8); 44px on a phone.
- **Focus is always visible and never under a sticky bar (2.4.11):** one ring
  (`--ds-ring`), and `scroll-margin` keeps focused controls clear of the top bar
  and the phone navigation.
- **Every drag has a single-pointer way (2.5.7):**

  | Drag | The other way |
  |---|---|
  | moving items into a folder | **Move to…** in each tile's menu, the viewer and the bulk bar |
  | selecting several tiles | the tick box on each tile, then the bulk bar |
  | area selection and drawing on the canvas | **essential exception**: a freehand mask cannot be described by clicks alone. Each editor should also offer a single-pointer way (click an object to select it; a typed request such as "the wheels"). Phase 1 records, per editor, whether it does |
  | sliders | the value is also typeable where precision matters (`AffixInput`) |

- Text that does not fit: `.ds-truncate` **and** a `title` with all of it.
- On touch, a tile's hover actions are always shown (`hover: none`).
- Phones: Home, the library and the viewer are fully usable; editors are
  simplified (settings in a bottom sheet, Generate in a sticky bar), never hidden.

---

## 8 · The guard: `npm run check:design`

Runs in CI after the type check. It reads `app/**/*.css`, every `.tsx` in
`app/` and `components/`, and `lib/` for dialogs, and counts:

1. **classes nothing styles**: a class in a `className` that neither our CSS
   nor Tailwind (asked through its own compiler) defines;
2. **`confirm()` / `alert()` / `prompt()`**;
3. **colours written out** instead of a token (CSS, `style={{…}}`, Tailwind
   arbitrary values such as `bg-[#fff]`);
4. **sizes off the scale**: a text size, padding, margin, gap or corner written
   as a number;
5. **controls with no class**: a native button, input, select or textarea the
   browser draws in its own style.

What is wrong today is in `scripts/design-baseline.json` with its count. **The
check passes while every count stays the same or goes down**, and fails when one
goes up or a new file has any. The design-system files themselves are at zero
and a test keeps them there.

```bash
npm run check:design -- --list     # every violation, with its line
npm run check:design -- --update   # write the baseline as it is now
```

Run `--update` only after deliberately fixing things, and say so in the PR.
Never raise a number to make the check pass.

Known limits: a class built from a variable (`'status-' + x`) is skipped, not
checked; shadcn's variant names in `components/ui` show up as unknown classes
and sit in the baseline.

---

## 9 · The gallery

`/design-system` (and `/design-system/wireframes/<home|folders|library|editor>?theme=light|dark`)
is for **Nmesis staff**: the page checks `getStudioContext()` on the server and
anybody else gets the ordinary 404. Data is synthetic.

To look at it locally without a Supabase project:

```bash
STUDIO_DESIGN_GALLERY=open npx next dev
```

That opening works **only** under `next dev` (`NODE_ENV=development`); every
build and every Vercel deployment runs as production, where it cannot apply.

---

## 10 · Adding something

1. Look in the gallery first. If it is there, use it.
2. If it is nearly there, extend the component (and its CSS in
   `design-system.css`) and add the new state to the gallery.
3. Only a genuinely new kind of thing gets a new `.ds-` component: CSS with
   light and dark, a React component, a gallery section, a line in section 3.
4. Never a page-level rule for something a component should do.
5. `npm run check:design` and `npm test` before the PR.
