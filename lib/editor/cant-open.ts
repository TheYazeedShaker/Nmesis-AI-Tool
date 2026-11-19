import {VISUAL_ID} from '@/lib/work-ref';

// Why the canvas editor can't open an address, each with its own words: a link
// that isn't one, a picture that isn't finished, a picture that isn't here
// (deleted, someone's "Only me" work, or stored by another Studio: the preview
// and production keep separate pictures), or a load that failed.

export type CantOpen = 'link' | 'pending' | 'failed' | 'missing' | 'other';

export const CANT_OPEN: Record<CantOpen, { title: string; body: string }> = {
  link: { title: 'This link doesn’t open a picture', body: 'The address is incomplete or isn’t an editor link. Open the picture in Projects and choose Edit.' },
  pending: { title: 'This picture isn’t finished yet', body: 'It’s still being made. Once it’s ready, open it in Projects and choose Edit.' },
  failed: { title: 'This picture isn’t finished', body: 'It didn’t finish, so there’s nothing to edit. Make it again in Key visual or Car lineup.' },
  missing: { title: 'This picture isn’t available here', body: 'It may have been deleted, or it’s stored in another version of the Studio. Your pictures are in Projects.' },
  other: { title: 'Can’t open the editor', body: 'The picture couldn’t be loaded. Check your connection, then try again.' },
};

/** A link problem, before anything is asked: no picture id, or one the Studio would never give. */
export const linkProblem = (id: string | null): CantOpen | null => (id && VISUAL_ID.test(id) ? null : 'link');

/** From the picture's answer (GET /api/visuals/<id>): null when it can be edited. */
export function answerProblem(status: number, visual?: { status?: string } | null): CantOpen | null {
  if (status === 404) return 'missing';
  if (status < 200 || status >= 300 || !visual) return 'other';
  return visual.status === 'ready' ? null : visual.status === 'failed' ? 'failed' : 'pending';
}
