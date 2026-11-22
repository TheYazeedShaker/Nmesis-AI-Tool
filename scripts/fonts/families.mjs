// The editor's font catalogue: the families scripts/fonts/build-catalogue.mjs
// takes from the official open font repository (every family under the SIL
// Open Font Licence or the Apache Licence 2.0, with its licence file). The
// build makes self-hosted WOFF2 files and the manifest the editor reads
// (lib/editor/font-catalogue.json); the Studio serves them itself, so no
// person's browser ever asks a third party for a font.
//
// Grouped as the font picker shows them. The nine fonts of the brand kit's
// list (lib/brand-kit.ts BRAND_FONTS, System aside) are here under the same
// names, so every design that names one keeps drawing it.
// Arabic: the families that write Arabic as well as Latin, for clients in the
// Gulf and Egypt.

export const FAMILIES = {
  sans: [
    'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway', 'Nunito', 'Nunito Sans', 'Work Sans',
    'Rubik', 'Noto Sans', 'Source Sans 3', 'PT Sans', 'Mulish', 'Outfit', 'Manrope', 'DM Sans', 'Plus Jakarta Sans', 'Figtree',
    'Urbanist', 'Lexend', 'Karla', 'Barlow', 'Barlow Condensed', 'Archivo', 'Fira Sans', 'IBM Plex Sans', 'Josefin Sans', 'Kanit',
    'Quicksand', 'Cabin', 'Titillium Web', 'Exo 2', 'Red Hat Display', 'Sora', 'Space Grotesk', 'Public Sans', 'Be Vietnam Pro', 'Albert Sans',
    'Onest', 'Hanken Grotesk', 'Instrument Sans', 'Bricolage Grotesque', 'Epilogue', 'Syne', 'Chivo', 'Jost', 'Prompt', 'Archivo Narrow',
  ],
  serif: [
    'Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Noto Serif', 'Source Serif 4', 'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond', 'Crimson Pro',
    'Bitter', 'Arvo', 'Roboto Slab', 'Zilla Slab', 'DM Serif Display', 'Frank Ruhl Libre', 'Spectral', 'Prata', 'Fraunces', 'Newsreader',
    'Young Serif', 'Instrument Serif', 'Bodoni Moda', 'Cinzel', 'Alegreya', 'Vollkorn', 'IBM Plex Serif',
  ],
  display: [
    'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Alfa Slab One', 'Righteous', 'Lobster', 'Bungee', 'Black Ops One', 'Russo One',
    'Teko', 'Fjalla One', 'Passion One', 'Staatliches', 'Monoton', 'Orbitron', 'Audiowide', 'Michroma', 'Big Shoulders Display', 'Unbounded',
    'Chakra Petch', 'Rajdhani', 'Luckiest Guy', 'Bangers', 'Racing Sans One', 'Faster One', 'Oxanium', 'Abril Fatface',
  ],
  script: [
    'Dancing Script', 'Pacifico', 'Great Vibes', 'Caveat', 'Satisfy', 'Sacramento', 'Allura', 'Parisienne', 'Kaushan Script', 'Shadows Into Light',
    'Permanent Marker', 'Amatic SC', 'Indie Flower', 'Yellowtail', 'Alex Brush', 'Courgette', 'Kalam', 'Patrick Hand', 'Pinyon Script', 'Tangerine',
  ],
  mono: ['JetBrains Mono', 'Fira Code', 'Roboto Mono', 'Space Mono', 'IBM Plex Mono'],
  arabic: [
    'Noto Kufi Arabic', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Cairo', 'Tajawal', 'IBM Plex Sans Arabic', 'Almarai', 'Amiri', 'Changa', 'El Messiri',
    'Harmattan', 'Lateef', 'Markazi Text', 'Mada', 'Reem Kufi', 'Scheherazade New', 'Readex Pro', 'Alexandria', 'Vazirmatn', 'Aref Ruqaa',
    'Lalezar', 'Rakkas', 'Lemonada', 'Kufam', 'Baloo Bhaijaan 2',
  ],
};
