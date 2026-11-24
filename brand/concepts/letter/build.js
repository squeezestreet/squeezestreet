#!/usr/bin/env node
/* Squeeze Street logo, "letter" concept: the S of Squeeze is punched through a lemon's peel.
 *   node brand/concepts/letter/build.js   -> mark.svg, logo.svg, logo-horizontal.svg (next to this file)
 * Lettering is Bagel Fat One outlined to paths by tools/ttf2svg.js. The sticker look, as in the game:
 * an ink copy dropped straight down (shadow), an ink outline (a fat round-joined stroke under the fill), flat fills.
 * Tweak MARK (the lemon-S) and the layout numbers in the "files" section at the bottom.
 */
'use strict';
const fs = require('fs'), path = require('path');
const T = require('../../../tools/ttf2svg');
const font = T.load(path.join(__dirname, '../../fonts/BagelFatOne-Regular.ttf'));
const OUT = __dirname;

const C = { ink: '#1b1f3b', lemon: '#ffd83d', deep: '#f2ae00', pale: '#fff4b8', cream: '#fffdf0', leaf: '#35c977', leafDeep: '#1c9655' };

/* ---- helpers --------------------------------------------------------- */
const r1 = (v) => String(Math.round(v * 10) / 10);
/** round every number in path data to 0.1 and drop the font's zero-length line segments */
const tidy = (d) => d.replace(/-?\d*\.?\d+(e-?\d+)?/g, (m) => r1(+m)).replace(/ -/g, '-')
  .replace(/(-[\d.]+|(?<![\d.-])[\d.]+)( ?)(-?[\d.]+)L\1\2\3(?![\d.])/g, '$1$2$3');
/** path data from [cmd, x, y, ...] in a local frame: scaled by k, rotated by deg, moved to (x, y); open = no Z */
function shape(cmds, k, deg, x, y, open) {
  const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
  const P = (px, py) => r1(x + k * (px * c - py * s)) + ' ' + r1(y + k * (px * s + py * c));
  return tidy(cmds.map(([op, ...p]) => op + p.reduce((o, v, i) => (i % 2 ? o : o + (i ? ' ' : '') + P(v, p[i + 1])), '')).join('') + (open ? '' : 'Z'));
}
/** [x0, y0, x1, y1] of path data (control points included, so a little generous), optionally rotated deg about (rx, ry) */
function bbox(ds, deg, rx, ry) {
  const c = Math.cos((deg || 0) * Math.PI / 180), s = Math.sin((deg || 0) * Math.PI / 180);
  rx = rx || 0; ry = ry || 0;
  let b = [1e9, 1e9, -1e9, -1e9];
  for (const d of ds) {
    const n = d.match(/-?\d*\.?\d+/g).map(Number);
    for (let i = 0; i < n.length; i += 2) {
      const x = rx + (n[i] - rx) * c - (n[i + 1] - ry) * s, y = ry + (n[i] - rx) * s + (n[i + 1] - ry) * c;
      b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    }
  }
  return b;
}
/** a glyph as path data with its ink box centred on (cx, cy) */
function centred(ch, size, cx, cy) {
  const b = bbox([T.textPath(font, ch, { size: 1000 }).d]).map((v) => v / 1000);
  return tidy(T.textPath(font, ch, { size, x: cx - size * (b[0] + b[2]) / 2, y: cy - size * (b[1] + b[3]) / 2 }).d);
}

/* ---- shapes (local frames, y down) ----------------------------------- */
// the game's lemon (js/icons.js LEMON) normalised, nubs drawn out a little so the silhouette says lemon at 16px:
// long axis on x (tips at +-1.07), body 0.69 tall
const LEMON = [
  ['M', -1.07, 0], ['C', -1.07, -0.09, -0.93, -0.14, -0.78, -0.17], ['C', -0.64, -0.51, -0.33, -0.69, 0, -0.69],
  ['C', 0.33, -0.69, 0.64, -0.51, 0.78, -0.17], ['C', 0.93, -0.14, 1.07, -0.09, 1.07, 0],
  ['C', 1.07, 0.09, 0.93, 0.14, 0.78, 0.17], ['C', 0.64, 0.51, 0.33, 0.69, 0, 0.69],
  ['C', -0.33, 0.69, -0.64, 0.51, -0.78, 0.17], ['C', -0.93, 0.14, -1.07, 0.09, -1.07, 0],
];
// the shaded crescent along the lemon's underside
const SHADE = [
  ['M', -0.78, 0.17], ['C', -0.55, 0.42, -0.3, 0.5, 0, 0.5], ['C', 0.3, 0.5, 0.55, 0.42, 0.78, 0.17],
  ['C', 0.64, 0.51, 0.33, 0.69, 0, 0.69], ['C', -0.33, 0.69, -0.64, 0.51, -0.78, 0.17],
];
const SHINE = [['M', -0.6, -0.36], ['C', -0.45, -0.5, -0.28, -0.56, -0.1, -0.58]];
// leaf: base at 0,0, tip at 1,0
const LEAF = [['M', 0, 0], ['C', 0.25, -0.42, 0.7, -0.42, 1, 0], ['C', 0.7, 0.42, 0.25, 0.42, 0, 0]];
const VEIN = [['M', 0.18, 0], ['C', 0.4, -0.04, 0.6, -0.04, 0.78, 0]];

/* ---- sticker parts: { defs: {id: d}, outer: [ids that make the silhouette], fill: markup over the ink } ---- */
const use = (id, attrs) => `<use href="#${id}"${attrs ? ' ' + attrs : ''}/>`;

/**
 * the lemon-S, centred on (cx, cy). R = half the lemon's length, o = ink outline width outside the fill.
 * tilt: lemon angle; sScale: S size / R; wall: depth of the pith band under the S strokes (x o); leafAngle, leafLen (x R)
 */
function lemonS(p, cx, cy, R, o, opt) {
  const { tilt, sScale, wall, leafAngle, leafLen } = opt;
  const a = tilt * Math.PI / 180, lk = R * leafLen;
  // the leaf grows from the stem end (local 0.9, -0.12)
  const bx = cx + R * (0.9 * Math.cos(a) + 0.12 * Math.sin(a)), by = cy + R * (0.9 * Math.sin(a) - 0.12 * Math.cos(a));
  const defs = {
    [p + 'lemon']: shape(LEMON, R, tilt, cx, cy),
    [p + 'leaf']: shape(LEAF, lk, leafAngle, bx, by),
    [p + 's']: centred('S', R * sScale, cx, cy),
  };
  const fill = `<g id="${p}lemon-fill">` +
    use(p + 'lemon', `fill="${C.lemon}"`) +
    `<path d="${shape(SHADE, R, tilt, cx, cy)}" fill="${C.deep}"/>` +
    `<path d="${shape(SHINE, R, tilt, cx, cy, true)}" fill="none" stroke="${C.cream}" stroke-width="${r1(o * 0.9)}" stroke-linecap="round"/>` +
    use(p + 'leaf', `fill="${C.leaf}"`) +
    `<path d="${shape(VEIN, lk, leafAngle, bx, by, true)}" fill="none" stroke="${C.leafDeep}" stroke-width="${r1(o * 0.7)}" stroke-linecap="round"/>` +
    // the S hole: pith, then ink lifted a little inside the S's own outline so a band of pith shows along the lower edges
    `<clipPath id="${p}s-cut">${use(p + 's')}</clipPath>` +
    use(p + 's', `fill="${C.pale}"`) +
    `<g clip-path="url(#${p}s-cut)">${use(p + 's', `fill="${C.ink}" transform="translate(0 ${r1(-o * wall)})"`)}</g>` +
    '</g>';
  return { defs, outer: [p + 'lemon', p + 'leaf'], fill };
}

/** a word as a sticker part */
function word(id, text, size, x, y, color, tracking) {
  const t = T.textPath(font, text, { size, x, y, tracking });
  return { defs: { [id]: tidy(t.d) }, outer: [id], fill: use(id, `fill="${color}"`), width: t.width };
}

/**
 * write parts as one sticker svg: tilted deg, cropped to the ink plus pad (or centred in a size x size square).
 * o = outline width outside the fill, drop = shadow offset straight down
 */
function write(file, parts, o, drop, deg, pad, size) {
  const defs = Object.assign({}, ...parts.map((p) => p.defs)), outer = [].concat(...parts.map((p) => p.outer));
  const ds = outer.map((id) => defs[id]), b0 = bbox(ds), rx = (b0[0] + b0[2]) / 2, ry = (b0[1] + b0[3]) / 2;
  const b = bbox(ds, deg, rx, ry);
  let w = b[2] - b[0] + 2 * (o + pad), h = b[3] - b[1] + 2 * (o + pad) + drop, x0 = b[0] - o - pad, y0 = b[1] - o - pad;
  if (size) {
    if (Math.max(w, h) > size) throw new Error(file + ' does not fit in ' + size);
    x0 -= (size - w) / 2; y0 -= (size - h) / 2; w = h = size;
  }
  w = Math.ceil(w); h = Math.ceil(h);
  const ink = `fill="${C.ink}" stroke="${C.ink}" stroke-width="${r1(2 * o)}" stroke-linejoin="round"`;
  const silhouette = outer.map((id) => use(id)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<title>Squeeze Street</title>
<defs>
${Object.entries(defs).map(([id, d]) => `<path id="${id}" d="${d}"/>`).join('\n')}
</defs>
<g transform="translate(${r1(-x0)} ${r1(-y0)})${deg ? ` rotate(${deg} ${r1(rx)} ${r1(ry)})` : ''}">
<g id="shadow" transform="translate(0 ${r1(drop)})" ${ink}>${silhouette}</g>
<g id="outline" ${ink}>${silhouette}</g>
<g id="fill">
${parts.map((p) => p.fill).join('\n')}
</g>
</g>
</svg>
`;
  fs.writeFileSync(path.join(OUT, file), svg);
  return [w, h];
}

/* ---- the files ----------------------------------------------------------- */
const MARK = { tilt: -38, sScale: 1.3, wall: 0.5, leafAngle: -55, leafLen: 0.58 };
const F = 200, o = F * 0.085, drop = F * 0.08;   // lettering em size, outline and shadow drop (as the title screen: .17em stroke, .085em drop)

// mark.svg, the icon: the lemon grows until its ink (outline + shadow + 6px pad) fills the 512 square
{
  const mo = 24, mdrop = 20, b = bbox(Object.values(lemonS('', 0, 0, 100, mo, MARK).defs).slice(0, 2));
  const R = Math.floor((512 - 2 * (mo + 6) - mdrop) / Math.max(b[2] - b[0], b[3] - b[1]) * 100);
  write('mark.svg', [lemonS('', 0, 0, R, mo, MARK)], mo, mdrop, 0, 6, 512);
}

// the lemon-S sits on the baseline (y = 0) with the S as tall as a capital; "queeze" follows it
const R = 160, sH = 0.733 * MARK.sScale * R;   // 0.733 = cap height of Bagel Fat One's S
const lemon = lemonS('', 0, -sH / 2, R, o, MARK);
const queeze = word('queeze', 'queeze', F, R * 0.86, 0, C.lemon, -4);

// logo.svg: stacked like the title screen, Street tucked under the lemon's right half, the whole thing tilted -4deg
write('logo.svg', [lemon, queeze, word('street', 'Street', F, R * 0.62, F * 0.98, C.cream, -4)], o, drop, -4, 8);
// logo-horizontal.svg: one line, for banners and wide headers
write('logo-horizontal.svg', [lemon, queeze, word('street', 'Street', F, R * 0.86 + queeze.width + F * 0.26, 0, C.cream, -4)], o, drop, -2, 8);

// self-check: the files are self-contained (no text, raster, filters or outside links)
for (const f of ['mark.svg', 'logo.svg', 'logo-horizontal.svg']) {
  const s = fs.readFileSync(path.join(OUT, f), 'utf8');
  if (/<text|<image|<filter|href="(?!#)|url\((?!#)/.test(s)) throw new Error(f + ' is not self-contained');
}
console.log('wrote mark.svg, logo.svg, logo-horizontal.svg');
