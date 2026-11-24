#!/usr/bin/env node
/* Squeeze Street logo: the S of "Squeeze" is cut through a lemon's peel.
 *   node brand/build.js          -> brand/logo.svg, logo-dark.svg, mark.svg, favicon.svg
 *   node brand/build.js --png    -> also brand/png/*.png, brand/logo-sheet.png, brand/options.png (headless Chrome, tools/play.js)
 * Lettering is Bagel Fat One outlined to paths by tools/ttf2svg.js. Sticker look, as in the game: one ink copy of every
 * silhouette dropped straight down (shadow), an ink outline (a fat round-joined stroke under the fills), flat fills,
 * light from the top left. Shapes are designed in local frames and placed with shape(); tune the numbers in LEMON / LOCKUP.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const T = require(path.join(ROOT, 'tools', 'ttf2svg.js'));
const font = T.load(path.join(__dirname, 'fonts', 'BagelFatOne-Regular.ttf'));
const OUT = process.env.OUT_DIR || __dirname; // TEMP

const C = {
  ink: '#1b1f3b', lemon: '#ffd83d', deep: '#f2ae00', pale: '#fff4b8', cream: '#fffdf0', leaf: '#35c977', leafDeep: '#1c9655',
  coral: '#ff6257', berry: '#ff5d8f', sky: '#4cc3f0', skyDeep: '#2487d1', grape: '#7a5cff', white: '#ffffff', night: '#131a3a',
};

/* ---- geometry ------------------------------------------------------------ */
const r1 = (v) => String(Math.round(v * 10) / 10);
const rad = (d) => (d * Math.PI) / 180;
const rot = ([x, y], deg) => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [x * c - y * s, x * s + y * c]; };
const place = (pts, k, deg, x, y) => pts.map((p) => { const q = rot(p, deg); return [x + k * q[0], y + k * q[1]]; });
const P = (p) => r1(p[0]) + ' ' + r1(p[1]);
/** round path data to 0.1 and drop the font's zero-length line segments */
const tidy = (d) => d.replace(/-?\d*\.?\d+(e-?\d+)?/g, (m) => r1(+m)).replace(/ -/g, '-')
  .replace(/(-[\d.]+|(?<![\d.-])[\d.]+)( ?)(-?[\d.]+)L\1\2\3(?![\d.])/g, '$1$2$3');
/** Catmull-Rom spline through pts as cubic path data */
function smooth(pts, closed) {
  const n = pts.length, at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = 'M' + P(pts[0]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), e = at(i + 2);
    d += 'C' + P([b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6]) + ' ' + P([c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6]) + ' ' + P(c);
  }
  return tidy(d + (closed ? 'Z' : ''));
}
/** every coordinate pair in path data (control points too, so boxes come out a little generous) */
const pairs = (d) => { const n = d.match(/-?\d*\.?\d+/g).map(Number), o = []; for (let i = 0; i < n.length; i += 2) o.push([n[i], n[i + 1]]); return o; };
function bbox(pts) {
  let b = [1e9, 1e9, -1e9, -1e9];
  for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
}
function inside(poly, [x, y]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(poly, [x, y]) {
  let m = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return m;
}

/* ---- the lemon-S ------------------------------------------------------- *
 * Local frame: the lemon's long axis on x, stem end at +x, body centre at 0,0, unit = half the tip-to-tip length.
 * The body is an ellipse; each end grows a smooth nub (a Gaussian bump), so it reads as a lemon, not a ball with a tail.
 */
const LEMON = Object.assign({
  a: 0.86, b: 0.66,                  // body half-length (shoulder to shoulder) and half-width
  stem: [0.13, 0.27],                // nub at the stem end (+x): [length, width in radians of the body angle]
  tip: [0.15, 0.23],                 // nub at the blossom end (-x)
  tilt: -32,                         // degrees, stem end up to the right
  sMargin: 0.085,                    // lemon left visible around the S (x R)
  sShift: [0.0, 0.02],               // S nudged off the lemon centre (x R), for optical centring
  shade: 0.11,                       // depth of the lemon-deep crescent along the underside (x R)
  erode: 0.4,                        // pith left all round the S cut (x outline width): thins the dark hole
  wall: 0.3,                         // the hole lifted this much more (x outline width), so the pith is deeper along the lower edges
  leaf: { at: [0.84, -0.2], angle: -68, len: 0.62 },
}, JSON.parse(process.env.LEMON || '{}')); // TEMP
function lemonLocal(n = 96) {
  const { a, b, stem, tip } = LEMON, pts = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n, dS = Math.min(t, 2 * Math.PI - t), dT = Math.abs(t - Math.PI);
    pts.push([a * Math.cos(t) + stem[0] * Math.exp(-((dS / stem[1]) ** 2)) - tip[0] * Math.exp(-((dT / tip[1]) ** 2)), b * Math.sin(t)]);
  }
  return pts;
}
const LEAF = [[0, 0], [0.16, -0.22], [0.42, -0.34], [0.72, -0.27], [1, 0], [0.72, 0.18], [0.4, 0.22], [0.15, 0.13]];
const VEIN = [[0.14, 0], [0.45, -0.05], [0.8, -0.03]];

/** glyph path data centred (ink box) on cx, cy */
function glyph(ch, size, cx, cy) {
  const b = bbox(pairs(T.textPath(font, ch, { size: 1000 }).d)).map((v) => v / 1000);
  return tidy(T.textPath(font, ch, { size, x: cx - (size * (b[0] + b[2])) / 2, y: cy - (size * (b[1] + b[3])) / 2 }).d);
}
/** largest S em size (x R) that keeps sMargin of lemon around it */
const S_FIT = (() => {
  const poly = place(lemonLocal(360), 1, LEMON.tilt, 0, 0), s = pairs(glyph('S', 1, LEMON.sShift[0], LEMON.sShift[1]));
  let lo = 0.5, hi = 2;
  for (let i = 0; i < 30; i++) {
    const k = (lo + hi) / 2;
    const ok = s.every((p) => { const q = [LEMON.sShift[0] + (p[0] - LEMON.sShift[0]) * k, LEMON.sShift[1] + (p[1] - LEMON.sShift[1]) * k]; return inside(poly, q) && edgeDist(poly, q) >= LEMON.sMargin; });
    ok ? (lo = k) : (hi = k);
  }
  return lo;
})();

/** a single-contour glyph's outline moved inward by dist (to thin the dark hole of the S), as smooth path data */
function erode(d, dist) {
  const tok = d.match(/[MLQZ]|-?\d*\.?\d+/g), pts = [];
  let i = 0, cur = null, contours = 0;
  while (i < tok.length) {
    const c = tok[i++], num = () => +tok[i++];
    if (c === 'M') { cur = [num(), num()]; pts.push(cur); contours++; }
    else if (c === 'L') { cur = [num(), num()]; pts.push(cur); }
    else if (c === 'Q') {
      const q = [num(), num()], e = [num(), num()];
      for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; pts.push([u * u * cur[0] + 2 * u * t * q[0] + t * t * e[0], u * u * cur[1] + 2 * u * t * q[1] + t * t * e[1]]); }
      cur = e;
    }
  }
  if (contours !== 1) throw new Error('erode() handles one contour, got ' + contours);
  // resample evenly, then push every point along its normal, towards the inside
  const step = Math.hypot(...bbox(pts).slice(2).map((v, k) => v - bbox(pts)[k])) / 260, even = [pts[0]];
  for (const p of pts.slice(1).concat([pts[0]])) {
    let last = even[even.length - 1], gap = Math.hypot(p[0] - last[0], p[1] - last[1]);
    while (gap >= step) { const t = step / gap; last = [last[0] + (p[0] - last[0]) * t, last[1] + (p[1] - last[1]) * t]; even.push(last); gap -= step; }
  }
  const n = even.length, nrm = (j) => { const a = even[(j - 1 + n) % n], b = even[(j + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  const j0 = even.reduce((m, p, j) => (p[0] > even[m][0] ? j : m), 0), sign = inside(even, [even[j0][0] + nrm(j0)[0], even[j0][1] + nrm(j0)[1]]) ? 1 : -1;
  return smooth(even.map((p, j) => [p[0] + sign * dist * nrm(j)[0], p[1] + sign * dist * nrm(j)[1]]).filter((_, j) => j % 2 === 0), true);
}

const use = (id, attrs) => `<use href="#${id}"${attrs ? ' ' + attrs : ''}/>`;
/**
 * the lemon-S centred on (cx, cy): R = half the lemon's length, o = ink outline width.
 * Returns a sticker part: { defs: {id: d}, outer: [silhouette ids], fill: markup drawn over the ink }.
 * opt.simple drops the pith band, shine and shade (for 16-32 px).
 */
function lemonS(cx, cy, R, o, opt = {}) {
  const L = LEMON, body = place(lemonLocal(), R, L.tilt, cx, cy);
  const loc = (p) => place([p], R, L.tilt, cx, cy)[0];
  const base = loc(L.leaf.at), lk = R * L.leaf.len;
  const sSize = R * S_FIT * (opt.sScale || 1), sc = [cx + R * L.sShift[0], cy + R * L.sShift[1]];
  const defs = {
    lemon: smooth(body, true),
    leaf: smooth(place(LEAF, lk, L.leaf.angle, base[0], base[1]), true),
    s: glyph('S', sSize, sc[0], sc[1]),
  };
  if (!opt.simple) defs.hole = erode(defs.s, o * L.erode);
  // shine: an arc just inside the lemon's upper-left edge
  const shine = smooth(place(lemonLocal(96).slice(58, 70).map(([x, y]) => [x * 0.8, y * 0.76]), R, L.tilt, cx, cy), false);
  const vein = smooth(place(VEIN, lk, L.leaf.angle, base[0], base[1]), false);
  const fill = opt.simple
    ? use('lemon', `fill="${C.lemon}"`) + use('leaf', `fill="${C.leaf}"`) + use('s', `fill="${C.ink}"`)
    : use('leaf', `fill="${C.leaf}"`) +
      `<path d="${vein}" fill="none" stroke="${C.leafDeep}" stroke-width="${r1(o * 0.62)}" stroke-linecap="round"/>` +
      // underside in shade: the lit lemon is the same shape lifted, clipped to the lemon
      `<clipPath id="lemon-clip">${use('lemon')}</clipPath>` +
      `<g clip-path="url(#lemon-clip)">${use('lemon', `fill="${C.deep}"`)}${use('lemon', `fill="${C.lemon}" transform="translate(0 ${r1(-R * L.shade)})"`)}</g>` +
      `<path d="${shine}" fill="none" stroke="${C.white}" stroke-width="${r1(o * 0.95)}" stroke-linecap="round"/>` +
      // the S cut: pith, then the dark hole lifted inside the S's own outline so a band of pith shows along its lower edges
      `<clipPath id="s-clip">${use('s')}</clipPath>` +
      `<g clip-path="url(#s-clip)">${use('s', `fill="${C.pale}"`)}${use('hole', `fill="${C.ink}" transform="translate(0 ${r1(-o * L.wall)})"`)}</g>`;
  return { defs, outer: ['lemon', 'leaf'], fill: `<g id="lemon-s">${fill}</g>`, sSize, body };
}

/* ---- words --------------------------------------------------------------- */
const F = 200, O = F * 0.085, DROP = F * 0.085;     // em size; outline and shadow drop as the title screen (.17em stroke, .085em drop)
function word(id, text, x, y, color, kern) {
  const t = T.textPath(font, text, { size: F, x, y, kern });
  return { defs: { [id]: tidy(t.d) }, outer: [id], fill: use(id, `fill="${color}"`), width: t.width };
}

/* ---- sticker writer ------------------------------------------------------ */
/**
 * parts as one sticker svg. o = outline width, drop = shadow offset straight down, deg = tilt, pad = margin around the ink.
 * edge > 0 adds a cream die-cut border that width around the ink and the shadow (for dark grounds).
 * size makes a size x size square with the drawing centred in it.
 */
function sticker(parts, { o, drop, deg = 0, pad = 6, edge = 0, size = 0 }) {
  const defs = Object.assign({}, ...parts.map((p) => p.defs)), outer = [].concat(...parts.map((p) => p.outer));
  const pts0 = [].concat(...outer.map((id) => pairs(defs[id]))), b0 = bbox(pts0), rx = (b0[0] + b0[2]) / 2, ry = (b0[1] + b0[3]) / 2;
  const b = bbox(pts0.map((p) => { const q = rot([p[0] - rx, p[1] - ry], deg); return [rx + q[0], ry + q[1]]; }));
  const e = o + edge + pad;
  let x0 = b[0] - e, y0 = b[1] - e, w = b[2] - b[0] + 2 * e, h = b[3] - b[1] + 2 * e + drop;
  if (size) {
    if (Math.max(w, h) > size + 0.5) throw new Error(`drawing (${Math.round(w)} x ${Math.round(h)}) does not fit in ${size}`);
    x0 -= (size - w) / 2; y0 -= (size - h) / 2; w = h = size;
  }
  w = Math.ceil(w); h = Math.ceil(h);
  const tilt = deg ? ` transform="rotate(${deg} ${r1(rx)} ${r1(ry)})"` : '';
  const sil = outer.map((id) => use(id)).join('');
  const blob = (color, width) => `fill="${color}" stroke="${color}" stroke-width="${r1(width)}" stroke-linejoin="round"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<title>Squeeze Street</title>
<defs>
${Object.entries(defs).map(([id, d]) => `<path id="${id}" d="${d}"/>`).join('\n')}
</defs>
<g transform="translate(${r1(-x0)} ${r1(-y0)})">
${edge ? `<g id="die-cut" ${blob(C.cream, 2 * (o + edge))}><g${tilt}>${sil}</g><g transform="translate(0 ${r1(drop)})"><g${tilt}>${sil}</g></g></g>\n` : ''}<g id="shadow" transform="translate(0 ${r1(drop)})" ${blob(C.ink, 2 * o)}><g${tilt}>${sil}</g></g>
<g${tilt}>
<g id="outline" ${blob(C.ink, 2 * o)}>${sil}</g>
<g id="fill">
${parts.map((p) => p.fill).join('\n')}
</g>
</g>
</g>
</svg>
`;
  return { svg, w, h };
}
const write = (file, s) => { fs.writeFileSync(path.join(OUT, file), s.svg); console.log(`wrote brand/${file} (${s.w} x ${s.h})`); return s; };

/* ---- the files ----------------------------------------------------------- */
// lockup: the lemon-S stands in for the capital S, its S a touch bigger than the cap height; "Street" stacked under
const LOCKUP = Object.assign({ sCap: 1.06, gap: 0.05, street: [0.42, 1.0], kernQ: {}, kernS: {}, tilt: -4 }, JSON.parse(process.env.LOCKUP || '{}')); // TEMP
const capS = 0.733 * F * LOCKUP.sCap, R = capS / (0.736 * S_FIT);   // 0.736 = ink height of Bagel's S per em
const lem = lemonS(0, -capS / 2 - R * LEMON.sShift[1], R, O);
const lemonRight = Math.max(...lem.body.filter((p) => p[1] > -F * 0.55 && p[1] < 0).map((p) => p[0]));
const qx = lemonRight + O + F * LOCKUP.gap - 0.023 * F;               // 0.023 = q's left side bearing
const queeze = word('queeze', 'queeze', qx, 0, C.lemon, LOCKUP.kernQ);
const street = word('street', 'Street', -R + F * LOCKUP.street[0], F * LOCKUP.street[1], C.cream, LOCKUP.kernS);
const lockup = [lem, queeze, street];
write('logo.svg', sticker(lockup, { o: O, drop: DROP, deg: LOCKUP.tilt }));
write('logo-dark.svg', sticker(lockup, { o: O, drop: DROP, deg: LOCKUP.tilt, edge: O * 0.6 }));

// mark.svg: the lemon-S alone in a 512 square, outline 24 and drop 20 so it holds from 512 down to 64
{
  const mo = 24, md = 20, probe = lemonS(0, 0, 100, mo), b = bbox([].concat(...probe.outer.map((id) => pairs(probe.defs[id]))));
  const k = (512 - 2 * (mo + 8) - md) / Math.max(b[2] - b[0], b[3] - b[1]);
  write('mark.svg', sticker([lemonS(0, 0, 100 * k, mo)], { o: mo, drop: md, size: 512 }));
}
// favicon.svg: 16-32 px tabs. Flat lemon, leaf and S, a heavier outline and a cream die-cut so it shows on dark tab bars
{
  const fo = 40, fd = 22, fe = 18, probe = lemonS(0, 0, 100, fo, { simple: true }), b = bbox([].concat(...probe.outer.map((id) => pairs(probe.defs[id]))));
  const k = (512 - 2 * (fo + fe + 2) - fd) / Math.max(b[2] - b[0], b[3] - b[1]);
  write('favicon.svg', sticker([lemonS(0, 0, 100 * k, fo, { simple: true, sScale: 1.04 })], { o: fo, drop: fd, edge: fe, pad: 0, size: 512 }));
}

// self-check: every file is self-contained (no text, raster, filters or outside links)
for (const f of ['logo.svg', 'logo-dark.svg', 'mark.svg', 'favicon.svg']) {
  const s = fs.readFileSync(path.join(OUT, f), 'utf8');
  if (/<text|<image|<filter|<style|href="(?!#)|url\((?!#)/.test(s)) throw new Error(f + ' is not self-contained');
}
console.log('S fit', S_FIT.toFixed(3), 'R', R.toFixed(1));
