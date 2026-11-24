#!/usr/bin/env node
/* Turn text set in a TrueType font into SVG path data, so a logo's lettering is plain shapes
 * that look the same everywhere (no font needed to view it). No dependencies.
 *   const T = require('./ttf2svg'); const f = T.load('brand/fonts/BagelFatOne-Regular.ttf');
 *   T.textPath(f, 'Squeeze', { size: 120, x: 0, y: 120, tracking: -10, kern: { Sq: -6 } }) -> { d, width }
 *   node tools/ttf2svg.js "Squeeze Street" [size] [font.ttf] > preview.svg
 * size is the em size in px; y is the baseline; tracking is extra px between letters;
 * kern maps a letter pair to extra px. Simple and composite glyf outlines, cmap formats 4 and 12.
 * shortcut: no GPOS kerning or ligatures (logos hand-tune spacing with `kern`); use fontTools if ever needed.
 */
'use strict';
const fs = require('fs');

function load(file) {
  const b = fs.readFileSync(file), u16 = (o) => b.readUInt16BE(o), i16 = (o) => b.readInt16BE(o), u32 = (o) => b.readUInt32BE(o);
  const tab = {};
  for (let i = 0, n = u16(4); i < n; i++) { const r = 12 + 16 * i; tab[b.toString('latin1', r, r + 4)] = u32(r + 8); }
  for (const t of ['head', 'maxp', 'hhea', 'hmtx', 'loca', 'glyf', 'cmap']) if (tab[t] === undefined) throw new Error('not a glyf TrueType font: no ' + t);
  const upm = u16(tab.head + 18), longLoca = i16(tab.head + 50) === 1, nGlyphs = u16(tab.maxp + 4), nH = u16(tab.hhea + 34);
  const ascender = i16(tab.hhea + 4), descender = i16(tab.hhea + 6);
  const loca = (g) => (longLoca ? u32(tab.loca + 4 * g) : 2 * u16(tab.loca + 2 * g));
  const adv = (g) => u16(tab.hmtx + 4 * Math.min(g, nH - 1));

  // character -> glyph id: prefer a full-Unicode (format 12) subtable, else BMP format 4
  let best = null;
  for (let i = 0, n = u16(tab.cmap + 2); i < n; i++) {
    const r = tab.cmap + 4 + 8 * i, pid = u16(r), eid = u16(r + 2), off = tab.cmap + u32(r + 4), fmt = u16(off);
    if (pid === 3 || pid === 0) { if (fmt === 12) best = { fmt, off }; else if (fmt === 4 && !best) best = { fmt, off }; }
  }
  if (!best) throw new Error('no usable cmap');
  function gid(cp) {
    const o = best.off;
    if (best.fmt === 12) {
      for (let i = 0, n = u32(o + 12); i < n; i++) { const r = o + 16 + 12 * i, s = u32(r), e = u32(r + 4); if (cp >= s && cp <= e) return u32(r + 8) + cp - s; }
      return 0;
    }
    const seg = u16(o + 6) / 2, ends = o + 14, starts = ends + 2 * seg + 2, deltas = starts + 2 * seg, ranges = deltas + 2 * seg;
    for (let i = 0; i < seg; i++) {
      if (cp > u16(ends + 2 * i)) continue;
      const s = u16(starts + 2 * i); if (cp < s) return 0;
      const ro = u16(ranges + 2 * i), d = i16(deltas + 2 * i);
      if (!ro) return (cp + d) & 0xffff;
      const g = u16(ranges + 2 * i + ro + 2 * (cp - s)); return g ? (g + d) & 0xffff : 0;
    }
    return 0;
  }

  /** glyph outline as contours of {x, y, on} in font units (y up) */
  function contours(g, depth) {
    if (g >= nGlyphs || depth > 8) return [];
    const start = loca(g), end = loca(g + 1);
    if (end <= start) return [];
    let o = tab.glyf + start;
    const nc = i16(o);
    o += 10;
    if (nc >= 0) {
      const endPts = []; for (let i = 0; i < nc; i++) endPts.push(u16(o + 2 * i));
      o += 2 * nc; o += 2 + u16(o);                         // skip instructions
      const n = nc ? endPts[nc - 1] + 1 : 0, flags = [];
      while (flags.length < n) { const f = b[o++]; flags.push(f); if (f & 8) for (let r = b[o++]; r > 0; r--) flags.push(f); }
      const xs = [], ys = [];
      for (const [arr, short, same] of [[xs, 2, 16], [ys, 4, 32]]) {
        let v = 0;
        for (let i = 0; i < n; i++) {
          const f = flags[i];
          if (f & short) { const d = b[o++]; v += f & same ? d : -d; } else if (!(f & same)) { v += i16(o); o += 2; }
          arr.push(v);
        }
      }
      const out = []; let s = 0;
      for (const e of endPts) { const c = []; for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) }); out.push(c); s = e + 1; }
      return out;
    }
    const out = []; let more = true;                         // composite: other glyphs, moved and scaled
    while (more) {
      const fl = u16(o), cg = u16(o + 2); o += 4;
      let dx, dy;
      if (fl & 1) { dx = i16(o); dy = i16(o + 2); o += 4; } else { dx = (b[o] << 24) >> 24; dy = (b[o + 1] << 24) >> 24; o += 2; }
      if (!(fl & 2)) { dx = 0; dy = 0; }                     // point-matching offsets: not used by display fonts like this
      let a = 1, bb = 0, c = 0, d = 1;
      const f2 = (p) => i16(p) / 16384;
      if (fl & 8) { a = d = f2(o); o += 2; } else if (fl & 0x40) { a = f2(o); d = f2(o + 2); o += 4; } else if (fl & 0x80) { a = f2(o); bb = f2(o + 2); c = f2(o + 4); d = f2(o + 6); o += 8; }
      for (const ct of contours(cg, depth + 1)) out.push(ct.map((p) => ({ x: a * p.x + c * p.y + dx, y: bb * p.x + d * p.y + dy, on: p.on })));
      more = !!(fl & 0x20);
    }
    return out;
  }

  /** SVG path data for glyph g, scaled by k (px per font unit), origin (x0, y0) at the baseline */
  function glyphPath(g, k, x0, y0) {
    const P = (p) => (x0 + p.x * k).toFixed(2) + ' ' + (y0 - p.y * k).toFixed(2), mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, on: true });
    let d = '';
    for (const c of contours(g, 0)) {
      const n = c.length;
      if (!n) continue;
      // start on the last point if on-curve, else the first, else between them (two off-curve points imply an on-curve midpoint)
      let next = c[0], cur = c[n - 1];
      d += 'M' + P(cur.on ? cur : next.on ? next : mid(cur, next));
      for (let i = 0; i < n; i++) {
        cur = next; next = c[(i + 1) % n];
        if (cur.on) d += 'L' + P(cur);
        else d += 'Q' + P(cur) + ' ' + P(next.on ? next : mid(cur, next));
      }
      d += 'Z';
    }
    return d;
  }
  return { upm, ascender, descender, gid, adv, glyphPath };
}

/** text -> { d, width } at the given em size; y is the baseline */
function textPath(font, text, opt) {
  opt = opt || {};
  const size = opt.size || 100, k = size / font.upm, kern = opt.kern || {}, tr = opt.tracking || 0;
  let x = opt.x || 0, d = '';
  const chars = Array.from(text);
  chars.forEach((ch, i) => {
    const g = font.gid(ch.codePointAt(0));
    d += font.glyphPath(g, k, x, opt.y || 0);
    x += font.adv(g) * k;
    if (i < chars.length - 1) x += tr + (kern[ch + chars[i + 1]] || 0);
  });
  return { d, width: x - (opt.x || 0) };
}

module.exports = { load, textPath };

if (require.main === module) {
  const text = process.argv[2] || 'Squeeze Street', size = Number(process.argv[3]) || 120;
  const font = load(process.argv[4] || require('path').join(__dirname, '..', 'brand', 'fonts', 'BagelFatOne-Regular.ttf'));
  const t = textPath(font, text, { size, x: 20, y: size });
  // self-check: every letter we asked for exists in the font and produced outline data
  for (const ch of new Set(text.replace(/\s/g, ''))) if (!font.gid(ch.codePointAt(0))) throw new Error('font has no glyph for ' + JSON.stringify(ch));
  if (!/^M[\d.\- ]+/.test(t.d)) throw new Error('no outline produced');
  process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(t.width + 40)}" height="${Math.ceil(size * 1.4)}"><path d="${t.d}" fill="#ffd83d" stroke="#1b1f3b" stroke-width="${size / 14}" paint-order="stroke" stroke-linejoin="round"/></svg>\n`);
}
