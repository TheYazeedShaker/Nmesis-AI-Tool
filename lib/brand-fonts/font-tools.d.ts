// The parts of subset-font (HarfBuzz's hb-subset) and fontverter (WOFF/WOFF2)
// that lib/brand-fonts/sanitise.ts uses. subset-font ships no types; fontverter's
// own declare no module, so both are declared here.
declare module 'subset-font' {
  type Options = {
    targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2';
    preserveNameIds?: number[];
    keepFeatures?: string[];
    variationAxes?: Record<string, number | {min: number; max: number; default?: number}>;
    noLayoutClosure?: boolean;
    glyphNames?: boolean;
    noHinting?: boolean;
    dropTables?: string[];
    keepAllGlyphs?: boolean;
  };
  export default function subsetFont(font: Buffer, text: string | undefined, options?: Options): Promise<Buffer>;
}
declare module 'fontverter' {
  type Format = 'truetype' | 'sfnt' | 'woff' | 'woff2';
  const fontverter: {
    convert(buf: Buffer, toFormat: Format, fromFormat?: Format): Promise<Buffer>;
    detectFormat(buf: Buffer): 'sfnt' | 'woff' | 'woff2';
  };
  export default fontverter;
}
