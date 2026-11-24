#!/usr/bin/env node
/* Squeeze Street logo, concept "slice": a lemon cross-section whose segments radiate like a sun,
 * "Squeeze" arched over it, "Street" on a candy-striped lemonade-stand awning across its front.
 *   node brand/concepts/slice/build.js      -> mark.svg, logo.svg, logo-horizontal.svg, preview.html (this folder)
 * Render the preview sheet:  node tools/play.js brand/concepts/slice/preview.json brand/concepts/slice
 * Every element is a sticker: ink outline OUT (visible width LINE, drawn as a 2*LINE stroke under the fill)
 * and a hard ink shadow DROP px straight down. Lettering is Bagel Fat One outlined to paths by tools/ttf2svg.js.
 */
'use strict';
const fs = require('fs'), path = require('path');
const OUT = __dirname, ROOT = path.join(__dirname, '..', '..', '..');
const T = require(path.join(ROOT, 'tools', 'ttf2svg'));
const font = T.load(path.join(ROOT, 'brand', 'fonts', 'BagelFatOne-Regular.ttf'));

const INK = '#1b1f3b', LEMON = '#ffd83d', LEMON_DEEP = '#f2ae00', LEMON_PALE = '#fff4b8', CREAM = '#fffdf0',
  CORAL = '#ff6257', WHITE = '#ffffff';

/* ---- geometry helpers ------------------------------------------------ */
const r1 = (v) => Math.round(v * 10) / 10;
const P = (p) => r1(p[0]) + ' ' + r1(p[1]);
const poly = (pts) => 'M' + pts.map(P).join('L') + 'Z';
/** point at radius r, angle a (radians, 0 = straight up, clockwise) around (cx, cy) */
const at = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
/** rewrite every "x y" pair in path data (ttf2svg emits absolute M/L/Q/Z only) */
const mapPath = (d, f) => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (m, x, y) => P(f(+x, +y)));
const pairs = (d) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);

/** Polar "bend": flat coords (u along the line, r = radius from the bend centre) -> page coords.
 *  s = +1 bends over the top of the centre (a rainbow), s = -1 hangs below it (a smile). u is arc length at radius rm. */
const bend = (cx, cy, s, rm) => (u, r) => [cx + r * Math.sin(u / rm), cy - s * r * Math.cos(u / rm)];

/** a word set on an arc: baseline radius rb, letters upright to the arc (each glyph rotated rigidly round its own
 *  centre, `warp` 0..1 mixes in a true polar warp that fans the letters). Returns path data. */
function arcWord(text, o) {
  const { size, cx, cy, s, rb } = o, tracking = o.tracking || 0, kern = o.kern || {}, warp = o.warp || 0;
  const rm = rb + s * size * 0.26;                       // measure spacing at mid x-height, where the eye reads it
  const glyphs = [];
  let x = 0;
  Array.from(text).forEach((ch, i, a) => {
    const g = T.textPath(font, ch, { size, x: 0, y: 0 });
    glyphs.push({ g, x });
    x += g.width + (i < a.length - 1 ? tracking + (kern[ch + a[i + 1]] || 0) : 0);
  });
  const total = x, f = bend(cx, cy, s, rm);
  return glyphs.map(({ g, x }) => {
    const uc = x + g.width / 2 - total / 2, phi = uc / rm, base = at(cx, cy, s * rb, s * phi);
    const right = [Math.cos(phi), s * Math.sin(phi)], up = [s * Math.sin(phi), -Math.cos(phi)];
    return mapPath(g.d, (gx, gy) => {
      const du = gx - g.width / 2, h = -gy;
      const rigid = [base[0] + du * right[0] + h * up[0], base[1] + du * right[1] + h * up[1]];
      const bent = f(uc + du, rb + s * h);
      return [rigid[0] + (bent[0] - rigid[0]) * warp, rigid[1] + (bent[1] - rigid[1]) * warp];
    });
  }).join('');
}

/* ---- sticker layering -------------------------------------------------- */
/** shadow + ink outline + fill for one silhouette; `inner` is painted on top of the fill */
function sticker(id, shape, fill, inner, st) {
  return `<g id="${id}">` +
    `<g transform="translate(0 ${st.drop})" fill="${INK}" stroke="${INK}" stroke-width="${st.line * 2}" stroke-linejoin="round">${shape('')}</g>` +
    `<g stroke="${INK}" stroke-width="${st.line * 2}" stroke-linejoin="round">${shape(` fill="${INK}"`)}</g>` +
    shape(` fill="${fill}"`) + (inner || '') + '</g>';
}
const circle = (cx, cy, r) => (attr) => `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"${attr}/>`;
const pathShape = (d) => (attr) => `<path d="${d}"${attr}/>`;

/* ---- the lemon wheel --------------------------------------------------- */
/** fills inside radius R, over a lemon-deep base disc: rind (lemon, leaving a deep crescent low right), cream pith, n rounded segments, gloss */
function wheelInner(cx, cy, R, o) {
  const n = o.n, t = R * o.shade, rp = R * o.pith, rs = R * o.flesh, gap = R * o.gap, rc = R * o.round;
  let s = `<circle cx="${r1(cx - t / 2.83)}" cy="${r1(cy - t / 2.83)}" r="${r1(R - t / 2)}" fill="${LEMON}"/>` +
    `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(rp)}" fill="${CREAM}"/>`;
  let seg = '';
  const e = gap / 2 + rc, ro = rs - rc, h = Math.PI / n, d = Math.asin(e / ro);
  for (let i = 0; i < n; i++) {
    const a = (o.rot || 0) + i * 2 * h, apex = at(cx, cy, e / Math.sin(h), a);
    seg += 'M' + P(apex) + 'L' + P(at(cx, cy, ro, a - h + d)) + `A${r1(ro)} ${r1(ro)} 0 0 1 ` + P(at(cx, cy, ro, a + h - d)) + 'Z';
  }
  s += `<path id="segments" d="${seg}" fill="${LEMON}" stroke="${LEMON}" stroke-width="${r1(rc * 2)}" stroke-linejoin="round"/>`;
  if (o.gloss) {                                          // white gloss on the rind, upper left
    const rg = (R + rp) / 2, a0 = -Math.PI * 0.42, a1 = -Math.PI * 0.2;
    s += `<path d="M${P(at(cx, cy, rg, a0))}A${r1(rg)} ${r1(rg)} 0 0 1 ${P(at(cx, cy, rg, a1))}" fill="none" stroke="${WHITE}" stroke-width="${r1((R - rp) * o.gloss)}" stroke-linecap="round"/>`;
  }
  return s;
}

/* ---- the awning ribbon ------------------------------------------------- */
/** striped band hanging on a smile arc, scalloped bottom edge. Flat coords: u in [-len/2, len/2], r in [rt, rt + hgt] */
function awning(o) {
  const { cx, cy, rt, hgt, len, k, sc } = o, rm = rt + hgt / 2, f = bend(cx, cy, -1, rm), sw = len / k;
  const edge = (u0, u1, r, steps) => { const pts = []; for (let i = 0; i <= steps; i++) pts.push(f(u0 + (u1 - u0) * i / steps, r)); return pts; };
  const scallop = (u0) => { const pts = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * i / 12; pts.push(f(u0 + sw / 2 + Math.cos(a) * sw / 2, rt + hgt + Math.sin(a) * sc)); } return pts; };
  const u0 = -len / 2;
  // silhouette: top edge left->right, then scallops right->left
  let sil = edge(u0, -u0, rt, 48);
  for (let i = k - 1; i >= 0; i--) sil = sil.concat(scallop(u0 + i * sw));
  let white = '';
  for (let i = 1; i < k; i += 2) white += poly(edge(u0 + i * sw, u0 + (i + 1) * sw, rt, 4).concat(scallop(u0 + i * sw)));
  return { sil: poly(sil), white };
}

/* ---- documents --------------------------------------------------------- */
function bbox(svgBody) {
  const xs = [], ys = [];
  for (const m of svgBody.matchAll(/d="([^"]+)"/g)) for (const [x, y] of pairs(m[1])) { xs.push(x); ys.push(y); }
  for (const m of svgBody.matchAll(/cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)) { xs.push(+m[1] - +m[3], +m[1] + +m[3]); ys.push(+m[2] - +m[3], +m[2] + +m[3]); }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function doc(title, body, vb) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(r1).join(' ')}" role="img" aria-labelledby="t">` +
    `<title id="t">${title}</title>\n${body}\n</svg>\n`;
}

/* MARK: the wheel alone, sized for a 16 px tab icon up to 512 px. Heavier line than the logo, bigger segments. */
const MARK = { n: 6, shade: 0.14, pith: 0.78, flesh: 0.7, gap: 0.14, round: 0.04, rot: Math.PI / 6, gloss: 0.42 };
function buildMark(M = MARK) {
  const st = { line: 14, drop: 14 }, R = 100, cx = 128, cy = 121;
  const body = sticker('lemon-slice', circle(cx, cy, R), LEMON_DEEP, wheelInner(cx, cy, R, M), st);
  return doc('Squeeze Street', body, [0, 0, 256, 256]);
}

/* LOGO (stacked emblem) */
const LOGO = {
  line: 12, drop: 14, R: 225, wheel: { gap: 0.11, gloss: 0.4 },          // thinner membranes than the 16 px mark
  top: { text: 'Squeeze', size: 160, gap: -40, arc: 440, tracking: -4, warp: 0.35, kern: {} },
  band: { y: 92, radius: 620, hgt: 128, pad: 46, k: 9, sc: 26 },
  low: { text: 'Street', size: 132, base: 0.86, tracking: 0, warp: 0.35, kern: {} },
};
function buildLogo(L) {
  const st = { line: L.line, drop: L.drop }, R = L.R, cx = 0, cy = 0;
  const wheel = sticker('lemon-slice', circle(cx, cy, R), LEMON_DEEP, wheelInner(cx, cy, R, { ...MARK, ...L.wheel }), st);
  // "Squeeze" rides a flatter arc than the rind (centre below the wheel's), so its ends stay readable
  const top = arcWord(L.top.text, { ...L.top, cx, cy: cy - R - L.line - L.top.gap + L.top.arc, s: 1, rb: L.top.arc });
  const squeeze = sticker('squeeze', pathShape(top), LEMON, '', st);
  const B = L.band, bcy = B.y - B.radius;
  const streetW = T.textPath(font, L.low.text, { size: L.low.size, tracking: L.low.tracking }).width;
  const a = awning({ cx, cy: bcy, rt: B.radius, hgt: B.hgt, len: streetW + 2 * B.pad, k: B.k, sc: B.sc });
  const ribbon = sticker('awning', pathShape(a.sil), CORAL, `<path d="${a.white}" fill="${WHITE}"/>`, st);
  const low = arcWord(L.low.text, { ...L.low, cx, cy: bcy, s: -1, rb: B.radius + B.hgt * L.low.base });
  const street = sticker('street', pathShape(low), CREAM, '', st);
  const body = [wheel, squeeze, ribbon, street].join('\n');
  const [x0, y0, x1, y1] = bbox(body), m = L.line + 8;
  return doc('Squeeze Street', body, [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m + L.drop]);
}

/* LOGO, horizontal: the whole wheel on the left, the words beside it tilted like the game's title */
const HORIZ = {
  line: 12, drop: 14, R: 172, x0: 120, tilt: -4,
  top: { text: 'Squeeze', size: 156, y: -12, tracking: -4, kern: {} },
  band: { y: 26, radius: 2600, hgt: 122, pad: 34, k: 11, sc: 24 },
  low: { text: 'Street', size: 124, base: 0.86, tracking: 0, kern: {} },
};
function buildHorizontal(H) {
  const st = { line: H.line, drop: H.drop }, R = H.R, FAR = 1e5;
  const wheel = sticker('lemon-slice', circle(0, 0, R), LEMON_DEEP, wheelInner(0, 0, R, { ...MARK, gloss: 0.4 }), st);
  const wTop = T.textPath(font, H.top.text, H.top).width, mid = H.x0 + wTop / 2;
  const spin = (d) => { const a = H.tilt * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return mapPath(d, (x, y) => [mid + (x - mid) * c - (y - 40) * s, 40 + (x - mid) * s + (y - 40) * c]); };
  const top = spin(arcWord(H.top.text, { ...H.top, cx: mid, cy: H.top.y + FAR, s: 1, rb: FAR }));
  const B = H.band, a = awning({ cx: mid, cy: B.y - B.radius, rt: B.radius, hgt: B.hgt, len: wTop + 2 * B.pad, k: B.k, sc: B.sc });
  const ribbon = sticker('awning', pathShape(spin(a.sil)), CORAL, `<path d="${spin(a.white)}" fill="${WHITE}"/>`, st);
  const low = spin(arcWord(H.low.text, { ...H.low, cx: mid, cy: B.y - B.radius, s: -1, rb: B.radius + B.hgt * H.low.base }));
  const body = [ribbon, wheel, sticker('squeeze', pathShape(top), LEMON, '', st), sticker('street', pathShape(low), CREAM, '', st)].join('\n');
  const [x0, y0, x1, y1] = bbox(body), m = H.line + 8;
  return doc('Squeeze Street', body, [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m + H.drop]);
}

module.exports = { buildMark, buildLogo, buildHorizontal, MARK, LOGO, HORIZ };
if (require.main !== module) return;

const files = { 'mark.svg': buildMark(), 'logo.svg': buildLogo(LOGO), 'logo-horizontal.svg': buildHorizontal(HORIZ) };
for (const [name, svg] of Object.entries(files)) {
  // self-check against the brief's hard rules
  if (/<text|<image|<filter|href=|url\(/.test(svg)) throw new Error(name + ': forbidden element or reference');
  if (!/viewBox="[-\d. ]+"/.test(svg) || /NaN/.test(svg)) throw new Error(name + ': bad geometry');
  fs.writeFileSync(path.join(OUT, name), svg);
  console.log(name, (svg.length / 1024).toFixed(1) + ' KB');
}

/* preview sheet: logo on three grounds, mark at true pixel sizes on light and dark (1600 x 1000, dpr 1) */
const sizes = [128, 64, 32, 16];
const row = (bg, fg) => `<div class="row" style="background:${bg};color:${fg}">` +
  sizes.map((z) => `<figure><img src="mark.svg" width="${z}" height="${z}"><figcaption>${z}</figcaption></figure>`).join('') + '</div>';
fs.writeFileSync(path.join(OUT, 'preview.html'), `<!doctype html><meta charset="utf-8"><title>slice preview</title>
<style>
*{box-sizing:border-box;margin:0} body{width:1600px;height:1000px;display:grid;grid-template-columns:560px 1fr;font:600 13px/1 system-ui,sans-serif;overflow:hidden}
.col{display:grid} .left{grid-template-rows:560px 1fr 1fr} .right{grid-template-rows:520px 480px;grid-template-columns:1fr 1fr}
.cell{display:grid;place-items:center;position:relative;overflow:hidden} .cell img{height:440px;max-width:94%;object-fit:contain} .pair{display:flex;align-items:center;gap:56px} .pale .pair img:first-child{height:450px} .pale .pair img:last-child{height:auto;width:440px}
.big{background:linear-gradient(90deg,#fff4b8 50%,#131a3a 50%)} .big img{width:512px;height:512px;max-width:none;max-height:none}
.row{display:flex;align-items:flex-end;justify-content:space-around;padding:0 20px 22px} figure{display:grid;justify-items:center;gap:8px} figcaption{opacity:.6}
.pale{background:#fff4b8;grid-column:1/3} .night{background:#131a3a} .sky{background:linear-gradient(#1560d4,#2e85ea 40%,#5cabf5 63%,#98cffa 83%,#d0e9fc)}
.tag{position:absolute;left:14px;top:12px;opacity:.55}
</style>
<div class="col left"><div class="cell big"><img src="mark.svg"><span class="tag" style="color:#1b1f3b">512</span></div>${row('#fffdf0', '#1b1f3b')}${row('#131a3a', '#fff4b8')}</div>
<div class="col right"><div class="cell pale"><div class="pair"><img src="logo.svg"><img src="logo-horizontal.svg"></div></div><div class="cell night"><img src="logo.svg"></div><div class="cell sky"><img src="logo.svg"></div></div>
`);
fs.writeFileSync(path.join(OUT, 'preview.json'), JSON.stringify([{ view: [1600, 1000], dpr: 1 }, { nav: 'brand/concepts/slice/preview.html' }, { wait: 300 }, { shot: 'preview' }]));
