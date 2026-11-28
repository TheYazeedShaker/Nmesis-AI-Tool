// What the canvas says about its own drawing, so whatever waits on it (check:ui, a person's tools) waits for the
// drawing itself, never for a guessed time. It is written on the stage's element (components/canvas/stage.tsx):
//
// - `data-render`: "drawing" from the moment the canvas takes a change until it has drawn it, with every text
//   layer's font settled (loaded, or missing and said so); then "ready".
// - `data-text-drawn`: each text layer as it was last drawn, one token each, space-separated:
//   `<layer id>:<effect>:<drawer>:<font>:<marks>`.
//   - effect: the layer's effect kind, or "none".
//   - drawer: "shaped" (curved Arabic: shaped first, then placed on the arc, lib/editor/curve-shaping.ts),
//     "path" (curved text letter by letter along the arc), or "text" (straight text, drawn whole).
//   - font: "loaded", "missing" (drawn in the fallback) or "loading" (not drawn in its font yet).
//   - marks: the pieces the shaping drawer placed in its last drawing (0: it drew nothing), or, for the
//     other drawers, the characters they were given.

export const RENDER_ATTR = 'data-render';
export const TEXT_DRAWN_ATTR = 'data-text-drawn';

export type TextDrawer = 'shaped' | 'path' | 'text';
export type FontState = 'loading' | 'loaded' | 'missing';
export type RenderState = 'drawing' | 'ready';
export type DrawnText = { id: string; effect: string; drawer: TextDrawer; font: FontState; marks: number };

const DRAWERS: readonly string[] = ['shaped', 'path', 'text'];
const FONTS: readonly string[] = ['loading', 'loaded', 'missing'];
const PART = /^[A-Za-z0-9_-]+$/;

/** One text layer's token. A part that could break the list (a space, a colon) is refused, not written. */
export function drawnTextToken(t: DrawnText): string | null {
  if (!PART.test(t.id) || !PART.test(t.effect) || !DRAWERS.includes(t.drawer) || !FONTS.includes(t.font)) return null;
  return [t.id, t.effect, t.drawer, t.font, Math.max(0, Math.round(Number.isFinite(t.marks) ? t.marks : 0))].join(':');
}

/** The attribute's text read back; a token that doesn't follow the format is left out. */
export function readDrawnText(said: string | null | undefined): DrawnText[] {
  const out: DrawnText[] = [];
  for (const token of (said ?? '').split(' ')) {
    const p = token.split(':');
    if (p.length !== 5 || !PART.test(p[0]) || !PART.test(p[1]) || !DRAWERS.includes(p[2]) || !FONTS.includes(p[3]) || !/^\d+$/.test(p[4])) continue;
    out.push({ id: p[0], effect: p[1], drawer: p[2] as TextDrawer, font: p[3] as FontState, marks: Number(p[4]) });
  }
  return out;
}

/** After a drawing: "ready" unless a text layer is still waiting for its font. */
export function renderStateOf(texts: readonly DrawnText[]): RenderState {
  return texts.some((t) => t.font === 'loading') ? 'drawing' : 'ready';
}
