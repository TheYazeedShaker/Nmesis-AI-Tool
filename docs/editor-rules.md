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
| 1 | **The canvas is central.** Panels are fixed and never float over it. | `editorPanelOverCanvas` |
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
   to it, so a row of icons alone fails.
6. Each selection type has its own list of sections (`docs/editor-rules.md`
   is the list; PR B's panel components implement it). Rarely used controls go
   in the section's "More" disclosure.
7. On/off and two-way choices (flip, lock, show, alignment of three) are
   toggles, checkboxes or segmented buttons, never a `<select>`.
8. The panel scrolls once, vertically. No element inside it has its own
   scroll (`overflow: auto` or `scroll` with content larger than it), and the
   panel never scrolls sideways.
9. Undo and redo cover every change to the design (one step per gesture:
   a drag, a resize, a rotation, a slider move, a typing session, a
   duplicate). The canvas bar always shows the save status: "Saving…",
   "Saved", "Offline, changes kept" or "Couldn't save, retry".
10. The shortcuts work wherever the canvas has focus, and each is named in its
    control's tooltip and in the shortcuts sheet ("?").
11. Every continuous value (opacity, corner radius, spacing, effect strength)
    uses the design system's one slider, with its number beside it, typed or
    stepped with the arrow keys; dragging it is one undo step.
12. Effects that could repaint the car (AI edits) say "Creative" on the
    control and in its description. The default path only adds layers over
    the picture; the picture's own pixels are never changed.

## Spacing tokens

| Token | Value | Between |
|---|---|---|
| `--ds-editor-label-gap` | 4 px | a label and its control |
| `--ds-editor-row-gap` | 8 px | rows within a section |
| `--ds-editor-pad` | 16 px | the panel's edge and its content |
| `--ds-editor-section-gap` | 24 px | one section and the next |
| `--ds-editor-panel` | 340 px | the right panel's width |
