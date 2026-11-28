# The editor rules

The canvas editor (`/editor`) is built and reviewed against these twelve rules.
Every editor PR lists each rule as pass or fail with its evidence. They sit on
top of the [design system](design-system.md): its tokens, components and
accessibility rules still apply.

The owner's decisions behind them (2026-11-21): keep the Studio's own Konva
editor (no editor SDK); the right panel is the one home for the selection's
settings (no floating toolbar); one text effect at a time; one person edits at
a time (others see "Being edited by …", no live co-editing); what a plan allows
follows the plans data.

| # | Rule | Measured by `check:ui` |
|---|---|---|
| 1 | **The canvas is central.** Panels are fixed and never float over it. | `editorPanelOverCanvas`, `editorToastOverPanels` |
| 2 | **Selection settings live in one place:** the right panel, 340 px, fixed width. | `editorPanelWidth` |
| 3 | **Fixed section order:** Position & size → Appearance → Text → Effects → Arrange. W/H and X/Y stay together. | `editorSectionOrder` |
| 4 | **Spacing uses tokens only:** 4 (label to control), 8 (within a section), 16 (panel padding), 24 (between sections). The container sets the spacing, never margins on single elements. | `editorSpacing` |
| 5 | **Every control has a plain-word label.** No icon-only rows. | `editorUnlabelled` |
| 6 | **Show only the controls that apply** to the current selection; rare ones go under "More". | review |
| 7 | **A toggle or checkbox** wherever a dropdown would only add a click. | review |
| 8 | **Rows, not columns.** Full-width inputs. One vertical scroll, no nested or sideways scroll. | `editorNestedScroll` |
| 9 | **Every change can be undone** (Ctrl/Cmd+Z), and **the save status is always visible.** | `editorSaveStatus`, tests |
| 10 | **Standard shortcuts:** Ctrl/Cmd+D duplicate, Alt-drag copy, Ctrl/Cmd+G group, Ctrl/Cmd+Shift+G ungroup, Ctrl/Cmd+] and [ for layer order, T for text, Delete, arrow keys to nudge (Shift = 10 px). | tests |
| 11 | **One slider component everywhere,** with its number shown and editable. | review |
| 12 | **An AI edit that could touch the car is labelled "creative";** the default path never changes the car's pixels. | review |

## How each rule is read

1. The canvas column and the panels are grid tracks of `.canvas-body`. Nothing
   positioned (`fixed`, `absolute`, `sticky`) from a panel may cover the
   canvas box. Menus and dialogs opened by a person are not panels.
   Toasts follow the design system's one rule (`components/ds/toast.tsx`): a
   toast never covers a panel, a primary action (Generate, Save, Download) or
   the page strip. Each layout declares its safe corner once with a
   `ToastSlot`. The editor's is its canvas column between the notices and the
   page strip, bottom right. The tools' (Key visual, Line-up, Film, Swap,
   Story, all drawn by `EditorScreen`) is their stage above the versions
   strip, top right. At most four toasts, six seconds each, over the light
   table or the picture's corner while they show. The stack never leaves the
   part of its slot that is on screen. Older toasts fold away and the newest's
   words scroll rather than spill past it, and it stops short of a primary
   button or a download link in its way. The exception: on a phone, a panel
   opened from the menu is a sheet over the whole screen, so toasts lie over
   it at the screen's bottom, as over a dialog.
2. `.canvas-inspector` is `--ds-editor-panel` wide (340 px) at every desktop
   width, whatever is selected. Below 768 px the editor is not offered.
3. Sections are `<section data-editor-section="…">` in that order; a section
   that does not apply is left out, never moved. Width and height share one
   row, X and Y share the next.
4. The panel's spacing comes from four tokens in `app/tokens.css`:
   `--ds-editor-label-gap` (4), `--ds-editor-row-gap` (8),
   `--ds-editor-pad` (16) and `--ds-editor-section-gap` (24), set as `gap` and
   `padding` on containers. `check:ui` fails a control or row inside the panel
   with its own margin, and a gap or padding that is not one of the four.
5. Every input, select, button and slider in the panel has a visible text
   label (its own words or a `<label>`); an icon button also needs words next
   to it, so a row of icons alone fails. A choice in a group (a colour swatch,
   a segmented choice) is named by its group's visible label and its own
   accessible name (the colour's name), like a radio button in a fieldset.
6. Each selection type has its own list of sections (below, "The panel by
   selection"). Rarely used controls go in the section's "More" disclosure.
7. On/off and two-way choices (flip, lock, show, alignment of three) are
   toggles, checkboxes or segmented buttons, never a `<select>`.
8. The panel scrolls once, vertically. No element inside it has its own
   scroll (`overflow: auto` or `scroll` with content larger than it), and the
   panel never scrolls sideways.
9. Undo and redo cover every change to the design (one step per gesture:
   a drag, a resize, a rotation, a slider move, a typing session, a
   duplicate). The canvas bar always shows the save status: "Saving…",
   "Saved", "Offline, changes kept" or "Couldn't save, retry". Closing the
   tab never loses a change. The last change goes with the page when it
   leaves: when the tab is hidden or closed, on a reload, or on going to
   another site, it is sent with `keepalive` if it fits the browser's limit
   (`components/canvas/use-autosave.ts`). A change that can't go with the
   page (offline, refused, or too large) stays on this device, and only then
   does the browser ask "Leave site?". The next time the design opens on this
   device it comes back with "Restored your unsaved changes." and is sent.
10. The shortcuts work wherever the canvas has focus, and each is named in its
    control's tooltip and in the shortcuts sheet ("?").
11. Every continuous value (opacity, corner radius, spacing, effect strength)
    uses the design system's one slider (`Slider` in
    `components/ds/field.tsx`), with its number beside it, typed or stepped
    with the arrow keys (its `editable` mode); dragging it is one undo step.
12. Effects that could repaint the car (AI edits) say "Creative" on the
    control and in its description. The default path only adds layers over
    the picture; the picture's own pixels are never changed.

## The panel by selection

The panel is built only from `components/ds/inspector.tsx` (section, labelled
row, number with its unit, a pair of numbers, the one slider, switch, a row of
choices, colour swatches, "More", buttons in words, the tabs);
`components/canvas/design-panel.tsx` decides which sections show.

| Selected | Sections, in order |
|---|---|
| Nothing | Page (its size; background: your picture or a colour, the colour solid or a linear or radial gradient), Brand (its colours and fonts) |
| A picture | Position & size (W/H, X/Y, rotation; More: align to the page) → Appearance (opacity, corner radius, flip left to right, flip upside down) → Arrange → Credit (a photo from the Photos panel only: "Photo by <name> on <library>", both linked; information, not a setting, so it comes after the settings) |
| A text | Position & size → Appearance (opacity) → Text (words, Type on the canvas, font (the font list), size, weight (only the weights the font has; a slider on a variable font's axis; none for a font of one weight), italic (only where the font has one), alignment, colour (with the contrast hint); More: line and letter spacing) → Effects (one at a time: None, Shadow, Outline, Lift, Neon, Background, Curve, as tiles; the chosen one's 2–5 controls) → Arrange |
| A shape | Position & size → Appearance (fill: solid, linear or radial; outline and its width, opacity) → Arrange |
| An icon | Position & size → Appearance (colour, line weight (not for a solid icon), opacity) → Arrange |
| A line or a frame | Position & size → Appearance (colour, line weight; a line: dashed, arrowheads; a frame: corner radius; opacity) → Arrange |
| A group, or several | Position & size (their box; X/Y move them together; align to each other, or a group to the page; distribute across or down) → Appearance (opacity for all) → Arrange (with Group or Ungroup) |

Arrange is always Forward, Backward, Group or Ungroup where it applies,
Duplicate and Delete; under More: To front, To back, Lock in place.

## The font list and the colour picker

Both open from their row in the panel as a popover: a person's own dialog
(`role="dialog"`, not modal) that lies over the right panel, under the
row (above it when there is no room), never over the canvas, so every change
shows on the canvas as it is made (rule 1). The focus goes in when it opens and
back to its row when it closes (Escape, Close, a click outside, or Tab past its
end). Its body is its one scroll area. Built from the same tokens and pieces
(the shared slider for every amount, rule 11). `check:ui` measures the rules
with each open.

- **The font list** (components/canvas/font-picker.tsx): Brand fonts (the
  company's own uploaded fonts first, then the brand kit's two) → In this design
  → Recent (this person's, kept with their account and on this device) → All
  fonts, one search across them (a name, "serif", "script", "Arabic"). Each
  name shows in its own font from a tiny file of its own glyphs, loaded when its
  row is on screen. The search keeps the focus; the arrow keys, Home, End and
  Page Up/Down move; Enter picks. The fonts are the Studio's own self-hosted
  catalogue (about 150 open-licence families, Latin and Arabic,
  `lib/editor/font-catalogue.json`, built by `scripts/fonts/build-catalogue.mjs`);
  no request ever goes to a font service. A company's owners may add their own
  font files ("Upload a font" here, or Brand → Your fonts), each sanitised on the
  server first (docs/brand-fonts.md); they follow the same weight and italic
  rules and load from short-lived signed links. A font that can't load (or one
  that was removed) says
  "Missing font" on its layer, in the Layers list and in the panel, and an
  export made with the fallback says so.
- **The colour picker** (components/canvas/colour-picker.tsx), the same for
  every colour (text, fill, outline, icon, line and frame, effect colours, the
  page): Brand colours → In this design → Recent → any colour (saturation and
  brightness, hue, hex) and its transparency. The eyedropper is the browser's
  where it has one (after a click), else the next click on the canvas. Shapes
  and the page may be a linear or radial gradient of 2–4 stops, with its angle.
  A text's colour shows "Low contrast" under 4.5:1 against what is behind it.
  Recent colours are kept with the person's account, like recent fonts.

## The Layers list

The Layers list is the right panel's second tab (Design, Layers), not a left
panel. The left panels are for adding things (Brand, Elements, Text,
Photos, Icons, Uploads); the layers are the selection's other view, so they share the
selection's one home (rule 2), and the canvas keeps its width at 1024 px
(rule 1: a fourth panel beside it would squeeze it). The tab stays as it is
when something is selected, so picking in the list never jumps away.

Each row is the layer's name (a text shows its words until it is renamed)
with a small picture of it, then "Hide" and "Lock" in words; a group's layers
are a list inside its row. Keyboard: the list is one Tab stop; Up and Down
move, Enter or Space selects, Shift with an arrow adds the next layer,
Ctrl/Cmd+Space adds or removes one, Alt with an arrow moves a layer one
place, F2 renames (Enter keeps, Esc cancels), Delete deletes; Left and Right
reach a row's Hide and Lock. With a mouse: click, Shift- or Ctrl/Cmd-click,
and drag a row among its neighbours.

## Snapping

A drag snaps to the page's edges and centre lines, to the other layers'
edges and centres (smart guides, drawn between the boxes they line up) and to
even spacing (marks on both gaps), within 6 screen pixels. Holding Ctrl or
Cmd while dragging moves freely. A group, or several layers, snap as one box.

## The check

`check:ui` measures the rules it can on every editor page and in each kind of
selection (nothing, a text, a picture, a shape, an icon, a line, a frame,
several, and the Layers tab) at 1440 × 900, 1191 × 786 and 1024 × 768, and
with four toasts shown (with and without the left panel open) at 1440 × 900,
1280 × 800 and 1024 × 768. `editorToastOverPanels` is measured on every page
check, and with four toasts shown on every tool page at those sizes and on a
phone (390 × 844), each counted under its own screen. Film, Swap and Story are
Coming soon, so their pages send a person Home and are measured as Home until
they open. The counts gate: each is held at zero, so any break fails the pull
request.

## Spacing tokens

| Token | Value | Between |
|---|---|---|
| `--ds-editor-label-gap` | 4 px | a label and its control |
| `--ds-editor-row-gap` | 8 px | rows within a section |
| `--ds-editor-pad` | 16 px | the panel's edge and its content |
| `--ds-editor-section-gap` | 24 px | one section and the next |
| `--ds-editor-panel` | 340 px | the right panel's width |
