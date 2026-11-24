#!/usr/bin/env node
/* Squeeze Street logo, mascot concept: a cocky lemon in shades with a leaf quiff.
 *   node brand/concepts/mascot/build.js            -> mark.svg, logo.svg, logo-horizontal.svg, preview.html
 *   node brand/concepts/mascot/build.js --preview  -> also renders preview.png (headless Chrome via tools/play.js)
 * Every outline is the same visible ink weight: shapes get a centred stroke of width t drawn on top of their fill,
 * lettering gets an ink copy stroked at 2t underneath its fill (so counters stay open). Drop shadows are solid
 * ink copies moved straight down. No <text>, filters, gradients or external references.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const T = require(path.join(ROOT, 'tools', 'ttf2svg.js'));
const FONT = T.load(path.join(ROOT, 'brand', 'fonts', 'BagelFatOne-Regular.ttf'));
const OUT = __dirname;

const C = {
  ink: '#1b1f3b', lemon: '#ffd83d', lemonDeep: '#f2ae00', lemonPale: '#fff4b8', cream: '#fffdf0',
  leaf: '#35c977', leafDeep: '#1c9655', coral: '#ff6257', berry: '#ff5d8f', sky: '#4cc3f0', skyDeep: '#2487d1',
  white: '#ffffff', night: '#131a3a',
};
const r1 = (v) => Math.round(v * 10) / 10;
const fix = (d) => d.replace(/-?\d+\.\d+/g, (m) => String(r1(+m)));        // round path data to 0.1

/* ---- the lemon character, in its own frame: centre (0,0), about 470 x 470 with the leaf ---------- */
// body: a chubby lemon lying on its side with a nub at each end; rotated so the stem end points up-right
const A = 234, B = 178, H = 150, N = 30;   // nub tip, nub base, half height, nub half-thickness
const BODY = fix(`M${-A} 0C${-A} ${-N * 0.8} ${-B - 18} ${-N} ${-B} ${-N * 1.15}C${-B - 6} ${-H * 0.62} ${-B * 0.56} ${-H} 0 ${-H}` +
  `C${B * 0.56} ${-H} ${B + 6} ${-H * 0.62} ${B} ${-N * 1.15}C${B + 18} ${-N} ${A} ${-N * 0.8} ${A} 0` +
  `C${A} ${N * 0.8} ${B + 18} ${N} ${B} ${N * 1.15}C${B + 6} ${H * 0.62} ${B * 0.56} ${H} 0 ${H}` +
  `C${-B * 0.56} ${H} ${-B - 6} ${H * 0.62} ${-B} ${N * 1.15}C${-B - 18} ${N} ${-A} ${N * 0.8} ${-A} 0Z`);
const BODY_ROT = -20;
// lower-right shade crescent, upper-left shine and a few peel pores, in the body's frame
const SHADE = fix(`M${-B} ${N * 1.15}C${-B - 6} ${H * 0.62} ${-B * 0.56} ${H} 0 ${H}C${B * 0.56} ${H} ${B + 6} ${H * 0.62} ${B} ${N * 1.15}` +
  `C${B - 20} ${H * 0.62} ${B * 0.5} ${H - 30} 0 ${H - 30}C${-B * 0.5} ${H - 30} ${-B + 30} ${H * 0.66} ${-B} ${N * 1.15}Z`);
const SHINE = 'M-140 -70C-116 -106 -72 -124 -30 -127';
const PORES = [[-150, 34], [-132, 62], [150, 50], [126, 84], [160, 18]];
// character frame from here on (the face barely tilts: the head leans, the face stays readable)
// leaf quiff: grows from the stem nub and sweeps up and back over the head
const LEAF = 'M176 -70C256 -136 216 -268 34 -264C104 -238 108 -150 150 -90Z';
const LEAF_VEIN = 'M162 -104C178 -180 142 -232 78 -252';
// shades slid down the nose, eyes peering over them, one brow up: the look of a lemon who knows a deal
const EYE_L = 'M-110 4V-28Q-78 -46 -42 -30V4Z';
const EYE_R = 'M44 4V-36C44 -58 60 -68 78 -68C96 -68 112 -58 112 -36V4Z';
const LID_L = 'M-110 -28Q-78 -46 -42 -30';                 // heavy lid: half-closed, sly
const PUPILS = [[-66, -16, 13], [84, -22, 14]];
const BROW_L = 'M-110 -78Q-78 -88 -44 -76';
const BROW_R = 'M40 -94Q74 -118 110 -96';
const LENS_L = 'M-128 0H-22C-20 34 -38 50 -75 50C-112 50 -130 34 -128 0Z';
const LENS_R = 'M22 0H128C130 34 112 50 75 50C38 50 20 34 22 0Z';
const BRIDGE = 'M-26 4Q0 -6 26 4';
const ARMS = 'M-128 2L-158 -6M128 2L160 -8';
const GLINT = 'M-106 16l14 -9M-100 33l30 -20M44 16l14 -9M50 33l30 -20';
const MOUTH = 'M-64 74C-26 90 38 86 84 58C82 104 44 128 6 126C-32 124 -60 104 -64 74Z';
const TEETH = 'M-56 80C-22 94 38 90 78 66C78 72 76 78 73 84C38 102 -24 104 -52 92C-54 88 -56 84 -56 80Z';
const TONGUE = 'M-26 116C-12 100 28 96 46 108C30 124 -2 128 -26 116Z';

/** the character: t = visible outline, s = shadow drop. small: favicon cut, only what survives at 16-32 px */
function lemonChar(t, s, small) {
  t = r1(t); s = r1(s);
  const rot = (b) => `<g transform="rotate(${BODY_ROT})">${b}</g>`;
  const outline = (d) => `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${t}" stroke-linejoin="round"/>`;
  const silhouette = rot(`<path d="${BODY}"/>`) + `<path d="${LEAF}"/>`;
  const shadow = `<g id="shadow" transform="translate(0 ${s})" fill="${C.ink}" stroke="${C.ink}" stroke-width="${t}" stroke-linejoin="round">${silhouette}</g>`;
  const body = rot(`<g id="body"><path d="${BODY}" fill="${C.lemon}"/><path d="${SHADE}" fill="${C.lemonDeep}"/>` +
    (small ? '' : `<path d="${SHINE}" fill="none" stroke="${C.lemonPale}" stroke-width="${t * 1.1}" stroke-linecap="round"/>` +
    PORES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r1(t * 0.32)}" fill="${C.lemonDeep}"/>`).join('')) + outline(BODY) + '</g>');
  const leaf = `<g id="leaf"><path d="${LEAF}" fill="${C.leaf}"/><path d="${LEAF_VEIN}" fill="none" stroke="${C.leafDeep}" stroke-width="${t * 0.7}" stroke-linecap="round"/>${outline(LEAF)}</g>`;
  const ti = r1(t * 0.62);                                // inner detail lines are lighter than the contour
  if (small) {   // shades as one bold band and a white grin; eyes, brows, glints and pores would only be grey noise
    return { shadow, art: leaf + body + `<g id="face" transform="rotate(-4) translate(0 -6)" stroke="${C.ink}" stroke-width="${t}" stroke-linejoin="round">` +
      `<path d="${LENS_L}M-24 4H24" fill="${C.ink}"/><path d="${LENS_R}" fill="${C.ink}"/>` +
      `<path d="${MOUTH}" fill="${C.ink}" stroke-width="${ti}"/><path d="${TEETH}" fill="${C.white}" stroke="none"/></g>` };
  }
  const face = `<g id="face" transform="rotate(-4) translate(0 -6)" stroke="${C.ink}" stroke-width="${ti}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${EYE_L}" fill="${C.white}"/><path d="${EYE_R}" fill="${C.white}"/>` +
    PUPILS.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${C.ink}" stroke="none"/>`).join('') +
    `<path d="${LID_L}" fill="none" stroke-width="${t}"/><path d="${BROW_L}" fill="none" stroke-width="${t}"/><path d="${BROW_R}" fill="none" stroke-width="${t}"/>` +
    `<path d="${ARMS}" fill="none" stroke-width="${t * 0.8}"/><path d="${BRIDGE}" fill="none" stroke-width="${t * 0.8}"/>` +
    `<path d="${LENS_L}" fill="${C.ink}"/><path d="${LENS_R}" fill="${C.ink}"/>` +
    `<path d="${GLINT}" stroke="${C.white}" stroke-width="${r1(t * 0.42)}"/>` +
    `<path d="${MOUTH}" fill="${C.ink}"/><path d="${TEETH}" fill="${C.white}" stroke="none"/><path d="${TONGUE}" fill="${C.coral}" stroke="none"/>` +
    `<path d="${MOUTH}" fill="none"/></g>`;
  return { shadow, art: leaf + body + face };
}

/* ---- lettering ------------------------------------------------------------------------------ */
function bbox(d) {
  const n = d.match(/-?[\d.]+/g).map(Number), b = [1e9, 1e9, -1e9, -1e9];
  for (let i = 0; i < n.length; i += 2) { b[0] = Math.min(b[0], n[i]); b[1] = Math.min(b[1], n[i + 1]); b[2] = Math.max(b[2], n[i]); b[3] = Math.max(b[3], n[i + 1]); }
  return b;
}
/** a word as outlined paths, centred on (cx, baseline y) */
function word(text, size, cx, y, kern) {
  const w = T.textPath(FONT, text, { size, x: 0, y, tracking: -size * 0.02, kern }).width;
  return fix(T.textPath(FONT, text, { size, x: cx - w / 2, y, tracking: -size * 0.02, kern }).d);
}
/** stacked "Squeeze / Street" sticker: shadow, ink, fills. o = visible outline, s = shadow drop */
function wordmark(sq, st, o, s) {
  const ink = (d) => `<path d="${d}"/>`;
  return `<g id="wordmark-shadow" transform="translate(0 ${s})" fill="${C.ink}" stroke="${C.ink}" stroke-width="${o * 2}" stroke-linejoin="round">${ink(sq)}${ink(st)}</g>` +
    `<g id="wordmark-ink" fill="${C.ink}" stroke="${C.ink}" stroke-width="${o * 2}" stroke-linejoin="round">${ink(sq)}${ink(st)}</g>` +
    `<path id="squeeze" d="${sq}" fill="${C.lemon}"/><path id="street" d="${st}" fill="${C.cream}"/>`;
}
const svg = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
  `<title>${title}</title>${body.replace(/\d+\.\d{3,}/g, (m) => String(Math.round(m * 100) / 100))}</svg>\n`;

/* ---- mark.svg: square, heavy outline so it holds up as a 16 px tab icon ------------------------- */
{
  const k = 1.02, t = 24 / k, s = 14 / k;      // visible outline 24, drop 14, in the 512 box
  const L = lemonChar(t, s);
  fs.writeFileSync(path.join(OUT, 'mark.svg'), svg(512, 512, `<g transform="translate(256 303) scale(${k})">${L.shadow}${L.art}</g>`, 'Squeeze Street'));
}

/* ---- mark-small.svg: the favicon cut of the mark, for 32 px and below ---------------------------- */
{
  const k = 1, t = 30 / k, s = 16 / k;
  const L = lemonChar(t, s, true);
  fs.writeFileSync(path.join(OUT, 'mark-small.svg'), svg(512, 512, `<g transform="translate(256 301) scale(${k})">${L.shadow}${L.art}</g>`, 'Squeeze Street'));
}

/* ---- logo.svg: lemon peeking over the stacked words, which tilt like the game's title ----------- */
const SIZE = 200, O = 17, S = 16;                 // letter em size, visible outline, drop (logo units)
const KS = { Sq: 2, ue: -2, ee: -4, ez: -2, ze: -2 }, KT = { St: -4, tr: -2, re: -4, ee: -4, et: -2 };
{
  const W = 818, Hh = 856, k = 1.08;
  const L = lemonChar(O / k, S / k);
  const sq = word('Squeeze', SIZE, 0, 0, KS), st = word('Street', SIZE, 40, 168, KT);
  const words = `<g id="words" transform="translate(410 616) rotate(-4)">${wordmark(sq, st, O, S)}</g>`;
  const mark = `<g id="mark" transform="translate(426 318) scale(${k})">${L.shadow}${L.art}</g>`;
  fs.writeFileSync(path.join(OUT, 'logo.svg'), svg(W, Hh, mark + words, 'Squeeze Street'));
}

/* ---- logo-horizontal.svg: mark left, stacked words right (wide banners, landscape covers) ------- */
{
  const W = 1282, Hh = 507, k = 0.98;
  const L = lemonChar(O / k, S / k);
  const sq = word('Squeeze', SIZE, 0, 0, KS), st = word('Street', SIZE, 40, 168, KT);
  const words = `<g id="words" transform="translate(875 268) rotate(-4)">${wordmark(sq, st, O, S)}</g>`;
  const mark = `<g id="mark" transform="translate(250 292) scale(${k})">${L.shadow}${L.art}</g>`;
  fs.writeFileSync(path.join(OUT, 'logo-horizontal.svg'), svg(W, Hh, mark + words, 'Squeeze Street'));
}

/* ---- preview.html -> preview.png ------------------------------------------------------------ */
const panel = (bg, src, w) => `<div class="p" style="background:${bg}"><img src="${src}" style="width:${w}px"></div>`;
const img = (src, n) => `<img src="${src}" width="${n}" height="${n}">`;
const sizes = (bg, fg) => `<div class="sz" style="background:${bg};color:${fg}"><div class="row">${[128, 64, 32, 16].map((n) => img('mark.svg', n)).join('')}` +
  `<i></i>${img('mark-small.svg', 32)}${img('mark-small.svg', 16)}</div><p>mark.svg 128 / 64 / 32 / 16 &nbsp; | &nbsp; mark-small.svg 32 / 16</p></div>`;
fs.writeFileSync(path.join(OUT, 'preview.html'), `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1600px;height:1040px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:500px 540px;background:#fff}
.p{display:grid;place-items:center;overflow:hidden}.p img{display:block}
.marks{grid-column:1/4;display:grid;grid-template-columns:552px 552px 1fr}
.m{display:grid;place-items:center}.sz{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;height:50%;font:600 12px system-ui}
.row{display:flex;align-items:center;gap:22px}.row i{width:2px;height:64px;background:currentColor;opacity:.25}
</style>
${panel(C.lemonPale, "logo.svg", 430)}${panel(C.night, "logo.svg", 430)}${panel(`linear-gradient(${C.skyDeep},${C.sky} 65%,#c8ecfb)`, "logo.svg", 430)}
<div class="marks"><div class="m" style="background:${C.cream}"><img src="mark.svg" width="512" height="512"></div>
<div class="m" style="background:${C.night}"><img src="mark.svg" width="512" height="512"></div>
<div>${sizes(C.cream, C.ink)}${sizes(C.night, C.cream)}</div></div>
`);

if (process.argv.includes('--preview')) {
  const os = require('os'), steps = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ssprev-')), 'steps.json');
  fs.writeFileSync(steps, JSON.stringify([{ view: [1600, 1040], dpr: 1 }, { nav: 'file://' + path.join(OUT, 'preview.html') }, { wait: 400 }, { shot: 'preview' }]));
  require('child_process').execFileSync('node', [path.join(ROOT, 'tools', 'play.js'), steps, OUT], { stdio: 'inherit' });
}
// self-check: the deliverables are self-contained SVG (no text, filters, rasters or outside links)
for (const f of ['mark.svg', 'mark-small.svg', 'logo.svg', 'logo-horizontal.svg']) {
  const s = fs.readFileSync(path.join(OUT, f), 'utf8');
  if (/<text|<filter|<image|href=|NaN|undefined/.test(s)) throw new Error(f + ' is not self-contained');
}
