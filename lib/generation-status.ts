import type {Visual} from './studio';
// Synchronous providers normally finish within their four-minute API timeout.
// Leave extra time for uploads/archiving. This is a display decision, not proof
// of provider failure or billing; never overwrite the original request record.
export function stalledGeneration(visual:Visual,now=Date.now()){
 const started=Date.parse(visual.createdAt);
 return visual.status==='pending'&&visual.provider!=='higgsfield'&&Number.isFinite(started)&&now-started>=10*60_000;
}
export const interruptedGenerationMessage='This request was interrupted or took too long, and no completed image is saved. Your references are preserved. No automatic retry was made. Refresh saved visuals to check again before starting another paid generation.';
