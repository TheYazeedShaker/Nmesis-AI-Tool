// Car lineup's inspiration comes from the one reference tray (lib/reference-tray.ts),
// exactly like Key visual's references: a photo clicked in the References panel,
// an upload, a brand logo or a Pinterest link all land there through the shell's
// one action (addAsReference), and the lineup uses the first. Plain module, so
// the test can follow a reference from the panel to the generate request.
import type {TrayItem} from './reference-tray';

export const NEED_INSPIRATION='Add an inspiration: a photo from References, an upload or a Pinterest link.';

/** The inspiration a lineup uses: the tray's first reference. */
export const lineupInspiration=(tray:readonly TrayItem[]):TrayItem|null=>tray[0]||null;

/**
 * The asset id the generate request sends as `moodId`. A refinement keeps its
 * parent's; otherwise a Pinterest link typed and not yet added is read first,
 * then the tray's inspiration is brought into the Studio's storage (`resolve`).
 */
export async function lineupMoodId({parentMoodId,tray,pin,pinAdded,importPin,resolve}:{
 parentMoodId?:string;tray:readonly TrayItem[];pin:string;
 /** The link last added (so it is not read twice). */pinAdded:string;
 importPin:()=>Promise<string>;resolve:(item:TrayItem)=>Promise<string>;
}):Promise<string>{
 if(parentMoodId)return parentMoodId;
 if(pin.trim()&&pin.trim()!==pinAdded.trim())return importPin();
 const first=lineupInspiration(tray);
 if(!first)throw new Error(NEED_INSPIRATION);
 return first.assetId||resolve(first);
}

/** True when there is something to use as the inspiration. */
export const hasInspiration=(tray:readonly TrayItem[],pin:string)=>!!lineupInspiration(tray)||!!pin.trim();
