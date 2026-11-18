'use client';
import * as React from 'react';
import { ArrowRight, Check, ImageOff, Search } from 'lucide-react';
import { Button, IconButton, dsClass } from '@/components/ds/button';
import { Loading, SkeletonTile, State } from '@/components/ds/feedback';
import { useToast } from '@/components/ds/toast';
import { inTray, referenceLimit, removeReference, updateReference, useReferenceTray, type TrayItem } from '@/lib/reference-tray';
import type { ReferenceCredit as Credit, ReferencePhoto } from '@/lib/references/provider';
import type { ToolId } from '@/lib/tools';
import { addAsReference } from '@/components/shell/shell-state';

// The References panel's body (the shell around it carries the "References"
// header and the close button). An empty search (never prefilled: a car's model
// name is not a photo search) and, until the person searches, a curated grid
// for the tool on screen (SUGGESTED). The grid loads the next page as it
// scrolls into view ("Load more" does the same by hand). One click uses a photo
// as a reference through the shell's one action (addAsReference: added in Key
// visual, the inspiration in Car lineup) and brings it into the Studio's
// storage in the background (POST /api/references/import); a ticked photo is
// in use, and clicking it again takes it out. Every photo carries its credit,
// as the library's rules ask (lib/references/unsplash.ts).

/** The curated grid shown before a search, per tool. */
export const SUGGESTED: Record<'visuals' | 'lineup' | 'other', { q: string; title: string }> = {
  visuals: { q: 'car key visual', title: 'Suggested for Key visual' },
  lineup: { q: 'car lineup', title: 'Suggested for Car lineup' },
  other: { q: 'car photography', title: 'Suggested photos' },
};
export const SEARCH_HINT = 'Search car photos, e.g. coastal road at dusk';
const suggestedFor = (tool: ToolId | null | undefined) => SUGGESTED[tool === 'visuals' || tool === 'lineup' ? tool : 'other'];

const SEARCH_MS = 20_000;
const IMPORT_MS = 45_000;
const QUERY_MAX = 100;

type Page = { kind: 'ok'; photos: ReferencePhoto[]; nextPage: number | null } | { kind: 'unavailable' } | { kind: 'error'; message: string };
type Results = { key: string; page: Page; more: 'idle' | 'loading' | 'error'; moreMessage?: string };

const isHttps = (v: unknown): v is string => typeof v === 'string' && v.startsWith('https://');
function validPhoto(v: unknown): v is ReferencePhoto {
  const p = v as ReferencePhoto;
  return !!p && typeof p.id === 'string' && (p.provider === 'unsplash' || p.provider === 'pinterest') && isHttps(p.thumb) && isHttps(p.src)
    && typeof p.alt === 'string' && !!p.credit && typeof p.credit.name === 'string' && typeof p.credit.href === 'string' && typeof p.credit.source === 'string' && typeof p.credit.sourceHref === 'string';
}

/** A request to the Studio's own API with its own deadline; `outer` aborting (a newer search, the panel closing) rejects. */
async function studioJson(url: string, init: RequestInit, ms: number, outer?: AbortSignal) {
  const inner = new AbortController();
  const stop = () => inner.abort();
  const timer = window.setTimeout(stop, ms);
  outer?.addEventListener('abort', stop, { once: true });
  try {
    const response = await fetch(url, { ...init, signal: inner.signal, headers: { Accept: 'application/json', ...init.headers } });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { response, body };
  } finally {
    window.clearTimeout(timer);
    outer?.removeEventListener('abort', stop);
  }
}

async function fetchPage(q: string, page: number, signal: AbortSignal): Promise<Page> {
  try {
    const { response, body } = await studioJson('/api/references?' + new URLSearchParams({ q, page: String(page) }), {}, SEARCH_MS, signal);
    // Not set up yet is not an error: the panel says so plainly.
    if (body?.available === false) return { kind: 'unavailable' };
    if (!response.ok || !body || !Array.isArray(body.photos)) return { kind: 'error', message: typeof body?.error === 'string' ? body.error : 'Something went wrong. Try again.' };
    return { kind: 'ok', photos: body.photos.filter(validPhoto), nextPage: typeof body.nextPage === 'number' ? body.nextPage : null };
  } catch (e) {
    if (signal.aborted) throw e;
    return { kind: 'error', message: 'The photo library could not be reached. Check your connection and try again.' };
  }
}

const trayKey = (p: ReferencePhoto) => `${p.provider}:${p.id}`;
const photoName = (p: ReferencePhoto) => p.alt || `Photo by ${p.credit.name}`;

/** "Photo by <name> on <library>", both linked (each library's attribution rule). Links that are not https are shown as words only. */
export function ReferenceCredit({ credit, className }: { credit: Credit; className?: string }) {
  const link = (href: string, text: string) => isHttps(href)
    ? <a className="refs-credit-link" href={href} target="_blank" rel="noopener noreferrer">{text}</a>
    : text;
  return <p className={dsClass('refs-credit', className)}>Photo by {link(credit.href, credit.name)} on {link(credit.sourceHref, credit.source)}</p>;
}

function Skeletons({ count }: { count: number }) {
  return <>{Array.from({ length: count }, (_, n) => <li key={n}><SkeletonTile /></li>)}</>;
}

export function ReferencesPanel({ tool }: { tool?: ToolId | null }) {
  const tray = useReferenceTray();
  const { toast } = useToast();
  const limit = referenceLimit(tool);
  const suggested = suggestedFor(tool);
  const [typed, setTyped] = React.useState('');
  const [search, setSearch] = React.useState({ q: '', n: 0 });
  // No search yet: the curated grid for this tool.
  const query = search.q || suggested.q;
  const [results, setResults] = React.useState<Results | null>(null);
  const key = `${search.n}:${query}`;
  const current = results?.key === key ? results : null;
  const more = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const ac = new AbortController();
    fetchPage(query, 1, ac.signal).then(
      (page) => setResults({ key, page, more: 'idle' }),
      () => { /* replaced by a newer search, or the panel closed */ },
    );
    return () => { ac.abort(); more.current?.abort(); };
  }, [key, query]);

  const ready = current?.page.kind === 'ok' ? current.page : null;
  const loadMore = React.useCallback(() => {
    if (!current || current.page.kind !== 'ok' || current.page.nextPage === null || current.more === 'loading') return;
    const at = current.key, page = current.page.nextPage;
    setResults((r) => (r && r.key === at ? { ...r, more: 'loading' } : r));
    more.current?.abort();
    const ac = new AbortController();
    more.current = ac;
    fetchPage(query, page, ac.signal).then((next) => setResults((r) => {
      if (!r || r.key !== at || r.page.kind !== 'ok') return r;
      if (next.kind !== 'ok') return { ...r, more: 'error', moreMessage: next.kind === 'error' ? next.message : "The photo library isn't set up yet." };
      const seen = new Set(r.page.photos.map((p) => p.id));
      return { ...r, more: 'idle', page: { ...r.page, photos: [...r.page.photos, ...next.photos.filter((p) => !seen.has(p.id))], nextPage: next.nextPage } };
    }), () => { /* replaced by a newer search, or the panel closed */ });
  }, [current, query]);

  // The next page loads when the end of the grid comes into view. The observer
  // is made again after every page, so a page that still leaves the end in view
  // asks for the one after it.
  const sentinel = React.useRef<HTMLDivElement>(null);
  const canAutoLoad = !!ready && ready.nextPage !== null && current?.more === 'idle';
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || !canAutoLoad || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: '0px 0px 320px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [canAutoLoad, loadMore, ready?.nextPage]);

  // Imports in flight, so a late answer never touches a photo removed and added again since.
  const imports = React.useRef(new Map<string, number>());
  const nextImport = React.useRef(0);
  async function bringIn(photo: ReferencePhoto, k: string) {
    const ticket = ++nextImport.current;
    imports.current.set(k, ticket);
    const stillMine = () => imports.current.get(k) === ticket;
    try {
      const { response, body } = await studioJson('/api/references/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: photo.provider, id: photo.id }) }, IMPORT_MS);
      if (!response.ok || typeof body?.id !== 'string') throw new Error(typeof body?.error === 'string' ? body.error : 'Something went wrong. Try again.');
      if (stillMine()) updateReference(k, { assetId: body.id, src: '/api/assets/' + body.id });
    } catch (e) {
      if (!stillMine() || !inTray(k)) return;
      removeReference(k);
      // Error: the Studio's own sentence; AbortError: our deadline; anything else: the network.
      const name = e instanceof Error ? e.name : '';
      const reason = name === 'Error' ? (e as Error).message : name === 'AbortError' ? 'It took too long. Try again.' : 'Check your connection and try again.';
      toast({ kind: 'bad', message: `Couldn't add that photo. ${reason}` });
    } finally {
      if (stillMine()) imports.current.delete(k);
    }
  }

  const chosen = new Map(tray.map((i) => [i.key, i]));
  const used = Math.min(tray.length, limit);
  const full = limit > 1 && tray.length >= limit;
  function toggle(photo: ReferencePhoto) {
    const k = trayKey(photo);
    if (chosen.has(k)) { imports.current.delete(k); removeReference(k); return; }
    const item: TrayItem = { key: k, provider: photo.provider, src: photo.src, thumb: photo.thumb, name: photoName(photo), credit: photo.credit };
    const done = addAsReference(item);
    if (done === 'full') { toast({ message: `You can choose up to ${limit} references. Remove one to add another.` }); return; }
    if (done === 'replaced') toast({ message: 'This photo is now your inspiration.' });
    void bringIn(photo, k);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // An empty search goes back to the suggestions.
    const q = typed.trim().slice(0, QUERY_MAX);
    setSearch((s) => ({ q, n: s.n + 1 }));
  }
  const retry = () => setSearch((s) => ({ ...s, n: s.n + 1 }));

  let body: React.ReactNode;
  if (!current) body = <Loading label="Loading photos"><ul className="refs-grid"><Skeletons count={8} /></ul></Loading>;
  else if (current.page.kind === 'unavailable') body = <State kind="empty" icon={<ImageOff />} title={"The photo library isn't set up yet"} />;
  else if (current.page.kind === 'error') body = <State kind="error" title="Photos couldn't load" actions={<Button size="sm" onClick={retry}>Try again</Button>}>{current.page.message}</State>;
  else if (!current.page.photos.length) body = <State kind="no-results" title="No photos for that search">Try other words, like a body style, a colour or a place.</State>;
  else body = (
    <>
      <h3 className="refs-heading">{search.q ? `Photos for “${search.q}”` : suggested.title}</h3>
      <ul className="refs-grid" aria-label={search.q ? `Photos for ${search.q}` : suggested.title}>
        {current.page.photos.map((photo) => {
          const k = trayKey(photo), item = chosen.get(k), picked = !!item;
          return (
            <li key={photo.id} className="ds-tile refs-tile">
              <button
                type="button"
                className="refs-pick"
                aria-pressed={picked}
                aria-label={`${photoName(photo)}, by ${photo.credit.name}`}
                title={photoName(photo)}
                onClick={() => toggle(photo)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked from the photo library's own image host, as its rules require */}
                <img src={photo.thumb} alt="" loading="lazy" decoding="async" />
                {picked && <span className="refs-tick" aria-hidden="true">{item.assetId ? <Check /> : <span className="ds-spinner" />}</span>}
              </button>
              <ReferenceCredit credit={photo.credit} />
            </li>
          );
        })}
      </ul>
      <div className="refs-more">
        <div ref={sentinel} className="refs-sentinel" aria-hidden="true" />
        {current.more === 'loading' ? <Loading label="Loading more photos" className="refs-more-grid"><ul className="refs-grid"><Skeletons count={4} /></ul></Loading>
          : current.more === 'error' ? <div className="refs-more-error" role="alert"><p>{current.moreMessage}</p><Button size="sm" onClick={loadMore}>Try again</Button></div>
          : current.page.nextPage !== null ? <Button size="sm" onClick={loadMore}>Load more</Button>
          : <p className="refs-end">That&rsquo;s every photo for this search.</p>}
      </div>
    </>
  );

  return (
    <div className="refs-panel">
      <form className="refs-search" role="search" onSubmit={submit}>
        <label className="ds-search">
          <Search aria-hidden="true" />
          <span className="ds-sr-only">Search photos</span>
          <input className="ds-input" type="search" value={typed} maxLength={QUERY_MAX} enterKeyHint="search" autoComplete="off" placeholder={SEARCH_HINT} onChange={(e) => { setTyped(e.target.value); if (!e.target.value) setSearch((s) => (s.q ? { q: '', n: s.n + 1 } : s)); }} />
        </label>
        <IconButton type="submit" label="Search" kind="secondary"><ArrowRight aria-hidden="true" /></IconButton>
      </form>
      <p className="refs-count" data-full={full || undefined} aria-live="polite">
        {limit === 1 ? (tray.length ? 'Your inspiration is chosen. Click another photo to use it instead.' : 'Click a photo to use it as your inspiration.')
          : full ? `Your references are full (${limit} of ${limit}). Remove one to add another.` : `${used} of ${limit} references chosen. Click a photo to add it.`}
      </p>
      {body}
    </div>
  );
}
