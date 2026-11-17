'use client';
import * as React from 'react';

// Tabs whose open tab is in the address (`#tab=<id>`), so a tab can be linked,
// bookmarked and survives a reload. ←/→ move between tabs, Home/End jump
// (ARIA tabs with automatic activation).

export type TabItem = { id: string; label: React.ReactNode; panel: React.ReactNode };

export function readTabFromHash(hash: string, ids: string[], key = 'tab'): string | null {
  const m = new RegExp(`(?:^#|&)${key}=([^&]+)`).exec(hash);
  const v = m ? decodeURIComponent(m[1]) : null;
  return v && ids.includes(v) ? v : null;
}

export function Tabs({ tabs, label, hashKey = 'tab' }: { tabs: TabItem[]; label: string; hashKey?: string }) {
  const ids = tabs.map((t) => t.id);
  const [current, setCurrent] = React.useState(ids[0]);
  const base = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const idList = ids.join('|');
  React.useEffect(() => {
    const known = idList.split('|');
    const sync = () => { const t = readTabFromHash(window.location.hash, known, hashKey); if (t) setCurrent(t); };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [idList, hashKey]);

  const choose = (id: string, focus = false) => {
    setCurrent(id);
    try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hashKey}=${encodeURIComponent(id)}`); } catch { /* history unavailable (sandboxed frame): the tab still changes */ }
    if (focus) refs.current[id]?.focus();
  };

  function onKey(e: React.KeyboardEvent) {
    const at = ids.indexOf(current);
    const to = e.key === 'ArrowRight' ? ids[(at + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(at - 1 + ids.length) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[ids.length - 1] : null;
    if (to) { e.preventDefault(); choose(to, true); }
  }

  return (
    <div>
      <div className="ds-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`${base}-${t.id}-tab`}
            aria-selected={t.id === current}
            aria-controls={`${base}-${t.id}-panel`}
            tabIndex={t.id === current ? 0 : -1}
            className="ds-tab"
            onClick={() => choose(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-${t.id}-panel`} aria-labelledby={`${base}-${t.id}-tab`} hidden={t.id !== current} className="ds-tabpanel" tabIndex={0}>
          {t.id === current && t.panel}
        </div>
      ))}
    </div>
  );
}
