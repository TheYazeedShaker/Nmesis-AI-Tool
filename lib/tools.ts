// Which tools are open. One list: a tool that is not in OPEN_TOOLS shows on
// Home, in the Tools menu and in the editor as "Coming soon" (visible, not
// clickable), and its pages are closed (proxy.ts sends them Home). Unlocking a
// tool later is adding its id here. Plain module: the proxy, the server, the
// pages and the tests read the same list.
export type ToolId='visuals'|'lineup'|'storyboard'|'films'|'swap';
export const OPEN_TOOLS:readonly ToolId[]=['visuals','lineup'];
export const COMING_SOON='Coming soon';
/** Each tool's pages: the address and everything under it. */
export const TOOL_PATHS:Record<ToolId,string>={visuals:'/key-visual',lineup:'/lineup',storyboard:'/storyboard',films:'/films',swap:'/swap'};
export const toolOpen=(tool:ToolId)=>OPEN_TOOLS.includes(tool);
/** The closed tool a page address belongs to, or null. */
export function closedToolAt(pathname:string):ToolId|null{
 for(const [tool,base] of Object.entries(TOOL_PATHS) as [ToolId,string][])if(!toolOpen(tool)&&(pathname===base||pathname.startsWith(base+'/')))return tool;
 return null;
}
