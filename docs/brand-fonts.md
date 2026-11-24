# Brand fonts (a company's own font files)

Editor Phase 4. A company's owners upload the font files their brand uses;
everyone in the company then picks them in the editor's font list (first under
Brand fonts) and every design and export draws in them.

The owner's decisions (2026-11-22):

- only **owners** upload (not creators or viewers), into their own company's brand fonts;
- a **licence confirmation** is required and recorded: who, when, and the exact words shown;
- every file is **sanitised** on the server before anyone's browser loads it;
- uploaded fonts are **visible only to that company**;
- **plan gating** follows the plans data (`studio.brand_fonts`), like every Studio feature.

## Where things are

| Part | File |
|---|---|
| Table (migration 0013) | `supabase/migrations/0013_brand_fonts.sql`, `studio.brand_fonts` |
| Reading a font strictly | `lib/brand-fonts/sfnt.ts` |
| Sanitising | `lib/brand-fonts/sanitise.ts` |
| Database and keys | `lib/brand-fonts/store.ts` |
| Words, limits, the licence wording | `lib/brand-fonts/shared.ts` |
| Routes | `app/api/brand-fonts/route.ts` (list, upload), `[id]/route.ts` (remove), `[id]/[file]/route.ts` (the font or its preview) |
| Brand → Your fonts | `components/brand/brand-fonts-section.tsx`, `components/brand/brand-fonts.ts` |
| The editor | `lib/editor/fonts.ts` (`setBrandFonts`, `brand:<family>` names), `components/canvas/fonts.ts`, `components/canvas/font-picker.tsx` |

## The upload

1. Brand → Your fonts (Settings → Brand kit), or "Upload a font" in the editor's font list.
2. The owner ticks the licence confirmation (`LICENCE_TEXT`, version `LICENCE_VERSION` in
   `lib/brand-fonts/shared.ts`; the owner may change the words: give the new words a new version).
3. OTF, TTF, WOFF or WOFF2, up to 10 MB each, several at once. Each file goes through the Studio's
   direct upload (`lib/studio-fetch.ts`): to private storage first, then the route reads it there, so
   it never passes through a function's 4.5 MB body.
4. The server sanitises it (below). A file that passes is stored as `ready`; one that doesn't is
   recorded as `refused` with its reason (the owner sees why) and nothing of it is kept.

Storage, under the company's own folder only:

```
orgs/<org>/brand/fonts/<id>/font.woff2      the sanitised file browsers load
orgs/<org>/brand/fonts/<id>/preview.woff2   the family's name alone, for the font list
orgs/<org>/brand/fonts/<id>/original.<ext>  as uploaded, kept for PDF export later; no route sends it
```

## Sanitising: what it does and what it removes

`sanitiseFont` in `lib/brand-fonts/sanitise.ts`, in order:

1. **By content, never by name.** The first bytes decide: OTF (`OTTO`), TTF (`0x00010000`/`true`),
   WOFF, WOFF2. A collection (`ttcf`) is refused ("upload each font on its own"); anything else is
   refused as not a font. WOFF and WOFF2 are unpacked; one that says it unpacks to more than 64 MB is refused.
2. **Read strictly** (`lib/brand-fonts/sfnt.ts`), as a sanitiser such as OTS starts: a known signature, a
   table count that fits, every table inside the file, no table overlapping another, no tag twice, the
   tables every font needs (`cmap head hhea hmtx maxp name OS/2 post` and outlines), sane `head`, `maxp`,
   `hhea` values, a Unicode character map with at least one character, a family name.
3. **Its own embedding permission** (OS/2 `fsType`, bits 1–3, the least restrictive winning as OpenType says):
   *restricted* is refused with a plain reason; *preview & print*, *editable* and *installable* are allowed
   and shown on the font. *Bitmaps only* (bit 9) is refused too: the Studio draws outlines. *No subsetting*
   (bit 8) is honoured: the preview is then the whole font, not a subset.
4. **Re-encoded by HarfBuzz** (hb-subset, through `subset-font`, the same tool the font catalogue's build
   uses): every character and glyph kept, and every table rebuilt from what HarfBuzz itself parsed and
   understood. HarfBuzz drops every table it doesn't know; the Studio also drops the ones it knows but
   text doesn't need. What is removed:
   - **hinting programs**: `fpgm`, `prep`, `cvt `, `cvar`, `hdmx`, `VDMX`, `LTSH` and every glyph's own instructions;
   - **colour, bitmap and SVG glyphs**: `SVG ` (can carry markup and scripts), `COLR`, `CPAL`, `sbix`, `CBDT`, `CBLC`, `EBDT`, `EBLC`, `EBSC`;
   - **vertical metrics**: `vhea`, `vmtx`, `VVAR`, `VORG`;
   - **other layout systems**: Apple (`morx`, `mort`, `kerx`, `feat`, `trak`, `ankr`, `bsln`, `just`, `lcar`, `opbd`, `prop`) and Graphite (`Silf`, `Glat`, `Gloc`, `Sill`);
   - **anything else**: `STAT`, `BASE`, `MATH`, `JSTF`, `DSIG`, `meta`, `gasp`, `PCLT`, and any table with a tag nobody knows;
   - **name records** other than ids 0–6 (copyright, family, style, unique id, full name, version, PostScript name);
   - **glyph names** (`post` becomes version 3);
   - **variation axes other than weight**, pinned to their defaults (the canvas draws weight, nothing else).
5. **Checked again**: the result must read strictly and hold only `cmap head hhea hmtx maxp name OS/2 post`,
   outlines (`glyf loca`, `CFF `, `CFF2`), layout (`GDEF GSUB GPOS kern`) and weight variation
   (`fvar gvar avar HVAR MVAR`). Anything else and it is refused.
6. **WOFF2** for browsers (Google's encoder, which parses every glyph again: a glyph it can't read refuses
   the font), unpacked once more and checked again; then the **preview** (the family's name, and a short
   Arabic sample for an Arabic font), as the catalogue's previews are made.

Browsers run their own sanitiser (OTS) on every web font as well; the Studio's is the first gate, not the only one.

The font tools are WebAssembly modules that hand back views into their own memory across an `await`, so two
fonts worked on at once in one server process could overwrite each other's bytes (found in testing with three
WOFF2 files unpacked in parallel). Every use goes through one queue per process (`exclusive`), and
`tests/brand-fonts.test.mjs` checks parallel uploads come out each as itself.

## In the editor

- A design names an uploaded font `brand:<family>` (a plain name, never an address).
- The font list shows the company's uploaded families first under Brand fonts, then the brand kit's two;
  with the catalogue's weight and italic rules (a slider on a variable font's weight axis).
- Each file loads as a `FontFace` from `/api/brand-fonts/<id>/font`, which answers with a 15-minute signed
  link to private storage; the canvas waits for it before drawing and exporting, as for the catalogue.
- A removed font (soft delete) is a **Missing font**: the layer, the Layers list, the panel and a notice say
  so, and an export made with the fallback says so too. Never a silent swap.

## Owner steps

### 1. Migration

```
npm run db:migrate
```

Applies `0013_brand_fonts.sql` (Preview and Production share the database: once). Before it runs,
Brand → Your fonts says uploading isn't on yet.

### 2. The plan feature key

The plans data has no `studio.brand_fonts` key yet, so uploading stays off for every client company
(they see "Available on Growth · Ask Nmesis"); Nmesis's own workspace has it. In the Nmesis admin:
**Plans → Growth → Features → Add feature**, key `studio.brand_fonts`, value **on** (`true`), Save.
Repeat for **Enterprise**. Within a minute, owners of companies on those plans can upload (no redeploy).

### 3. Storage CORS (both buckets)

The canvas loads fonts with `FontFace` from signed S3 links, a cross-origin `GET` from the Studio's page.
The rule the Studio already needs for pictures ([`s3-cors.example.json`](s3-cors.example.json),
[S3 setup §3](s3-setup.md)) covers it: nothing new is needed if each bucket has it with its own Studio
address. Check, in each bucket: **Permissions → Cross-origin resource sharing (CORS)**.

Production bucket (replace the address with the Production Studio's HTTPS address):

```json
[
  {
    "AllowedOrigins": ["https://YOUR-STUDIO.vercel.app"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type", "Content-Disposition", "Accept-Ranges", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

Preview bucket (its stable Preview address; `http://localhost:3000` only if you develop against it):

```json
[
  {
    "AllowedOrigins": ["https://YOUR-PREVIEW-STUDIO.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type", "Content-Disposition", "Accept-Ranges", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

If fonts show "Missing font" while pictures draw, the browser's console names a CORS refusal on the
bucket's host: the address in `AllowedOrigins` doesn't match the page's.

## Not done (yet)

- PDF export with the original files (they are kept for it).
- Purging a removed font's files from storage (the row and files stay; nothing serves them).
- Variation axes other than weight (pinned to their defaults).
