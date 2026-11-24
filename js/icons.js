/* Squeeze Street — icons.js
 * SS.ICONS: icon name -> inline SVG string (viewBox 0 0 48 48), used through SS.icon(name).
 * One sticker family: 3px ink outlines, round caps and joins, flat fills, light from the top left.
 * No ids, defs, gradients, filters, clip-paths or <text>, so an icon can repeat any number of times in a page.
 * Colour icons use fixed palette colours ('drink' tints its liquid with currentColor);
 * control icons (play, pause, close, ...) are drawn entirely in currentColor.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var SS = (root.SS = root.SS || {});

  /* palette (plus tints and shades of it) */
  var K = '#1b1f3b', W = '#fff', WS = '#dfe2f2',
    Y = '#ffd83d', YD = '#f2ae00', YP = '#fff4b8',
    G = '#35c977', GD = '#1c9655', GP = '#bff0d5',
    C = '#ff6257', CD = '#d83a30',
    B = '#ff5d8f', BD = '#d83a6e',
    S = '#4cc3f0', SD = '#2487d1', SP = '#cdeefc',
    V = '#7a5cff', VD = '#5a3fd9',
    O = '#c98a4b', OD = '#96602e', OP = '#e6b684',
    T = '#c9cde6', TD = '#9299c4',
    SKIN = '#f6d2a9', SKIN2 = '#b3753f';

  /* ---- tiny markup builders ------------------------------------------ */
  function n(v) { return String(Math.round(v * 10) / 10); }
  function a(k, v) { return v == null || v === '' ? '' : ' ' + k + '="' + v + '"'; }
  /** outlined path (the root <svg> supplies the ink stroke) */
  function p(d, fill) { return '<path d="' + d + '"' + a('fill', fill) + '/>'; }
  /** fill only */
  function f(d, fill, op) { return '<path d="' + d + '" fill="' + fill + '" stroke="none"' + a('opacity', op) + '/>'; }
  /** stroke only */
  function l(d, col, w, op) { return '<path d="' + d + '"' + a('stroke', col) + a('stroke-width', w) + a('opacity', op) + '/>'; }
  function c(x, y, r, fill) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + a('fill', fill) + '/>'; }
  function cf(x, y, r, fill, op) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '" stroke="none"' + a('opacity', op) + '/>'; }
  function co(x, y, r, col, w, op) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + a('stroke', col) + a('stroke-width', w) + a('opacity', op) + '/>'; }
  function r(x, y, w, h, rx, fill) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + a('rx', rx) + a('fill', fill) + '/>'; }
  function rf(x, y, w, h, rx, fill, op) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + a('rx', rx) + ' fill="' + fill + '" stroke="none"' + a('opacity', op) + '/>'; }
  function g(tf, body) { return '<g transform="' + tf + '">' + body + '</g>'; }
  /** nudge a whole drawing (optical centring) without changing its stroke weight */
  function mv(x, y, body) { return g('translate(' + x + ' ' + y + ')', body); }
  /** fill, then inner detail, then the outline on top so shading can hug the edge */
  function o(d, fill, inner) { return f(d, fill) + (inner || '') + l(d); }
  /** white highlight stroke / translucent ink shade */
  function hi(d, w, op) { return l(d, W, w || 2.5, op || 0.7); }
  function sh(d, op) { return f(d, K, op || 0.14); }
  /** an outlined coloured line (handles, straws, raindrops) */
  function tube(d, col, w) { return l(d, K, w + 6) + l(d, col, w); }
  /** outlined disc with a shade crescent on the lower right, t = crescent thickness */
  function disc(x, y, rad, fill, shade, t) {
    t = t || 3;
    return c(x, y, rad, shade) + cf(n(x - t / 2.83), n(y - t / 2.83), n(rad - 1.5 - t / 2), fill);
  }
  /** star / sunburst polygon: k points, outer radius R, inner radius q */
  function burst(x, y, k, R, q, rot) {
    var d = '', i, ang, rad;
    for (i = 0; i < k * 2; i++) {
      ang = (rot || 0) + Math.PI * i / k - Math.PI / 2; rad = i % 2 ? q : R;
      d += (i ? 'L' : 'M') + n(x + rad * Math.cos(ang)) + ' ' + n(y + rad * Math.sin(ang));
    }
    return d + 'z';
  }
  /** striped, scalloped canopy: top edge xt0..xt1 at yt, bottom edge xb0..xb1 at yb, k scallops */
  function canopy(xt0, xt1, yt, xb0, xb1, yb, k, ry, c1, c2) {
    var tw = (xt1 - xt0) / k, bw = (xb1 - xb0) / k, i,
      arc = 'a' + n(bw / 2) + ' ' + ry + ' 0 0 1 ' + n(-bw) + ' 0',
      all = 'M' + xt0 + ' ' + yt + 'H' + xt1 + 'L' + xb1 + ' ' + yb, stripes = '', val = 'M' + xb1 + ' ' + yb;
    for (i = 0; i < k; i++) { all += arc; val += arc; }
    for (i = 1; i < k; i += 2) stripes += 'M' + n(xt0 + i * tw) + ' ' + yt + 'h' + n(tw) + 'L' + n(xb0 + (i + 1) * bw) + ' ' + yb + arc + 'z';
    return f(all + 'z', c1) + f(stripes, c2) + sh(val + 'z', 0.12) + l(all + 'z');
  }
  var HEAD = '<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round" ';
  function col(body) { return HEAD + 'stroke="' + K + '" stroke-width="3">' + body + '</svg>'; }
  function mono(body, w) { return HEAD + 'stroke="currentColor" stroke-width="' + (w || 5) + '">' + body + '</svg>'; }
  var CC = ' fill="currentColor"';

  var I = {};

  /* ==================================================================== *
   * 1. Full-colour item icons
   * ==================================================================== */

  /* ---- ingredients ---- */
  var LEMON = 'M-19.5 0c0-2 2-3.2 4.2-3.6C-12.5-10-6.5-13.5 0-13.5S12.5-10 15.3-3.6c2.2.4 4.2 1.6 4.2 3.6s-2 3.2-4.2 3.6C12.5 10 6.5 13.5 0 13.5S-12.5 10-15.3 3.6C-17.5 3.2-19.5 2-19.5 0z';
  I.lemon = col(
    p('M39 18.5C39.5 10.5 34 5 25 5.5c-.5 8 4.5 13.5 14 13z', G) +
    l('M36 15.5q-3.5-4.5-7.5-6.5', GD, 2) +
    g('translate(23 28) rotate(-30)', o(LEMON, Y,
      f('M-15.3 3.6C-12.5 10-6.5 13.5 0 13.5S12.5 10 15.3 3.6C11 8 6 9.5 0 9.5S-11 8-15.3 3.6z', YD) +
      hi('M-9-7q4-2.5 9-2.5'))));

  I.lemonSlice = col(
    disc(24, 24, 19.5, Y, YD, 3) + cf(23.5, 23.5, 14, YP) + cf(23.5, 23.5, 11.5, Y) +
    l('M23.5 12v23M13.5 17.8l20 11.5M13.5 29.2l20-11.5', YP, 2.5) + cf(23.5, 23.5, 2.2, YP) + hi('M8.6 18A16 16 0 0 1 18 8.6', 2, 0.6));

  I.sugar = col(
    p('M17.5 14l-4-8c3.5 1.6 7 1.6 10.5 0 3.5 1.6 7 1.6 10.5 0l-4 8z', WS) +
    o('M17 13.5C9.5 18 6 26 6 33c0 7 5.5 10.5 18 10.5S42 40 42 33c0-7-3.5-15-11-19.5z', W,
      sh('M31 13.5c7.5 4.5 11 12.5 11 19.5 0 7-5.5 10.5-18 10.5 9-1 13-4.5 13-11 0-7-2.5-14-6-19z') +
      rf(15, 22.5, 18, 13.5, 3.5, B) + f('M24 25l4.2 4.2-4.2 4.2-4.2-4.2z', W)) +
    l('M16.5 13.7h15'));

  I.ice = col(
    f('M24 5.5l16.5 9-16.5 9-16.5-9z', '#e8f8fe') +
    f('M7.5 14.5l16.5 9v19l-16.5-9z', '#a9e4f9') +
    f('M24 23.5l16.5-9v19l-16.5 9z', S) +
    l('M7.5 14.5l16.5 9 16.5-9M24 23.5v19', W, 2.5, 0.9) +
    hi('M12.5 23v6', 2.5, 0.9) + hi('M35.5 21.5v3', 2.5, 0.5) +
    l('M24 5.5l16.5 9v19l-16.5 9-16.5-9v-19z'));

  I.cup = col(mv(0, -1.5,
    o('M11 14.5h26l-3 25.4a3.5 3.5 0 0 1-3.5 3.1h-13a3.5 3.5 0 0 1-3.5-3.1z', W,
      f('M11.9 22h24.2l-1.1 9H13z', C) +
      sh('M30.5 14.5H37l-3 25.4a3.5 3.5 0 0 1-3.5 3.1h-3.5q2.6-.5 3-3.1z')) +
    r(7.5, 8, 33, 6.5, 2.5, W)));

  /* ---- money and rating ---- */
  /* deep-gold rim so the coin still reads on lemon buttons and chips */
  I.coin = col(
    disc(24, 24, 18.5, YD, '#d18a00', 2.4) + cf(24, 24, 12.4, Y) + rf(21.7, 17.6, 4.6, 12.8, 2.3, YD) +
    hi('M9.8 19.2a15 15 0 0 1 9.4-9.4', 2.2, 0.8));

  I.cash = col(
    g('rotate(9 25 19)', r(7, 9, 36, 20, 3, GD)) +
    g('rotate(-7 23 28)', r(4.5, 17.5, 37, 21, 3, G) + cf(23, 28, 5.5, GP) + rf(21.6, 24.5, 2.8, 7, 1.4, GD) +
      cf(10, 28, 1.8, GP) + cf(36, 28, 1.8, GP)));

  var STAR = burst(24, 25.5, 5, 19.5, 10.2);
  I.star = col(f(STAR, YD) + g('translate(3.1 3.4) scale(.8)', f(STAR, Y)) + hi('M14.5 21.5l4.7-.6 1.6-3.6') + l(STAR));

  var HEART = 'M24 14.5C21 8 13 6 8.5 10.5 3 16 5 24 11 30l13 12.5L37 30c6-6 8-14 2.5-19.5C35 6 27 8 24 14.5z';
  I.heart = col(mv(0, -1, f(HEART, CD) + g('translate(2 2) scale(.86)', f(HEART, C)) + hi('M10.5 18q-.5-4 3-6') + l(HEART)));

  /* ---- weather ---- */
  I.sun = col(p(burst(24, 24, 8, 20.5, 14.2), YD) + disc(24, 24, 11.5, Y, YD, 2.4) + hi('M17.5 22.5a6.5 6.5 0 0 1 5-5'));

  var CLOUD = 'M13 37.5a7.5 7.5 0 0 1-1.6-14.8 11 11 0 0 1 21.2-2.9A9 9 0 0 1 35 37.5z';
  I.cloud = col(o(CLOUD, W, f('M5.8 32A7.5 7.5 0 0 0 13 37.5h22a9 9 0 0 0 6.1-5.5Q35 34.5 24 34.5T5.8 32z', WS)));

  var RC = 'M13.5 27.5a6.5 6.5 0 0 1-1.3-12.9 9.5 9.5 0 0 1 18.3-2.4A7.8 7.8 0 0 1 33.5 27.5z',
    RCS = 'M7.3 23.5a6.5 6.5 0 0 0 6.2 4h20a7.8 7.8 0 0 0 5.2-4Q33 25 23.5 25T7.3 23.5z';
  I.rain = col(mv(0.7, -1,
    o(RC, T, f(RCS, TD)) +
    tube('M14.5 33.5l-2 5.5M24 35.5l-2 5.5M33.5 33.5l-2 5.5', S, 2.5)));

  I.storm = col(mv(0.7, -1.5,
    p('M27.5 21L16 34.5h6.5l-3 10.5L34 29h-7l4.5-8z', Y) +
    o(RC, TD, f(RCS, '#737aad'))));

  I.heat = col(p(burst(24, 24, 10, 20.5, 14.8), C) + disc(24, 24, 11.5, YD, '#d18a00', 2.4) + hi('M17.5 22.5a6.5 6.5 0 0 1 5-5'));

  I.thermometer = col(
    p('M16.5 9.5a4.5 4.5 0 0 1 9 0v17.2a9 9 0 1 1-9 0z', W) +
    cf(21, 34.5, 5.2, C) + l('M21 34V17.5', C, 3.6) + cf(19.2, 32.8, 1.5, W, 0.8) +
    l('M31 10h5M31 16.5h3.5M31 23h5'));

  /* ---- upgrades ---- */
  I.pitcher = col(mv(-2, -1.5,
    tube('M33.5 15h4a5 5 0 0 1 5 5v5.5a5 5 0 0 1-5 5H33', SP, 2.5) +
    o('M7 8.5h27l-1.7 30a4.5 4.5 0 0 1-4.5 4.2H17.2a4.5 4.5 0 0 1-4.5-4.2L11.5 16z', SP,
      f('M11.7 19.5h21.7l-1.1 19a4.5 4.5 0 0 1-4.5 4.2H17.2a4.5 4.5 0 0 1-4.5-4.2z', Y) +
      sh('M28 19.5h5.4l-1.1 19a4.5 4.5 0 0 1-4.5 4.2h-3q3-.7 3.2-4.2z') +
      hi('M17 24.5v11'))));

  I.juicer = col(
    p('M8 12.5c-2 2.6-3 4.2-3 5.6a3 3 0 0 0 6 0c0-1.4-1-3-3-5.6z', Y) + p('M40.5 8.5c-1.5 2-2.3 3.3-2.3 4.4a2.3 2.3 0 0 0 4.6 0c0-1.1-.8-2.4-2.3-4.4z', Y) +
    o('M13.5 26.5c0-6.5 3.5-11.6 8.3-13 .4-1.8 1.2-2.8 2.2-2.8s1.8 1 2.2 2.8c4.8 1.4 8.3 6.5 8.3 13z', Y,
      f('M29.5 15.5c3.2 2.4 5 6.4 5 11h-4.8c0-4.3-.1-7.8-.2-11z', YD) + hi('M17.6 22.5q.8-3.8 3.6-5.6')) +
    o('M4.5 26.5h39l-3.6 11a6 6 0 0 1-5.7 4.2H13.8a6 6 0 0 1-5.7-4.2z', S,
      f('M6.9 34h34.2l-1.2 3.5a6 6 0 0 1-5.7 4.2H13.8a6 6 0 0 1-5.7-4.2z', SD) + hi('M10.5 30.5h9')));

  I.cooler = col(
    l('M12.5 13v-2.5a4.5 4.5 0 0 1 4.5-4.5h14a4.5 4.5 0 0 1 4.5 4.5V13') +
    o('M10 19.5h28a4 4 0 0 1 4 4V38a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V23.5a4 4 0 0 1 4-4z', S,
      f('M6 35.5h36V38a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z', SD) +
      l('M24 24.5v10M19.7 27l8.6 5M19.7 32l8.6-5', W, 2.5)) +
    r(4.5, 12.5, 39, 8.5, 3, W));

  I.stand = col(
    l('M10 18v10M38 18v10', K, 3.5) +
    r(6.5, 30, 35, 13.5, 2.5, O) + l('M8.5 36.5h31', OD, 2) + cf(24, 36.7, 3.8, Y) +
    r(4.5, 26.5, 39, 5.5, 2, OP) +
    canopy(9, 39, 5.5, 4.5, 43.5, 15, 4, 4.5, C, W));

  I.awning = col(
    l('M8 28v15M40 28v15', K, 3.5) + l('M4.5 43.5h7M36.5 43.5h7') +
    canopy(10.5, 37.5, 10, 4, 44, 25, 4, 5, C, W) +
    r(7, 6, 34, 5.5, 2.75, T));

  I.sign = col(
    r(21.5, 24, 5, 20, 1.5, OD) +
    g('rotate(-4 24 17)', o('M9.5 6h29a3.5 3.5 0 0 1 3.5 3.5v15a3.5 3.5 0 0 1-3.5 3.5h-29A3.5 3.5 0 0 1 6 24.5v-15A3.5 3.5 0 0 1 9.5 6z', O,
      f('M6 22.5h36v2a3.5 3.5 0 0 1-3.5 3.5h-29A3.5 3.5 0 0 1 6 24.5z', OD) +
      cf(16.5, 16, 5.2, Y) + l('M26 13.5h10M26 19.5h6.5', W, 3))));

  I.tipjar = col(
    c(24, 7.5, 4.5, Y) +
    o('M13.5 21c-2.5 2-4 4-4 7.5V39a4.5 4.5 0 0 0 4.5 4.5h20a4.5 4.5 0 0 0 4.5-4.5V28.5c0-3.5-1.5-5.5-4-7.5z', SP,
      cf(18, 38, 4.6, YD) + cf(17.5, 37.5, 3.4, Y) + cf(29.5, 38.5, 4.6, YD) + cf(29, 38, 3.4, Y) +
      cf(24, 32.5, 4.6, YD) + cf(23.5, 32, 3.4, Y) + hi('M14 28.5v6', 2.5, 0.9)) +
    r(12.5, 15, 23, 6, 2.5, SP));

  I.helper = col(mv(0, -1.5,
    o('M7.5 44c0-9 6-14.5 16.5-14.5S40.5 35 40.5 44z', G, f('M18.5 44v-8.5a2.5 2.5 0 0 1 2.5-2.5h6a2.5 2.5 0 0 1 2.5 2.5V44z', W) + cf(24, 39, 2.3, Y) + sh('M33 31.5c5 2.5 7.5 7 7.5 12.5h-6c0-5-.5-9-1.5-12.5z')) +
    c(24, 19.5, 9.5, SKIN) + cf(20.5, 22, 1.5, K) + cf(27.5, 22, 1.5, K) + l('M21 25.3q3 2.4 6 0', K, 2.4) +
    p('M13.5 18a10.5 10.5 0 0 1 21 0z', C) + l('M33 18h6.5')));

  I.speaker = col(
    o('M16 4.5h16a5 5 0 0 1 5 5v29a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5v-29a5 5 0 0 1 5-5z', V,
      sh('M31 4.5h1a5 5 0 0 1 5 5v29a5 5 0 0 1-5 5h-1z', 0.25) + hi('M15.5 9.5v9', 2.5, 0.45)) +
    c(24, 30, 7.5, T) + cf(24, 30, 3, K) + c(24, 13.5, 3.2, T));

  I.bell = col(
    l('M5.5 16q-2 4.5-.5 9M42.5 9.5q3 3.5 3 8') +
    g('rotate(-10 24 24)',
      c(24, 39.5, 3.8, YD) + c(24, 7, 2.6, YD) +
      o('M24 8c-7.5 0-11.5 5.5-11.5 12.5v7L8 34.5V37h32v-2.5l-4.5-7v-7C35.5 13.5 31.5 8 24 8z', Y,
        f('M29 9c4.5 2 6.5 6.5 6.5 11.5v7l4.5 7V37H30.5v-2.5c1-2 1.5-4.5 1.5-7v-7c0-5-1-8.5-3-11.5z', YD) +
        hi('M17 19q.5-4.5 3.5-6.5'))));

  /* ---- places and menus ---- */
  I.map = col(
    o('M5.5 12.5l12-4.5 13 4.5 12-4.5v27.5l-12 4.5-13-4.5-12 4.5z', '#e3f8ec',
      f('M17.5 8l13 4.5V40l-13-4.5z', GP) + f('M5.5 12.5l7-2.6c1 4-2 7-7 7.6z', S) +
      l('M9.5 33.5q4-7 9.5-4.5t8-3.5', C, 2.5) + l('M17.5 8v27.5M30.5 12.5V40', K, 2.4)) +
    p('M34 27.5c-4.3-4.5-6-7.5-6-10a6 6 0 0 1 12 0c0 2.5-1.7 5.5-6 10z', C) + cf(34, 17.5, 2, W));

  I.shop = col(
    r(8, 17, 32, 26.5, 2, YP) + r(26.5, 28, 8.5, 15.5, 1.5, O) + r(12.5, 28, 9.5, 8.5, 1.5, SP) +
    canopy(8.5, 39.5, 5, 4.5, 43.5, 15.5, 4, 4.5, S, W));

  I.trophy = col(
    tube('M13.5 11H9a2 2 0 0 0-2 2v1.5a7 7 0 0 0 7 7M34.5 11H39a2 2 0 0 1 2 2v1.5a7 7 0 0 1-7 7', YD, 2.5) +
    p('M21.5 27h5v9h-5z', YD) + r(14.5, 35.5, 19, 8, 2.5, O) +
    o('M13.5 6h21v12a10.5 10.5 0 0 1-21 0z', Y, f('M29.5 6h5v12a10.5 10.5 0 0 1-10.5 10.5c3.5-1.5 5.5-5 5.5-10.5z', YD) + hi('M18 10.5v8')));

  I.clock = col(
    disc(24, 24, 19.5, S, SD, 3) + cf(23.5, 23.5, 13, W) +
    l('M23.5 13.5v1.5M33.5 23.5H32M23.5 33.5V32M13.5 23.5H15', T, 2.5) +
    l('M23.5 16v7.5l5.5 3.5', K, 3.5));

  I.people = col(mv(0, -1.5,
    c(16, 14.5, 7, SKIN2) + p('M4.5 38.5c0-8 4.5-13 11.5-13s11.5 5 11.5 13z', S) +
    c(30.5, 21, 8, SKIN) + o('M17 43.5c0-9 5.5-14.5 13.5-14.5S44 34.5 44 43.5z', C, sh('M37 30.5c4.5 2.5 7 7 7 13h-5.5c0-5-.5-9.5-1.5-13z'))));

  I.tag = col(
    g('rotate(45 24 24)', o('M21 13h16.5a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H21L8.3 26.1a3 3 0 0 1 0-4.2z', C,
      f('M12.5 30h28v2a3 3 0 0 1-3 3H21l-8.5-5z', CD) + l('M26 20.5h9.5M26 26.5h6', W, 3)) +
      cf(16.5, 24, 3.4, W)) +
    l('M18.5 18.5C13.5 15 9.5 11.5 7 5', K, 2.5));

  I.recipe = col(
    r(8, 7.5, 32, 36.5, 4, O) + r(12.5, 12.5, 23, 27.5, 2, W) + r(17.5, 3.5, 13, 8.5, 2.5, T) +
    cf(18.5, 22, 3.6, Y) + l('M25.5 20.5h6M25.5 24.5h4M16.5 30.5h15M16.5 35h10', TD, 2.5));

  I.newspaper = col(
    r(29, 15, 14.5, 25.5, 3.5, WS) + r(4.5, 8.5, 32, 31.5, 3.5, W) +
    l('M10.5 15.5h20', K, 4) + rf(9, 21, 10, 9, 1.5, S) +
    l('M23.5 22.5h7M23.5 28h7M10.5 34.5h20', TD, 2.5));

  I.calendar = col(
    o('M10.5 9h27a4 4 0 0 1 4 4v25.5a4 4 0 0 1-4 4h-27a4 4 0 0 1-4-4V13a4 4 0 0 1 4-4z', W,
      f('M6.5 19.5V13a4 4 0 0 1 4-4h27a4 4 0 0 1 4 4v6.5z', C) +
      cf(15, 26.5, 2.3, T) + cf(24, 26.5, 2.3, T) + cf(33, 26.5, 2.3, T) + cf(15, 34.5, 2.3, T) + cf(24, 34.5, 2.3, T) + cf(33, 34.5, 3.4, C)) +
    l('M15.5 5v8M32.5 5v8', K, 4));

  I.gift = col(
    p('M24 14c-2.5-7-8-10.5-11.5-8s-1 8 11.5 8zM24 14c2.5-7 8-10.5 11.5-8s1 8-11.5 8z', Y) +
    o('M8 21h32v19a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z', B, rf(20.5, 21, 7, 22, 0, Y) + sh('M34 21h6v19a3 3 0 0 1-3 3h-3z')) +
    o('M8 13.5h32a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 20v-4A2.5 2.5 0 0 1 8 13.5z', B, rf(20.5, 13.5, 7, 9, 0, Y)));

  I.chart = col(mv(0, -1.5,
    r(6.5, 27, 9, 15.5, 2, S) + r(19.5, 18, 9, 24.5, 2, G) + r(32.5, 8, 9, 34.5, 2, Y) +
    l('M4.5 43h39')));

  var DROP = 'M24 5C17 14 11.5 21 11.5 29a12.5 12.5 0 0 0 25 0C36.5 21 31 14 24 5z';
  I.drop = col(o(DROP, S, f('M31 14.5c3.5 5 5.5 9.5 5.5 14.5a12.5 12.5 0 0 1-18 11.2c7 .5 12.5-4.5 12.5-11.2 0-4.5-1-8.5-3-12z', SD) + hi('M17 28a7 7 0 0 0 3 6.5')));

  I.fire = col(
    p('M26 4c1.5 7-4 10-6 14.5-1.5-1.5-2-3.5-2-6C12.5 16.5 9 22.5 9 29a15 15 0 0 0 30 0c0-9.5-6-17-13-25z', C) +
    f('M24.5 23c.5 4-3 5.5-4 8-.6-.8-1-1.6-1-2.8-2 1.8-3 4-3 6.3a7.5 7.5 0 0 0 15 0c0-4-3.5-8-7-11.5z', Y));

  /* ---- locations: one landmark each, on a strip of ground ---- */
  function ground(fill) { return r(3.5, 39, 41, 6, 3, fill); }
  I.locStreet = col(
    r(30.5, 7.5, 5.5, 10, 1, OD) + r(11.5, 19, 25, 21, 0, W) + r(20.5, 27, 7, 13, 1.2, O) +
    p('M5.5 21.5L24 5.5l18.5 16z', C) + ground(G));

  I.locPark = col(
    r(21.5, 25, 5, 15, 1, O) +
    o('M16 29a8 8 0 0 1-2-15.6 10 10 0 0 1 20 0A8 8 0 0 1 32 29z', G,
      f('M33.9 13.2A8 8 0 0 1 32 29H16a8 8 0 0 1-6.5-3.3c7.5 1.8 20.5.3 24.4-12.5z', GD) + hi('M17.5 14.5a7 7 0 0 1 5-5')) +
    ground(G) + cf(10, 42, 1.4, W) + cf(37, 42, 1.4, Y));

  I.locBeach = col(
    g('rotate(-14 24 24)', l('M24 14v27', K, 3.5) +
      o('M5 23.5C6 12.5 14 6 24 6s18 6.5 19 17.5z', C, f('M24 6c-4.5 3-7 9.5-7.5 17.5h15C31 15.5 28.5 9 24 6z', W)) + c(24, 5.5, 1.5, Y)) +
    ground('#f7dc9c') + l('M34 42h6', OP, 2));

  I.locDowntown = col(
    r(6.5, 18, 13, 22, 1.5, S) + r(28.5, 13, 13, 27, 1.5, SD) + r(17, 5, 14, 35, 1.5, V) +
    f('M20.5 10h3v3h-3zM24.5 16h3v3h-3zM20.5 22h3v3h-3zM24.5 28h3v3h-3zM9.5 23h3v3h-3zM13 29.5h3v3h-3zM34.5 18.5h3v3h-3zM34.5 26h3v3h-3z', Y) +
    ground(T));

  I.locCarnival = col(
    l('M24 21l-9 19M24 21l9 19') + co(24, 21, 13.5) + l('M24 7.5v27M10.5 21h27M14.5 11.5l19 19M33.5 11.5l-19 19', K, 1.6) +
    c(24, 7, 3, C) + c(36.1, 14, 3, Y) + c(36.1, 28, 3, S) + c(24, 35, 3, G) + c(11.9, 28, 3, B) + c(11.9, 14, 3, V) +
    c(24, 21, 3, Y) + ground(V));

  /* ---- customer moods ---- */
  var EYES = l('M16.5 19v3.5M30.5 19v3.5', K, 4.2),
    GRIN = p('M14 27.5h19a9.5 9.5 0 0 1-19 0z', K) + f('M18.5 34a6 6 0 0 1 10 0 9.3 9.3 0 0 1-10 0z', C);
  function face(fill, shade, bits) { return col(disc(24, 24, 19.5, fill, shade, 3.2) + bits); }
  var MINI = 'M0 2.8C-.9.4-4.5-.5-5.5 2.2c-1 2.8 2 5.3 5.5 7.8 3.5-2.5 6.5-5 5.5-7.8C4.5-.5.9.4 0 2.8z';
  I.faceHappy = face(Y, YD, EYES + GRIN);
  I.faceLove = face(Y, YD, g('translate(16 15.5)', f(MINI, B)) + g('translate(31 15.5)', f(MINI, B)) + GRIN);
  I.faceMeh = face(Y, YD, EYES + l('M16 31.5h15', K, 3.5));
  I.faceSad = face(S, SD, l('M12.5 17.5l6-2.5M34.5 17.5l-6-2.5') + l('M16.5 21.5v3M30.5 21.5v3', K, 4.2) +
    l('M16 34.5q7.5-6.5 15 0', K, 3.5) + f('M33 26.5c1.8 2.5 2.7 4 2.7 5.3a2.7 2.7 0 0 1-5.4 0c0-1.3.9-2.8 2.7-5.3z', W));
  I.faceAngry = face(C, CD, l('M12.5 14.5l7 4M34.5 14.5l-7 4', K, 3.5) + l('M16.5 22v3M30.5 22v3', K, 4.2) +
    l('M16.5 35q7-5.5 14 0', K, 3.5));

  /* ---- rewards ---- */
  I.medal = col(
    p('M10.5 4.5H20l6.5 15H17z', SD) + p('M37.5 4.5H28l-6.5 15H31z', S) +
    disc(24, 31, 12.5, Y, YD, 2.6) + g('translate(13.7 20.3) scale(.42)', f(STAR, YD)));

  /** four-point twinkle: radius R, k = how fat the waist is */
  function spark(x, y, R, k) {
    return 'M' + x + ' ' + n(y - R) + 'Q' + n(x + k) + ' ' + n(y - k) + ' ' + n(x + R) + ' ' + y + 'Q' + n(x + k) + ' ' + n(y + k) + ' ' + x + ' ' + n(y + R) +
      'Q' + n(x - k) + ' ' + n(y + k) + ' ' + n(x - R) + ' ' + y + 'Q' + n(x - k) + ' ' + n(y - k) + ' ' + x + ' ' + n(y - R) + 'z';
  }
  I.sparkle = col(
    o(spark(20, 25.5, 16.5, 4.6), Y, f('M36.5 25.5Q24.6 30.1 20 42 22.8 28.3 36.5 25.5z', YD) + hi('M13.5 23.5q3.5-1.8 5-5.5', 2.2)) +
    p(spark(37.5, 11, 7.5, 2.7), W) + p(spark(38, 37.5, 6, 2.3), Y));

  /* ---- regulars and Dex the Dealer ---- */
  var FLAME = 'M24 4.5c2 6.5 9.5 10 12.5 17.5 3.5 9-2 21.5-12.5 21.5S8 35 11.5 26c1.5-4 4.5-6 5.5-10 2 2.5 2.5 5 2 7.5 4-3.5 6.5-11 5-19z';
  I.flame = col(o(FLAME, '#ff9f43',
    f('M36.5 22c3.5 9-2 21.5-12.5 21.5 6.5-2 9.5-8 9.5-14 0-3-1-5-2.5-8 2.5 0 4.5.2 5.5.5z', '#f07b1d') +
    f('M24 21.5c4 4.5 7.5 8.5 7.5 13.5a7.5 7.5 0 0 1-15 0c0-4.5 4-8.5 7.5-13.5z', Y) +
    f('M24 31c1.8 2 3 3.6 3 5.2a3 3 0 0 1-6 0c0-1.6 1.2-3.2 3-5.2z', W, 0.85) + hi('M14 29q.5-3 2.5-5', 2.2)));

  var SHIELD = 'M24 4.5L40.5 10v12c0 10.5-7 18-16.5 21.5C14.5 40 7.5 32.5 7.5 22V10z';
  I.shield = col(o(SHIELD, S, f('M24 4.5L40.5 10v12c0 10.5-7 18-16.5 21.5z', SD) + hi('M12 13.5v8.5', 2.5, 0.6)) +
    g('translate(12 9.5) scale(.5)', '<path d="' + HEART + '" fill="' + B + '" stroke-width="5"/>') + hi('M16.5 17.5q.5-2 2.5-3', 2));

  I.regular = col(mv(0, -1, f(HEART, BD) + g('translate(2 2) scale(.86)', f(HEART, B)) +
    cf(24, 20, 4.3, W) + f('M15.5 33.5c0-5.3 3.8-8.5 8.5-8.5s8.5 3.2 8.5 8.5z', W) + hi('M10.5 18q-.5-4 3-6') + l(HEART)));

  var DXS = '#d9a273', DXV = '#6c3fd6';
  I.dealer = col(
    o('M6.5 45.5c.5-7.5 5.5-12 12.5-13.5h10c7 1.5 12 6 12.5 13.5z', DXV, f('M19 32l5 7.5 5-7.5z', W) + f('M33.5 33.5c4.5 2.5 7 6.5 7.5 12h-5.5c0-4.5-.5-8.5-2-12z', K, 0.18)) +
    l('M17.5 34.5q6.5 6 13 0', K, 6.5) + l('M17.5 34.5q6.5 6 13 0', Y, 3) + c(24, 39.5, 2.6, Y) +
    disc(24, 19.5, 13.5, DXS, '#b9824f', 2.6) +
    p('M11 13.5C10 6.5 16 2.5 23.5 2.5c7.5 0 13 3 14 8.5-2.2-1.2-5-1.5-7.5-.8-4-1.6-9-1.2-12.5 1-2 1.2-4 2-6.5 2.3z', '#3d2b74') + hi('M16.5 7.5q3.5-2.6 7.5-2.8', 2, 0.5) +
    p('M11.5 14.5h11v2.5a3.5 3.5 0 0 1-3.5 3.5h-4a3.5 3.5 0 0 1-3.5-3.5zM25.5 14.5h11v2.5a3.5 3.5 0 0 1-3.5 3.5h-4a3.5 3.5 0 0 1-3.5-3.5z', K) +
    l('M14 17.2l3.2-1.4M28 17.2l3.2-1.4', W, 1.7, 0.9) +
    '<path d="M17 24h14c-.8 4.3-3.6 6.5-7 6.5s-6.2-2.2-7-6.5z" fill="' + W + '" stroke-width="2.5"/>' + rf(25, 25, 3, 2.6, 0.6, YD));

  /* ---- the drink: liquid takes currentColor so the UI can tint it per flavor ---- */
  var GLASS = 'M13 15.5h27l-3 24.4a4 4 0 0 1-4 3.6H20a4 4 0 0 1-4-3.6z';
  I.drink = col(
    disc(14, 15.5, 6.2, YP, YD, 2) +
    f(GLASS, W) +
    tube('M29.5 31l5-23', C, 2.5) +
    '<path d="M13.7 21h25.6L37 39.9a4 4 0 0 1-4 3.6H20a4 4 0 0 1-4-3.6z" stroke="none"' + CC + '/>' +
    rf(18.5, 28, 6, 6, 1.5, W, 0.55) + g('rotate(20 29.5 36)', rf(26.5, 33, 6, 6, 1.5, W, 0.55)) +
    sh('M34 21h5.3L37 39.9a4 4 0 0 1-4 3.6h-3q2.8-.6 3.1-3.6z') +
    l(GLASS));

  /* ==================================================================== *
   * 2. Control icons: currentColor only
   * ==================================================================== */
  function gear() {
    var d = '', i, k = 8, st = Math.PI * 2 / k, b;
    function pt(rad, ang) { return n(24 + rad * Math.cos(ang)) + ' ' + n(24 + rad * Math.sin(ang)); }
    for (i = 0; i < k; i++) {
      b = i * st;
      d += (i ? 'L' : 'M') + pt(13.5, b - 0.29) + 'L' + pt(20, b - 0.17) + 'L' + pt(20, b + 0.17) + 'L' + pt(13.5, b + 0.29);
    }
    return d + 'zM24 17.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z';
  }
  var NOTE = '<path d="M17.5 35V12.5l20-4V31"/><ellipse cx="12.5" cy="35.5" rx="5.5" ry="4.5"' + CC + ' stroke="none"/><ellipse cx="32.5" cy="31.5" rx="5.5" ry="4.5"' + CC + ' stroke="none"/>',
    CONE = '<path d="M7.5 19.5h7l9.5-8v25l-9.5-8h-7z"' + CC + ' stroke-width="3.5"/>';

  I.play = mono('<path d="M14 9v30l25-15z"' + CC + '/>');
  I.pause = mono('<path d="M16.5 12v24M31.5 12v24"/>', 8);
  I.fast = mono('<path d="M8 13.5v21L22.5 24zM26 13.5v21L40.5 24z"' + CC + '/>', 4);
  I.plus = mono('<path d="M24 9.5v29M9.5 24h29"/>', 6.5);
  I.minus = mono('<path d="M9.5 24h29"/>', 6.5);
  I.close = mono('<path d="M12 12l24 24M36 12L12 36"/>', 6.5);
  I.check = mono('<path d="M8.5 25.5l10 10 21-22"/>', 6.5);
  I.arrowLeft = mono('<path d="M39 24H10M21.5 11.5L9 24l12.5 12.5"/>', 6);
  I.arrowRight = mono('<path d="M9 24h29M26.5 11.5L39 24 26.5 36.5"/>', 6);
  I.arrowUp = mono('<path d="M24 39V10M11.5 21.5L24 9l12.5 12.5"/>', 6);
  I.arrowDown = mono('<path d="M24 9v29M11.5 26.5L24 39l12.5-12.5"/>', 6);
  I.lock = mono('<path d="M16 21v-6a8 8 0 0 1 16 0v6"/><path fill-rule="evenodd" d="M12.5 20.5h23a3.5 3.5 0 0 1 3.5 3.5v15a3.5 3.5 0 0 1-3.5 3.5h-23A3.5 3.5 0 0 1 9 39V24a3.5 3.5 0 0 1 3.5-3.5zM24 27a3 3 0 0 0-1.8 5.4V36h3.6v-3.6A3 3 0 0 0 24 27z"' + CC + ' stroke="none"/>', 4.5);
  I.gear = mono('<path fill-rule="evenodd" d="' + gear() + '"' + CC + '/>', 2.5);
  I.sound = mono(CONE + '<path d="M31 18a8.5 8.5 0 0 1 0 12M36 12a17 17 0 0 1 0 24"/>', 4.5);
  I.mute = mono(CONE + '<path d="M30.5 18L41 30M41 18L30.5 30"/>', 5);
  I.music = mono(NOTE, 4.5);
  I.musicOff = mono('<g opacity=".5">' + NOTE + '</g><path d="M8 8l32 32"/>', 5);
  I.info = mono('<circle cx="24" cy="24" r="17.5"/><path d="M24 22.5V33" stroke-width="5.5"/><circle cx="24" cy="14.8" r="3.2"' + CC + ' stroke="none"/>', 4.5);
  I.warning = mono('<path d="M24 7.5l18.5 32.5h-37z"/><path d="M24 19v9.5" stroke-width="5"/><circle cx="24" cy="34.5" r="2.9"' + CC + ' stroke="none"/>', 4.5);
  I.home = mono('<path d="M6.5 23.5L24 8l17.5 15.5M12 20.5V40h24V20.5"/><path d="M20.5 40V30.5h7V40"' + CC + ' stroke-width="3"/>', 4.5);
  I.restart = mono('<path d="M39 26a15 15 0 1 1-5-11.2M35.5 6.5V16H26"/>', 5);
  I.trash = mono('<path d="M8.5 13h31M19 12.5V8h10v4.5M12.5 13.5l1.8 25a3.5 3.5 0 0 0 3.5 3.3h12.4a3.5 3.5 0 0 0 3.5-3.3l1.8-25M20 21v12.5M28 21v12.5"/>', 4.5);
  I.menu = mono('<path d="M9 13h30M9 24h30M9 35h30"/>', 6);
  I.hand = mono('<path d="M19 26.5V9.5a3.5 3.5 0 0 1 7 0V21l9 1.6a5 5 0 0 1 4.1 5.2L38.5 34a9.5 9.5 0 0 1-9.5 9h-5a9 9 0 0 1-7.6-4.2L9.5 28a3.3 3.3 0 0 1 5.4-3.7z" fill="currentColor" fill-opacity=".22"/>', 4);

  SS.ICONS = I;
})();
