#!/usr/bin/env node
/* Squeeze Street logo, concept "squeeze": a lemon squeezed mid-burst, juice spraying out of its tip.
 *   node brand/concepts/squeeze/build.js   -> mark.svg, logo.svg, logo-horizontal.svg (+ preview.html)
 * Every shape is drawn as: ink outline layer (stroke behind the fill, so the outline sits outside the shape,
 * same as the game's -webkit-text-stroke title), then the flat fill, then highlights. One ink copy of all
 * outlines, offset straight down, is the hard drop shadow. Lettering is outlined from Bagel Fat One.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const T = require(path.join(ROOT, 'tools', 'ttf2svg.js'));
const FONT = T.load(path.join(ROOT, 'brand', 'fonts', 'BagelFatOne-Regular.ttf'));
const OUT = __dirname;

const C = {
  ink: '#1b1f3b', lemon: '#ffd83d', lemonDeep: '#f2ae00', lemonPale: '#fff4b8', cream: '#fffdf0',
  leaf: '#35c977', leafDeep: '#1c9655', white: '#ffffff', night: '#131a3a', sky: '#4cc3f0', skyDeep: '#2487d1',
};

/* ---- geometry helpers --------------------------------------------------- */
const r1 = (v) => Math.round(v * 10) / 10;
const P = (p) => r1(p[0]) + ' ' + r1(p[1]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]), unit = (a) => mul(a, 1 / len(a)), perp = (a) => [-a[1], a[0]];
const rot = (p, deg) => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const place = (pts, o) => pts.map((p) => add(rot(mul(p, o.s || 1), o.rot || 0), [o.x || 0, o.y || 0]));

/** closed Catmull-Rom through pts -> smooth cubic path */
function smooth(pts, closed = true) {
  const n = pts.length, at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = 'M' + P(pts[0]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += 'C' + P(add(p1, mul(sub(p2, p0), 1 / 6))) + ' ' + P(sub(p2, mul(sub(p3, p1), 1 / 6))) + ' ' + P(p2);
  }
  return d + (closed ? 'Z' : '');
}

/** lemon outline in local frame (axis along x, centred on 0): a = half length, b = half thickness.
 *  nub = tip length, pinch = how much the waist is squeezed in (0..1), squash > 1 flattens the belly. */
function lemonPts({ a, b, nub = 0.1, nubW = 0.2, nubBack, pinch = 0, pinchW = 0.5, taper = 0, n = 96 }) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n, c = Math.cos(t), s = Math.sin(t);
    const dTip = Math.min(t, 2 * Math.PI - t), dBack = Math.abs(t - Math.PI);
    let x = a * c, y = b * s * (1 - taper * c ** 6);                     // taper: shoulders slope into the tips
    x += a * nub * Math.exp(-((dTip / nubW) ** 2)) - a * (nubBack ?? nub) * Math.exp(-((dBack / nubW) ** 2));
    const dWaist = Math.min(Math.abs(t - Math.PI / 2), Math.abs(t - 1.5 * Math.PI));
    y *= 1 - pinch * Math.exp(-((dWaist / pinchW) ** 2));
    pts.push([x, y]);
  }
  return pts;
}

/** teardrop: round head of radius r at `head`, pointed tail at `tail` */
function drop(head, tail, r) {
  const L = len(sub(tail, head)), u = unit(sub(tail, head)), v = perp(u);
  const p1 = add(head, mul(v, r)), p2 = add(head, mul(v, -r));
  return 'M' + P(tail) +
    'C' + P(add(tail, add(mul(u, -L * 0.3), mul(v, r * 0.25)))) + ' ' + P(add(p1, mul(u, r * 0.75))) + ' ' + P(p1) +
    'A' + r1(r) + ' ' + r1(r) + ' 0 0 1 ' + P(p2) +
    'C' + P(add(p2, mul(u, r * 0.75))) + ' ' + P(add(tail, add(mul(u, -L * 0.3), mul(v, -r * 0.25)))) + ' ' + P(tail) + 'Z';
}

/** leaf from base to tip, half-width w, bent sideways by `bend` (fraction of length) */
function leaf(base, tip, w, bend = 0) {
  const L = len(sub(tip, base)), u = unit(sub(tip, base)), v = perp(u), at = (k, side) => add(add(base, mul(u, L * k)), mul(v, side + bend * L * Math.sin(Math.PI * k)));
  return {
    d: 'M' + P(base) + 'C' + P(at(0.12, w * 1.05)) + ' ' + P(at(0.62, w * 1.1)) + ' ' + P(tip) + 'C' + P(at(0.62, -w * 0.95)) + ' ' + P(at(0.12, -w * 0.9)) + ' ' + P(base) + 'Z',
    rib: 'M' + P(at(0.12, 0)) + 'Q' + P(at(0.5, w * 0.08)) + ' ' + P(at(0.82, 0)),
  };
}

/* ---- the mark ------------------------------------------------------------ *
 * Designed around the lemon's centre (0, 0); `bb` collects extreme points so a layout can fit it.
 * O = visible outline width in these design units. opt: fan (drops), tail, leaf, ang, shape. */
function markParts(O, opt = {}) {
  const bb = [];
  const ang = opt.ang ?? -30;                                              // lemon axis angle
  const shape = { a: 150, b: 104, nub: 0.12, nubW: 0.24, nubBack: 0.09, taper: 0.12, pinch: 0.08, pinchW: 0.5, ...opt.shape };
  const L = (x, y) => rot([x, y], ang);                                   // lemon-local point -> design
  const bodyPts = place(lemonPts(shape), { rot: ang });
  bb.push(...bodyPts);
  const tip = L(shape.a * 1.13, 0), axis = unit(tip);
  // inner (lit) body: shrunk and nudged up-left so a lemon-deep crescent shows on the lower right
  const lit = place(lemonPts({ ...shape, a: shape.a - 14, b: shape.b - 20 }), { x: -5, y: -11, rot: ang });
  const hl = place(lemonPts({ ...shape, a: shape.a * 0.64, b: shape.b * 0.6, n: 56 }).slice(30, 41), { x: -6, y: -8, rot: ang });

  // leaf sticks out of the stem end, to the left
  const [lb, lt, lw0, lbend] = opt.leaf || [[-0.85, -0.15], [-1.3, -1.45], 44, -0.1];
  const lfBase = L(shape.a * lb[0], shape.b * lb[1]), lfTip = L(shape.a * lt[0], shape.b * lt[1]);
  const lf = leaf(lfBase, lfTip, lw0, lbend);
  bb.push(lfTip, add(lfTip, [-lw0 * 0.6, 0]), add(lfTip, [0, -lw0 * 0.4]));

  // juice: bold drops flying off the tip. Each spec is [angle off axis, distance from tip, radius].
  const fan = (opt.fan || [[-54, 190, 30, -32], [-12, 218, 46, -6], [34, 188, 32, 24]]);   // + optional tail angle
  const tail = opt.tail || 2.6;
  // where the juice bursts from: the tip (along the axis) or a point on the lemon's top (src = [x, y] in lemon units)
  const srcAt = opt.src || [0.6, -0.85], src = L(shape.a * srcAt[0], shape.b * srcAt[1]);
  const base = rot([0, -1], opt.srcRot ?? 28);
  const drops = fan.map(([da, dist, r, tdir]) => {
    const dir = rot(base, da), head = add(src, mul(dir, dist)), back = tdir ? rot(base, tdir) : dir;
    bb.push(add(head, [r, 0]), add(head, [-r, 0]), add(head, [0, r]), add(head, [0, -r]));
    return { head, r, d: drop(head, add(head, mul(back, -r * tail)), r) };
  });
  return { O, bb, body: smooth(bodyPts), lit: smooth(lit), hl: smooth(hl, false), leaf: lf, drops };
}
const bbox = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };

const markSil = (m) => [m.leaf.d, m.body, ...m.drops.map((d) => d.d)].map((d) => `<path d="${d}"/>`).join('');
/** cream die-cut edge around the mark and its shadow (for dark grounds) */
function markEdge(m, shadowDy, edge) {
  const sil = markSil(m);
  return `<g fill="${C.cream}" stroke="${C.cream}" stroke-width="${r1(m.O * 2 + 2 * edge)}" stroke-linejoin="round">${sil}<g transform="translate(0 ${r1(shadowDy)})">${sil}</g></g>`;
}

function markSVG(m, shadowDy) {
  const W = m.O * 2;                                                     // outline stroke: only the outer half shows
  const sil = markSil(m);
  const ol = (d, fill, inner = '') => `<path d="${d}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${r1(W)}"/><path d="${d}" fill="${fill}"/>` + inner;
  return [
    `<g id="shadow" transform="translate(0 ${r1(shadowDy)})" fill="${C.ink}" stroke="${C.ink}" stroke-width="${r1(W)}" stroke-linejoin="round" stroke-linecap="round">${sil}</g>`,
    `<g id="leaf" stroke-linejoin="round" stroke-linecap="round">${ol(m.leaf.d, C.leaf, `<path d="${m.leaf.rib}" fill="none" stroke="${C.leafDeep}" stroke-width="${r1(m.O * 0.55)}"/>`)}</g>`,
    `<g id="lemon" stroke-linejoin="round" stroke-linecap="round">${ol(m.body, C.lemonDeep, `<path d="${m.lit}" fill="${C.lemon}"/><path d="${m.hl}" fill="none" stroke="${C.white}" stroke-width="${r1(m.O * 0.7)}"/>`)}</g>`,
    `<g id="juice" stroke-linejoin="round" stroke-linecap="round">${m.drops.map((dr) => ol(dr.d, C.lemon, `<circle cx="${r1(dr.head[0] - dr.r * 0.3)}" cy="${r1(dr.head[1] - dr.r * 0.32)}" r="${r1(dr.r * 0.24)}" fill="${C.white}"/>`)).join('')}</g>`,
  ].join('\n');
}

/** the mark fitted into a box: (x, y, w, h) in final units, visible outline O and shadow sh in final units */
function markIn(x, y, w, h, O, sh, opt = {}) {
  const b = bbox(markParts(1, opt).bb);
  const k = Math.min((w - 2 * O) / (b.x1 - b.x0), (h - 2 * O - sh) / (b.y1 - b.y0));
  const tx = x + (w - k * (b.x1 + b.x0)) / 2, ty = y + (h - sh - k * (b.y1 + b.y0)) / 2;
  const e = O + (opt.edge || 0), box = { x0: tx + k * b.x0 - e, y0: ty + k * b.y0 - e, x1: tx + k * b.x1 + e, y1: ty + k * b.y1 + e + sh };
  const m = markParts(O / k, opt), tf = `translate(${r1(tx)} ${r1(ty)}) scale(${+k.toFixed(4)})`;
  return {
    k, box,
    edge: opt.edge ? `<g id="mark-edge" transform="${tf}">${markEdge(m, sh / k, opt.edge / k)}</g>\n` : '',
    svg: `<g id="mark" transform="${tf}">\n${markSVG(m, sh / k)}\n</g>`,
  };
}

/* ---- wordmark ------------------------------------------------------------ */
const F = 200, WO = F * 0.085;                                           // em size, visible outline (= game title)
function word(text, x, y, kern) { return T.textPath(FONT, text, { size: F, x, y, kern }); }

/** juice drip hanging straight down from point A (global): top width w, neck half-width, bulb radius R, neck length len */
function dripPath(A, { w = 40, neck = 14, R = 26, len = 40 } = {}) {
  const c = [A[0], A[1] + len + R * 0.75];
  const side = (k) => [[k * w / 2, -26], [k * w / 2, -2], [k * (neck + 4), len * 0.45], [k * neck, len * 0.85]].map((p) => add(A, p));
  const pts = side(-1);
  for (let t = 150; t <= 390; t += 20) pts.push(add(c, [R * Math.cos((t * Math.PI) / 180), -R * Math.sin((t * Math.PI) / 180)]));
  pts.push(...side(1).reverse());
  return { d: smooth(pts), bottom: c[1] + R };
}

/** "Squeeze" over "Street", tilted; opt.indent = how far "Street" is pushed right (em);
 *  opt.drip = [x, y] point on the bottom of a letter of "Squeeze" (unrotated word units) where juice drips off */
function wordmarkSVG(x, y, tilt, opt = {}) {
  const w1 = word('Squeeze', 0, F, {}), w2 = word('Street', F * (opt.indent ?? 0.5), F * 1.86, {});
  const W = WO * 2, piv = [w1.width / 2, F];
  const G = (p) => add(add(rot(sub(p, piv), tilt), piv), [x, y]);        // word units -> logo units
  const g = (body) => `<g transform="translate(${x} ${y}) rotate(${tilt} ${r1(piv[0])} ${r1(piv[1])})">${body}</g>`;
  let drip = null, fall = null;
  if (opt.drip) {
    drip = dripPath(G(opt.drip), opt.dripShape);
    const fr = opt.fallR ?? 21, head = [G(opt.drip)[0], drip.bottom + WO * 2 + fr * 2.4];
    if (fr) fall = { head, r: fr, d: drop(head, sub(head, [0, fr * 2.4]), fr) };
  }
  const nums = (w1.d + w2.d).match(/-?[\d.]+/g).map(Number), pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push(G([nums[i], nums[i + 1]]));
  const b = bbox(pts), bottom = Math.max(b.y1, fall ? fall.head[1] + fall.r : drip ? drip.bottom : 0);
  const E = opt.edge || 0, box = { x0: b.x0 - WO - E, y0: b.y0 - WO - E, x1: b.x1 + WO + E, y1: bottom + WO * 2 + E };
  const extra = (drip ? `<path d="${drip.d}"/>` : '') + (fall ? `<path d="${fall.d}"/>` : '');
  const sil = g(`<path d="${w1.d}"/><path d="${w2.d}"/>`) + extra;
  const edgeG = E ? `<g id="wordmark-edge" fill="${C.cream}" stroke="${C.cream}" stroke-width="${r1(W + 2 * E)}" stroke-linejoin="round">${sil}<g transform="translate(0 ${r1(WO)})">${sil}</g></g>\n` : '';
  const inkAttr = `fill="${C.ink}" stroke="${C.ink}" stroke-width="${r1(W)}" stroke-linejoin="round"`;
  return {
    box,
    shadow: edgeG + `<g id="wordmark-shadow" transform="translate(0 ${r1(WO)})" ${inkAttr}>${sil}</g>`,
    body: `<g id="wordmark">\n<g id="wordmark-outline" ${inkAttr}>${sil}</g>\n` +
      g(`<path id="squeeze" d="${w1.d}" fill="${C.lemon}"/><path id="street" d="${w2.d}" fill="${C.cream}"/>`) +
      (drip ? `<path id="drip" d="${drip.d}" fill="${C.lemon}"/>` : '') +
      (fall ? `<path d="${fall.d}" fill="${C.lemon}"/><circle cx="${r1(fall.head[0] - fall.r * 0.3)}" cy="${r1(fall.head[1] - fall.r * 0.3)}" r="${r1(fall.r * 0.24)}" fill="${C.white}"/>` : '') + '\n</g>',
  };
}

/* ---- files --------------------------------------------------------------- */
const svg = (w, h, body, title, x0 = 0, y0 = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}">\n<title>${title}</title>\n${body}\n</svg>\n`;
const write = (name, s) => { fs.writeFileSync(path.join(OUT, name), s); console.log('wrote', name, (s.length / 1024).toFixed(1) + ' kB'); };

module.exports = { markIn, markParts, wordmarkSVG, svg, C, WO, F, write };
if (require.main === module) {
// mark.svg: 512 frame, thick outline so it holds up at 16-32 px
const MARK_O = 24, MARK_SH = 20;
write('mark.svg', svg(512, 512, markIn(16, 16, 480, 480, MARK_O, MARK_SH).svg, 'Squeeze Street'));

// favicon.svg: 16-32 px browser tabs. Just the lemon and leaf, heavier outline: at that size any drop reads as
// a duck's head, bee wings or a paw (tested), while the bare lemon stays a lemon.
write('favicon.svg', svg(512, 512, markIn(0, 0, 512, 512, 36, 26, { fan: [], ang: -34 }).svg, 'Squeeze Street'));

// lockups: the mark fitted in a box; its outline matches the lettering's
function lockup(name, box, words, markOpt = {}) {
  const wm = wordmarkSVG(words.x, words.y, -4, words), mk = markIn(...box, WO, WO, { edge: words.edge, ...markOpt });
  const pad = 6, x0 = Math.floor(Math.min(wm.box.x0, mk.box.x0) - pad), y0 = Math.floor(Math.min(wm.box.y0, mk.box.y0) - pad);
  const x1 = Math.ceil(Math.max(wm.box.x1, mk.box.x1) + pad), y1 = Math.ceil(Math.max(wm.box.y1, mk.box.y1) + pad);
  write(name, svg(x1 - x0, y1 - y0, mk.edge + wm.shadow + '\n' + wm.body + '\n' + mk.svg, 'Squeeze Street', x0, y0));
}
const Q = { indent: 1.45, drip: [219.5, 236], dripShape: { w: 37, neck: 15, R: 27, len: 30 } };   // juice drips off the q's tail
lockup('logo.svg', [200, 0, 620, 520], { x: 40, y: 430, ...Q });
lockup('logo-dark.svg', [200, 0, 620, 520], { x: 40, y: 430, ...Q, edge: 11 });                  // cream die-cut edge for dark grounds
lockup('logo-horizontal.svg', [0, 30, 540, 480], { x: 540, y: 90, ...Q });

// preview sheet: logo on lemon-pale, night and daytime sky; the mark at true pixel sizes on light and dark
const sizes = [128, 64, 32, 16];
const markCol = (bg, fg) => `<div class="marks" style="background:${bg};color:${fg}"><figure><img src="mark.svg" width="512" height="512"><figcaption>512</figcaption></figure><div class="col">` +
  sizes.map((n) => `<figure><img src="mark.svg" width="${n}" height="${n}"><figcaption>${n}</figcaption></figure>`).join('') + '</div><div class="col">' +
  [32, 16].map((n) => `<figure><img src="favicon.svg" width="${n}" height="${n}"><figcaption>${n} tab</figcaption></figure>`).join('') + '</div></div>';
fs.writeFileSync(path.join(OUT, 'preview.html'), `<!doctype html><meta charset="utf-8"><title>Squeeze Street logo preview</title>
<style>
body { margin: 0; width: 1600px; height: 1000px; display: grid; grid-template-rows: 460px 540px; font: 600 13px/1 system-ui, sans-serif; }
.row { display: flex; } .panel { flex: 1; display: flex; align-items: center; justify-content: center; } .panel img { height: 410px; } .panel img.wide { height: auto; width: 480px; }
.marks { flex: 1; display: flex; align-items: center; justify-content: center; gap: 40px; } .col { display: flex; flex-direction: column; align-items: center; gap: 18px; }
figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; } figcaption { opacity: .55; }
</style>
<div class="row">
<div class="panel" style="background:${C.lemonPale}"><img src="logo.svg"></div>
<div class="panel" style="background:${C.night}"><img src="logo-dark.svg"></div>
<div class="panel" style="background:linear-gradient(#2f86dc, #58b9f5 55%, #bfe9ff)"><img class="wide" src="logo-horizontal.svg"></div>
</div>
<div class="row">${markCol(C.cream, C.ink)}${markCol(C.night, C.cream)}</div>
`);
if (process.argv.includes('--png')) {                                   // node build.js --png  -> preview.png via tools/play.js
  const steps = path.join(require('os').tmpdir(), 'squeeze-preview-steps.json');
  fs.writeFileSync(steps, JSON.stringify([{ view: [1600, 1000], dpr: 1 }, { nav: 'file://' + path.join(OUT, 'preview.html') }, { wait: 400 }, { shot: 'preview' }]));
  require('child_process').execFileSync('node', [path.join(ROOT, 'tools', 'play.js'), steps, OUT], { stdio: 'inherit' });
}

// self-check: no <text>, no external refs, no filters/images
for (const f of ['mark.svg', 'favicon.svg', 'logo.svg', 'logo-dark.svg', 'logo-horizontal.svg']) {
  const s = fs.readFileSync(path.join(OUT, f), 'utf8');
  if (/<text|<image|<filter|href=|url\(/.test(s)) throw new Error(f + ': forbidden element');
}
}
