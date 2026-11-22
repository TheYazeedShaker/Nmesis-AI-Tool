# The editor's fonts

The canvas editor's font catalogue: 155 families, 17.0 MB of WOFF2, every one under the SIL Open Font Licence 1.1 or the Apache Licence 2.0. The Studio serves the files itself (`public/fonts/<id>/`, each family's licence file beside its fonts), so no person's browser asks a font service for anything, and `check:ui` fails on any request to one. Built by `node scripts/fonts/build-catalogue.mjs` from the official open font repository (the families are listed in `scripts/fonts/families.mjs`); the manifest is `lib/editor/font-catalogue.json`. This list is written by the same build.

| Family | Kind | Writes | Weights | Licence | Source |
|---|---|---|---|---|---|
| Inter | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/inter) |
| Roboto | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/roboto) |
| Open Sans | Sans serif | Latin | 300–800 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/opensans) |
| Lato | Sans serif | Latin | 100, 200, 300, 400, 500, 600, 700, 800, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/lato) |
| Montserrat | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/montserrat) |
| Poppins | Sans serif | Latin | 100, 200, 300, 400, 500, 600, 700, 800, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/poppins) |
| Raleway | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/raleway) |
| Nunito | Sans serif | Latin | 200–1000 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/nunito) |
| Nunito Sans | Sans serif | Latin | 200–1000 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/nunitosans) |
| Work Sans | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/worksans) |
| Rubik | Sans serif | Latin, Arabic | 300–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/rubik) |
| Noto Sans | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/notosans) |
| Source Sans 3 | Sans serif | Latin | 200–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/sourcesans3) |
| PT Sans | Sans serif | Latin | 400, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/ptsans) |
| Mulish | Sans serif | Latin | 200–1000 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/mulish) |
| Outfit | Sans serif | Latin | 100–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/outfit) |
| Manrope | Sans serif | Latin | 200–800 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/manrope) |
| DM Sans | Sans serif | Latin | 100–1000 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/dmsans) |
| Plus Jakarta Sans | Sans serif | Latin | 200–800 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/plusjakartasans) |
| Figtree | Sans serif | Latin | 300–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/figtree) |
| Urbanist | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/urbanist) |
| Lexend | Sans serif | Latin | 100–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/lexend) |
| Karla | Sans serif | Latin | 200–800 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/karla) |
| Barlow | Sans serif | Latin | 100, 200, 300, 400, 500, 600, 700, 800, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/barlow) |
| Barlow Condensed | Sans serif | Latin | 100, 200, 300, 400, 500, 600, 700, 800, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/barlowcondensed) |
| Archivo | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/archivo) |
| Fira Sans | Sans serif | Latin | 100, 200, 300, 400, 500, 600, 700, 800, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/firasans) |
| IBM Plex Sans | Sans serif | Latin | 100–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/ibmplexsans) |
| Josefin Sans | Sans serif | Latin | 100–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/josefinsans) |
| Kanit | Sans serif | Latin | 100, 200, 300, 400, 500, 600, 700, 800, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/kanit) |
| Quicksand | Sans serif | Latin | 300–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/quicksand) |
| Cabin | Sans serif | Latin | 400–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/cabin) |
| Titillium Web | Sans serif | Latin | 200, 300, 400, 600, 700, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/titilliumweb) |
| Exo 2 | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/exo2) |
| Red Hat Display | Sans serif | Latin | 300–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/redhatdisplay) |
| Sora | Sans serif | Latin | 100–800 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/sora) |
| Space Grotesk | Sans serif | Latin | 300–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/spacegrotesk) |
| Public Sans | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/publicsans) |
| Be Vietnam Pro | Sans serif | Latin | 100, 200, 300, 400, 500, 600, 700, 800, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/bevietnampro) |
| Albert Sans | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/albertsans) |
| Onest | Sans serif | Latin | 100–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/onest) |
| Hanken Grotesk | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/hankengrotesk) |
| Instrument Sans | Sans serif | Latin | 400–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/instrumentsans) |
| Bricolage Grotesque | Sans serif | Latin | 200–800 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque) |
| Epilogue | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/epilogue) |
| Syne | Sans serif | Latin | 400–800 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/syne) |
| Chivo | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/chivo) |
| Jost | Sans serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/jost) |
| Prompt | Sans serif | Latin | 100, 200, 300, 400, 500, 600, 700, 800, 900, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/prompt) |
| Archivo Narrow | Sans serif | Latin | 400–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/archivonarrow) |
| Playfair Display | Serif | Latin | 400–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/playfairdisplay) |
| Merriweather | Serif | Latin | 300–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/merriweather) |
| Lora | Serif | Latin | 400–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/lora) |
| PT Serif | Serif | Latin | 400, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/ptserif) |
| Noto Serif | Serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/notoserif) |
| Source Serif 4 | Serif | Latin | 200–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/sourceserif4) |
| Libre Baskerville | Serif | Latin | 400–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/librebaskerville) |
| EB Garamond | Serif | Latin | 400–800 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/ebgaramond) |
| Cormorant Garamond | Serif | Latin | 300–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) |
| Crimson Pro | Serif | Latin | 200–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/crimsonpro) |
| Bitter | Serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/bitter) |
| Arvo | Serif | Latin | 400, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/arvo) |
| Roboto Slab | Serif | Latin | 100–900 (variable) | Apache-2.0 | [folder](https://github.com/google/fonts/tree/main/apache/robotoslab) |
| Zilla Slab | Serif | Latin | 300, 400, 500, 600, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/zillaslab) |
| DM Serif Display | Serif | Latin | 400, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/dmserifdisplay) |
| Frank Ruhl Libre | Serif | Latin | 300–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/frankruhllibre) |
| Spectral | Serif | Latin | 200, 300, 400, 500, 600, 700, 800, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/spectral) |
| Prata | Serif | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/prata) |
| Fraunces | Serif | Latin | 100–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/fraunces) |
| Newsreader | Serif | Latin | 200–800 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/newsreader) |
| Young Serif | Serif | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/youngserif) |
| Instrument Serif | Serif | Latin | 400, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/instrumentserif) |
| Bodoni Moda | Serif | Latin | 400–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/bodonimoda) |
| Cinzel | Serif | Latin | 400–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/cinzel) |
| Alegreya | Serif | Latin | 400–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/alegreya) |
| Vollkorn | Serif | Latin | 400–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/vollkorn) |
| IBM Plex Serif | Serif | Latin | 100, 200, 300, 400, 500, 600, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/ibmplexserif) |
| Oswald | Display | Latin | 200–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/oswald) |
| Bebas Neue | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/bebasneue) |
| Anton | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/anton) |
| Archivo Black | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/archivoblack) |
| Alfa Slab One | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/alfaslabone) |
| Righteous | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/righteous) |
| Lobster | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/lobster) |
| Bungee | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/bungee) |
| Black Ops One | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/blackopsone) |
| Russo One | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/russoone) |
| Teko | Display | Latin | 300–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/teko) |
| Fjalla One | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/fjallaone) |
| Passion One | Display | Latin | 400, 700, 900 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/passionone) |
| Staatliches | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/staatliches) |
| Monoton | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/monoton) |
| Orbitron | Display | Latin | 400–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/orbitron) |
| Audiowide | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/audiowide) |
| Michroma | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/michroma) |
| Big Shoulders Display | Display | Latin | 100–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/bigshouldersdisplay) |
| Unbounded | Display | Latin | 200–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/unbounded) |
| Chakra Petch | Display | Latin | 300, 400, 500, 600, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/chakrapetch) |
| Rajdhani | Display | Latin | 300, 400, 500, 600, 700 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/rajdhani) |
| Luckiest Guy | Display | Latin | 400 | Apache-2.0 | [folder](https://github.com/google/fonts/tree/main/apache/luckiestguy) |
| Bangers | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/bangers) |
| Racing Sans One | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/racingsansone) |
| Faster One | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/fasterone) |
| Oxanium | Display | Latin | 200–800 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/oxanium) |
| Abril Fatface | Display | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/abrilfatface) |
| Dancing Script | Script | Latin | 400–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/dancingscript) |
| Pacifico | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/pacifico) |
| Great Vibes | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/greatvibes) |
| Caveat | Script | Latin | 400–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/caveat) |
| Satisfy | Script | Latin | 400 | Apache-2.0 | [folder](https://github.com/google/fonts/tree/main/apache/satisfy) |
| Sacramento | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/sacramento) |
| Allura | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/allura) |
| Parisienne | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/parisienne) |
| Kaushan Script | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/kaushanscript) |
| Shadows Into Light | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/shadowsintolight) |
| Permanent Marker | Script | Latin | 400 | Apache-2.0 | [folder](https://github.com/google/fonts/tree/main/apache/permanentmarker) |
| Amatic SC | Script | Latin | 400, 700 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/amaticsc) |
| Indie Flower | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/indieflower) |
| Yellowtail | Script | Latin | 400 | Apache-2.0 | [folder](https://github.com/google/fonts/tree/main/apache/yellowtail) |
| Alex Brush | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/alexbrush) |
| Courgette | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/courgette) |
| Kalam | Script | Latin | 300, 400, 700 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/kalam) |
| Patrick Hand | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/patrickhand) |
| Pinyon Script | Script | Latin | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/pinyonscript) |
| Tangerine | Script | Latin | 400, 700 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/tangerine) |
| JetBrains Mono | Monospace | Latin | 100–800 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono) |
| Fira Code | Monospace | Latin | 300–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/firacode) |
| Roboto Mono | Monospace | Latin | 100–700 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/robotomono) |
| Space Mono | Monospace | Latin | 400, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/spacemono) |
| IBM Plex Mono | Monospace | Latin | 100, 200, 300, 400, 500, 600, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/ibmplexmono) |
| Noto Kufi Arabic | Sans serif | Latin, Arabic | 100–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/notokufiarabic) |
| Noto Naskh Arabic | Serif | Latin, Arabic | 400–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/notonaskharabic) |
| Noto Sans Arabic | Sans serif | Latin, Arabic | 100–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/notosansarabic) |
| Cairo | Sans serif | Latin, Arabic | 200–1000 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/cairo) |
| Tajawal | Sans serif | Latin, Arabic | 200, 300, 400, 500, 700, 800, 900 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/tajawal) |
| IBM Plex Sans Arabic | Sans serif | Latin, Arabic | 100, 200, 300, 400, 500, 600, 700 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/ibmplexsansarabic) |
| Almarai | Sans serif | Latin, Arabic | 300, 400, 700, 800 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/almarai) |
| Amiri | Serif | Latin, Arabic | 400, 700, italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/amiri) |
| Changa | Sans serif | Latin, Arabic | 200–800 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/changa) |
| El Messiri | Sans serif | Latin, Arabic | 400–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/elmessiri) |
| Harmattan | Sans serif | Latin, Arabic | 400, 500, 600, 700 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/harmattan) |
| Lateef | Serif | Latin, Arabic | 200, 300, 400, 500, 600, 700, 800 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/lateef) |
| Markazi Text | Serif | Latin, Arabic | 400–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/markazitext) |
| Mada | Sans serif | Latin, Arabic | 200–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/mada) |
| Reem Kufi | Sans serif | Latin, Arabic | 400–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/reemkufi) |
| Scheherazade New | Serif | Latin, Arabic | 400, 500, 600, 700 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/scheherazadenew) |
| Readex Pro | Sans serif | Latin, Arabic | 160–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/readexpro) |
| Alexandria | Sans serif | Latin, Arabic | 100–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/alexandria) |
| Vazirmatn | Sans serif | Latin, Arabic | 100–900 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/vazirmatn) |
| Aref Ruqaa | Serif | Latin, Arabic | 400, 700 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/arefruqaa) |
| Lalezar | Sans serif | Latin, Arabic | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/lalezar) |
| Rakkas | Display | Latin, Arabic | 400 | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/rakkas) |
| Lemonada | Display | Latin, Arabic | 300–700 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/lemonada) |
| Kufam | Sans serif | Latin, Arabic | 400–900 (variable), italic | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/kufam) |
| Baloo Bhaijaan 2 | Display | Latin, Arabic | 400–800 (variable) | OFL-1.1 | [folder](https://github.com/google/fonts/tree/main/ofl/baloobhaijaan2) |
