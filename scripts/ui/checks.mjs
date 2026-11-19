// The checks the UI harness runs inside each page (passed to page.evaluate, so
// each function is self-contained). docs/design-audit/harness.md describes them
// and lists the mistakes they are known to make.

// Installed before any page script runs: layout shifts (CLS, session windows as
// web-vitals counts them), long tasks, slow events (for INP) and DOM quiet.
export function initScript() {
  const w = window;
  w.__ui = { shifts: [], longTasks: [], events: [], lastMutation: performance.now(), lcp: 0 };
  try {
    // Each shift with the elements that moved (for finding what causes CLS).
    const name = (n) => !n || n.nodeType !== 1 ? '#text' : n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/s+/).slice(0, 2).join('.') : '');
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) w.__ui.shifts.push({ t: e.startTime, v: e.value, moved: (e.sources || []).slice(0, 4).map((x) => `${name(x.node)} ${Math.round(x.previousRect.y)}→${Math.round(x.currentRect.y)}`) }); }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__ui.longTasks.push(e.duration); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__ui.lcp = Math.max(w.__ui.lcp, e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.interactionId) w.__ui.events.push({ name: e.name, d: e.duration, id: e.interactionId }); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch { /* an observer type this browser lacks: that metric stays empty */ }
  const watch = () => new MutationObserver(() => { w.__ui.lastMutation = performance.now(); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
}

export function quietFor() { return performance.now() - window.__ui.lastMutation; }

export function vitals() {
  const s = window.__ui.shifts;
  // CLS: the largest session window (gap < 1s, window < 5s).
  let best = 0, cur = 0, start = 0, last = -Infinity;
  for (const x of s) { if (x.t - last > 1000 || x.t - start > 5000) { cur = 0; start = x.t; } cur += x.v; last = x.t; best = Math.max(best, cur); }
  const byInteraction = new Map();
  for (const e of window.__ui.events) byInteraction.set(e.id, Math.max(byInteraction.get(e.id) || 0, e.d));
  const inp = [...byInteraction.values()].sort((a, b) => b - a)[0] || 0;
  const biggest = [...s].sort((x, y) => y.v - x.v).slice(0, 3).map((x) => ({ v: Math.round(x.v * 1000) / 1000, moved: x.moved }));
  return { shifts: biggest, cls: Math.round(best * 1000) / 1000, lcp: Math.round(window.__ui.lcp), inp: Math.round(inp), longTaskMs: Math.round(window.__ui.longTasks.reduce((a, b) => a + b, 0)), longTasks: window.__ui.longTasks.length };
}

export function layoutChecks({ phone }) {
  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return el.tagName.toLowerCase() + id + cls + (name ? ' "' + name + '"' : '');
  };
  // Visually hidden on purpose (screen-reader text, the 1 px skip-link pattern,
  // clip-path / clip hiding): neither a target, nor drawn over, nor clipped text.
  // The element or any ancestor below <body>; remembered per element for this
  // call (the page does not change while it runs), so each box is read once.
  const hiddenSeen = new Map();
  const hiddenOnPurpose = (n) => {
    if (!n || n === document.body) return false;
    if (hiddenSeen.has(n)) return hiddenSeen.get(n);
    let hidden = false;
    // Inside a closed <details> (other than its summary) nothing is drawn or
    // reachable; Phase 1 counted those as covered (F-069 was this, in part).
    if (n.parentElement && n.parentElement.tagName === 'DETAILS' && !n.parentElement.open && n.tagName !== 'SUMMARY') hidden = true;
    else {
      const cs = getComputedStyle(n), r = n.getBoundingClientRect();
      if ((r.width <= 2 || r.height <= 2) && cs.overflow !== 'visible') hidden = true;
      else if (/inset\(50%\)|rect\(0/.test(cs.clipPath + ' ' + cs.clip)) hidden = true;
    }
    if (!hidden) hidden = hiddenOnPurpose(n.parentElement);
    hiddenSeen.set(n, hidden);
    return hidden;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01 && !hiddenOnPurpose(el); };
  const out = { overflowX: document.documentElement.scrollWidth - window.innerWidth, under24: [], under44: [], overlapped: [], clippedNoEllipsis: [], ellipsisNoTitle: [], spilling: [], interactive: 0 };
  // With a dialog open, only what is in it can be reached; the page behind is
  // meant to be covered.
  const dialogs = [...document.querySelectorAll('dialog[open], [role=dialog], [role=alertdialog]')].filter(visible);
  const scope = dialogs.length ? dialogs[dialogs.length - 1] : document;
  const interactive = [...scope.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [tabindex]:not([tabindex="-1"])')].filter(visible);
  out.interactive = interactive.length;
  out.dialogOpen = dialogs.length > 0;
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    // 2.5.8 exception: a link inside a sentence.
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /[a-z]{3}/i.test((el.parentElement.textContent || '').replace(el.textContent || '', ''));
    // A label that wraps a native box makes the whole label the target.
    const target = el.closest('label') && /^(INPUT)$/.test(el.tagName) ? el.closest('label').getBoundingClientRect() : r;
    const small = Math.min(target.width, target.height);
    if (!inline && small < 24) out.under24.push({ el: describe(el), w: Math.round(target.width), h: Math.round(target.height) });
    else if (phone && !inline && small < 44) out.under44.push({ el: describe(el), w: Math.round(target.width), h: Math.round(target.height) });
    // Its own words spill out of its box, or wrap where the control does not
    // allow it (Phase 3 group 2: a fixed width squeezed "Your car / Result"
    // on phones). Text fields and the scrolling regions are not controls of words.
    if (!/^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(el.tagName) && (el.textContent || '').trim() && r.width > 0) {
      const cs = getComputedStyle(el);
      const spills = cs.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 1;
      const wraps = cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 1;
      if (spills || wraps) out.spilling.push({ el: describe(el), w: Math.round(r.width), needs: el.scrollWidth });
      // Cut off at the side of the screen with nothing that scrolls it into view
      // (a Generate button pushed off a phone; the page itself does not scroll).
      else if ((r.right > innerWidth + 1 || r.left < -1) && !sideScroller(el)) out.spilling.push({ el: describe(el), cutOff: true, right: Math.round(r.right) });
    }
    // Pointing at it: is it what the pointer reaches? (Only what is on screen now:
    // inside the window and inside every box that scrolls or clips it. A setting
    // scrolled below its panel, or a card past the end of a strip that scrolls
    // sideways, is reached by scrolling that box, as the page; Phase 3 group 2
    // counted those as covered by whatever lies beyond the box.)
    const c = shownArea(el);
    if (r.top >= c.top && r.left >= c.left && r.bottom <= c.bottom && r.right <= c.right) {
      const x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
      const lbl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !(lbl && (lbl === hit || lbl.contains(hit))) && !(el.closest('label') && el.closest('label').contains(hit))) {
        out.overlapped.push({ el: describe(el), by: describe(hit) });
      }
    }
  }
  // Text cut off: a box narrower than its text, overflow hidden.
  // The same tests as before, cheapest first (DOM only, then layout, then style).
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || el.children.length > 2) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!ownText || el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = getComputedStyle(el);
    if (!/hidden|clip/.test(cs.overflowX + cs.overflow) || !visible(el)) continue;
    const full = (el.textContent || '').trim();
    if (cs.textOverflow === 'ellipsis') { if (!el.getAttribute('title') && !el.closest('[title]') && !el.getAttribute('aria-label')) out.ellipsisNoTitle.push({ el: describe(el), text: full.slice(0, 80) }); }
    else out.clippedNoEllipsis.push({ el: describe(el), text: full.slice(0, 80) });
  }
  // A fixed-position control over the editor's settings panel (Phase 3 polish:
  // a round button floated over it). Toasts come and go and the skip link is
  // off screen until focused; an open dialog is meant to cover the page.
  out.fixedOverSettings = [];
  const panel = document.querySelector('.ds-editor-settings');
  if (panel && visible(panel)) {
    const p = panel.getBoundingClientRect();
    const CONTROL = 'a[href], button, input, select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll('body *')) {
      if (getComputedStyle(el).position !== 'fixed' || !visible(el) || panel.contains(el) || el.contains(panel)) continue;
      if (el.closest('dialog[open], .ds-toasts, .ds-skip')) continue;
      if (!el.matches(CONTROL) && !el.querySelector(CONTROL)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top) out.fixedOverSettings.push(describe(el));
    }
  }
  // The editor fills the window under the top bar, with nothing left below it
  // or under its version history (owner, design/editor-cleanup: an empty band
  // under "Your versions appear here"). Measured with the page at the top.
  // A phone zooms a page out when something is wider than the screen: the
  // window then grows past the screen (innerWidth > screen.width), which the
  // scrollWidth check above cannot see. Name the widest boxes that cause it.
  out.zoomedOut = [];
  if (phone && window.innerWidth > screen.width + 1) {
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > screen.width + 1 && !sideScroller(el) && ![...el.children].some((c) => c.getBoundingClientRect().right > screen.width + 1)) out.zoomedOut.push({ el: describe(el), right: Math.round(b.right), screen: screen.width });
    }
    // Content inside a sideways scroller (the version history) is not the cause; see sideScroller above.
    out.zoomedOut = out.zoomedOut.slice(0, 8);
    out.zoomedBy = Math.round(window.innerWidth - screen.width);
  }
  out.editorBand = [];
  const editor = document.querySelector('.ds-editor');
  if (editor && visible(editor) && window.scrollY === 0) {
    const e = editor.getBoundingClientRect();
    const docBottom = document.documentElement.scrollHeight;
    if (e.bottom < window.innerHeight - 2 && docBottom <= window.innerHeight + 2) out.editorBand.push({ el: 'below .ds-editor', gap: Math.round(window.innerHeight - e.bottom) });
    const canvas = document.querySelector('.ds-canvas-stage'), history = document.querySelector('.editor-stage-history');
    if (canvas && history && visible(history) && canvas.scrollHeight <= canvas.clientHeight + 1) {
      const c = canvas.getBoundingClientRect(), h = history.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(canvas).paddingBottom) || 0;
      if (c.bottom - pad - h.bottom > 8) out.editorBand.push({ el: 'under .editor-stage-history', gap: Math.round(c.bottom - pad - h.bottom) });
    }
  }
  // The shell fills the window (fix/shell-height-and-critique): at the top of the page, the
  // shell (.studio-frame) and its work area (.studio-frame-page) reach the bottom of the
  // window, and the shell is never scrolled (that would show the background under the page).
  out.shellShort = [];
  const shell = document.querySelector('.studio-frame'), work = document.querySelector('.studio-frame-page');
  if (shell && window.scrollY === 0) {
    const s = shell.getBoundingClientRect(), w = work && visible(work) ? work.getBoundingClientRect() : null;
    if (s.top > 1 || s.bottom < window.innerHeight - 1) out.shellShort.push({ el: 'shell', top: Math.round(s.top), bottom: Math.round(s.bottom), window: window.innerHeight });
    if (w && w.bottom < window.innerHeight - 1) out.shellShort.push({ el: 'work area', bottom: Math.round(w.bottom), window: window.innerHeight });
    if (shell.scrollTop > 0) out.shellShort.push({ el: 'shell scrolled', by: Math.round(shell.scrollTop) });
  }
  // Layers (feat/studio-foundations): an open menu or drawer is drawn over everything,
  // never under a panel. Five points inside each open one (its middle and near
  // each corner) must hit the menu itself; whatever covers a point is named.
  out.menusUnder = [];
  const open = [...document.querySelectorAll('.studio-account-pop, [role="menu"], dialog[open]')].filter((m) => visible(m));
  for (const m of open) {
    const r = m.getBoundingClientRect();
    const inset = 12, pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + inset, r.top + inset], [r.right - inset, r.top + inset], [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset]];
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && !m.contains(hit)) { out.menusUnder.push({ el: describe(m), coveredBy: describe(hit) }); break; }
    }
  }
  for (const k of ['under24', 'under44', 'overlapped', 'clippedNoEllipsis', 'ellipsisNoTitle', 'spilling', 'fixedOverSettings', 'menusUnder']) out[k] = dedupe(out[k]);
  return out;
  function sideScroller(el) {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
    return false;
  }
  function shownArea(el) {
    const a = { top: 0, left: 0, bottom: innerHeight, right: innerWidth };
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/auto|scroll|hidden|clip/.test(cs.overflowX + ' ' + cs.overflowY)) continue;
      const q = n.getBoundingClientRect();
      a.top = Math.max(a.top, q.top); a.left = Math.max(a.left, q.left); a.bottom = Math.min(a.bottom, q.bottom); a.right = Math.min(a.right, q.right);
    }
    return a;
  }
  function dedupe(list) { const seen = new Map(); for (const x of list) { const key = JSON.stringify(x); seen.set(key, x); } return [...seen.values()].slice(0, 40); }
}

// After a real Tab press: the focused element, whether it shows a focus
// indicator, and whether a fixed or sticky bar covers it (2.4.11).
export function focusState() {
  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return el.tagName.toLowerCase() + id + cls + (name ? ' "' + name + '"' : '');
  };
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  // An indicator is anything that changes when focus arrives: outline, shadow,
  // border, background or text colour (2.4.7). Read focused, then unfocused.
  const look = (n) => { const s = getComputedStyle(n); return [s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? s.outlineColor + s.outlineWidth : 'none', s.boxShadow, s.borderTopColor, s.borderBottomColor, s.backgroundColor, s.color].join('|'); };
  const holder = el.parentElement;
  const focused = look(el) + '#' + (holder ? look(holder) : '');
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const shadow = cs.boxShadow && cs.boxShadow !== 'none';
  let changed = outline || shadow;
  if (!changed && typeof el.blur === 'function') {
    el.blur();
    const unfocused = look(el) + '#' + (holder ? look(holder) : '');
    el.focus({ preventScroll: true });
    changed = unfocused !== focused;
  }
  const r = el.getBoundingClientRect();
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]
    .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
  let covered = 0, coveredBy = null;
  for (const [x, y] of pts) {
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
    let n = hit, pinned = false;
    while (n && n !== document.body) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') { pinned = true; break; } n = n.parentElement; }
    if (pinned) { covered++; coveredBy = describe(n); }
  }
  return { el: describe(el), indicator: changed, offscreen: pts.length === 0, covered, points: pts.length, coveredBy, size: [Math.round(r.width), Math.round(r.height)] };
}


// F-050: provider and model names a client without its own keys can read —
// visible text, and aria-label / title / alt. `source` is the pattern's source
// (lib/provider-words.ts PROVIDER_PATTERN), passed in because this runs in the page.
export function providerNamesOnPage({ source }) {
  const re = new RegExp(source, 'i');
  const found = [];
  const text = document.body ? document.body.innerText : '';
  for (const line of text.split('\n')) { const m = re.exec(line); if (m) found.push({ where: 'text', name: m[0], text: line.trim().slice(0, 140) }); }
  for (const el of document.querySelectorAll('[aria-label], [title], img[alt]')) {
    for (const attr of ['aria-label', 'title', 'alt']) {
      const v = el.getAttribute(attr);
      const m = v && re.exec(v);
      if (m) found.push({ where: attr, name: m[0], text: v.slice(0, 140) });
    }
  }
  const seen = new Set();
  return found.filter((f) => { const k = f.where + f.text; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40);
}
