# Squeeze Street brand

The logo is the lemon mascot: a cool lemon with a leaf quiff, shades pushed down its nose and a raised brow, over "Squeeze Street" in Bagel Fat One (fonts/).

- `logo.svg` is the stacked logo (the default). `logo-horizontal.svg` is for wide spaces. `mark.svg` is the lemon alone, for 64 px and up. `mark-small.svg` is the favicon cut, for 32 px and below.
- `png/` holds transparent renders: logo-2048, mark-1024, mark-512, favicon-32 and favicon-16. The game's `favicon.svg` and `favicon-32.png` are the small mark.
- Two renders have a background: `png/logo-sky-2048.png` (the logo on the brand sky, 2048 x 2048) and `png/logo-scene-3840.png` (the logo over the game's title-screen street, 3840 x 2160).
- To rebuild, run `node brand/concepts/mascot/build.js`. It writes these SVGs, the favicon and `js/logo.js` (the animated title-screen cut). Add `--png` to also re-render the PNGs with headless Chrome.
- `concepts/` holds the other logo directions. The retired "Lemon S" finals are in `concepts/letter/final/`.
