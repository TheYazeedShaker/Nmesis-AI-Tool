# Icons: the editor's icon sets

The editor's Icons panel offers these open icon sets. Every one is under a licence
that lets the Studio and its clients use the icons commercially **without
attribution** (MIT, Apache 2.0, ISC or CC0; `scripts/icons/build-icons.mjs`
refuses any other). Each set's licence file is served beside its icons.

| Set | Style | Icons | Licence | Version | Licence file |
|---|---|---|---|---|---|
| Lucide | Line | 2,154 | ISC (`ISC`) | 1.2.159 | [`public/icons/lucide.LICENSE.txt`](../public/icons/lucide.LICENSE.txt) |
| Tabler | Line and solid | 6,111 | MIT (`MIT`) | 3.52.0 | [`public/icons/tabler.LICENSE.txt`](../public/icons/tabler.LICENSE.txt) |
| Phosphor | Regular and solid | 2,888 | MIT (`MIT`) | 2.1.1 | [`public/icons/phosphor.LICENSE.txt`](../public/icons/phosphor.LICENSE.txt) |
| Material Symbols | Outline | 3,973 | Apache 2.0 (`Apache-2.0`) | 1.2.101 | [`public/icons/material.LICENSE.txt`](../public/icons/material.LICENSE.txt) |

Left out on purpose:

- **Remix Icon**: its current releases are under its own "Remix Icon License",
  not one of the four above, so it is not offered.
- **Companies' logos** in any set (Tabler's `brand-…`, Phosphor's `…-logo`, and the
  like): a logo is its owner's trademark, not the set's to licence, and this
  repository holds no third-party brand names.

How it works:

- The icon data ships with the Studio (`public/icons/<set>.json`, built from the
  sets' published data by `node --experimental-strip-types scripts/icons/build-icons.mjs`).
  No request goes to an icon service, from the server or the browser.
- Browsing: a set's file loads only when its category opens in the panel.
- Searching looks in every set at once, through a small index of names and tags
  (`public/icons/index.json`: each icon's other names, its category where the set
  has them, the Studio's plain words; no drawings), loaded the first time someone
  searches. Exact names come first. Each result loads its drawing (its set's chunk
  of 64, `public/icons/<set>/<n>.json`) only when it scrolls into view.
- An icon goes on a design as its own vector paths on its set's grid
  (`lib/editor/doc.ts` IconLayer: `grid`, and `fill` for a solid icon), so
  it stays sharp at any size, recolours from the right panel and needs nothing
  else to reopen.
- Icons that need more than plain lines or solid shapes (masks, transforms,
  transparency, even-odd fills, lines and fills mixed) are left out by the build.
