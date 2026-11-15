# CRUD matrix

What a person can do with each kind of thing in the Studio today, read from the
routes (`app/api/**/route.ts`), the screens and the harness run (`npm run
check:ui`). ✅ yes · ⚠️ partly (see the note) · ❌ no · — does not apply.
"Logged" means the action leaves a record a person can see later.

| Object | Create | View | Edit / rename | Delete | Restore | Bulk | Download / export | Logged |
|---|---|---|---|---|---|---|---|---|
| **Visual** (key visual, line-up, area edit, upscale) | ✅ generate | ✅ library, details | ❌ no rename | ✅ to "Deleted images" with **Undo** toast (creator or a company owner) | ✅ from "Deleted images" | ❌ | ✅ image download | ⚠️ paid actions in Usage; deletes and restores not logged |
| **Deleted images** (trash) | — | ✅ dialog | — | ❌ **no permanent delete, no 30-day expiry** | ✅ | ❌ | ❌ | ❌ |
| **Empty drafts** | automatic | ❌ | — | ⚠️ "Clean empty" archives them (no confirmation needed; archived, not deleted) | ❌ | ✅ (all at once) | — | ❌ |
| **Reference image** (uploaded car view, inspiration) | ✅ paste / upload | ⚠️ only inside the tool that used it | ❌ | ❌ | — | ❌ | ❌ | ❌ |
| **Film** | ✅ from a saved visual | ✅ list, editor | ⚠️ direction editable while draft or quoted; **no rename** | ❌ **none** | — | ❌ | ✅ video | ⚠️ credits in Usage |
| **Car swap** | ✅ | ✅ | ❌ | ❌ **none** | — | ❌ | ✅ video, diagnostic | ⚠️ credits in Usage |
| **Storyboard** | ✅ | ✅ | ✅ (with revision check) | ❌ **none** | — | ❌ | ✅ frames and video export | ⚠️ credits in Usage |
| **Upscale job** | ✅ | ✅ | — | ❌ (its result is a visual) | — | ❌ | through the visual | ⚠️ credits in Usage |
| **Provider key** (company's own; Enterprise, owners) | ✅ connect | ⚠️ connected / not, never the key | ⚠️ replace by connecting again | ⚠️ "Remove" disconnects **at once: no question, no Undo**, and the key must be typed again | ❌ | — | — | ❌ |
| **Support access** (owner) | ✅ allow for 7 days, with a note | ✅ status and until when | ✅ extend | ✅ end now | ❌ | — | — | ✅ every staff opening listed on Company |
| **Company choice** (switcher) | — | ✅ | ✅ switch | — | — | — | — | ⚠️ staff openings logged |
| **Usage** (owners) | — | ✅ by person, by tool, last 50, packs | — | — | — | — | ❌ **no export** | — |
| **Folder / project** | ❌ **does not exist** (Phase 3) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Item → folder** ("Move to…") | ❌ **does not exist** (Phase 3) | | | | | | | |

## What is missing, for the findings register

- No **folders or projects**, so nothing to organise, move or share by folder (Phase 3 group "Home, projects and folders").
- **Films, swaps and storyboards cannot be deleted** at all; a test, a mistake or a draft stays in the list forever.
- **No rename** for visuals or films.
- The **trash never empties** and has **no permanent delete**; the target is a 30-day trash with restore and a confirmed permanent delete.
- **No bulk** select, move, download or delete anywhere.
- **Usage cannot be exported** (owners asked for "by person, by tool"; a CSV would let them reconcile).
- **Deletes, restores and key changes are not logged** for owners to see (only paid actions and staff openings are).
- The browser's `confirm()` still guards "discard unsaved storyboard changes" in Film studio (`app/films/page.tsx`, two places).
