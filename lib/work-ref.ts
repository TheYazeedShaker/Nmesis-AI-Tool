// A piece of work in the library, as its kind and its own id. The library keys
// each item by both together ("visual:<id>"), because a film and a picture may
// share an id; every API, the share panel and the canvas editor take the kind
// and the raw id. The key is built and read here only, so one is never sent
// where the other is expected (the editor once received "visual:<id>").

export type WorkKind = 'visual' | 'film' | 'swap' | 'story';
export type WorkRef = { kind: WorkKind; id: string };

const KINDS: readonly string[] = ['visual', 'film', 'swap', 'story'];
/** A saved picture's id, as the Studio's routes accept it (lib/studio-server.ts validId). */
export const VISUAL_ID = /^[a-z0-9-]{8,80}$/;

/** The library's key for a piece of work: "visual:<id>". Never an id a route or the editor takes. */
export const workKey = (r: WorkRef) => `${r.kind}:${r.id}`;

/** The kind and raw id back from a library key; null for anything else. */
export function workRef(key: string): WorkRef | null {
  const at = key.indexOf(':'), kind = key.slice(0, at), id = key.slice(at + 1);
  return at > 0 && KINDS.includes(kind) && id ? { kind: kind as WorkKind, id } : null;
}

/** Projects with this piece open in its viewer (the library reads ?open=<key>). */
export const viewerHref = (r: WorkRef) => '/library?open=' + encodeURIComponent(workKey(r));
