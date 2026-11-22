// The company's own fonts, as the browser sees them (Brand → Fonts, the
// editor's font list): types, limits and words. No I/O and nothing secret:
// the server's side is lib/brand-fonts/store.ts and sanitise.ts.

/**
 * The licence confirmation an owner ticks before uploading (owner to confirm the wording).
 * A new wording gets a new version; the database keeps the version and the exact words shown.
 */
export const LICENCE_VERSION='2026-11-22';
export const LICENCE_TEXT='I confirm my company holds a licence that allows this font to be used in our designs and exports.';
export const LICENCES:Record<string,string>={[LICENCE_VERSION]:LICENCE_TEXT};

export const MAX_FONT_MB=10;
export const FONT_EXTENSIONS=['otf','ttf','woff','woff2'] as const;
export const FONT_ACCEPT='.otf,.ttf,.woff,.woff2,font/otf,font/ttf,font/woff,font/woff2';
/** How many fonts a company may keep (ready ones; refused ones don't count). */
export const MAX_BRAND_FONTS=60;
/** The plan feature that turns uploading on (the plans data, as every Studio feature). */
export const BRAND_FONTS_FEATURE='studio.brand_fonts';
/** The prefix a design's text layer carries for an uploaded font: `brand:<family>`. */
export const BRAND_FONT_PREFIX='brand:';
export const brandFontName=(family:string)=>BRAND_FONT_PREFIX+family;
export const isBrandFontName=(name:unknown):name is string=>typeof name==='string'&&name.startsWith(BRAND_FONT_PREFIX);

export type Embedding='installable'|'editable'|'preview-print'|'restricted';
export const EMBEDDING_LABELS:Record<Embedding,string>={installable:'Installable',editable:'Editable','preview-print':'Preview & print',restricted:'Restricted'};
export const EMBEDDING_HELP:Record<Embedding,string>={
 installable:'Its licence settings allow it to be embedded in designs and exports.',
 editable:'Its licence settings allow it to be embedded in designs and exports, and edited there.',
 'preview-print':'Its licence settings allow it to be embedded for viewing and printing.',
 restricted:'Its licence settings don’t allow it to be embedded.',
};
export type BrandFontKind='sans'|'serif'|'display'|'script'|'mono';

/** One uploaded font file. `url` and `previewUrl` are the Studio's own addresses (each answers with a short-lived signed link). */
export type BrandFontFile={
 id:string;family:string;style:string;weight:number;italic:boolean;
 /** A variable font's weight axis. */weightRange:[number,number]|null;
 kind:BrandFontKind;arabic:boolean;format:'otf'|'ttf'|'woff'|'woff2';size:number;
 embedding:Embedding;status:'ready'|'refused';reason:string|null;createdAt:number;
 url:string|null;previewUrl:string|null;
};
/** GET /api/brand-fonts. */
export type BrandFontsState={
 /** Migration 0013 has run. */ready:boolean;
 /** The company's plan has brand fonts. */onPlan:boolean;
 /** This person may upload and remove (an owner, not staff viewing). */mayUpload:boolean;
 /** The plan that has brand fonts, for "Available on Growth". */upsell:string;
 fonts:BrandFontFile[];
};

export const fontUrl=(id:string)=>`/api/brand-fonts/${encodeURIComponent(id)}/font`;
export const previewUrl=(id:string)=>`/api/brand-fonts/${encodeURIComponent(id)}/preview`;

// The words (the design plugin's UX copy pass: say what happened and what to do).
export const WORDS={
 onlyOwners:'Only your company’s owners can upload or remove fonts. Ask an owner to add the one you need.',
 notOnPlan:(plan:string)=>`Available on ${plan} · Ask Nmesis`,
 notYet:'Uploading fonts isn’t on yet. Try again later.',
 licenceRequired:'Tick the licence confirmation first.',
 tooLarge:`Choose a font file up to ${MAX_FONT_MB} MB.`,
 wrongType:'Choose an OTF, TTF, WOFF or WOFF2 font file.',
 already:'This font is already in your brand fonts.',
 full:`Your brand fonts hold ${MAX_BRAND_FONTS} fonts, the most they can. Remove one first.`,
 notFound:'Font not found.',
} as const;

/** "Bold Italic", from the weight and italic (for a file the font names oddly). */
export const extensionOf=(name:string)=>(/\.([a-z0-9]+)$/i.exec(name)?.[1]||'').toLowerCase();
export const acceptedFile=(name:string)=>(FONT_EXTENSIONS as readonly string[]).includes(extensionOf(name));
