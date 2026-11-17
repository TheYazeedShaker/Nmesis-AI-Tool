// The wireframe screens. A plain module (not 'use client'), so the server page
// can read the list as values.
export const SCREENS = ['home', 'folders', 'library', 'editor'] as const;
export type Screen = typeof SCREENS[number];
export const SCREEN_TITLES: Record<Screen, string> = { home: 'Home', folders: 'Projects and folders', library: 'Library', editor: 'Editor (key visual)' };
export const isScreen = (s: string): s is Screen => (SCREENS as readonly string[]).includes(s);
// Phase 3 group 1, before it is built: the real screens with synthetic data.
export const PROPOSALS = ['home', 'library', 'projects', 'folder', 'editor-visuals', 'editor-lineup', 'editor-films', 'editor-swap', 'editor-storyboard'] as const;
export type Proposal = typeof PROPOSALS[number];
