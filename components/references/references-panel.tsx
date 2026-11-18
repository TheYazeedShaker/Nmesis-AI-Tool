'use client';
import * as React from 'react';
import { Check, ImageOff, Search } from 'lucide-react';
import { Button, dsClass } from '@/components/ds/button';
import { Loading, SkeletonTile, State } from '@/components/ds/feedback';
import { useToast } from '@/components/ds/toast';
import { addReference, inTray, removeReference, TRAY_LIMIT, updateReference, useReferenceTray, type TrayItem } from '@/lib/reference-tray';
import type { ReferenceCredit as Credit, ReferencePhoto } from '@/lib/references/provider';

// The References panel's body (the shell around it carries the "References"
// header and the close button). A search, prefilled with the chosen car, and a
// grid of photos that loads the next page as it scrolls into view ("Load more"
// does the same by hand). One click adds a photo to the reference tray
// (lib/reference-tray.ts) and brings it into the Studio's storage in the
// background (POST /api/references/import); a ticked photo is in the tray, and
// clicking it again takes it out. Every photo carries its credit, as the
// library's rules ask (lib/references/unsplash.ts).

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

export function ReferencesPanel({ initialQuery }: { initialQuery: string }) {
  const tray = useReferenceTray();
  const { toast } = useToast();
  const start = initialQuery.trim().slice(0, QUERY_MAX);
  const [typed, setTyped] = React.useState(start);
  const [search, setSearch] = React.useState({ q: start, n: 0 });
  const [edited, setEdited] = React.useState(false);
  // A different car chosen while the panel is open: follow it, unless the
  // person has typed a search of their own.
  const [seenInitial, setSeenInitial] = React.useState(start);
  if (seenInitial !== start) {
    setSeenInitial(start);
    if (!edited) { setTyped(start); setSearch((s) => ({ q: start, n: s.n + 1 })); }
  }
  const [results, setResults] = React.useState<Results | null>(null);
  const key = `${search.n}:${search.q}`;
  const current = results?.key === key ? results : null;
  const more = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!search.q) return;
    const ac = new AbortController();
    fetchPage(search.q, 1, ac.signal).then(
      (page) => setResults({ key, page, more: 'idle' }),
      () => { /* replaced by a newer search, or the panel closed */ },
    );
    return () => { ac.abort(); more.current?.abort(); };
  }, [key, search.q]);

  const ready = current?.page.kind === 'ok' ? current.page : null;
  const loadMore = React.useCallback(() => {
    if (!current || current.page.kind !== 'ok' || current.page.nextPage === null || current.more === 'loading') return;
    const at = current.key, page = current.page.nextPage;
    setResults((r) => (r && r.key === at ? { ...r, more: 'loading' } : r));
    more.current?.abort();
    const ac = new AbortController();
    more.current = ac;
    fetchPage(search.q, page, ac.signal).then((next) => setResults((r) => {
      if (!r || r.key !== at || r.page.kind !== 'ok') return r;
      if (next.kind !== 'ok') return { ...r, more: 'error', moreMessage: next.kind === 'error' ? next.message : "The photo library isn't set up yet." };
      const seen = new Set(r.page.photos.map((p) => p.id));
      return { ...r, more: 'idle', page: { ...r.page, photos: [...r.page.photos, ...next.photos.filter((p) => !seen.has(p.id))], nextPage: next.nextPage } };
    }), () => { /* replaced by a newer search, or the panel closed */ });
  }, [current, search.q]);

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
  const full = tray.length >= TRAY_LIMIT;
  function toggle(photo: ReferencePhoto) {
    const k = trayKey(photo);
    if (chosen.has(k)) { imports.current.delete(k); removeReference(k); return; }
    const item: TrayItem = { key: k, provider: photo.provider, src: photo.src, thumb: photo.thumb, name: photoName(photo), credit: photo.credit };
    if (!addReference(item)) { toast({ message: `You can choose up to ${TRAY_LIMIT} references. Remove one to add another.` }); return; }
    void bringIn(photo, k);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = typed.trim().slice(0, QUERY_MAX);
    if (!q) return;
    setEdited(true);
    setSearch((s) => ({ q, n: s.n + 1 }));
  }
  const retry = () => setSearch((s) => ({ ...s, n: s.n + 1 }));

  let body: React.ReactNode;
  if (!search.q) body = <State kind="empty" icon={<Search />} title="Search for photos">Try a car, a place or a mood.</State>;
  else if (!current) body = <Loading label="Loading photos"><ul className="refs-grid"><Skeletons count={8} /></ul></Loading>;
  else if (current.page.kind === 'unavailable') body = <State kind="empty" icon={<ImageOff />} title={"The photo library isn't set up yet"} />;
  else if (current.page.kind === 'error') body = <State kind="error" title="Photos couldn't load" actions={<Button size="sm" onClick={retry}>Try again</Button>}>{current.page.message}</State>;
  else if (!current.page.photos.length) body = <State kind="no-results" title="No photos for that search">Try other words, like a body style, a colour or a place.</State>;
  else body = (
    <>
      <ul className="refs-grid" aria-label={`Photos for ${search.q}`}>
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
          <input className="ds-input" type="search" value={typed} maxLength={QUERY_MAX} enterKeyHint="search" autoComplete="off" placeholder="Search photos" onChange={(e) => { setTyped(e.target.value); setEdited(true); }} />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <p className="refs-count" data-full={full || undefined} aria-live="polite">
        {full ? `Your references are full (${TRAY_LIMIT} of ${TRAY_LIMIT}). Remove one to add another.` : `${tray.length} of ${TRAY_LIMIT} references chosen. Click a photo to add it.`}
      </p>
      {body}
    </div>
  );
}
