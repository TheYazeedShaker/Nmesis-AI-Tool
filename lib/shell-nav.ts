// The left navigation's model, in one place (components/shell/side-nav.tsx
// draws it). Plain module: the navigation and the tests read the same rules.
//
// - Outside a tool the navigation lists pages only: Home, Projects, Uploads, Settings.
// - Inside a tool's view (Key visual, Car lineup; later the editor) it adds the
//   tool's panels: References, Brand, Elements, and Uploads opens as a panel there.
// - One item is selected, from one source: the open panel when there is one,
//   otherwise the page the person is on. Never two.
import type {ToolId} from './tools';

export type NavPanel='references'|'brand'|'elements'|'uploads';
/** The pages a frame can show (components/studio-topbar.tsx StudioPage). */
export type NavPage='home'|'library'|'projects'|'brand'|'account'|'uploads'|'visuals'|'lineup'|'storyboard'|'films'|'swap'|'usage'|'company'|'lab';
export type NavKey='home'|'projects'|'references'|'brand'|'elements'|'uploads'|'settings';
export type NavItem={key:NavKey;label:string}&({href:string;pages:readonly NavPage[]}|{panel:NavPanel});

/** The tool a page belongs to, when the page is a tool's view. */
export function toolOf(page:NavPage|undefined):ToolId|null{
 return page==='visuals'||page==='lineup'?page:null;
}

const HOME:NavItem={key:'home',label:'Home',href:'/',pages:['home']};
const PROJECTS:NavItem={key:'projects',label:'Projects',href:'/library',pages:['library','projects']};
const SETTINGS:NavItem={key:'settings',label:'Settings',href:'/company',pages:['company','usage','brand']};
const UPLOADS_PAGE:NavItem={key:'uploads',label:'Uploads',href:'/uploads',pages:['uploads']};
const PANELS:NavItem[]=[
 {key:'references',label:'References',panel:'references'},
 {key:'brand',label:'Brand',panel:'brand'},
 {key:'elements',label:'Elements',panel:'elements'},
 {key:'uploads',label:'Uploads',panel:'uploads'},
];

/** What the navigation lists on this page. */
export function navItems(page:NavPage|undefined):NavItem[]{
 return toolOf(page)?[HOME,PROJECTS,...PANELS,SETTINGS]:[HOME,PROJECTS,UPLOADS_PAGE,SETTINGS];
}

/** The panels this page may show (none outside a tool). */
export function panelsOn(page:NavPage|undefined):NavPanel[]{
 return navItems(page).flatMap(i=>'panel' in i?[i.panel]:[]);
}

/** The one selected item: the open panel (when this page offers it), else the page's own item, else none. */
export function navSelection(page:NavPage|undefined,panel:NavPanel|null):NavKey|null{
 const items=navItems(page);
 if(panel){const open=items.find(i=>'panel' in i&&i.panel===panel);if(open)return open.key}
 const here=page?items.find(i=>'pages' in i&&i.pages.includes(page)):undefined;
 return here?here.key:null;
}
