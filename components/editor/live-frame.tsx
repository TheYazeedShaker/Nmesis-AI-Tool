'use client';
import * as React from 'react';
import {RotateCw} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {State} from '@/components/ds/feedback';

// The live configurator's iframe, for every tool. Why it sometimes stayed black
// until a refresh:
//  - it was drawn on the server, so its `load` could fire before React was
//    listening (hydration race): now the frame is created only after mount;
//  - it was loaded while its pane was hidden (display: none, e.g. Swap opens on
//    "Reference ad", Key visual on a result), so the configurator started its
//    3D view at 0 × 0 and never redrew: now it loads the first time it is shown.
// If it has not loaded 10 s after it is shown, it says so with Try again, and
// the cause goes to the console (no address, only the host).
export const LIVE_FRAME_TIMEOUT_MS = 10_000;
type Status = 'loading' | 'ready' | 'failed';
const noop = () => () => {};

function host(url: string) {
  try { return new URL(url).host; } catch { return 'unknown'; }
}

export function LiveFrame({url, name, frameRef, visible = true, badge = true}: {url: string; name: string; frameRef?: React.Ref<HTMLIFrameElement>; visible?: boolean; badge?: boolean}) {
  // false on the server and in the hydrating render, true after: the frame is created only once React listens.
  const mounted = React.useSyncExternalStore(noop, () => true, () => false);
  const [shown, setShown] = React.useState(visible);
  if (visible && !shown) setShown(true);// loads the first time it is shown, then stays
  const [attempt, setAttempt] = React.useState(0);
  // A new car or a new attempt starts over: the status belongs to one address and attempt.
  const key = url + '#' + attempt;
  const [held, setHeld] = React.useState<{key: string; status: Status}>({key, status: 'loading'});
  const status: Status = held.key === key ? held.status : 'loading';
  const setStatus = (next: Status) => setHeld({key, status: next});
  React.useEffect(() => {
    if (!mounted || !shown || status !== 'loading') return;
    const timer = window.setTimeout(() => {
      setHeld({key, status: 'failed'});
      console.warn('[configurator] not loaded', {cause: 'no load event within 10 s', host: host(url), attempt});
    }, LIVE_FRAME_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [mounted, shown, status, key, url, attempt]);

  const live = mounted && shown;
  return <>
    {live && <iframe ref={frameRef} key={key} title={name + ' configurator'} src={url}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" referrerPolicy="no-referrer" allow="fullscreen" allowFullScreen
      onLoad={() => setStatus('ready')}// a late load still shows the configurator
      onError={() => { setStatus('failed'); console.warn('[configurator] not loaded', {cause: 'error event', host: host(url), attempt}); }}/>}
    {badge && status === 'ready' && <span className="editor-live"><span aria-hidden="true"/>Live configurator</span>}
    {status === 'failed' && <div className="editor-frame-state">
      <State kind="error" title="Couldn’t load the configurator" actions={<Button kind="primary" icon={<RotateCw aria-hidden="true"/>} onClick={() => setAttempt((a) => a + 1)}>Try again</Button>}>Check your connection, then try again.</State>
    </div>}
  </>;
}
