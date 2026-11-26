/* Squeeze Street — backdrops.js
 * The world behind (and just in front of) the actors: five hand-drawn dioramas.
 *
 *   SS.Backdrops.update(dt, view, env)     scene bookkeeping (optional; drawBack does it if this is not called)
 *   SS.Backdrops.drawBack(ctx, view, env)  far, mid and near layers plus the ground, to the bottom of the canvas
 *   SS.Backdrops.drawFront(ctx, view, env) low props and traffic in front of the actors
 *
 * How it works: a location is a list of passes, back to front. A "strip" pass is static art painted
 * once (in world units) onto an offscreen canvas wide enough for the view plus a margin; an "fn" pass
 * draws the moving things every frame. Night is a cross-fade to a tinted copy of each strip, golden
 * hour adds a rim-light copy, and both copies are only made when first needed. When the view zooms the
 * old strips are stretched for a moment and repainted a few milliseconds per frame.
 *
 * Coordinates inside painters: x = world x, y = 0 on the back edge of the walkway, negative is up.
 */
(function () {
  'use strict';
  var SS = window.SS, W = SS.W, hash = SS.hash, clamp = SS.clamp, lerp = SS.lerp;
  var PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs;
  var floor = Math.floor, ceil = Math.ceil, round = Math.round, min = Math.min, max = Math.max;
  var CX = W.STAND_X, WALK = W.SIDEWALK_H;
  var NIGHT_COL = '#0d1a50', NIGHT_A = 0.48, RIM_COL = '#ffae5e';
  var FONT = '"Figtree", system-ui, sans-serif';
  var NODASH = [];

  /* ------------------------------------------------------------------ helpers */
  function H(i, k) { return hash(Math.imul(i | 0, 73856093) ^ Math.imul((k | 0) + 11, 19349663)); }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = max(1, ceil(w)); c.height = max(1, ceil(h)); return c; }
  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  var hexCache = {};
  function rgb(h) { var c = hexCache[h]; if (c) return c; var n = parseInt(h.slice(1), 16); return (hexCache[h] = [n >> 16, (n >> 8) & 255, n & 255]); }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b);
    return 'rgb(' + round(A[0] + (B[0] - A[0]) * t) + ',' + round(A[1] + (B[1] - A[1]) * t) + ',' + round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function mixHex(a, b, t) {
    var A = rgb(a), B = rgb(b), n = (round(A[0] + (B[0] - A[0]) * t) << 16) | (round(A[1] + (B[1] - A[1]) * t) << 8) | round(A[2] + (B[2] - A[2]) * t);
    return '#' + (0x1000000 + n).toString(16).slice(1);
  }
  function rgba(h, a) { var A = rgb(h); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }

  /* Light for this frame, shared by every pass. */
  var LT = { night: 0, dark: 0, warm: 0, sun: 1, rim: 0, heat: 0, wet: 0, side: 1, budget: 0, q: -1, d: 0.5 };
  var litMemo = {};
  /** a flat colour under tonight's light (memoised until the light moves a step) */
  function lit(hex, k) {
    var key = k == null ? hex : hex + k, v = litMemo[key];
    return v || (litMemo[key] = mix(hex, NIGHT_COL, NIGHT_A * LT.dark * (k == null ? 1 : k)));
  }
  function setLight(env) {
    var l = SS.light(env.dayT || 0), w = env.weather || {}, d = (((env.dayT || 0) % 1.6) + 1.6) % 1.6;
    LT.night = l.night; LT.warm = l.warm; LT.sun = l.sun; LT.d = d;
    // art starts to dim a little before the lamps come on, so sunset reads as sunset
    LT.dark = max(1 - Math.pow(1 - l.night, 1.8), d > 0.78 && d < 1.14 ? 0.3 * SS.smooth((d - 0.78) / 0.22) : 0);
    LT.heat = clamp(w.heat || 0, 0, 1); LT.wet = clamp(w.wet || 0, 0, 1);
    LT.rim = l.warm * 0.7 * (1 - 0.85 * clamp(w.cloud || 0, 0, 1)) * (1 - l.night * 0.7);
    LT.side = d < 0.5 || d > 1.45 ? -1 : 1;              // which side the low sun is on
    LT.budget = 2;                                        // tinted copies we may make this frame
    var q = round(LT.dark * 48);
    if (q !== LT.q) { LT.q = q; litMemo = {}; }
  }

  /* Pre-rendered soft glows (never shadowBlur). */
  var glowCache = {};
  function glowSpr(hex) {
    var c = glowCache[hex];
    if (c) return c;
    c = mk(96, 96);
    var g = c.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, rgba(hex, 0.95)); gr.addColorStop(0.16, rgba(hex, 0.55)); gr.addColorStop(0.42, rgba(hex, 0.17));
    gr.addColorStop(0.72, rgba(hex, 0.04)); gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
    return (glowCache[hex] = c);
  }
  /** caller sets globalCompositeOperation; alpha is reset by the caller too */
  function glow(ctx, hex, x, y, rx, a, ry) {
    if (a <= 0.004) return;
    ry = ry || rx;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(glowSpr(hex), x - rx, y - ry, rx * 2, ry * 2);
  }
  var puffC = null;
  function puff(ctx, x, y, r, a) {
    if (a <= 0.004) return;
    if (!puffC) {
      puffC = mk(64, 64);
      var g = puffC.getContext('2d'), gr = g.createRadialGradient(28, 26, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.55, 'rgba(244,246,250,.6)'); gr.addColorStop(1, 'rgba(235,240,246,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(puffC, x - r, y - r, r * 2, r * 2);
  }

  /* A picture with lazily made night and rim-light copies. */
  function Img(c, w, h, ax, ay, ppu, o) {
    this.c = c; this.n = null; this.r = null; this.rs = 0;
    this.w = w; this.h = h; this.ax = ax; this.ay = ay; this.ppu = ppu;
    this.nk = o && o.nk != null ? o.nk : 1;               // how much night darkens it
    this.rk = o && o.rk != null ? o.rk : 1;               // how much rim light it takes
  }
  function nightOf(im, na) {
    if (im.n) return im.n;
    if (LT.budget <= 0 && na < 0.15) return null;
    LT.budget--;
    var n = mk(im.c.width, im.c.height), g = n.getContext('2d');
    g.drawImage(im.c, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = NIGHT_A; g.fillStyle = NIGHT_COL;
    g.fillRect(0, 0, n.width, n.height);
    return (im.n = n);
  }
  function rimOf(im, ra) {
    if (im.r && im.rs === LT.side) return im.r;
    if (LT.budget <= 0 && ra < 0.15) return null;
    LT.budget--;
    var r = im.r || mk(im.c.width, im.c.height), g = r.getContext('2d'), d = max(1.2, im.ppu * 2.4);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, r.width, r.height);
    g.drawImage(im.c, 0, 0);
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.88;
    g.drawImage(im.c, -LT.side * d, d);
    g.globalCompositeOperation = 'source-in'; g.globalAlpha = 1; g.fillStyle = RIM_COL;
    g.fillRect(0, 0, r.width, r.height);
    im.rs = LT.side;
    return (im.r = r);
  }
  function blit(ctx, im, x, y, w, h) {
    var na = LT.dark * im.nk, ra = LT.rim * im.rk, n = na > 0.01 ? nightOf(im, na) : null, r;
    if (!(n && na > 0.995)) ctx.drawImage(im.c, x, y, w, h);
    if (LT.heat > 0.02 && na < 0.9) {                     // sun-bleached
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = LT.heat * 0.09 * (1 - na);
      ctx.drawImage(im.c, x, y, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (n) { ctx.globalAlpha = na > 1 ? 1 : na; ctx.drawImage(n, x, y, w, h); }
    if (ra > 0.01 && (r = rimOf(im, ra))) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ra > 1 ? 1 : ra;
      ctx.drawImage(r, x, y, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
  /** draw a sprite with its anchor at (x, y), in world units */
  function put(ctx, im, x, y, sc) { sc = sc || 1; blit(ctx, im, x - im.ax * sc, y - im.ay * sc, im.w * sc, im.h * sc); }
  /** same, leaning: `lean` = how far the top moves sideways, in world units */
  function putLean(ctx, im, x, y, sc, lean) {
    ctx.save();
    ctx.transform(1, 0, -lean / (im.ay * sc), 1, x, y);
    blit(ctx, im, -im.ax * sc, -im.ay * sc, im.w * sc, im.h * sc);
    if (im.tree) noteTree(ctx, -im.ax * sc, -im.ay * sc, im.w * sc, im.h * sc, im);
    ctx.restore();
  }
  /* Where trees were drawn this frame, in CSS px, so a click can find one (SS.Backdrops.treeAt; admin.js uses it). */
  var treeBoxes = [];
  function noteTree(ctx, x, y, w, h, im) {
    if (treeBoxes.length >= 64 || !ctx.getTransform) return;
    var m = ctx.getTransform(), d = (SS.view && SS.view.dpr) || 1, xs = [x, x + w], ys = [y, y + h], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, i, j, px, py;
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
      px = (m.a * xs[i] + m.c * ys[j] + m.e) / d; py = (m.b * xs[i] + m.d * ys[j] + m.f) / d;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    treeBoxes.push({ x0: x0, y0: y0, x1: x1, y1: y1, m: m.inverse(), d: d, x: x, y: y, w: w, h: h, im: im });
  }
  /** is the tree's own art (not its sprite's clear margin) under CSS px (sx, sy)? */
  function onTree(b, sx, sy) {
    var X = sx * b.d, Y = sy * b.d, m = b.m, lx = m.a * X + m.c * Y + m.e, ly = m.b * X + m.d * Y + m.f, c = b.im.c;
    var u = Math.floor((lx - b.x) / b.w * c.width), v = Math.floor((ly - b.y) / b.h * c.height);
    if (u < 0 || v < 0 || u >= c.width || v >= c.height) return false;
    try { return c.getContext('2d').getImageData(u, v, 1, 1).data[3] > 100; } catch (e) { return true; }
  }
  function putFlip(ctx, im, x, y, sc) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); put(ctx, im, 0, 0, sc); ctx.restore(); }
  /** wind sway at world x (world units of lean per unit of "bendiness") */
  function swayAt(x, env) {
    var w = env.wind || 0;
    if (env.reduced) return w * 0.5;
    return w * 0.8 + sin(env.t * 1.15 + x * 0.013) * (0.3 + 0.5 * abs(w)) + sin(env.t * 2.4 + x * 0.031) * 0.12;
  }

  /* ------------------------------------------------------------------ scene */
  var warned = {};
  function warn(name, e) { if (!warned[name]) { warned[name] = true; if (window.console) console.error('[SS.Backdrops] ' + name + ' failed', e); } }

  function Scene(loc, view, scale) {
    this.loc = loc; this.scale = scale; this.dpr = view.dpr || 1; this.pr = scale * this.dpr;
    this.v = { camX: view.camX, cx: view.cx, w: view.w };
    this.margin = 0.32 * view.w / scale + 48;
    this.back = []; this.front = []; this.steps = []; this.cur = null; this.tf = null; this.short = false;
    this.frontCol = '#555b66'; this.wetCol = '#101828'; this.puddles = null; this.groundBot = 300;
    try { LOCS[loc](this); } catch (e) { warn(loc + ' setup', e); }
  }
  Scene.prototype.strip = function (o) {
    var S = this, st = { p: o.p == null ? 1 : o.p, top: o.top, bot: o.bot || 0, res: o.res || 1, paint: o.paint, im: null, a: 0, b: 0,
      lights: [], ground: !!o.ground, nk: o.nk, rk: o.rk, name: o.name || 'strip' };
    if (!o.hidden) (o.front ? S.front : S.back).push(st);   // hidden strips are built but drawn by an fn pass
    if (st.ground) S.groundBot = st.bot;
    S.steps.push(function () { buildStrip(S, st); });
    return st;
  };
  Scene.prototype.fn = function (p, fn, front) { (front ? this.front : this.back).push({ p: p, fn: fn, name: 'fn' }); };
  /** w, h in world units; (ax, ay) = anchor inside it; paint(g) draws with the anchor at 0,0 */
  Scene.prototype.sprite = function (w, h, ax, ay, paint, o) {
    var ppu = this.pr * ((o && o.res) || 1), c = mk(w * ppu, h * ppu), im = new Img(c, w, h, ax, ay, ppu, o), S = this;
    S.steps.push(function () {
      var g = c.getContext('2d');
      g.setTransform(ppu, 0, 0, ppu, ax * ppu, ay * ppu);
      try { paint(g); } catch (e) { warn(S.loc + ' sprite', e); }
    });
    return im;
  };
  /** a window or lamp that switches on at night; call while a strip is being painted */
  Scene.prototype.light = function (x, y, w, h, o) {
    if (!this.cur) return;
    o = o || {};
    var tf = this.tf, gl = o.g || 0;
    if (tf) { x = tf.x + x * tf.k; y = tf.y + y * tf.k; w *= tf.k; h *= tf.k; gl *= tf.k; }
    this.cur.lights.push({ x: x, y: y, w: w, h: h, thr: o.thr == null ? 0.3 + H(x * 3.1 + y, 5) * 0.42 : o.thr, c: o.c || '#ffd98f',
      k: o.k == null ? 0.92 : o.k, g: gl, gc: o.gc || o.c || '#ffd98f', a: 0 });
  };
  function buildStrip(S, st) {
    var v = S.v, camP = CX + (v.camX - CX) * st.p;
    var a = floor((camP - v.cx / S.scale - S.margin) / 8) * 8, b = ceil((camP + (v.w - v.cx) / S.scale + S.margin) / 8) * 8;
    var ppu = S.pr * st.res, hh = st.top + st.bot;
    if ((b - a) * ppu > 8192) ppu = 8192 / (b - a);
    if ((b - a) * hh * ppu * ppu > 12e6) ppu = Math.sqrt(12e6 / ((b - a) * hh));
    var c = mk((b - a) * ppu, hh * ppu), g = c.getContext('2d');
    g.setTransform(ppu, 0, 0, ppu, -a * ppu, st.top * ppu);
    st.a = a; st.b = b; st.im = new Img(c, b - a, hh, 0, 0, ppu, st);
    S.cur = st;
    try { st.paint(g, a, b, S); } catch (e) { warn(S.loc + ' ' + st.name, e); }
    S.cur = null; S.tf = null;
  }
  function runSteps(S, budgetMs) {
    var t0 = now();
    while (S.steps.length && (budgetMs <= 0 || now() - t0 < budgetMs)) S.steps.shift()();
    return !S.steps.length;
  }

  function drawLights(ctx, ls, va, vb) {
    var i, l, a, n = LT.night, any = false;
    for (i = 0; i < ls.length; i++) {
      l = ls[i]; l.a = 0;
      if (l.x > vb || l.x + l.w < va) continue;
      a = (n - l.thr) * 7;
      if (a <= 0) continue;
      l.a = a > 1 ? 1 : a;
      ctx.globalAlpha = l.a * l.k; ctx.fillStyle = l.c; ctx.fillRect(l.x, l.y, l.w, l.h);
      if (l.g) any = true;
    }
    if (any) {
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < ls.length; i++) { l = ls[i]; if (l.g && l.a > 0) glow(ctx, l.gc, l.x + l.w / 2, l.y + l.h / 2, l.g, l.a * 0.42); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  function drawWet(ctx, S, view, env, va, vb) {
    var wet = LT.wet, rows = S.puddles, r, i, k, x, y, rx, ry, u, D;
    ctx.globalAlpha = 0.3 * wet; ctx.fillStyle = S.wetCol;
    ctx.fillRect(va - 4, 0, vb - va + 8, (view.h - view.groundY) / view.scale + 4);
    if (!rows) { ctx.globalAlpha = 1; return; }
    var sheen = lit('#c9deef', 0.8), hi = lit('#f4faff', 0.6);
    for (r = 0; r < rows.length; r++) {
      D = rows[r][2];
      for (i = floor(va / D) - 1; i * D < vb + D; i++) {
        if (H(i, r * 9 + 1) < 0.3) continue;
        x = i * D + H(i, r * 9 + 2) * D * 0.7; y = lerp(rows[r][0], rows[r][1], H(i, r * 9 + 3));
        rx = 20 + H(i, r * 9 + 4) * 24; ry = rx * 0.17;
        ctx.globalAlpha = 0.5 * wet; ctx.fillStyle = sheen;
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.ellipse(x + rx * 0.55, y + ry * 0.5, rx * 0.6, ry * 0.75, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.45 * wet; ctx.fillStyle = hi;
        ctx.beginPath(); ctx.ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.5, ry * 0.3, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = hi; ctx.lineWidth = 0.7;
        for (k = 0; k < 2; k++) {                         // rain rings
          u = env.reduced ? 0.35 + k * 0.3 : (env.t * 0.85 + H(i, k + 40 + r)) % 1;
          ctx.globalAlpha = (1 - u) * 0.7 * wet;
          ctx.beginPath(); ctx.ellipse(x + (H(i, k + 50 + floor(env.reduced ? 0 : env.t * 0.85 + H(i, k + 40 + r))) - 0.5) * rx, y, rx * 0.3 * u + 1, ry * 0.5 * u + 0.3, 0, 0, TAU); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawScene(ctx, S, view, env, front) {
    var list = front ? S.front : S.back, s = view.scale, i, ps, camP, ox, va, vb, im, exact, es, dx, dy, dw, dh;
    for (i = 0; i < list.length; i++) {
      ps = list[i];
      if (ps.dead) continue;
      camP = CX + (view.camX - CX) * ps.p; ox = view.cx - camP * s;
      va = camP - view.cx / s; vb = camP + (view.w - view.cx) / s;
      if (ps.fn) {
        ctx.save(); ctx.translate(ox, view.groundY); ctx.scale(s, s);
        try { ps.fn(ctx, va - 2, vb + 2, env, S, view); } catch (e) { ps.dead = true; warn(S.loc + ' pass ' + i + (front ? ' (front)' : ''), e); }
        ctx.restore();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      im = ps.im;
      if (!im) continue;
      if (va < ps.a - 0.5 || vb > ps.b + 0.5) S.short = true;
      exact = abs(s / S.scale - 1) < 0.002; es = exact ? S.scale : s;
      dx = ox + ps.a * s; dy = view.groundY - ps.top * s; dw = im.c.width * es / im.ppu; dh = im.c.height * es / im.ppu;
      if (exact) { dx = round(dx * view.dpr) / view.dpr; dy = round(dy * view.dpr) / view.dpr; }
      blit(ctx, im, dx, dy, dw, dh);
      if (ps.ground) {                                    // flat colour on to the bottom of the canvas, then rain
        var gy = dy + dh - 1;
        if (gy < view.h) { ctx.fillStyle = groundFill(S.frontCol); ctx.fillRect(0, gy, view.w, view.h - gy + 2); }
      }
      if ((ps.lights.length && LT.night > 0.2) || (ps.ground && LT.wet > 0.02)) {
        ctx.save(); ctx.translate(ox, view.groundY); ctx.scale(s, s);
        if (ps.ground && LT.wet > 0.02) drawWet(ctx, S, view, env, va, vb);
        if (ps.lights.length && LT.night > 0.2) drawLights(ctx, ps.lights, va, vb);
        ctx.restore();
      }
    }
  }
  /** the colour a strip pixel of `hex` ends up on screen, for the flat fill under the ground strip */
  function groundFill(hex) {
    var c = hex, h = LT.heat * 0.09 * (1 - LT.dark);
    if (h > 0.004) { var A = rgb(hex); c = mixHex(hex, '#' + (0x1000000 + (min(255, round(A[0] * 2)) << 16 | min(255, round(A[1] * 2)) << 8 | min(255, round(A[2] * 2)))).toString(16).slice(1), h); }
    return LT.dark > 0.004 ? mix(c, NIGHT_COL, NIGHT_A * LT.dark) : c;
  }

  /* ------------------------------------------------------------------ bookkeeping */
  var cur = null, prev = null, pending = null, wipe0 = 0, ticked = false;
  var lastScale = 0, predScale = 0, stable = 0;
  var WIPE_MS = 560;

  function tick(view, env) {
    setLight(env);
    if (!(view.w > 1 && view.h > 1 && view.scale > 0)) return;
    var loc = LOCS[env.loc] ? env.loc : 'street', s = view.scale, dt = env.dt || 0, T = s, t = now();
    // render.js eases the camera with damp(rate 6); look ahead to where the zoom will settle
    if (lastScale && dt > 0.001 && dt < 0.2 && s !== lastScale) T = s + (s - lastScale) / (Math.exp(6 * dt) - 1);
    if (!(T > s * 0.5 && T < s * 2)) T = s;
    stable = predScale && abs(T / predScale - 1) < 0.004 ? stable + 1 : 0;
    predScale = T; lastScale = s;
    if (prev && t - wipe0 > WIPE_MS) prev = null;
    if (!cur) { cur = new Scene(loc, view, s); runSteps(cur, 0); return; }
    var urgent = cur.short || cur.dpr !== (view.dpr || 1) || abs(cur.scale / s - 1) > 0.5;
    var offScale = abs(cur.scale / T - 1) > 0.002;
    if (pending && (pending.loc !== loc || abs(pending.scale / T - 1) > 0.006 || pending.dpr !== (view.dpr || 1))) pending = null;
    if (!pending) {
      if (urgent) pending = new Scene(loc, view, s);
      else if (cur.loc !== loc || (offScale && stable >= 3)) pending = new Scene(loc, view, T);
    }
    if (pending && runSteps(pending, urgent ? 0 : 5)) {
      if (pending.loc !== cur.loc && !env.reduced) { prev = cur; wipe0 = t; } else prev = null;
      cur = pending; pending = null;
    }
  }

  function draw(ctx, view, env, front) {
    if (!cur) return;
    if (!prev) { drawScene(ctx, cur, view, env, front); return; }
    var e = SS.ease.inOutCubic(clamp((now() - wipe0) / WIPE_MS, 0, 1)), sl = view.h * 0.16, x = lerp(-sl - 30, view.w + sl + 30, e);
    ctx.save();                                           // old place, right of the wipe line
    ctx.beginPath(); ctx.moveTo(x + sl, -20); ctx.lineTo(view.w + 40, -20); ctx.lineTo(view.w + 40, view.h + 20); ctx.lineTo(x - sl, view.h + 20); ctx.closePath(); ctx.clip();
    drawScene(ctx, prev, view, env, front);
    ctx.restore();
    ctx.save();                                           // new place, left of it
    ctx.beginPath(); ctx.moveTo(-40, -20); ctx.lineTo(x + sl, -20); ctx.lineTo(x - sl, view.h + 20); ctx.lineTo(-40, view.h + 20); ctx.closePath(); ctx.clip();
    drawScene(ctx, cur, view, env, front);
    ctx.restore();
    if (!front) {                                         // a soft sheen along the edge
      var gr = ctx.createLinearGradient(x - 26, 0, x + 10, 0);
      gr.addColorStop(0, 'rgba(255,250,225,0)'); gr.addColorStop(0.8, 'rgba(255,250,225,.5)'); gr.addColorStop(1, 'rgba(255,250,225,0)');
      ctx.save(); ctx.transform(1, 0, -2 * sl / (view.h + 40), 1, sl + 2 * sl * 20 / (view.h + 40), 0);
      ctx.fillStyle = gr; ctx.fillRect(x - 26, -20, 36, view.h + 40);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ drawing kit (world units) */
  function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function rr(g, x, y, w, h, r, c) {
    r = min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    if (c) { g.fillStyle = c; g.fill(); }
  }
  function poly(g, p, c) { g.beginPath(); g.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); if (c) { g.fillStyle = c; g.fill(); } }
  function circ(g, x, y, r, c) { g.beginPath(); g.arc(x, y, r, 0, TAU); if (c) { g.fillStyle = c; g.fill(); } }
  function ell(g, x, y, rx, ry, c) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); if (c) { g.fillStyle = c; g.fill(); } }
  function seg(g, x0, y0, x1, y1, c, w) { g.strokeStyle = c; g.lineWidth = w || 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  function vgrad(g, y0, y1) {
    var gr = g.createLinearGradient(0, y0, 0, y1), n = arguments.length - 4, i;
    for (i = 0; i <= n; i++) gr.addColorStop(n ? i / n : 0, arguments[3 + i]);
    return gr;
  }
  function hgrad(g, x0, x1) {
    var gr = g.createLinearGradient(x0, 0, x1, 0), n = arguments.length - 4, i;
    for (i = 0; i <= n; i++) gr.addColorStop(n ? i / n : 0, arguments[3 + i]);
    return gr;
  }
  /** texture dots that stay put when a strip is repainted (hashed per cell, not per range) */
  function speckle(g, a, b, y0, y1, cell, per, col, seed, sz) {
    var i, k, x, y;
    g.fillStyle = col;
    for (i = floor(a / cell); i * cell < b; i++) for (k = 0; k < per; k++) {
      x = (i + H(i, seed + k * 3)) * cell; y = lerp(y0, y1, H(i, seed + k * 3 + 1));
      g.fillRect(x, y, sz * (0.6 + H(i, seed + k * 3 + 2)), sz * 0.6);
    }
  }
  function ridgeY(x, seed, wl) {
    return sin(x / wl * TAU + H(seed, 1) * 9) * 0.5 + sin(x / (wl * 0.41) * TAU + H(seed, 2) * 9) * 0.3 + sin(x / (wl * 0.19) * TAU + H(seed, 3) * 9) * 0.2;
  }
  /** a rolling silhouette from x=a to b; top edge = base - amp * (0..1) */
  function ridge(g, a, b, base, amp, wl, seed, fill, bot) {
    g.beginPath(); g.moveTo(a - 8, bot);
    for (var x = a - 8; x <= b + 8; x += 6) g.lineTo(x, base - amp * (0.5 + 0.5 * ridgeY(x, seed, wl)));
    g.lineTo(b + 8, bot); g.closePath(); g.fillStyle = fill; g.fill();
  }
  function ridgeTop(x, base, amp, wl, seed) { return base - amp * (0.5 + 0.5 * ridgeY(x, seed, wl)); }

  var LEAF = {
    fresh: ['#3c7d3e', '#58a04a', '#80c25a', '#b3e07a'],
    deep: ['#2c6a48', '#3f8a55', '#62ab66', '#96cf82'],
    lime: ['#5b8f2f', '#7fb23c', '#a7d04f', '#d5ec80'],
    pink: ['#b95f88', '#e088aa', '#f5b0c8', '#ffdbe8'],
    gold: ['#b5672a', '#d98c2e', '#f0b445', '#fbdc7a'],
    hedge: ['#3d7a45', '#4f9150', '#69a85c', '#8cc06e']
  };
  function hazePal(pal, col, k) { return [mixHex(pal[0], col, k), mixHex(pal[1], col, k), mixHex(pal[2], col, k), mixHex(pal[3], col, k)]; }

  /** painterly foliage: four tones of overlapping blobs, lit from the upper left */
  function crown(g, cx, cy, rx, ry, seed, c) {
    var m = min(rx, ry), i, a, r, x, y;
    function ring(col, k, ox, oy, rs, cnt, off) {
      g.fillStyle = col; g.beginPath();
      g.ellipse(cx + ox, cy + oy, rx * k * 0.95, ry * k * 0.95, 0, 0, TAU);
      for (i = 0; i < cnt; i++) {
        a = (i + H(seed, i + off) * 0.7) / cnt * TAU; r = m * rs * (0.72 + H(seed, i + off + 40) * 0.56);
        x = cx + ox + cos(a) * rx * k; y = cy + oy + sin(a) * ry * k;
        g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
      }
      g.fill();
    }
    ring(c[0], 0.62, 0, 0, 0.46, 12, 0);
    ring(c[1], 0.54, -rx * 0.07, -ry * 0.1, 0.4, 11, 100);
    ring(c[2], 0.4, -rx * 0.17, -ry * 0.24, 0.3, 8, 200);
    ring(c[3], 0.22, -rx * 0.26, -ry * 0.4, 0.17, 6, 300);
    g.fillStyle = c[0]; g.globalAlpha = 0.5;              // leaf dabs for texture
    for (i = 0; i < 16; i++) {
      a = H(seed, i + 400) * TAU; r = Math.sqrt(H(seed, i + 440)) * 0.8;
      x = cx + cos(a) * rx * r + rx * 0.1; y = cy + sin(a) * ry * r + ry * 0.12;
      g.beginPath(); g.ellipse(x, y, m * 0.09, m * 0.045, -0.5, 0, PI); g.fill();
    }
    g.fillStyle = c[3]; g.globalAlpha = 0.55;
    for (i = 0; i < 12; i++) {
      a = H(seed, i + 500) * TAU; r = Math.sqrt(H(seed, i + 540)) * 0.7;
      x = cx + cos(a) * rx * r - rx * 0.15; y = cy + sin(a) * ry * r - ry * 0.2;
      g.beginPath(); g.ellipse(x, y, m * 0.08, m * 0.04, -0.5, PI, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  /** a broad-leaf tree, trunk base at 0,0 */
  function paintLeafy(g, seed, ht, pal, wide) {
    var tw = ht * 0.05, th = ht * 0.46, cw = ht * (wide ? 0.44 : 0.36);
    g.fillStyle = hgrad(g, -tw * 1.3, tw * 1.4, '#7b563c', '#94694a', '#5e402d');
    g.beginPath(); g.moveTo(-tw * 1.5, 0); g.quadraticCurveTo(-tw * 0.7, -th * 0.35, -tw * 0.62, -th); g.lineTo(tw * 0.62, -th);
    g.quadraticCurveTo(tw * 0.7, -th * 0.35, tw * 1.6, 0); g.closePath(); g.fill();
    g.strokeStyle = '#6a4832'; g.lineCap = 'round'; g.lineWidth = tw * 0.75;
    g.beginPath(); g.moveTo(-tw * 0.1, -th * 0.8); g.lineTo(-cw * 0.5, -th * 1.22); g.moveTo(tw * 0.1, -th * 0.88); g.lineTo(cw * 0.55, -th * 1.3); g.stroke();
    g.lineCap = 'butt';
    crown(g, -cw * 0.55, -ht * 0.57, cw * 0.56, ht * 0.17, seed + 1, pal);
    crown(g, cw * 0.58, -ht * 0.61, cw * 0.54, ht * 0.165, seed + 2, pal);
    crown(g, 0, -ht * 0.71, cw * 0.95, ht * 0.27, seed, pal);
  }
  function treeSprite(S, seed, ht, pal, wide, o) {
    var w = ht * (wide ? 1.2 : 1.02), h = ht * 1.03;
    var im = S.sprite(w, h, w / 2, h - 1, function (g) { paintLeafy(g, seed, ht, pal, wide); }, o);
    im.tree = true;
    return im;
  }
  function bush(g, x, y, w, h, seed, pal) { crown(g, x, y - h * 0.5, w * 0.5, h * 0.56, seed, pal); }
  function tuft(g, x, y, s, col) {
    g.strokeStyle = col; g.lineWidth = s * 0.22; g.lineCap = 'round'; g.beginPath();
    g.moveTo(x - s * 0.5, y); g.quadraticCurveTo(x - s * 0.6, y - s * 0.6, x - s * 0.9, y - s);
    g.moveTo(x, y); g.quadraticCurveTo(x, y - s * 0.8, x + s * 0.15, y - s * 1.3);
    g.moveTo(x + s * 0.5, y); g.quadraticCurveTo(x + s * 0.7, y - s * 0.5, x + s, y - s * 0.9);
    g.stroke(); g.lineCap = 'butt';
  }
  function flowers(g, x, y, w, seed, cols, n) {
    var i, fx, fy, c;
    for (i = 0; i < n; i++) {
      fx = x + H(seed, i) * w; fy = y - 2 - H(seed, i + 30) * 7;
      seg(g, fx, y, fx, fy, '#4c8a3f', 0.8);
      c = cols[floor(H(seed, i + 60) * cols.length)];
      circ(g, fx, fy, 1.7 + H(seed, i + 90), c); circ(g, fx, fy, 0.6, '#fff3b0');
    }
  }
  /** a hedge with a bumpy top between xa and xb, standing on y */
  function hedge(g, xa, xb, y, h, seed, pal, soft) {
    var x, r, i = 0;
    g.fillStyle = vgrad(g, y - h, y, pal[1], pal[0]);
    g.beginPath(); g.moveTo(xa, y); g.lineTo(xa, y - h * 0.7);
    for (x = xa; x < xb; x += 11) { r = 7 + H(seed, floor(x / 11)) * 4; g.arc(min(x + 5.5, xb - 3), y - h + r * 0.55, r, PI, TAU); }
    g.lineTo(xb, y); g.closePath(); g.fill();
    g.fillStyle = pal[2]; g.globalAlpha = soft ? 0.45 : 0.8;
    for (x = xa + 3; x < xb - 4; x += 7) { i = floor(x / 7); g.beginPath(); g.ellipse(x + H(seed, i + 3) * 4, y - h + 3 + H(seed, i + 7) * h * 0.3, 3.4, 1.9, -0.4, 0, TAU); g.fill(); }
    g.fillStyle = pal[0]; g.globalAlpha = soft ? 0.25 : 0.5;
    for (x = xa + 2; x < xb - 4; x += 6) { i = floor(x / 6); g.beginPath(); g.ellipse(x + H(seed, i + 13) * 4, y - h * 0.15 - H(seed, i + 17) * h * 0.5, 2.6, 1.4, -0.4, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  }
  function pickets(g, xa, xb, y, h) {
    var x, i;
    g.fillStyle = '#e9e2d2'; g.fillRect(xa, y - h * 0.72, xb - xa, 2.6); g.fillRect(xa, y - h * 0.3, xb - xa, 2.6);
    for (x = ceil(xa / 7) * 7; x < xb - 3; x += 7) {
      g.fillStyle = '#fffdf7'; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h + 3.2); g.lineTo(x + 2.3, y - h); g.lineTo(x + 4.6, y - h + 3.2); g.lineTo(x + 4.6, y); g.closePath(); g.fill();
      g.fillStyle = '#ddd5c3'; g.fillRect(x + 3.7, y - h + 3.4, 0.9, h - 3.4);
    }
    for (i = ceil(xa / 63); i * 63 < xb - 4; i++) {
      x = i * 63; g.fillStyle = '#fffdf7'; g.fillRect(x - 1, y - h - 3, 6.4, h + 3); g.fillStyle = '#ddd5c3'; g.fillRect(x + 4.2, y - h - 3, 1.2, h + 3);
      rr(g, x - 2.2, y - h - 5.4, 8.8, 3.2, 1.2, '#fffdf7');
    }
  }
  /** glass, frame, mullions; registers its panes as night lights on the strip being painted */
  function win(g, S, x, y, w, h, o) {
    o = o || {};
    var trim = o.trim || '#fffaf0', nx = o.nx || 2, ny = o.ny || 2, i, j, sd = (x * 13.7 + y * 7.3 + (S && S.tf ? S.tf.x * 3.3 : 0)) | 0, pw, ph, t = 1.5;
    if (o.sh) {
      var sw = w * 0.34;
      rect(g, x - sw - 2.6, y - 1, sw, h + 2, o.sh); rect(g, x + w + 2.6, y - 1, sw, h + 2, o.sh);
      g.fillStyle = 'rgba(0,0,0,.14)';
      for (j = y + 2; j < y + h; j += 3.4) { g.fillRect(x - sw - 1.6, j, sw - 2, 0.9); g.fillRect(x + w + 3.6, j, sw - 2, 0.9); }
    }
    rect(g, x - 2.2, y - 2.2, w + 4.4, h + 4.4, trim);
    g.fillStyle = vgrad(g, y, y + h, o.g0 || '#b4d4e4', o.g1 || '#7aa3bd'); g.fillRect(x, y, w, h);
    if (o.curt) { g.fillStyle = 'rgba(255,255,255,.6)'; poly(g, [x, y, x + w * 0.42, y, x, y + h * 0.7]); g.fill(); poly(g, [x + w, y, x + w * 0.58, y, x + w, y + h * 0.7]); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.2)'; poly(g, [x, y + h * 0.62, x + w * 0.62, y, x + w * 0.86, y, x, y + h * 0.9]); g.fill();
    if (S && (o.lit == null ? H(sd, 1) < 0.78 : o.lit)) {
      var thr = o.thr == null ? 0.3 + H(sd, 2) * 0.42 : o.thr, lc = o.lc || (H(sd, 3) < 0.16 ? '#cfe2ff' : H(sd, 4) < 0.5 ? '#ffd98f' : '#ffc670');
      pw = (w - t * (nx - 1)) / nx; ph = (h - t * (ny - 1)) / ny;
      for (i = 0; i < nx; i++) for (j = 0; j < ny; j++) S.light(x + i * (pw + t), y + j * (ph + t), pw, ph, { thr: thr, c: lc, g: i || j ? 0 : (o.glow == null ? max(w, h) * 1.5 : o.glow) });
    }
    g.fillStyle = trim;
    for (i = 1; i < nx; i++) g.fillRect(x + i * w / nx - t / 2, y, t, h);
    for (j = 1; j < ny; j++) g.fillRect(x, y + j * h / ny - t / 2, w, t);
    if (!o.nosill) { rect(g, x - 3.6, y + h + 2, w + 7.2, 2.6, trim); rect(g, x - 3.6, y + h + 4.6, w + 7.2, 1, 'rgba(0,0,0,.12)'); }
    if (o.box) { rr(g, x - 3, y + h + 3, w + 6, 6, 1.5, o.box); flowers(g, x - 1, y + h + 4, w + 2, sd, ['#ff6f7d', '#ffd24a', '#ff9ac1', '#ffffff'], 7); }
  }

  /* ---- vehicles (origin: middle of the wheelbase on the road, facing right) ---- */
  function paintCar(g, col, kind) {
    var dk = mixHex(col, '#141826', 0.4), lt = mixHex(col, '#ffffff', 0.4), van = kind === 'van';
    ell(g, 0, 1, 82, 5.5, 'rgba(10,14,26,.3)');
    g.fillStyle = vgrad(g, -64, -30, lt, col);            // cabin
    g.beginPath();
    if (van) { g.moveTo(-74, -34); g.lineTo(-74, -66); g.quadraticCurveTo(-74, -72, -66, -72); g.lineTo(34, -72); g.quadraticCurveTo(48, -70, 62, -40); g.lineTo(62, -34); }
    else { g.moveTo(-58, -32); g.bezierCurveTo(-52, -50, -44, -60, -28, -60); g.lineTo(18, -60); g.bezierCurveTo(32, -60, 42, -46, 56, -33); }
    g.closePath(); g.fill();
    g.fillStyle = vgrad(g, -40, -8, lt, col, col, dk);    // body
    rr(g, -80, -38, 160, 30, 11); g.fill();
    g.fillStyle = vgrad(g, -60, -34, '#d8f0fa', '#8fbdd6');   // glass
    if (van) { rr(g, 12, -66, 34, 24, 4); g.fill(); rr(g, -22, -66, 30, 24, 3); g.fill(); rr(g, -68, -66, 40, 24, 3); g.fill(); }
    else { poly(g, [-48, -36, -40, -53, -30, -55, -6, -55, -6, -36]); g.fill(); poly(g, [-1, -36, -1, -55, 17, -55, 28, -50, 44, -36]); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.35)'; poly(g, [4, -40, 12, -54, 17, -54, 9, -40]); g.fill();
    rect(g, -78, -22, 156, 1.6, 'rgba(255,255,255,.28)'); rect(g, -3.6, -36, 1.2, 24, 'rgba(0,0,0,.18)');
    rr(g, 6, -31, 9, 2.4, 1.2, 'rgba(0,0,0,.3)');
    rr(g, -84, -17, 16, 7, 3, '#cfd5dc'); rr(g, 68, -17, 16, 7, 3, '#cfd5dc');   // bumpers
    rr(g, 72, -31, 8, 8, 3, '#fff4c4'); rr(g, -80, -31, 6, 8, 2.5, '#e8473f');     // head and tail lights
    if (kind === 'taxi') { rr(g, -12, -67, 22, 8, 2.5, '#fff7d0'); rect(g, -78, -27, 156, 3, '#2b2f38'); for (var i = -76; i < 76; i += 6) rect(g, i, -27, 3, 3, '#fff7d0'); }
    for (var s = -1; s <= 1; s += 2) {                    // wheels
      circ(g, s * 48, -13, 16, dk); circ(g, s * 48, -13, 13.2, '#262a31'); circ(g, s * 48, -13, 7.6, '#d5dae0'); circ(g, s * 48, -13, 3, '#8c939c');
    }
  }
  function carSprite(S, col, kind) { return S.sprite(176, 82, 88, 74, function (g) { paintCar(g, col, kind); }); }
  /** head-lamp beams and a tail-light glow for a car at x (wheels on y), heading dir */
  function carLights(ctx, x, y, dir, a) {
    if (a <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, '#fff1bf', x + dir * 118, y - 20, 62, a * 0.5, 17);
    glow(ctx, '#fff6d6', x + dir * 78, y - 27, 13, a * 0.9);
    glow(ctx, '#ff5a4a', x - dir * 79, y - 27, 10, a * 0.7);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /* ---- little bits of life shared by several places ---- */
  function flock(ctx, va, vb, env, seed, yTop, yBot, cnt, col) {
    var fade = (1 - LT.night / 0.55) * (1 - LT.wet * 1.6), span = vb - va + 240, i, x, y, f, s, t = env.reduced ? 3.3 : env.t;
    if (fade <= 0.02) return;
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.globalAlpha = min(1, fade) * 0.75;
    ctx.beginPath();
    for (i = 0; i < cnt; i++) {
      x = va - 120 + (((H(seed, i + 50) * span + t * (12 + H(seed, i) * 14) * (H(seed, i + 70) < 0.5 ? 1 : -1)) % span) + span) % span;
      y = lerp(yTop, yBot, H(seed, i + 90)) + sin(t * 0.6 + i * 1.7) * 6;
      f = sin(t * (6 + H(seed, i + 9) * 3) + i * 2) * 3; s = 4.5 + H(seed, i + 3) * 3;
      ctx.moveTo(x - s, y - f); ctx.quadraticCurveTo(x - s * 0.45, y - f * 0.3 - 1.6, x, y); ctx.quadraticCurveTo(x + s * 0.45, y - f * 0.3 - 1.6, x + s, y - f);
    }
    ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
  function smoke(ctx, x, y, env, seed, scale) {
    var k, u, a = 0.5 * (1 - LT.night * 0.55), n = env.reduced ? 3 : 6, t = env.reduced ? 2 : env.t;
    for (k = 0; k < n; k++) {
      u = (t * 0.11 + k / n + H(seed, 1)) % 1;
      puff(ctx, x + (env.wind || 0) * u * u * 60 + sin(u * 7 + k) * 3, y - u * 54 * scale, (4 + u * 13) * scale, a * (1 - u) * min(1, u * 6));
    }
    ctx.globalAlpha = 1;
  }

  /* ================================================================== MAPLE STREET */
  var WALLS = ['#f7e7b4', '#cfe6d2', '#c9dff0', '#f5cdb4', '#ddd0ee', '#f3c3c8', '#f3ecdc'];
  var ROOFS = ['#6f7f93', '#b7694f', '#8b6c58', '#55838a', '#7d6180', '#5f6b7c'];
  var ACCENTS = ['#d2493f', '#2f7f8a', '#e9b93a', '#3f5a9a', '#5f9e55', '#b65a8a'];
  var LOT = 460, LOT0 = 180, LAWN = -40, HK = 1.35;
  function calmAt(x) { return x > 190 && x < 770; }      // behind the stand and the line: keep it quiet
  function lot(i) {                                       // lot 1 is your own house, right behind the stand
    var sd = i * 31 + 5, home = i === 1, x = LOT0 + i * LOT + (i === 0 || home ? 0 : (H(sd, 9) - 0.5) * 36);
    var w = home ? 178 : round(152 + H(sd, 1) * 40), bay = home ? 2 : i === 0 ? 0 : floor(H(sd, 4) * 3);
    return { sd: sd, x: x, w: w, home: home, two: home ? true : i === 0 ? false : H(sd, 2) < 0.45, rt: home ? 0 : i === 0 ? 1 : floor(H(sd, 3) * 3),
      bay: bay, door: x + [-0.3 * w, 0, 0.3 * w][bay] * HK, calm: calmAt(x - 50) || calmAt(x + 50) };
  }

  function house(g, S, i) {
    var L = lot(i), sd = L.sd, w = L.w, calm = L.calm, two = L.two, hw = two ? 128 : 78, ty = -hw, x0 = -w / 2, x1 = w / 2, rt = L.rt;
    var wall = WALLS[(((i * 3 + (L.home ? 6 : 0)) % 7) + 7) % 7], roofC = ROOFS[(((i * 5 + 1) % 6) + 6) % 6], acc = ACCENTS[(((i * 2 + 3) % 6) + 6) % 6];
    var trim = calm ? mixHex('#fffaf0', wall, 0.22) : '#fffaf0', bays = [-0.3 * w, 0, 0.3 * w], dx = bays[L.bay], b, k;
    if (calm) { roofC = mixHex(roofC, '#cfd9e2', 0.22); acc = mixHex(acc, wall, 0.3); }
    var roofDk = mixHex(roofC, '#1a2030', 0.25), roofLt = mixHex(roofC, '#ffffff', 0.22), gable = mixHex(wall, '#ffffff', 0.18);
    g.save(); g.translate(L.x, LAWN); g.scale(HK, HK); S.tf = { x: L.x, y: LAWN, k: HK };

    poly(g, [x0 + 2, -1, x1, -1, x1 + 24, 8, x0 + 20, 8], 'rgba(30,70,40,.16)');                               // shadow on the lawn
    // chimney, behind the roof
    var chx = (H(sd, 5) < 0.5 ? -1 : 1) * w * 0.27, chTop = ty - (rt === 1 ? 58 : 62);
    rect(g, chx - 8, chTop, 16, 60, '#b9735a'); rect(g, chx + 3, chTop, 5, 60, 'rgba(0,0,0,.14)');
    g.fillStyle = 'rgba(255,255,255,.16)'; for (k = chTop + 5; k < chTop + 56; k += 6) g.fillRect(chx - 8, k, 16, 0.9);
    rect(g, chx - 10, chTop - 4, 20, 5, '#8f5a48');
    S.smokes.push({ x: L.x + chx * HK, y: LAWN + (chTop - 6) * HK, on: H(sd, 6) < 0.6 });

    // walls
    g.fillStyle = vgrad(g, ty, 0, wall, mixHex(wall, '#8a7f9a', 0.14)); g.fillRect(x0, ty, w, hw);
    g.fillStyle = 'rgba(60,50,80,.055)'; for (k = ty + 6; k < -6; k += 6.5) g.fillRect(x0, k, w, 0.9);          // clapboard
    rect(g, x0, -6, w, 6, mixHex(wall, '#70687a', 0.45));                                                       // foundation
    rect(g, x0, ty, 4.2, hw - 6, trim); rect(g, x1 - 4.2, ty, 4.2, hw - 6, trim);
    if (two) { rect(g, x0, -70, w, 3, trim); rect(g, x0, -67, w, 1.2, 'rgba(0,0,0,.08)'); }

    // roof
    if (rt === 1) {                                       // gable end to the street
      poly(g, [x0 - 2, ty + 1, 0, ty - 62, x1 + 2, ty + 1], gable);
      g.fillStyle = 'rgba(60,50,80,.055)'; for (k = ty - 52; k < ty; k += 6.5) { b = (ty - k) / 62 * (w / 2 + 2); g.fillRect(-(w / 2 + 2) + b, k, 2 * (w / 2 + 2 - b), 0.9); }
      g.lineJoin = 'miter'; g.strokeStyle = roofDk; g.lineWidth = 9;
      g.beginPath(); g.moveTo(x0 - 15, ty + 7); g.lineTo(0, ty - 66); g.lineTo(x1 + 15, ty + 7); g.stroke();
      g.strokeStyle = roofC; g.lineWidth = 6.5; g.beginPath(); g.moveTo(x0 - 15, ty + 4.4); g.lineTo(0, ty - 68.6); g.lineTo(x1 + 15, ty + 4.4); g.stroke();
      g.strokeStyle = roofLt; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x0 - 15, ty + 1.6); g.lineTo(0, ty - 71.4); g.lineTo(x1 + 15, ty + 1.6); g.stroke();
      circ(g, 0, ty - 24, 11.5, trim); circ(g, 0, ty - 24, 8.6, '#8fb6cc'); rect(g, -0.8, ty - 32.6, 1.6, 17.2, trim); rect(g, -8.6, ty - 24.8, 17.2, 1.6, trim);
      S.light(-7, ty - 31, 14, 14, { thr: 0.45 + H(sd, 20) * 0.3, c: '#ffd98f', k: 0.55 });
    } else {
      var ins = rt === 2 ? 30 : 5, rh = rt === 2 ? 44 : 50;
      g.fillStyle = vgrad(g, ty - rh, ty + 4, roofLt, roofC, roofC); poly(g, [x0 - 12, ty + 3, x1 + 12, ty + 3, x1 - ins, ty - rh, x0 + ins, ty - rh]); g.fill();
      g.save(); g.clip(); g.strokeStyle = 'rgba(20,20,40,.13)'; g.lineWidth = 0.9;                              // shingle courses
      for (k = ty - rh + 7; k < ty + 3; k += 7) { g.beginPath(); g.moveTo(x0 - 14, k); g.lineTo(x1 + 14, k); g.stroke(); }
      for (k = 0; k < 60; k++) { b = x0 - 12 + H(sd, k + 200) * (w + 24); var ry = ty - rh + 7 * floor(H(sd, k + 300) * (rh / 7)); g.beginPath(); g.moveTo(b, ry); g.lineTo(b, ry + 7); g.stroke(); }
      g.restore();
      rect(g, x0 + ins - 2, ty - rh - 2, w - ins * 2 + 4, 3.4, roofDk); rect(g, x0 - 13, ty + 1, w + 26, 4.4, trim);
      if (!two) for (k = -1; k <= 1; k += 2) {            // dormers
        b = k * w * 0.24;
        rect(g, b - 13, ty - 34, 26, 26, gable); poly(g, [b - 17, ty - 33, b, ty - 49, b + 17, ty - 33], roofDk); poly(g, [b - 13, ty - 34, b, ty - 46, b + 13, ty - 34], gable);
        win(g, S, b - 7, ty - 30, 14, 16, { trim: trim, nosill: true, glow: 20 });
      }
    }
    rect(g, x0, ty + 5.4, w, 6, 'rgba(50,50,90,.09)');                                                          // shade under the eaves

    // upstairs windows
    if (two) for (k = 0; k < 3; k++) win(g, S, bays[k] - 11, -114, 22, 30, { trim: trim, sh: calm ? null : mixHex(acc, '#2a3040', 0.25), curt: H(sd, k + 30) < 0.6 });

    // porch or stoop
    var porch = !calm && H(sd, 7) < 0.65, px0 = x0 + 6, px1 = x1 - 6;
    if (porch) rect(g, px0, -58, px1 - px0, 52, 'rgba(40,40,70,.10)');
    for (k = 0; k < 3; k++) if (k !== L.bay) win(g, S, bays[k] - 12, -56, 24, 32, { trim: trim, sh: calm || porch ? null : mixHex(acc, '#2a3040', 0.25), box: !calm && !porch && H(sd, k + 40) < 0.6 ? '#b98a62' : null, curt: true });
    rect(g, dx - 13, -53, 26, 47, trim);
    g.fillStyle = vgrad(g, -50, -6, mixHex(acc, '#ffffff', 0.12), acc); g.fillRect(dx - 10.5, -50.5, 21, 44.5);
    g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(dx - 7.5, -30, 6, 20); g.fillRect(dx + 1.5, -30, 6, 20);
    rr(g, dx - 7.5, -46.5, 15, 12, 2, '#a9cbdc'); rect(g, dx - 0.6, -46.5, 1.2, 12, trim);
    S.light(dx - 7.5, -46.5, 15, 12, { thr: 0.32 + H(sd, 21) * 0.2, c: '#ffe2a1', k: 0.8 });
    circ(g, dx + 7, -27, 1.4, '#f2cf62');
    rr(g, dx - 17.5, -43, 4.4, 7, 1, '#3a3f4c');          // porch lantern
    S.light(dx - 17, -42.4, 3.4, 5.6, { thr: 0.3, c: '#fff0c0', g: 30, gc: '#ffcf80' });
    if (porch) {
      g.fillStyle = vgrad(g, -70, -56, roofLt, roofC); poly(g, [px0 - 8, -56, px1 + 8, -56, px1 - 2, -70, px0 + 2, -70]); g.fill();
      rect(g, px0 - 8, -57, px1 - px0 + 16, 3.4, trim); rect(g, px0 - 8, -53.6, px1 - px0 + 16, 1.2, 'rgba(0,0,0,.12)');
      rect(g, px0 - 2, -8, px1 - px0 + 4, 8, '#d8c8ac'); rect(g, px0 - 2, -8, px1 - px0 + 4, 1.6, '#efe3cc');
      for (k = 0; k <= 4; k++) { b = lerp(px0, px1 - 4, k / 4); if (abs(b + 2 - dx) < 13) continue; rect(g, b, -54, 4, 46, trim); rect(g, b + 3, -54, 1, 46, 'rgba(0,0,0,.1)'); }
      g.fillStyle = trim;
      for (b = px0; b < px1 - 2; b += 4.6) if (abs(b - dx) > 15) g.fillRect(b, -22, 1.3, 14);
      if (dx - 15 > px0) g.fillRect(px0, -23.5, dx - 15 - px0, 2.2);
      if (px1 > dx + 15) g.fillRect(dx + 15, -23.5, px1 - dx - 15, 2.2);
    } else {
      poly(g, [dx - 20, -53, dx + 20, -53, dx + 15, -61, dx - 15, -61], roofC); rect(g, dx - 20, -54, 40, 2.4, trim);
    }
    for (k = 0; k < 3; k++) { rect(g, dx - 13 - k * 2.5, -6 + k * 2, 26 + k * 5, 2, '#e9dfcb'); rect(g, dx - 13 - k * 2.5, -4.6 + k * 2, 26 + k * 5, 0.7, 'rgba(0,0,0,.14)'); }

    // planting along the front
    var bp = calm ? LEAF.hedge : LEAF.deep;
    for (k = 0; k < 3; k++) if (k !== L.bay) {
      bush(g, bays[k] - 9, 1, 30, 20 + H(sd, k + 50) * 6, sd + k, bp); bush(g, bays[k] + 12, 2, 24, 16, sd + k + 9, bp);
      if (!calm) flowers(g, bays[k] - 20, 2, 40, sd + k * 7, ['#ff7a8a', '#ffd04f', '#ffffff', '#c58cff'], 9);
    }
    g.restore(); S.tf = null;
  }

  /** what stands in the gap between two houses: nothing much near the stand, garden things further out */
  function sideYard(g, S, i) {
    var A = lot(i), B = lot(i + 1), xa = A.x + A.w * HK / 2, xb = B.x - B.w * HK / 2, x = (xa + xb) / 2, k, calm = calmAt(x), kind = floor(H(i, 43) * 3);
    if (H(i, 41) < 0.45 && !calm) {                       // a board fence at the back of the garden
      rect(g, xa - 6, LAWN - 44, xb - xa + 12, 44, '#b79673'); g.fillStyle = 'rgba(60,40,20,.16)'; for (k = xa - 6; k < xb + 6; k += 8) g.fillRect(k, LAWN - 44, 1, 44);
      rect(g, xa - 6, LAWN - 46, xb - xa + 12, 3, '#c9aa85');
    } else hedge(g, xa - 6, xb + 6, LAWN, calm ? 34 : 44, i + 50, calm ? LEAF.hedge : LEAF.deep, true);
    if (calm) return;
    if (kind === 0) {                                     // swing set
      g.strokeStyle = '#d2493f'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
      g.moveTo(x - 40, LAWN + 6); g.lineTo(x - 30, LAWN - 62); g.lineTo(x - 20, LAWN + 6); g.moveTo(x + 40, LAWN + 6); g.lineTo(x + 30, LAWN - 62); g.lineTo(x + 20, LAWN + 6);
      g.moveTo(x - 32, LAWN - 62); g.lineTo(x + 32, LAWN - 62); g.stroke(); g.lineCap = 'butt';
      for (k = -1; k <= 1; k += 2) { seg(g, x + k * 13 - 5, LAWN - 61, x + k * 13 - 6, LAWN - 16, '#6b7280', 0.9); seg(g, x + k * 13 + 5, LAWN - 61, x + k * 13 + 6, LAWN - 16, '#6b7280', 0.9); rr(g, x + k * 13 - 8, LAWN - 17, 16, 3.4, 1.4, k < 0 ? '#3f5a9a' : '#e9b93a'); }
    } else if (kind === 1) {                              // garden shed
      rect(g, x - 30, LAWN - 52, 60, 54, '#9fb8a3'); g.fillStyle = 'rgba(30,50,40,.12)'; for (k = x - 30; k < x + 30; k += 6) g.fillRect(k, LAWN - 52, 0.9, 54);
      poly(g, [x - 37, LAWN - 50, x, LAWN - 74, x + 37, LAWN - 50], '#6f7f93'); poly(g, [x - 37, LAWN - 50, x, LAWN - 74, x, LAWN - 70, x - 31, LAWN - 50], 'rgba(255,255,255,.2)');
      rect(g, x - 9, LAWN - 36, 18, 38, '#6f8f7a'); circ(g, x + 5, LAWN - 16, 1.2, '#f2cf62');
      rect(g, x + 14, LAWN - 38, 11, 11, '#bcd6e4'); S.light(x + 14, LAWN - 38, 11, 11, { thr: 0.5, k: 0.7 });
    } else {                                              // washing line
      rect(g, x - 44, LAWN - 60, 3, 62, '#8a6a4c'); rect(g, x + 41, LAWN - 60, 3, 62, '#8a6a4c');
      g.strokeStyle = '#eef0f2'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 42, LAWN - 58); g.quadraticCurveTo(x, LAWN - 52, x + 42, LAWN - 58); g.stroke();
      var cols = ['#ffffff', '#ff9ac1', '#8fd3ff', '#ffe27a', '#b7e3a0'];
      for (k = 0; k < 5; k++) { var lx = x - 34 + k * 15, ly = LAWN - 56 + (1 - abs(k - 2) / 2.4) * 2.6; rect(g, lx, ly, 10, 14 + (k % 2) * 6, cols[k]); rect(g, lx, ly, 10, 2, 'rgba(0,0,0,.08)'); }
    }
  }

  function lawnAndPaths(g, a, b) {
    var i, x, L;
    g.fillStyle = vgrad(g, LAWN - 2, 0, '#a2d96d', '#8ccb5e', '#7dbb54'); g.fillRect(a, LAWN - 2, b - a, 2 - LAWN);
    g.fillStyle = 'rgba(255,255,255,.08)';                // mowing stripes
    for (x = floor(a / 52) * 52; x < b; x += 52) { g.beginPath(); g.moveTo(x, LAWN - 2); g.lineTo(x + 24, LAWN - 2); g.lineTo(x + 38, 0); g.lineTo(x + 6, 0); g.fill(); }
    for (i = floor((a - LOT0) / LOT) - 1; LOT0 + i * LOT < b + LOT; i++) {      // front paths
      L = lot(i);
      poly(g, [L.door - 14, LAWN + 9, L.door + 14, LAWN + 9, L.door + 19, 0, L.door - 19, 0], '#eadfc9');
      g.fillStyle = 'rgba(120,100,70,.2)'; for (x = LAWN + 16; x < 0; x += 8) g.fillRect(L.door - 18, x, 36, 0.8);
    }
    speckle(g, a, b, LAWN + 1, -1, 16, 3, 'rgba(255,255,255,.2)', 71, 1.4);
    speckle(g, a, b, LAWN + 1, -1, 22, 2, 'rgba(40,90,40,.25)', 73, 1.6);
  }

  function paveStreet(g, a, b, S) {
    var i, x, k, home = lot(1), hx0 = 196, hx1 = 768, gx = home.door;
    // back edge: a clipped hedge behind the stand and the line, picket fence everywhere else
    if (a < hx0) pickets(g, a, min(b, hx0 - 4), 0, 30);
    if (b > hx1) pickets(g, max(a, hx1 + 4), b, 0, 30);
    if (b > hx0 && a < hx1) {
      hedge(g, hx0, gx - 15, 0, 27, 3, LEAF.hedge, true); hedge(g, gx + 15, hx1, 0, 27, 4, LEAF.hedge, true);
      rect(g, gx - 17, -29, 4, 29, '#fffdf7'); rect(g, gx + 13, -29, 4, 29, '#fffdf7');                         // the gate at your own path
      for (x = gx - 11; x < gx + 11; x += 5.6) rect(g, x, -23, 3.2, 23, '#fffdf7');
      rect(g, gx - 13, -18, 26, 2, '#e9e2d2'); rect(g, gx - 13, -8, 26, 2, '#e9e2d2');
    }
    for (i = floor((a - LOT0) / LOT) - 1; LOT0 + i * LOT < b + LOT; i++) {      // mailboxes and flowers by the fence
      x = lot(i).door + 34;
      if (calmAt(x) && i !== 1) continue;
      rect(g, x - 1.8, -31, 3.6, 31, '#8a6a4c'); rr(g, x - 10, -42, 20, 12, 5, ACCENTS[((i % 6) + 6) % 6]); rect(g, x - 10, -34, 20, 4, 'rgba(0,0,0,.12)');
      rect(g, x + 8, -47, 1.4, 9, '#d9d9d9'); rect(g, x + 8, -47, 6, 4, '#e2483e');
      if (i === 1) continue;
      flowers(g, x - 110, 0, 60, i + 300, ['#ff7a8a', '#ffd04f', '#ffffff'], 12); flowers(g, x + 12, 0, 70, i + 320, ['#c58cff', '#ffffff', '#ff9ac1'], 13);
      tuft(g, x - 6, 0, 5, '#5f9e4a'); tuft(g, x + 7, 0, 4, '#6fae52');
    }

    // sidewalk
    g.fillStyle = vgrad(g, 0, WALK, '#c9c2b5', '#dad4c8', '#e2ddd2', '#e6e1d7'); g.fillRect(a, 0, b - a, WALK);
    g.fillStyle = vgrad(g, 0, 10, 'rgba(60,70,60,.3)', 'rgba(60,70,60,0)'); g.fillRect(a, 0, b - a, 10);
    speckle(g, a, b, 2, WALK - 2, 12, 3, 'rgba(120,112,98,.22)', 5, 1.2);
    speckle(g, a, b, 2, WALK - 2, 15, 2, 'rgba(255,255,255,.35)', 9, 1.1);
    for (i = floor(a / 74); i * 74 < b; i++) {
      x = i * 74; rect(g, x, 0, 1.3, WALK, 'rgba(110,102,90,.42)'); rect(g, x + 1.3, 0, 1, WALK, 'rgba(255,255,255,.4)');
      if (H(i, 81) < 0.3 && !calmAt(x)) tuft(g, x + 0.6, 6 + H(i, 82) * 70, 3.2, '#79ad55');
      if (H(i, 83) < 0.22) { g.strokeStyle = 'rgba(110,102,90,.4)'; g.lineWidth = 0.8; g.beginPath(); k = x + 20 + H(i, 84) * 30; g.moveTo(k, 90); g.lineTo(k + 6, 72); g.lineTo(k + 2, 58); g.lineTo(k + 9, 44); g.stroke(); }
    }
    hopscotch(g, 796, 22);
    for (i = floor(a / 900) - 1; i * 900 < b; i++) {      // chalk doodles further along
      x = i * 900 + 60; if (calmAt(x) || calmAt(x + 50)) continue;
      g.globalAlpha = 0.8; g.strokeStyle = '#fff2a8'; g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath(); g.ellipse(x + 20, 50, 9, 4.6, 0, 0, TAU); g.stroke();
      for (k = 0; k < 8; k++) { g.beginPath(); g.moveTo(x + 20 + cos(k * PI / 4) * 12, 50 + sin(k * PI / 4) * 6.2); g.lineTo(x + 20 + cos(k * PI / 4) * 17, 50 + sin(k * PI / 4) * 8.8); g.stroke(); }
      g.strokeStyle = '#ffb3d1'; g.beginPath(); g.moveTo(x + 52, 56); g.bezierCurveTo(x + 44, 46, x + 56, 42, x + 58, 50); g.bezierCurveTo(x + 60, 42, x + 72, 46, x + 64, 56); g.lineTo(x + 58, 62); g.closePath(); g.stroke();
      g.globalAlpha = 1; g.lineCap = 'butt';
    }
    // curb
    rect(g, a, WALK, b - a, 4.5, '#f1ede4'); g.fillStyle = vgrad(g, WALK + 4.5, WALK + 13, '#bdb6a8', '#9d968a'); g.fillRect(a, WALK + 4.5, b - a, 8.5);
    for (i = floor(a / 148); i * 148 < b; i++) rect(g, i * 148, WALK, 1, 13, 'rgba(90,84,74,.35)');
    // asphalt
    g.fillStyle = vgrad(g, WALK + 13, 300, '#626a77', '#565d6a', '#4b525e'); g.fillRect(a, WALK + 13, b - a, 300 - WALK - 13);
    g.fillStyle = vgrad(g, WALK + 13, WALK + 21, 'rgba(20,24,34,.4)', 'rgba(20,24,34,0)'); g.fillRect(a, WALK + 13, b - a, 8);
    speckle(g, a, b, WALK + 15, 298, 10, 5, 'rgba(255,255,255,.09)', 21, 1.3);
    speckle(g, a, b, WALK + 15, 298, 13, 4, 'rgba(15,18,26,.16)', 25, 1.6);
    for (i = floor(a / 84); i * 84 < b; i++) { rr(g, i * 84 + 8, 204, 44, 5, 1.5, '#ecd06a'); rect(g, i * 84 + 8, 207.6, 44, 1.4, 'rgba(0,0,0,.1)'); }
    for (i = floor(a / 620) - 1; i * 620 < b; i++) {
      x = i * 620 + 330; ell(g, x, 150, 24, 7.5, '#444b56'); ell(g, x, 149.3, 21, 6.2, '#59606c'); g.strokeStyle = 'rgba(20,24,32,.4)'; g.lineWidth = 0.8;
      for (k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x - 18, 149.3 + k * 2); g.lineTo(x + 18, 149.3 + k * 2); g.stroke(); }
      x = i * 620 + 70; rr(g, x, WALK + 6, 30, 5.5, 1.5, '#2c3038');                                            // storm drain in the curb
      g.fillStyle = 'rgba(150,100,40,.55)'; for (k = 0; k < 5; k++) ell(g, x + 36 + k * 5 + H(i, k) * 8, WALK + 16 + H(i, k + 5) * 4, 2.4, 1.1);
    }
  }
  function hopscotch(g, x, y) {
    var cols = ['#ffc9df', '#bfe4ff', '#fff0a6', '#c9f2bf'], lay = [[0, 0], [1, 0], [2, 0], [3, -0.5], [3, 0.5], [4, 0], [5, -0.5], [5, 0.5]], s = 19, i, px, py;
    g.save(); g.transform(1, 0, -0.25, 0.5, x, y + 22);   // laid flat on the pavement
    g.lineWidth = 2; g.lineJoin = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 12px ' + FONT;
    for (i = 0; i < lay.length; i++) {
      px = lay[i][0] * s; py = lay[i][1] * s;
      g.globalAlpha = 0.62; g.fillStyle = cols[i % 4]; g.fillRect(px, py, s, s);
      g.globalAlpha = 0.95; g.strokeStyle = '#ffffff'; g.strokeRect(px, py, s, s);
      g.fillStyle = '#ffffff'; g.fillText(String(i + 1), px + s / 2, py + s / 2 + 0.5);
    }
    g.globalAlpha = 0.9; g.strokeStyle = '#fff'; g.beginPath(); g.arc(6 * s, s / 2, s * 0.75, -PI / 2, PI / 2); g.stroke();
    g.restore(); g.globalAlpha = 1;
  }

  function paintLamp(g, kind) {                           // base at 0,0; lantern at (18, -139)
    var c = kind === 'city' ? '#2e3440' : '#2f4a3c';
    rr(g, -4.5, -8, 9, 8, 1.5, c); rect(g, -2.2, -132, 4.4, 126, c); rect(g, -0.4, -132, 1.2, 126, 'rgba(255,255,255,.18)');
    rr(g, -3.4, -74, 6.8, 3, 1, c);
    g.strokeStyle = c; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -130); g.quadraticCurveTo(0, -152, 18, -152); g.stroke(); g.lineCap = 'butt';
    poly(g, [10, -150, 26, -150, 23, -146, 13, -146], c);
    poly(g, [12.5, -146, 23.5, -146, 21.5, -133, 14.5, -133], '#f4edd2'); rect(g, 13.5, -133, 9, 2, c); rect(g, 17.4, -146, 1.2, 13, 'rgba(0,0,0,.25)');
  }
  function lampGlow(ctx, x, y, a, pool) {
    if (a <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, '#ffb347', x, y, 70, a * 0.6); glow(ctx, '#ffe2a0', x, y, 15, a);
    if (pool) glow(ctx, '#ffb347', x, pool, 105, a * 0.34, 25);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  function street(S) {
    S.frontCol = '#4b525e'; S.puddles = [[16, 80, 170], [122, 190, 230]];
    S.smokes = [];
    var trees = [treeSprite(S, 11, 290, LEAF.fresh, false), treeSprite(S, 23, 300, LEAF.deep, true), treeSprite(S, 37, 270, LEAF.lime, false)];
    var backTrees = [treeSprite(S, 51, 330, hazePal(LEAF.deep, '#9fc7c9', 0.2), true, { res: 0.7 }), treeSprite(S, 67, 300, hazePal(LEAF.fresh, '#9fc7c9', 0.24), false, { res: 0.7 })];
    var lamp = S.sprite(40, 162, 8, 160, function (g) { paintLamp(g, 'street'); });
    var cars = [carSprite(S, '#e2574c', 'car'), carSprite(S, '#4d9bb5', 'car'), carSprite(S, '#f1e6c8', 'van')];
    var bike = S.sprite(84, 104, 42, 102, paintCyclist);
    var wagon = S.sprite(64, 44, 32, 42, paintWagon);

    S.strip({ name: 'hills', p: 0.22, top: 260, bot: 12, res: 0.5, rk: 0.3, paint: function (g, a, b) {
      ridge(g, a, b, -160, 84, 980, 11, vgrad(g, -246, -60, '#a8c8de', '#c9deea'), 12);
      ridge(g, a, b, -122, 70, 640, 12, vgrad(g, -194, -30, '#93c3a8', '#bfdcc4'), 12);
      var x, y, i;
      for (x = floor(a / 26) * 26; x < b; x += 26) {      // far woods along the second ridge
        i = x / 26; if (H(i, 3) < 0.45) continue;
        y = ridgeTop(x, -122, 70, 640, 12); circ(g, x, y - 3, 6 + H(i, 4) * 5, '#7fb596'); circ(g, x + 7, y - 1, 5 + H(i, 5) * 3, '#8bbf9f');
      }
      ridge(g, a, b, -74, 58, 430, 13, vgrad(g, -134, 0, '#84bf7c', '#a9d595'), 12);
      for (x = floor(a / 19) * 19; x < b; x += 19) {
        i = x / 19; y = ridgeTop(x, -74, 58, 430, 13);
        if (H(i, 6) < 0.5) { circ(g, x, y - 4, 6 + H(i, 7) * 6, '#62a56c'); circ(g, x - 2, y - 6, 4 + H(i, 7) * 4, '#78b87a'); }
        else if (H(i, 8) < 0.16) { rect(g, x - 5, y - 7, 11, 8, '#f6efe2'); poly(g, [x - 7, y - 7, x + 0.5, y - 13, x + 8, y - 7], '#c0705a'); }
      }
      g.fillStyle = vgrad(g, -50, 12, 'rgba(225,238,236,0)', 'rgba(225,238,236,.55)'); g.fillRect(a, -50, b - a, 62);   // valley haze
    } });
    S.fn(0.22, function (ctx, va, vb, env) { flock(ctx, va, vb, env, 7, -360, -250, 5, lit('#55647a')); });

    S.strip({ name: 'far houses', p: 0.6, top: 170, bot: 8, res: 0.75, rk: 0.6, paint: function (g, a, b, S) {
      var i, x, w, h, c, k;
      rect(g, a, -30, b - a, 38, '#93c97c');
      for (i = floor(a / 64) - 1; i * 64 < b + 64; i++) {  // back gardens' trees
        x = i * 64 + H(i, 1) * 30; crown(g, x, -52 - H(i, 2) * 26, 28 + H(i, 3) * 14, 26 + H(i, 4) * 12, i + 900, hazePal(i % 3 ? LEAF.deep : LEAF.fresh, '#bcd8d2', 0.38));
      }
      for (i = floor(a / 190) - 1; i * 190 < b + 190; i++) {
        x = i * 190 + H(i, 5) * 50; w = 76 + H(i, 6) * 30; h = 48 + H(i, 7) * 24; c = mixHex(WALLS[((i * 2 + 1) % 7 + 7) % 7], '#c6dade', 0.35);
        rect(g, x, -26 - h, w, h, c); rect(g, x, -26 - h, w, h * 0.12, 'rgba(0,0,0,.05)');
        poly(g, [x - 6, -26 - h, x + w + 6, -26 - h, x + w - 12, -52 - h, x + 12, -52 - h], mixHex(ROOFS[((i * 3) % 6 + 6) % 6], '#c6dade', 0.4));
        for (k = 0; k < 3; k++) { rect(g, x + 10 + k * (w - 30) / 2, -26 - h * 0.72, 10, 13, '#9fbfcf'); S.light(x + 10 + k * (w - 30) / 2, -26 - h * 0.72, 10, 13, { k: 0.75 }); }
      }
      hedge(g, a, b, 8, 40, 77, hazePal(LEAF.hedge, '#bcd8d2', 0.3), true);
    } });

    S.fn(0.92, function (ctx, va, vb, env) {              // big trees behind the houses
      for (var i = floor(va / 190) - 2, x; i * 190 < vb + 380; i++) {
        if (H(i, 33) < 0.34) continue;
        x = i * 190 + 75 + (H(i, 31) - 0.5) * 60;
        putLean(ctx, backTrees[((i % 2) + 2) % 2], x, LAWN - 8, 0.9 + H(i, 32) * 0.22, swayAt(x, env) * 6);
      }
    });

    S.strip({ name: 'houses', p: 1, top: 322, bot: 2, paint: function (g, a, b, S) {
      var i;
      S.smokes.length = 0;
      for (i = floor((a - LOT0) / LOT) - 1; LOT0 + i * LOT < b + LOT; i++) sideYard(g, S, i);
      lawnAndPaths(g, a, b);
      for (i = floor((a - LOT0) / LOT) - 1; LOT0 + i * LOT < b + LOT; i++) house(g, S, i);
    } });

    S.fn(1, function (ctx, va, vb, env) {                 // chimney smoke, a sprinkler, trees in the front gardens
      var i, x, s, sm, k, u, ang, t = env.reduced ? 1 : env.t;
      for (i = 0; i < S.smokes.length; i++) { sm = S.smokes[i]; if (sm.on && sm.x > va - 60 && sm.x < vb + 60 && LT.wet < 0.5) smoke(ctx, sm.x, sm.y, env, i, 1.2); }
      for (i = floor((va - LOT0) / LOT) - 1; LOT0 + i * LOT < vb + LOT; i++) {
        x = LOT0 + i * LOT + LOT / 2 + (H(i, 51) - 0.5) * 50;
        if (calmAt(x)) continue;
        if (i % 2 === 0 && LT.wet < 0.1 && LT.night < 0.3) {   // a sprinkler on the lawn
          s = x - 96; ang = sin(t * 1.3 + i) * 0.8;
          rect(ctx, s - 1.2, -22, 2.4, 6, lit('#7d8791'));
          ctx.fillStyle = '#ffffff';
          for (k = 1; k <= 14; k++) { u = k / 14; ctx.globalAlpha = 0.8 * (1 - u * 0.6); ctx.fillRect(s + sin(ang) * u * 40 + sin(k * 9 + t * 7) * 0.8, -22 - cos(ang) * u * 36 + u * u * 34, 1.5, 1.5); }
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = 'rgba(30,70,40,.2)'; ctx.beginPath(); ctx.ellipse(x + 14, -9, 70, 7, 0, 0, TAU); ctx.fill();
        putLean(ctx, trees[((i % 3) + 3) % 3], x, -11, 0.95 + H(i, 52) * 0.15, swayAt(x, env) * 7);
      }
    });

    S.strip({ name: 'pavement', p: 1, top: 52, bot: 300, ground: true, rk: 0.25, paint: paveStreet });

    S.fn(1, function (ctx, va, vb) {                      // street lamps
      var i, x, a = clamp((LT.night - 0.3) * 6, 0, 1);
      for (i = floor((va - 150) / 600) - 1; 150 + i * 600 < vb + 100; i++) {
        x = 150 + i * 600;
        put(ctx, lamp, x, 3, 1); lampGlow(ctx, x + 18, -136, a, 30);
      }
    });

    S.fn(1, function (ctx, va, vb, env) {                 // FRONT: parked car, a toy wagon, traffic now and then
      var i, x, t = env.t, na = clamp((LT.night - 0.3) * 5, 0, 1), k, T, u;
      for (i = floor(va / 1150) - 1; i * 1150 < vb + 200; i++) {
        x = i * 1150 + 900; if (x > va - 100 && x < vb + 100) put(ctx, cars[((i % 3) + 3) % 3], x, 168, 1);
        x = i * 1150 + 96; if (x > va - 40 && x < vb + 40) put(ctx, wagon, x, 138, 1);
      }
      if (env.reduced) return;
      T = 17; k = floor(t / T); u = (t - k * T) / 5.2;    // a cyclist every so often
      if (u < 1) { x = lerp(va - 60, vb + 60, k % 2 ? 1 - u : u); if (k % 2) putFlip(ctx, bike, x, 152 + sin(t * 9) * 0.6, 1); else put(ctx, bike, x, 152 + sin(t * 9) * 0.6, 1); }
      T = 23; k = floor((t + 9) / T); u = ((t + 9) - k * T) / 3.4;   // and a car
      if (u < 1) { x = lerp(va - 110, vb + 110, u); put(ctx, cars[(k + 1) % 3], x, 236, 1.12); carLights(ctx, x, 236, 1, na); }
    }, true);
  }

  function paintCyclist(g) {                              // wheels on y=0, heading right
    var s;
    ell(g, 0, 1, 34, 3.4, 'rgba(10,14,26,.25)');
    for (s = -1; s <= 1; s += 2) {
      g.strokeStyle = '#2b2f38'; g.lineWidth = 2.6; g.beginPath(); g.arc(s * 24, -15, 13.6, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(200,205,212,.8)'; g.lineWidth = 0.6;
      for (var k = 0; k < 8; k++) { g.beginPath(); g.moveTo(s * 24, -15); g.lineTo(s * 24 + cos(k * PI / 4) * 12.6, -15 + sin(k * PI / 4) * 12.6); g.stroke(); }
      circ(g, s * 24, -15, 2, '#8c939c');
    }
    g.strokeStyle = '#e2574c'; g.lineWidth = 2.6; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-24, -15); g.lineTo(-8, -40); g.lineTo(16, -40); g.lineTo(-2, -15); g.lineTo(-24, -15); g.moveTo(-2, -15); g.lineTo(-8, -40); g.moveTo(16, -40); g.lineTo(24, -15); g.moveTo(16, -40); g.lineTo(14, -50); g.lineTo(21, -52); g.stroke();
    rr(g, -15, -45, 13, 3.6, 1.6, '#2b2f38');
    g.strokeStyle = '#3d5a80'; g.lineWidth = 6; g.beginPath(); g.moveTo(-8, -46); g.lineTo(4, -30); g.lineTo(-2, -15); g.stroke();            // leg
    g.strokeStyle = '#ffd166'; g.lineWidth = 11; g.beginPath(); g.moveTo(-8, -50); g.lineTo(6, -72); g.stroke();                               // torso
    g.strokeStyle = '#f2b28c'; g.lineWidth = 4.4; g.beginPath(); g.moveTo(6, -70); g.lineTo(14, -58); g.lineTo(20, -53); g.stroke();           // arm
    circ(g, 11, -82, 8, '#f2b28c'); g.fillStyle = '#3f8fb0'; g.beginPath(); g.arc(11, -84, 8.6, PI * 1.05, PI * 2.05); g.closePath(); g.fill();
    g.lineCap = 'butt';
  }
  function paintWagon(g) {
    ell(g, 0, 1, 26, 3, 'rgba(10,14,26,.25)');
    rr(g, -24, -24, 48, 14, 3, '#d8453c'); rect(g, -24, -24, 48, 3, '#ef6a5e'); rect(g, -22, -14, 44, 2, 'rgba(0,0,0,.15)');
    g.strokeStyle = '#2b2f38'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(24, -14); g.lineTo(31, -30); g.lineTo(27, -32); g.stroke(); g.lineCap = 'butt';
    circ(g, -15, -6, 6.5, '#262a31'); circ(g, -15, -6, 3, '#f1ede4'); circ(g, 15, -6, 6.5, '#262a31'); circ(g, 15, -6, 3, '#f1ede4');
    circ(g, -8, -29, 7, '#ffb23e'); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 0.8; g.beginPath(); g.arc(-8, -29, 7, -1.2, 1.2); g.moveTo(-15, -29); g.lineTo(-1, -29); g.stroke();
  }

  /* ================================================================== MEADOW PARK */
  var POND = { x: 868, y: -36, rx: 140, ry: 19, every: 1900 };
  var BLOOMS = ['#ff6f7d', '#ffd24a', '#ff9ac1', '#ffffff', '#c58cff', '#ff8f4a'];

  function treeRow(g, a, b, base, gap, r0, r1, c0, c1, seed) {
    for (var i = floor(a / gap) - 1, x, r; i * gap < b + gap; i++) {
      x = i * gap + H(i, seed) * gap * 0.7; r = lerp(r0, r1, H(i, seed + 1));
      circ(g, x, base - r * 0.8, r, c0); circ(g, x + r * 0.7, base - r * 0.55, r * 0.7, c0); circ(g, x - r * 0.75, base - r * 0.5, r * 0.66, c0);
      circ(g, x - r * 0.25, base - r * 1.05, r * 0.6, c1); circ(g, x + r * 0.55, base - r * 0.8, r * 0.36, c1);
    }
  }
  function paintBench(g, x, y) {                          // x = middle of the seat, y = ground
    var k;
    ell(g, x, y + 1, 36, 3.2, 'rgba(30,60,30,.22)');
    for (k = -1; k <= 1; k += 2) { rect(g, x + k * 27 - 1.6, y - 15, 3.2, 15, '#39424d'); rect(g, x + k * 27 - 1.6, y - 38, 3.2, 24, '#39424d'); }
    for (k = 0; k < 3; k++) { rr(g, x - 33, y - 38 + k * 6.2, 66, 4.6, 1.6, '#c08a55'); rect(g, x - 32, y - 37.6 + k * 6.2, 64, 1.1, 'rgba(255,255,255,.25)'); }
    rr(g, x - 34, y - 18, 68, 5, 1.8, '#b47c49'); rect(g, x - 33, y - 17.6, 66, 1.3, 'rgba(255,255,255,.28)'); rect(g, x - 34, y - 13.4, 68, 1.4, 'rgba(0,0,0,.18)');
    g.strokeStyle = '#39424d'; g.lineWidth = 2.4; g.lineCap = 'round';
    for (k = -1; k <= 1; k += 2) { g.beginPath(); g.moveTo(x + k * 31, y - 28); g.quadraticCurveTo(x + k * 37, y - 28, x + k * 35, y - 17); g.stroke(); }
    g.lineCap = 'butt';
  }
  function flowerBed(g, x, y, rx, ry, seed) {
    var i, a, r, fx, fy;
    ell(g, x, y + 1.5, rx + 3, ry + 2, '#6aa64a'); ell(g, x, y, rx, ry, '#7a5a3c'); ell(g, x, y - 1, rx * 0.94, ry * 0.8, '#8c6a48');
    for (i = 0; i < rx * 1.6; i++) {
      a = H(seed, i) * TAU; r = Math.sqrt(H(seed, i + 300)); fx = x + cos(a) * rx * 0.9 * r; fy = y + sin(a) * ry * 0.8 * r;
      rect(g, fx - 0.4, fy - 6, 0.8, 6, '#4c8a3f'); ell(g, fx + 1.6, fy - 2.4, 2, 0.9, '#5fa24a');
      circ(g, fx, fy - 6.5, 2.1 + H(seed, i + 600) * 1.2, BLOOMS[floor((fx - x + rx) / (2 * rx) * 5.99) % 6]); circ(g, fx, fy - 6.5, 0.7, '#fff3b0');
    }
  }
  function paintPond(g, x) {
    var P = POND, y = P.y, i, lx, ly;
    ell(g, x, y + 3, P.rx + 9, P.ry + 5, '#76b352'); ell(g, x, y + 1.4, P.rx + 4.5, P.ry + 3, '#d8c99a');
    g.fillStyle = vgrad(g, y - P.ry, y + P.ry, '#a5dcf0', '#74c2e2', '#52a7cf'); ell(g, x, y, P.rx, P.ry); g.fill();
    g.save(); g.clip();
    g.fillStyle = 'rgba(52,120,96,.28)';                  // the trees on the far bank, mirrored
    for (i = 0; i < 9; i++) { g.beginPath(); g.ellipse(x - P.rx + i * P.rx * 0.26 + H(i, 801) * 14, y - P.ry + 2, 22 + H(i, 802) * 16, 7 + H(i, 803) * 5, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.3)';
    for (i = 0; i < 7; i++) g.fillRect(x - P.rx * 0.8 + H(i, 811) * P.rx * 1.5, y - P.ry * 0.4 + H(i, 812) * P.ry * 1.2, 16 + H(i, 813) * 26, 0.9);
    g.restore();
    for (i = 0; i < 9; i++) {                             // lily pads
      lx = x - P.rx * 0.78 + H(i, 821) * P.rx * 0.55 + (i > 4 ? P.rx * 1.02 : 0); ly = y + (H(i, 822) - 0.3) * P.ry * 1.0;
      g.fillStyle = i % 2 ? '#5fae5a' : '#6fbc62'; g.beginPath(); g.ellipse(lx, ly, 6.5, 2.4, 0, 0.5, TAU); g.lineTo(lx, ly); g.fill();
      if (i % 3 === 0) { circ(g, lx + 1, ly - 1.8, 2, '#ff9ac1'); circ(g, lx + 1, ly - 1.8, 0.9, '#fff3b0'); }
    }
    for (i = 0; i < 16; i++) {                            // reeds at both ends
      lx = x + (i < 8 ? -1 : 1) * (P.rx - 4 - H(i, 831) * 26); ly = y + 5 + H(i, 832) * 9;
      g.strokeStyle = i % 2 ? '#4f8f45' : '#5fa24f'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(lx, ly); g.quadraticCurveTo(lx + (H(i, 833) - 0.5) * 6, ly - 16, lx + (H(i, 834) - 0.5) * 10, ly - 24 - H(i, 835) * 12); g.stroke();
      if (i % 3 === 1) rr(g, lx + (H(i, 834) - 0.5) * 10 - 1.4, ly - 36 - H(i, 835) * 12, 2.8, 9, 1.4, '#7a5234');
    }
    ell(g, x - P.rx + 26, y + P.ry + 1, 9, 4, '#a9a59c'); ell(g, x - P.rx + 24, y + P.ry - 0.5, 7, 2.6, '#c5c1b8'); ell(g, x + P.rx - 12, y + P.ry - 3, 7, 3.4, '#b3afa6');
  }
  function paintClump(g) {                                // tall grass and a few flowers, base at 0,0
    var i, x;
    for (i = 0; i < 16; i++) {
      x = -24 + i * 3.2 + H(i, 851) * 2;
      g.strokeStyle = i % 3 ? '#5a9c46' : '#7dbb55'; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (H(i, 852) - 0.5) * 6, -12, x + (H(i, 853) - 0.5) * 14, -18 - H(i, 854) * 14); g.stroke();
    }
    g.lineCap = 'butt';
    for (i = 0; i < 4; i++) { x = -18 + i * 12; seg(g, x, 0, x + 1, -22 - i % 2 * 6, '#4c8a3f', 1); circ(g, x + 1, -23 - i % 2 * 6, 3.2, BLOOMS[(i * 2) % 6]); circ(g, x + 1, -23 - i % 2 * 6, 1.1, '#fff3b0'); }
  }

  function pavePark(g, a, b) {
    var i, x, k, y;
    // back edge: benches and flowers away from the stand
    for (i = floor(a / 640) - 1; i * 640 < b + 100; i++) {
      x = i * 640 + 70; if (!calmAt(x) && !calmAt(x + 40)) paintBench(g, x, -2);
      x = i * 640 + 400; if (!calmAt(x)) { rr(g, x - 7, -24, 14, 24, 2.5, '#4d6b58'); rect(g, x - 8.5, -26, 17, 3.4, '#3e5847'); rect(g, x - 4, -19, 8, 1.2, 'rgba(255,255,255,.3)'); }
    }
    for (x = floor(a / 9) * 9; x < b; x += 9) { i = x / 9; if (H(i, 861) < 0.5 && !calmAt(x)) flowers(g, x, 1, 8, i + 870, BLOOMS, 2); }
    // gravel path
    g.fillStyle = vgrad(g, 0, WALK, '#d6c597', '#e2d2a8', '#e9dab3', '#ecdeb9'); g.fillRect(a, 0, b - a, WALK);
    g.fillStyle = vgrad(g, 0, 9, 'rgba(70,90,50,.26)', 'rgba(70,90,50,0)'); g.fillRect(a, 0, b - a, 9);
    speckle(g, a, b, 2, WALK - 2, 9, 4, 'rgba(150,128,86,.35)', 5, 1.5);
    speckle(g, a, b, 2, WALK - 2, 11, 3, 'rgba(255,255,255,.5)', 9, 1.4);
    speckle(g, a, b, 2, WALK - 2, 26, 2, 'rgba(120,104,76,.4)', 13, 2.6);
    for (x = floor(a / 7) * 7; x < b + 7; x += 7) {       // grass creeping over both edges
      i = x / 7; ell(g, x, -0.5, 5 + H(i, 881) * 4, 1.6 + H(i, 882) * 2.2, '#86c75c'); ell(g, x + 3, WALK + 1.5, 5 + H(i, 883) * 5, 2 + H(i, 884) * 2.6, '#86c75c');
      if (H(i, 885) < 0.22) tuft(g, x, 1, 3 + H(i, 886) * 2, '#6cab4c');
    }
    // lawn in front
    g.fillStyle = vgrad(g, WALK, 300, '#86c75c', '#74b651', '#62a547'); g.fillRect(a, WALK + 1.5, b - a, 300 - WALK);
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (x = floor(a / 70) * 70; x < b; x += 70) { g.beginPath(); g.moveTo(x, WALK + 2); g.lineTo(x + 34, WALK + 2); g.lineTo(x + 34 + 60, 300); g.lineTo(x + 30, 300); g.fill(); }
    speckle(g, a, b, WALK + 4, 298, 14, 3, 'rgba(255,255,255,.75)', 31, 1.6);       // daisies
    speckle(g, a, b, WALK + 4, 298, 19, 2, 'rgba(255,230,120,.8)', 37, 1.5);
    speckle(g, a, b, WALK + 4, 298, 12, 3, 'rgba(40,100,40,.22)', 41, 2.2);
    for (x = floor(a / 31) * 31; x < b; x += 31) { i = x / 31; tuft(g, x + H(i, 891) * 20, WALK + 12 + H(i, 892) * 180, 4 + H(i, 893) * 3, H(i, 894) < 0.5 ? '#5f9e46' : '#93cf66'); }
    for (i = floor(a / 1500) - 1; i * 1500 < b; i++) {
      x = i * 1500 + 860; y = 128;                        // picnic blanket, basket, apples
      g.save(); poly(g, [x, y, x + 96, y, x + 116, y + 46, x - 16, y + 46]); g.fillStyle = '#f6f1e6'; g.fill(); g.clip();
      g.fillStyle = 'rgba(220,70,70,.75)'; for (k = -2; k < 9; k++) { g.beginPath(); g.moveTo(x + k * 16, y); g.lineTo(x + k * 16 + 8, y); g.lineTo(x + k * 19.6 - 7.6, y + 46); g.lineTo(x + k * 19.6 - 15.6, y + 46); g.fill(); }
      for (k = 0; k < 4; k++) g.fillRect(x - 20, y + 4 + k * 12, 140, 5.5);
      g.restore();
      ell(g, x + 30, y + 31, 20, 4, 'rgba(0,0,0,.14)'); rr(g, x + 12, y + 8, 36, 22, 5, '#c0915a'); rect(g, x + 12, y + 8, 36, 4, '#d6aa72');
      g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 0.8; for (k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x + 13, y + 14 + k * 3.4); g.lineTo(x + 47, y + 14 + k * 3.4); g.stroke(); }
      g.strokeStyle = '#a87a48'; g.lineWidth = 2.2; g.beginPath(); g.arc(x + 30, y + 9, 13, PI, TAU); g.stroke();
      circ(g, x + 64, y + 24, 5, '#e2483e'); circ(g, x + 73, y + 28, 5, '#8cc152'); circ(g, x + 62.6, y + 22.4, 1.4, 'rgba(255,255,255,.6)');
      x = i * 1500 + 96; ell(g, x, 139, 11, 2.6, 'rgba(0,0,0,.16)'); circ(g, x, 129, 10, '#fdfdfd'); g.fillStyle = '#2d3340';   // football
      poly(g, [x - 3, 126, x + 3, 126, x + 5, 131, x, 134.5, x - 5, 131]); g.fill(); g.strokeStyle = '#2d3340'; g.lineWidth = 0.9; g.beginPath(); g.arc(x, 129, 10, 0, TAU); g.stroke();
    }
  }

  function park(S) {
    S.frontCol = '#62a547'; S.wetCol = '#16281c'; S.puddles = [[18, 78, 190]];
    var trees = [treeSprite(S, 111, 300, LEAF.fresh, true), treeSprite(S, 123, 280, LEAF.pink, false), treeSprite(S, 137, 310, LEAF.deep, false)];
    var backTrees = [treeSprite(S, 151, 330, hazePal(LEAF.deep, '#a8d0c0', 0.22), true, { res: 0.7 }), treeSprite(S, 167, 300, hazePal(LEAF.lime, '#a8d0c0', 0.25), false, { res: 0.7 }),
      treeSprite(S, 171, 290, hazePal(LEAF.gold, '#b8d8c0', 0.18), false, { res: 0.7 })];
    var lamp = S.sprite(40, 162, 8, 160, function (g) { paintLamp(g, 'street'); });
    var clump = S.sprite(64, 44, 32, 42, paintClump);

    S.strip({ name: 'woods', p: 0.2, top: 250, bot: 12, res: 0.5, rk: 0.3, paint: function (g, a, b) {
      ridge(g, a, b, -168, 66, 1150, 41, vgrad(g, -236, -60, '#a6cbe0', '#cfe3ea'), 12);
      rect(g, a, -150, b - a, 162, '#9fcab4'); treeRow(g, a, b, -146, 34, 13, 21, '#9fcab4', '#b0d4bf', 1);
      rect(g, a, -118, b - a, 130, '#86bd90'); treeRow(g, a, b, -114, 40, 15, 25, '#86bd90', '#9bcba0', 5);
      rect(g, a, -88, b - a, 100, '#71b26c'); treeRow(g, a, b, -84, 46, 17, 28, '#71b26c', '#8bc47c', 9);
      g.fillStyle = vgrad(g, -60, 12, 'rgba(226,240,226,0)', 'rgba(226,240,226,.5)'); g.fillRect(a, -60, b - a, 72);
    } });
    S.fn(0.2, function (ctx, va, vb, env) { flock(ctx, va, vb, env, 17, -360, -260, 6, lit('#55647a')); });

    S.strip({ name: 'meadow', p: 0.55, top: 190, bot: 8, res: 0.8, rk: 0.25, paint: function (g, a, b) {
      var i, x, y, r, k;
      ridge(g, a, b, -72, 40, 860, 21, vgrad(g, -116, 0, '#bfe58a', '#a3d672'), 8);
      g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 5;                                                   // mown swathes following the slope
      for (k = 1; k < 4; k++) { g.beginPath(); for (x = a - 8; x <= b + 8; x += 12) g.lineTo(x, ridgeTop(x, -72, 40, 860, 21) + k * 14); g.stroke(); }
      for (i = floor(a / 150) - 1; i * 150 < b + 150; i++) {
        if (H(i, 61) < 0.4) continue;
        x = i * 150 + H(i, 62) * 90; y = ridgeTop(x, -72, 40, 860, 21) + 4; r = 20 + H(i, 63) * 14;
        ell(g, x + 6, y + 1, r * 0.9, 3, 'rgba(60,110,50,.25)'); rect(g, x - 2, y - r * 1.1, 4, r * 1.1, '#8a6a52');
        crown(g, x, y - r * 1.7, r, r * 0.95, i + 60, hazePal(i % 4 === 0 ? LEAF.pink : i % 3 ? LEAF.deep : LEAF.lime, '#c2dfc0', 0.3));
      }
      for (i = floor(a / 2100) - 1; i * 2100 < b + 200; i++) {                                                  // bandstand on the rise
        x = i * 2100 + 150; y = ridgeTop(x, -72, 40, 860, 21) + 3;
        rect(g, x - 34, y - 8, 68, 8, '#e9e4d6'); for (k = 0; k < 5; k++) rect(g, x - 31 + k * 15, y - 46, 2.6, 38, '#f6f2e8');
        rect(g, x - 34, y - 20, 68, 1.6, '#f6f2e8'); poly(g, [x - 42, y - 45, x + 42, y - 45, x + 18, y - 64, x - 18, y - 64], '#5fa7a2'); poly(g, [x - 18, y - 64, x + 18, y - 64, x, y - 76], '#4f928d');
        rect(g, x - 0.8, y - 86, 1.6, 10, '#f6f2e8'); poly(g, [x + 0.8, y - 86, x + 12, y - 83, x + 0.8, y - 80], '#ff6f7d');
      }
    } });

    S.fn(0.55, function (ctx, va, vb, env) {              // a kite over the meadow
      var a = (1 - LT.night / 0.6) * (1 - LT.wet * 2), i, x, y, t = env.reduced ? 2 : env.t, w = env.wind || 0, k, px, py, ax, ay;
      if (a <= 0.02) return;
      for (i = floor(va / 1300) - 1; i * 1300 < vb + 300; i++) {
        ax = i * 1300 + 250; ay = ridgeTop(ax, -72, 40, 860, 21) - 4;
        x = ax + 110 + w * 60 + sin(t * 0.5 + i) * 16; y = -318 + cos(t * 0.4 + i) * 10 - abs(w) * 14;
        ctx.globalAlpha = min(1, a) * 0.6; ctx.strokeStyle = lit('#f4f6f8'); ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(lerp(ax, x, 0.7), ay - 40, x, y + 16); ctx.stroke();
        ctx.globalAlpha = min(1, a);
        ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35 + w * 0.3 + sin(t * 0.9 + i) * 0.1);
        ctx.fillStyle = lit('#ff6f7d'); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(13, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = lit('#ffd24a'); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-13, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = lit('#4fb7d8'); ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(0, 20); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = lit('#8cd16a'); ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(0, 20); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = lit('#ffffff'); ctx.lineWidth = 0.9; ctx.beginPath(); px = 0; py = 20; ctx.moveTo(px, py);     // tail
        for (k = 1; k <= 6; k++) { px = -k * 3 * (w >= 0 ? 1 : -1) + sin(t * 3 + k * 1.2 + i) * 3; py = 20 + k * 8; ctx.lineTo(px, py); }
        ctx.stroke();
        for (k = 2; k <= 6; k += 2) { ctx.fillStyle = lit(BLOOMS[k % 6]); ctx.fillRect(-k * 3 * (w >= 0 ? 1 : -1) + sin(t * 3 + k * 1.2 + i) * 3 - 2.5, 20 + k * 8 - 1.5, 5, 3); }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });

    S.fn(0.85, function (ctx, va, vb, env) {              // the tree line
      for (var i = floor(va / 200) - 2, x; i * 200 < vb + 400; i++) {
        if (H(i, 133) < 0.28) continue;
        x = i * 200 + 40 + (H(i, 131) - 0.5) * 70;
        if (x > 420 && x < 640) continue;                 // leave open sky above the stand
        putLean(ctx, backTrees[floor(H(i, 134) * 3)], x, -58, 0.88 + H(i, 132) * 0.26, swayAt(x, env) * 6);
      }
    });

    S.strip({ name: 'lawn', p: 1, top: 100, bot: 2, rk: 0.12, paint: function (g, a, b) {
      var i, x, k;
      g.fillStyle = vgrad(g, -78, 0, '#aede78', '#94d063', '#80c057');
      g.beginPath(); g.moveTo(a - 8, 2); for (x = a - 8; x <= b + 10; x += 10) g.lineTo(x, -66 - 8 * ridgeY(x, 31, 560)); g.lineTo(b + 10, 2); g.closePath(); g.fill();
      g.save(); g.clip();
      g.fillStyle = 'rgba(255,255,255,.075)';             // mowing stripes running away from us
      for (x = floor(a / 64) * 64 - 64; x < b + 64; x += 64) { g.beginPath(); g.moveTo(x, 2); g.lineTo(x + 32, 2); g.lineTo(lerp(x + 32, CX, 0.16), -80); g.lineTo(lerp(x, CX, 0.16), -80); g.fill(); }
      for (i = floor(a / 1700) - 1; i * 1700 < b + 300; i++) {                                                  // a second path wandering off
        x = i * 1700 - 10;
        g.fillStyle = '#e2d2a8'; g.beginPath(); g.moveTo(x, 2); g.bezierCurveTo(x + 30, -30, x + 120, -40, x + 150, -80); g.lineTo(x + 162, -80); g.bezierCurveTo(x + 150, -34, x + 86, -28, x + 56, 2); g.closePath(); g.fill();
      }
      speckle(g, a, b, -60, -2, 18, 3, 'rgba(255,255,255,.55)', 51, 1.3); speckle(g, a, b, -60, -2, 24, 2, 'rgba(255,225,110,.7)', 55, 1.3);
      speckle(g, a, b, -62, -2, 13, 3, 'rgba(40,100,40,.2)', 59, 2);
      g.restore();
      for (i = floor(a / POND.every) - 1; i * POND.every < b + 300; i++) {
        paintPond(g, POND.x + i * POND.every);
        x = i * POND.every + 128; flowerBed(g, x, -24, 44, 8, i + 3); flowerBed(g, x + POND.every - 760, -22, 40, 7, i + 5);
        for (k = 0; k < 3; k++) { x = i * POND.every + POND.x - POND.rx - 60 - k * 0; }
      }
      for (x = floor(a / 44) * 44; x < b; x += 44) { i = x / 44; if (!calmAt(x) && H(i, 65) < 0.5) tuft(g, x + H(i, 66) * 30, -8 - H(i, 67) * 44, 4, '#6cab4c'); }
    } });

    S.fn(1, function (ctx, va, vb, env) {                 // ducks and glints on the pond, butterflies, fireflies
      var i, k, x, y, u, t = env.reduced ? 4 : env.t, P = POND, px, dir, day = clamp(1 - LT.night / 0.5, 0, 1) * (1 - LT.wet), ff = clamp((LT.night - 0.2) * 3, 0, 1) * (1 - LT.wet);
      for (i = floor(va / P.every) - 1; i * P.every < vb + 300; i++) {
        px = P.x + i * P.every;
        if (px + P.rx < va || px - P.rx > vb) continue;
        ctx.fillStyle = lit('#ffffff', 0.3);
        for (k = 0; k < 12; k++) {                        // glints
          u = env.reduced ? 0.5 : sin(t * (1.6 + H(k, 901)) + k * 1.9); if (u <= 0) continue;
          ctx.globalAlpha = u * u * (0.75 - LT.night * 0.4);
          ctx.fillRect(px - P.rx * 0.78 + H(k, 902) * P.rx * 1.56, P.y - P.ry * 0.55 + H(k, 903) * P.ry * 1.1, 5 + H(k, 904) * 7, 0.9);
        }
        ctx.globalAlpha = 1;
        for (k = 0; k < 3; k++) {                         // ducks
          u = t * (0.1 + k * 0.03) + k * 2.1; x = px + sin(u) * P.rx * (0.5 - k * 0.1) + (k - 1) * 22; y = P.y - 2 + (k - 1) * 6 + sin(t * 2 + k) * 0.4; dir = cos(u) >= 0 ? 1 : -1;
          ctx.strokeStyle = lit('#ffffff', 0.3); ctx.lineWidth = 0.6; ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.moveTo(x - dir * 5, y + 2); ctx.lineTo(x - dir * 17, y + 0.2); ctx.moveTo(x - dir * 5, y + 2.6); ctx.lineTo(x - dir * 16, y + 4.4); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.fillStyle = lit(k === 1 ? '#8a6a48' : '#fdfdfb'); ctx.beginPath(); ctx.ellipse(x, y, 6, 3.3, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x - dir * 5, y - 1); ctx.lineTo(x - dir * 8.4, y - 3.6); ctx.lineTo(x - dir * 4, y + 1.6); ctx.fill();
          ctx.fillStyle = lit(k === 1 ? '#2f6b4a' : '#fdfdfb'); ctx.beginPath(); ctx.arc(x + dir * 4.6, y - 4.2, 2.6, 0, TAU); ctx.fill();
          ctx.fillStyle = lit('#f2a73b'); ctx.fillRect(x + dir * 6.4 - (dir < 0 ? 3 : 0), y - 4.4, 3, 1.3);
        }
      }
      if (day > 0.02) for (k = 0; k < (env.reduced ? 3 : 7); k++) {          // butterflies, away from the line
        x = va + H(k, 911) * (vb - va) * 1.0 + sin(t * 0.6 + k * 1.3) * 36 + sin(t * 1.7 + k * 3) * 9;
        if (calmAt(x)) continue;
        y = -24 - H(k, 912) * 54 + sin(t * 1.1 + k * 2) * 12; u = env.reduced ? 0.8 : abs(sin(t * 13 + k * 2));
        ctx.globalAlpha = day; ctx.fillStyle = lit(['#ff9f43', '#ffffff', '#7fc8ff', '#ffe066'][k % 4]);
        ctx.beginPath(); ctx.ellipse(x - 2.4 * u, y - 1, 2.8 * u + 0.3, 3.2, -0.3, 0, TAU); ctx.ellipse(x + 2.4 * u, y - 1, 2.8 * u + 0.3, 3.2, 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = lit('#3a3340'); ctx.fillRect(x - 0.4, y - 3, 0.8, 5);
      }
      if (ff > 0.02) {                                    // fireflies at dusk
        ctx.globalCompositeOperation = 'lighter';
        for (k = 0; k < (env.reduced ? 7 : 20); k++) {
          x = va + H(k, 921) * (vb - va) + sin(t * 0.33 + k * 1.7) * 26; y = -14 - H(k, 922) * 110 + sin(t * 0.5 + k * 1.3) * 12;
          u = env.reduced ? 0.7 : 0.5 + 0.5 * sin(t * (1.3 + H(k, 923)) + k * 2.3);
          glow(ctx, '#d9ff6a', x, y, 9, ff * u * u * 0.9); glow(ctx, '#fbffd0', x, y, 2.2, ff * u);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      for (i = floor(va / 620) - 1; i * 620 < vb + 620; i++) {               // big trees framing the view
        x = i * 620 + 20 + (H(i, 141) - 0.5) * 60;
        if (calmAt(x)) continue;
        ctx.fillStyle = 'rgba(40,90,40,.2)'; ctx.beginPath(); ctx.ellipse(x + 16, -10, 76, 7, 0, 0, TAU); ctx.fill();
        putLean(ctx, trees[((i % 3) + 3) % 3], x, -12, 0.95 + H(i, 142) * 0.15, swayAt(x, env) * 7);
      }
    });

    S.strip({ name: 'path', p: 1, top: 48, bot: 300, ground: true, rk: 0.25, paint: pavePark });

    S.fn(1, function (ctx, va, vb) {                      // lamps
      var i, x, a = clamp((LT.night - 0.3) * 6, 0, 1);
      for (i = floor((va - 176) / 640) - 1; 176 + i * 640 < vb + 100; i++) { x = 176 + i * 640; put(ctx, lamp, x, 3, 1); lampGlow(ctx, x + 18, -136, a, 30); }
    });

    S.fn(1, function (ctx, va, vb, env) {                 // FRONT: tall grass and flowers leaning over the path edge
      for (var i = floor(va / 120) - 1, x; i * 120 < vb + 120; i++) {
        x = i * 120 + H(i, 151) * 70;
        if (H(i, 152) < 0.35 || (x > 150 && x < 810)) continue;
        putLean(ctx, clump, x, WALK + 12 + H(i, 153) * 5, 0.9 + H(i, 154) * 0.5, swayAt(x, env) * 2.5);
      }
    }, true);
  }

  /* ================================================================== DRIFTWOOD BEACH */
  var HORIZON = -172, SHORE = -54;
  var WOOD = ['#c9a878', '#c19f6f', '#d2b384', '#bb9868', '#cdae7e'];
  var TOWELS = [['#ff6f7d', '#ffffff'], ['#4fb7d8', '#fff3b0'], ['#ffd24a', '#ff8f4a'], ['#8cd16a', '#ffffff']];
  function shoreY(x) { return SHORE + 5 * ridgeY(x, 71, 420); }

  /** a flag flying from (x, y); it droops when it rains. pennant = pointed end */
  function flag(ctx, x, y, w, h, col, env, seed, pennant) {
    var dir = (env.wind == null ? 0.15 : env.wind) >= 0 ? 1 : -1, droop = LT.wet * 0.8, t = env.reduced ? 1 : env.t, n = 6, i, u;
    var amp = (1 - droop) * (1 + abs(env.wind || 0) * 2.4), len = w * (1 - droop * 0.7);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y);
    for (i = 1; i <= n; i++) { u = i / n; ctx.lineTo(x + dir * u * len, y + u * u * w * droop + sin(t * 6.5 + seed - u * 5) * amp * u); }
    for (i = n; i >= 0; i--) { u = i / n; ctx.lineTo(x + dir * u * len, y + (pennant ? h * (1 - u * 0.5) + (i === n ? -h * 0.5 : 0) : h) + u * u * w * droop + sin(t * 6.5 + seed - u * 5 + 0.5) * amp * u); }
    ctx.closePath(); ctx.fill();
  }
  /** where sky.js puts the sun and the moon across the screen (0..1), so glitter can lie under them */
  function sunFrac() { var d = LT.d, ang = d <= 1 ? PI * d : PI * (1 + (d - 1) / 0.6); return lerp(0.1, 0.9, 0.5 - 0.5 * cos(ang)); }
  function moonFrac() { var d = LT.d, ang = d >= 1 ? PI * (d - 1) / 0.6 : 0; return lerp(0.14, 0.86, 0.5 - 0.5 * cos(ang)); }

  function paintPalm(g, seed, ht) {                       // base at 0,0
    var lean = (H(seed, 1) - 0.5) * ht * 0.34, tx = lean, ty = -ht * 0.8, i, k, u, px, py, a, len, ex, ey, cx2, cy2, w;
    for (k = 0; k <= 22; k++) {                           // ringed trunk, tapering
      u = k / 22; px = 2 * (1 - u) * u * lean * 0.15 + u * u * tx; py = 2 * (1 - u) * u * (-ht * 0.42) + u * u * ty; w = lerp(8.5, 4.6, u);
      g.fillStyle = k % 2 ? '#b08a5c' : '#a27d51'; g.beginPath(); g.ellipse(px, py, w, ht * 0.03, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,240,200,.16)'; g.beginPath(); g.ellipse(px - w * 0.4, py, w * 0.3, ht * 0.022, 0, 0, TAU); g.fill();
    }
    rr(g, -11, -5, 22, 7, 3, '#a27d51');
    for (i = 0; i < 11; i++) {                            // fronds, back ones first
      a = -PI * (i % 2 ? 0.06 + (i >> 1) * 0.2 : 0.94 - (i >> 1) * 0.2) + (H(seed, i + 9) - 0.5) * 0.2; len = ht * (0.3 + H(seed, i + 20) * 0.1);
      ex = tx + cos(a) * len; ey = ty + sin(a) * len * 0.6 + len * 0.5; cx2 = tx + cos(a) * len * 0.62; cy2 = ty + sin(a) * len * 0.95 - len * 0.16;
      g.fillStyle = [LEAF.deep[0], LEAF.deep[1], LEAF.fresh[1], LEAF.fresh[2]][min(3, floor(i / 3))];
      g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(cx2, cy2, ex, ey); g.quadraticCurveTo(cx2 - cos(a) * len * 0.1, cy2 + len * 0.34, tx, ty + 5); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(20,70,40,.3)'; g.lineWidth = 0.8;                                                   // leaflets
      for (k = 2; k < 12; k++) { u = k / 12; px = (1 - u) * (1 - u) * tx + 2 * (1 - u) * u * cx2 + u * u * ex; py = (1 - u) * (1 - u) * ty + 2 * (1 - u) * u * cy2 + u * u * ey; g.beginPath(); g.moveTo(px, py); g.lineTo(px - cos(a) * 3, py + len * 0.2 * sin(PI * u)); g.stroke(); }
      g.strokeStyle = 'rgba(220,245,160,.5)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(cx2, cy2, ex, ey); g.stroke();
    }
    circ(g, tx - 5, ty + 5, 4.6, '#7a5a3a'); circ(g, tx + 4, ty + 6, 4.4, '#6b4e32'); circ(g, tx, ty + 2, 4, '#86653f');
  }
  function palmSprite(S, seed, ht) { var w = ht * 0.95, h = ht * 1.0, im = S.sprite(w, h, w / 2, h - 2, function (g) { paintPalm(g, seed, ht); }); im.tree = true; return im; }

  function paintUmbrella(g, x, y, c1, c2) {               // canopy centre at x,y; pole foot about 70 below
    var k, a0, a1;
    ell(g, x + 26, y + 74, 54, 9, 'rgba(120,90,40,.2)');
    rect(g, x - 1.5, y, 3, 72, '#f4f1ea'); rect(g, x + 0.6, y, 0.9, 72, 'rgba(0,0,0,.15)');
    for (k = 0; k < 8; k++) {
      a0 = PI + k * PI / 8; a1 = a0 + PI / 8;
      g.fillStyle = k % 2 ? c2 : c1; g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + cos(a0) * 64, y + sin(a0) * 4 + 4); g.quadraticCurveTo(x + cos((a0 + a1) / 2) * 64, y + 10 + sin(a0) * 4, x + cos(a1) * 64, y + sin(a1) * 4 + 4); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(x, y - 30); g.quadraticCurveTo(x - 46, y - 24, x - 64, y + 4); g.lineTo(x - 40, y + 5); g.quadraticCurveTo(x - 30, y - 16, x, y - 30); g.fill();
    circ(g, x, y - 31, 2.4, '#f4f1ea');
  }
  function paintTowel(g, x, y, c) {
    var k;
    g.save(); poly(g, [x, y, x + 62, y, x + 74, y + 26, x - 10, y + 26]); g.fillStyle = c[0]; g.fill(); g.clip();
    g.fillStyle = c[1]; for (k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x + 6 + k * 12, y); g.lineTo(x + 11 + k * 12, y); g.lineTo(x + 3 + k * 14.4, y + 26); g.lineTo(x - 3 + k * 14.4, y + 26); g.fill(); }
    g.restore();
  }

  function paveBeach(g, a, b) {
    var i, x, k, y, c;
    // rope rail along the back of the boardwalk, with dune grass where nobody queues
    for (i = floor(a / 66) - 1; i * 66 < b + 66; i++) {
      x = i * 66;
      g.strokeStyle = '#e8dcc0'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, -19); g.quadraticCurveTo(x + 33, -9, x + 66, -19); g.stroke();
      g.strokeStyle = 'rgba(120,90,50,.35)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, -18); g.quadraticCurveTo(x + 33, -8, x + 66, -18); g.stroke();
      rr(g, x - 3.2, -25, 6.4, 26, 1.6, '#a98458'); rect(g, x - 3.2, -25, 2, 26, 'rgba(255,255,255,.18)'); rr(g, x - 4, -27, 8, 4, 1.6, '#8f6c44');
      if (!calmAt(x + 30) && H(i, 201) < 0.7) { tuft(g, x + 20 + H(i, 202) * 24, 0, 7 + H(i, 203) * 5, '#9bb86a'); tuft(g, x + 30 + H(i, 204) * 20, 0, 6, '#b5cc7c'); }
    }
    // planks
    for (i = floor(a / 14) - 1; i * 14 < b; i++) {
      x = i * 14; c = WOOD[floor(H(i, 211) * 5)];
      rect(g, x, 0, 14.2, WALK, c);
      rect(g, x, 0, 0.9, WALK, 'rgba(70,45,20,.38)'); rect(g, x + 0.9, 0, 0.7, WALK, 'rgba(255,255,255,.16)');
      rect(g, x + 4 + H(i, 212) * 6, 4 + H(i, 213) * 30, 0.5, 20 + H(i, 214) * 30, 'rgba(90,60,30,.16)');
      if (H(i, 215) < 0.4) { y = 20 + H(i, 216) * 50; rect(g, x, y, 14, 0.9, 'rgba(70,45,20,.4)'); circ(g, x + 4, y - 2.6, 0.8, 'rgba(60,40,20,.5)'); circ(g, x + 10, y + 3.2, 0.8, 'rgba(60,40,20,.5)'); }
      circ(g, x + 7.4, 4.5, 0.8, 'rgba(60,40,20,.5)'); circ(g, x + 7.4, WALK - 4.5, 0.9, 'rgba(60,40,20,.5)');
    }
    g.fillStyle = vgrad(g, 0, 10, 'rgba(80,60,30,.3)', 'rgba(80,60,30,0)'); g.fillRect(a, 0, b - a, 10);
    g.fillStyle = vgrad(g, 0, WALK, 'rgba(255,240,200,0)', 'rgba(255,240,200,.1)'); g.fillRect(a, 0, b - a, WALK);
    speckle(g, a, b, 3, WALK - 3, 30, 2, 'rgba(243,227,182,.55)', 17, 2.4);                                     // blown sand
    // front edge and the sand below
    rect(g, a, WALK, b - a, 3, '#dcc091'); g.fillStyle = vgrad(g, WALK + 3, WALK + 12, '#9a7448', '#7f5d38'); g.fillRect(a, WALK + 3, b - a, 9);
    g.fillStyle = vgrad(g, WALK + 12, 300, '#f0dcab', '#ead29c', '#dfc48c'); g.fillRect(a, WALK + 12, b - a, 300 - WALK - 12);
    g.fillStyle = vgrad(g, WALK + 12, WALK + 26, 'rgba(110,80,40,.38)', 'rgba(110,80,40,0)'); g.fillRect(a, WALK + 12, b - a, 14);
    for (i = floor(a / 132) - 1; i * 132 < b; i++) { x = i * 132 + 20; rect(g, x, WALK + 12, 10, 13, '#7f5d38'); rect(g, x, WALK + 12, 3, 13, 'rgba(255,255,255,.12)'); ell(g, x + 5, WALK + 25, 9, 2.4, 'rgba(110,80,40,.3)'); }
    speckle(g, a, b, WALK + 26, 298, 9, 4, 'rgba(255,255,255,.4)', 21, 1.3);
    speckle(g, a, b, WALK + 26, 298, 11, 3, 'rgba(160,125,70,.3)', 25, 1.5);
    g.lineWidth = 0.9;                                    // wind ripples
    for (i = floor(a / 46) - 1; i * 46 < b; i++) for (k = 0; k < 3; k++) {
      x = i * 46 + H(i, 221 + k) * 40; y = WALK + 30 + H(i, 231 + k) * 160;
      g.strokeStyle = 'rgba(150,115,60,.22)'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y - 2.4, x + 24, y); g.quadraticCurveTo(x + 34, y + 2, x + 44, y); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.moveTo(x, y + 1.3); g.quadraticCurveTo(x + 12, y - 1.1, x + 24, y + 1.3); g.stroke();
    }
    for (i = floor(a / 90) - 1; i * 90 < b; i++) {        // shells, a starfish now and then
      x = i * 90 + H(i, 241) * 80; y = WALK + 34 + H(i, 242) * 150;
      if (H(i, 243) < 0.5) { g.fillStyle = '#fbf3e4'; g.beginPath(); g.arc(x, y, 3.4, PI, TAU); g.fill(); g.strokeStyle = 'rgba(190,150,110,.6)'; g.lineWidth = 0.5; for (k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + k * 2.2, y - 3); g.stroke(); } }
      else if (H(i, 244) < 0.3) { g.fillStyle = '#f08a5d'; g.beginPath(); for (k = 0; k < 10; k++) { c = k % 2 ? 2.2 : 5.6; g.lineTo(x + cos(k * PI / 5 - PI / 2) * c, y + sin(k * PI / 5 - PI / 2) * c * 0.7); } g.fill(); }
      else ell(g, x, y, 2.6, 1.5, '#cdb48a');
    }
    for (i = floor(a / 1150) - 1; i * 1150 < b + 200; i++) {                                                    // umbrellas, towels and toys toward the edges
      x = i * 1150;
      paintTowel(g, x + 846, 148, TOWELS[((i % 4) + 4) % 4]); paintUmbrella(g, x + 940, 142, '#ff6f7d', '#fff6e6'); paintTowel(g, x + 968, 186, TOWELS[(((i + 2) % 4) + 4) % 4]);
      paintUmbrella(g, x + 70, 150, '#4fb7d8', '#fff6e6'); paintTowel(g, x + 100, 190, TOWELS[(((i + 1) % 4) + 4) % 4]);
      ell(g, x + 172, 141, 12, 2.6, 'rgba(120,90,40,.25)'); circ(g, x + 170, 130, 11, '#ffffff');               // beach ball
      g.save(); g.beginPath(); g.arc(x + 170, 130, 11, 0, TAU); g.clip();
      g.fillStyle = '#ff6f7d'; g.beginPath(); g.moveTo(x + 170, 130); g.arc(x + 170, 130, 12, -1.9, -0.9); g.fill(); g.fillStyle = '#4fb7d8'; g.beginPath(); g.moveTo(x + 170, 130); g.arc(x + 170, 130, 12, 0.2, 1.2); g.fill();
      g.fillStyle = '#ffd24a'; g.beginPath(); g.moveTo(x + 170, 130); g.arc(x + 170, 130, 12, 2.3, 3.3); g.fill(); g.restore();
      poly(g, [x + 790, 124, x + 806, 124, x + 803, 140, x + 793, 140], '#ffd24a'); rect(g, x + 789, 123, 18, 2.4, '#f4b53a');   // bucket and spade
      g.strokeStyle = '#e9e4d6'; g.lineWidth = 1; g.beginPath(); g.arc(x + 798, 124, 8, PI, TAU); g.stroke();
      seg(g, x + 812, 140, x + 822, 122, '#e2574c', 1.8); ell(g, x + 811, 141, 3.4, 2, '#e2574c');
    }
  }

  function beach(S) {
    S.frontCol = '#dfc48c'; S.wetCol = '#4a3414'; S.puddles = [[18, 78, 230]];
    var palms = [palmSprite(S, 3, 262), palmSprite(S, 8, 236), palmSprite(S, 15, 286)];
    var warmGrad = null, coolGrad = null;

    S.strip({ name: 'sea', p: 0.15, top: 262, bot: -22, res: 0.75, rk: 0, paint: function (g, a, b, S) {
      var i, x, y, k, f;
      g.fillStyle = vgrad(g, HORIZON, -22, '#3d8fd2', '#35a0d2', '#3fb6d2', '#63cfd3', '#a5e6dc', '#d3f3e6'); g.fillRect(a, HORIZON, b - a, -22 - HORIZON);
      rect(g, a, HORIZON, b - a, 1.4, 'rgba(255,255,255,.4)'); g.fillStyle = vgrad(g, HORIZON, HORIZON + 26, 'rgba(255,255,255,.22)', 'rgba(255,255,255,0)'); g.fillRect(a, HORIZON, b - a, 26);
      for (k = 0; k < 9; k++) {                           // standing swell, closer together toward the horizon
        f = k / 8; y = HORIZON + 5 + f * f * 100;
        for (i = floor(a / 60) - 1; i * 60 < b; i++) { if (H(i, 300 + k) < 0.45) continue; x = i * 60 + H(i, 310 + k) * 50; rect(g, x, y, 10 + H(i, 320 + k) * (20 + f * 30), 0.7 + f * 0.6, 'rgba(255,255,255,' + (0.16 + f * 0.12) + ')'); }
      }
      for (i = floor(a / 2400) - 1; i * 2400 < b + 600; i++) {
        x = i * 2400 + 600;                               // headland and lighthouse
        g.fillStyle = vgrad(g, HORIZON - 26, HORIZON + 4, '#86b3a2', '#74a596'); g.beginPath(); g.moveTo(x, HORIZON + 1.5); g.bezierCurveTo(x + 40, HORIZON - 14, x + 90, HORIZON - 30, x + 150, HORIZON - 24); g.bezierCurveTo(x + 210, HORIZON - 20, x + 250, HORIZON - 6, x + 300, HORIZON + 1.5); g.closePath(); g.fill();
        g.fillStyle = '#b9b2a4'; g.beginPath(); g.moveTo(x - 6, HORIZON + 1.5); g.lineTo(x + 10, HORIZON - 6); g.lineTo(x + 26, HORIZON - 3); g.lineTo(x + 40, HORIZON + 1.5); g.fill();
        rect(g, x - 10, HORIZON + 1, 320, 1.4, 'rgba(255,255,255,.5)');
        poly(g, [x + 140, HORIZON - 24, x + 156, HORIZON - 24, x + 153, HORIZON - 72, x + 143, HORIZON - 72], '#fbf7ee'); rect(g, x + 141.4, HORIZON - 44, 13.2, 9, '#e2574c'); rect(g, x + 142.6, HORIZON - 64, 10.8, 7, '#e2574c');
        poly(g, [x + 151, HORIZON - 24, x + 156, HORIZON - 24, x + 153, HORIZON - 72, x + 150, HORIZON - 72], 'rgba(0,0,0,.12)');
        rect(g, x + 140.6, HORIZON - 75, 14.8, 3, '#39424d'); rect(g, x + 143.6, HORIZON - 84, 8.8, 9, '#ffe9a8'); poly(g, [x + 141.6, HORIZON - 84, x + 154.4, HORIZON - 84, x + 148, HORIZON - 92], '#e2574c');
        S.light(x + 143.6, HORIZON - 84, 8.8, 9, { thr: 0.25, c: '#fff3c4', g: 26 });
        rect(g, x + 160, HORIZON - 32, 20, 10, '#fbf7ee'); poly(g, [x + 158, HORIZON - 32, x + 182, HORIZON - 32, x + 170, HORIZON - 40], '#c0705a'); S.light(x + 164, HORIZON - 29, 4, 4, { thr: 0.4 });
        x = i * 2400 - 300;                               // the pier
        rect(g, x, HORIZON + 6, 420, 3, '#9c8670'); rect(g, x, HORIZON + 4.6, 420, 1.4, '#c9b79c');
        for (k = 0; k < 420; k += 22) { rect(g, x + k, HORIZON + 9, 2, 8, '#8a7560'); rect(g, x + k, HORIZON + 17, 2, 4, 'rgba(60,90,110,.3)'); if (k % 44 === 0) { rect(g, x + k, HORIZON - 4, 1, 9, '#8a7560'); S.light(x + k - 1, HORIZON - 6, 3, 3, { thr: 0.32 + (k % 88 ? 0.1 : 0), c: '#ffe2a0', g: 9 }); } }
        rect(g, x + 372, HORIZON - 12, 40, 17, '#f1e6cf'); poly(g, [x + 366, HORIZON - 12, x + 418, HORIZON - 12, x + 392, HORIZON - 26], '#5fa7a2'); rect(g, x + 380, HORIZON - 8, 6, 7, '#8fb6cc'); rect(g, x + 396, HORIZON - 8, 6, 7, '#8fb6cc');
        S.light(x + 380, HORIZON - 8, 6, 7, { thr: 0.3 }); S.light(x + 396, HORIZON - 8, 6, 7, { thr: 0.36 });
      }
    } });

    S.fn(0.15, function (ctx, va, vb, env, S, view) {     // moving water: swell, glitter, boats, the lighthouse beam
      var t = env.reduced ? 3 : env.t, k, i, x, y, f, u, n, sx, w = env.weather || {}, calm = 1 - LT.wet * 0.5;
      if (!warmGrad) {
        warmGrad = ctx.createLinearGradient(0, HORIZON, 0, -22); warmGrad.addColorStop(0, 'rgba(255,150,80,.85)'); warmGrad.addColorStop(0.45, 'rgba(255,170,120,.4)'); warmGrad.addColorStop(1, 'rgba(255,190,150,.12)');
        coolGrad = ctx.createLinearGradient(0, HORIZON, 0, -22); coolGrad.addColorStop(0, 'rgba(70,88,110,.75)'); coolGrad.addColorStop(1, 'rgba(120,138,150,.5)');
      }
      if (LT.warm > 0.02) { ctx.globalAlpha = LT.warm * (1 - LT.night) * 0.75 * (1 - (w.cloud || 0) * 0.7); ctx.fillStyle = warmGrad; ctx.fillRect(va, HORIZON, vb - va, -22 - HORIZON); }
      if ((w.cloud || 0) > 0.4) { ctx.globalAlpha = ((w.cloud || 0) - 0.4) * 1.1; ctx.fillStyle = coolGrad; ctx.fillRect(va, HORIZON, vb - va, -22 - HORIZON); }   // grey sea under grey sky
      ctx.fillStyle = lit('#ffffff', 0.5);
      for (k = 0; k < 6; k++) {                           // travelling swell lines
        f = (k + 0.5) / 6; y = HORIZON + 10 + f * f * 104; u = t * (3 + f * 14) * (k % 2 ? 1 : -0.7);
        for (i = floor((va - u) / 96) - 1; i * 96 + u < vb; i++) {
          if (H(i, 330 + k) < 0.4) continue;
          x = i * 96 + u + H(i, 340 + k) * 60; n = 16 + H(i, 350 + k) * (20 + f * 44);
          ctx.globalAlpha = (0.2 + f * 0.3) * (0.6 + 0.4 * sin(t * 0.9 + i * 1.7 + k)) * calm; ctx.fillRect(x, y + sin(t * 0.8 + i + k) * (0.4 + f), n, 0.8 + f * 1.1);
        }
      }
      // sun or moon glitter path
      var sunA = clamp(LT.sun * 3, 0, 1) * (1 - (w.cloud || 0) * 0.85) * (1 - LT.night), moonA = clamp((LT.night - 0.35) * 2.5, 0, 1) * (1 - (w.cloud || 0) * 0.85);
      for (k = 0; k < 2; k++) {
        u = k ? moonA : sunA; if (u < 0.03) continue;
        sx = va + 2 + (k ? moonFrac() : sunFrac()) * view.w / view.scale;
        ctx.fillStyle = k ? '#dfe9ff' : LT.warm > 0.3 ? '#ffe0a0' : '#fffbe6';
        n = env.reduced ? 26 : 60;
        for (i = 0; i < n; i++) {
          f = H(i, 361); f = f * f; y = HORIZON + 2.5 + f * 108;
          x = sx + (H(i, 362) - 0.5) * (26 + f * 150) + (env.reduced ? 0 : sin(t * 0.7 + i) * 3);
          ctx.globalAlpha = u * (k ? 0.5 : 0.8) * (env.reduced ? 0.6 : max(0, sin(t * (2.2 + H(i, 363) * 3) + i * 2.4)));
          ctx.fillRect(x, y, 3 + f * 13 + H(i, 364) * 5, 0.8 + f * 1.3);
        }
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, k ? '#9fb6ff' : LT.warm > 0.3 ? '#ffb060' : '#fff6d8', sx, HORIZON + 4, 120, u * (k ? 0.3 : 0.4), 12); ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      for (i = floor(va / 520) - 1; i * 520 < vb + 520; i++) {                                                 // sailboats
        if (H(i, 371) < 0.25) continue;
        f = 0.6 + H(i, 372) * 0.7; x = i * 520 + H(i, 373) * 400 + (env.reduced ? 0 : t * (1.5 + H(i, 374) * 2)); y = HORIZON + 5 + f * 12 + sin(t * 1.1 + i) * 0.5;
        ctx.save(); ctx.translate(x, y); ctx.rotate(sin(t * 0.9 + i * 2) * 0.035); ctx.scale(f, f);
        ctx.fillStyle = lit('#ffffff', 0.4); ctx.globalAlpha = 0.22; ctx.fillRect(-7, 2, 14, 12); ctx.globalAlpha = 1;
        ctx.fillStyle = lit(i % 2 ? '#d2493f' : '#3f5a9a'); ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(11, -2); ctx.lineTo(8, 2.4); ctx.lineTo(-8, 2.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = lit('#fdfbf4'); ctx.beginPath(); ctx.moveTo(0.8, -24); ctx.lineTo(0.8, -3.4); ctx.lineTo(11, -3.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = lit(i % 3 ? '#f4efe2' : '#ffd24a'); ctx.beginPath(); ctx.moveTo(-0.8, -20); ctx.lineTo(-0.8, -3.4); ctx.lineTo(-8, -3.4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      var bm = clamp((LT.night - 0.3) * 3, 0, 1);         // lighthouse beam
      if (bm > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        for (i = floor(va / 2400) - 1; i * 2400 < vb + 600; i++) {
          x = i * 2400 + 748; y = HORIZON - 79.5; u = env.reduced ? 0.4 : sin(t * 0.7 + i);
          glow(ctx, '#fff3c4', x + u * 90, y, 110 * (0.35 + abs(u) * 0.65), bm * 0.5 * (0.4 + 0.6 * abs(u)), 7);
          glow(ctx, '#fff8dc', x, y, 16 + (1 - abs(u)) * 16, bm * 0.9);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    });
    S.fn(0.3, function (ctx, va, vb, env) {               // gulls
      var fade = (1 - LT.night / 0.55) * (1 - LT.wet * 1.4), span = vb - va + 300, i, x, y, f, s, t = env.reduced ? 2.2 : env.t, dir;
      if (fade <= 0.02) return;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = min(1, fade);
      for (i = 0; i < (env.reduced ? 3 : 5); i++) {
        dir = H(i, 381) < 0.5 ? 1 : -1; s = 7 + H(i, 382) * 5;
        x = va - 150 + (((H(i, 383) * span + t * (16 + H(i, 384) * 12) * dir) % span) + span) % span; y = -250 - H(i, 385) * 110 + sin(t * 0.5 + i * 1.9) * 12;
        f = sin(t * (3.2 + H(i, 386) * 1.5) + i * 2); f = f * abs(f) * 0.9;
        ctx.strokeStyle = lit('#8f9aa8'); ctx.lineWidth = s * 0.3; ctx.beginPath(); ctx.moveTo(x - s * 1.5, y - f * s * 0.7 + 1); ctx.quadraticCurveTo(x - s * 0.7, y - s * 0.3 - f * s * 0.3, x, y); ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.3 - f * s * 0.3, x + s * 1.5, y - f * s * 0.7 + 1); ctx.stroke();
        ctx.strokeStyle = lit('#ffffff'); ctx.lineWidth = s * 0.26; ctx.beginPath(); ctx.moveTo(x - s * 1.1, y - f * s * 0.5); ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.34 - f * s * 0.24, x, y); ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.34 - f * s * 0.24, x + s * 1.1, y - f * s * 0.5); ctx.stroke();
        ctx.fillStyle = lit('#ffffff'); ctx.beginPath(); ctx.ellipse(x, y + s * 0.1, s * 0.52, s * 0.22, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = lit('#f2a73b'); ctx.fillRect(x + dir * s * 0.5 - (dir < 0 ? s * 0.22 : 0), y, s * 0.22, s * 0.1);
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    });

    S.strip({ name: 'sand', p: 1, top: 176, bot: 2, rk: 0.4, paint: function (g, a, b) {
      var i, x, k, y;
      g.beginPath(); g.moveTo(a - 8, 2); for (x = a - 8; x <= b + 10; x += 10) g.lineTo(x, shoreY(x) - 7); g.lineTo(b + 10, 2); g.closePath();
      g.fillStyle = vgrad(g, SHORE - 12, 0, '#c9b184', '#d9c291', '#efdcab', '#f4e4b8', '#f1dfb0'); g.fill();
      g.save(); g.clip();
      g.fillStyle = vgrad(g, SHORE - 12, SHORE + 12, 'rgba(120,200,210,.55)', 'rgba(150,215,215,0)'); g.fillRect(a, SHORE - 12, b - a, 24);       // glassy wet sand
      speckle(g, a, b, SHORE + 8, -2, 9, 3, 'rgba(255,255,255,.4)', 61, 1.2); speckle(g, a, b, SHORE + 8, -2, 12, 2, 'rgba(160,125,70,.28)', 65, 1.4);
      g.lineWidth = 0.8;
      for (i = floor(a / 52) - 1; i * 52 < b; i++) for (k = 0; k < 2; k++) {
        x = i * 52 + H(i, 401 + k) * 44; y = SHORE + 14 + H(i, 411 + k) * 34;
        g.strokeStyle = 'rgba(150,115,60,.2)'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 1.8, x + 20, y); g.quadraticCurveTo(x + 28, y + 1.5, x + 36, y); g.stroke();
      }
      g.restore();
      for (i = floor(a / 1150) - 1; i * 1150 < b + 300; i++) {
        x = i * 1150 + 884;                               // lifeguard tower
        ell(g, x + 14, -4, 46, 6, 'rgba(120,90,40,.22)');
        g.strokeStyle = '#b08a5c'; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 24, -4); g.lineTo(x - 18, -64); g.moveTo(x + 24, -4); g.lineTo(x + 18, -64); g.moveTo(x - 22, -22); g.lineTo(x + 20, -46); g.moveTo(x + 22, -22); g.lineTo(x - 20, -46); g.stroke();
        g.lineWidth = 2.2; g.beginPath(); g.moveTo(x + 26, -64); g.lineTo(x + 58, -6); g.moveTo(x + 34, -64); g.lineTo(x + 66, -6); g.stroke(); g.lineCap = 'butt';
        for (k = 1; k < 6; k++) seg(g, x + 26 + k * 5.4, -64 + k * 9.6, x + 34 + k * 5.4, -64 + k * 9.6, '#b08a5c', 1.6);
        rect(g, x - 30, -68, 64, 5, '#c9a878'); rect(g, x - 30, -68, 64, 1.4, '#e1c79a');
        rect(g, x - 24, -106, 48, 38, '#fbf7ee'); rect(g, x - 24, -92, 48, 9, '#e2574c'); rect(g, x + 14, -106, 10, 38, 'rgba(0,0,0,.07)');
        rect(g, x - 14, -103, 16, 12, '#9cc7dc'); rect(g, x - 6.6, -103, 1.2, 12, '#fbf7ee');
        poly(g, [x - 32, -104, x + 32, -104, x + 26, -117, x - 22, -119], '#d2493f'); rect(g, x - 32, -105.4, 64, 2.6, '#f4efe2');
        for (k = -28; k < 32; k += 7) rect(g, x + k, -80, 1.4, 12, '#e1c79a'); rect(g, x - 30, -81, 64, 1.8, '#e1c79a');
        rect(g, x + 26, -160, 1.6, 56, '#f4f1ea');
        x = i * 1150 + 60;                                // surfboards against a rail
        ell(g, x + 32, -3, 44, 5, 'rgba(120,90,40,.2)'); rect(g, x - 4, -34, 3, 32, '#a98458'); rect(g, x + 66, -34, 3, 32, '#a98458'); rect(g, x - 6, -36, 78, 3.4, '#b99466');
        for (k = 0; k < 4; k++) {
          g.save(); g.translate(x + 8 + k * 17, -4); g.rotate(-0.12 + k * 0.07);
          g.fillStyle = ['#ff8f4a', '#4fb7d8', '#fff6e6', '#8cd16a'][k]; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-8, -14, -8, -62, 0, -80); g.bezierCurveTo(8, -62, 8, -14, 0, 0); g.fill();
          g.fillStyle = ['#fff6e6', '#ffd24a', '#ff6f7d', '#ffffff'][k]; g.fillRect(-1.1, -74, 2.2, 70); g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(-2.6, -44, 1.3, 24, 0, 0, TAU); g.fill();
          g.restore();
        }
        x = i * 1150 + 800;                               // sandcastle
        ell(g, x + 4, -3, 30, 4, 'rgba(120,90,40,.2)'); rect(g, x - 18, -16, 40, 14, '#e2c98e'); rect(g, x - 22, -22, 9, 20, '#e8d19a'); rect(g, x + 17, -22, 9, 20, '#d9bf84'); rect(g, x - 5, -30, 14, 16, '#e8d19a');
        for (k = 0; k < 3; k++) rect(g, x - 5 + k * 5.5, -33, 3, 3, '#e8d19a');
        rect(g, x + 1.6, -44, 0.9, 12, '#8a6a4c'); poly(g, [x + 2.5, -44, x + 10, -41.5, x + 2.5, -39], '#ff6f7d'); rect(g, x, -10, 5, 8, '#b99a62');
        for (k = 0; k < 6; k++) {                         // footprints wandering down to the water
          rr(g, x - 150 + k * 9 + (k % 2) * 3, -8 - k * 6, 3.4, 2, 1, 'rgba(150,115,60,.3)');
        }
      }
      for (i = floor(a / 150) - 1; i * 150 < b + 150; i++) {    // far towels and parasols, well away from the stand
        x = i * 150 + H(i, 421) * 90; if (calmAt(x - 30) || calmAt(x + 60) || H(i, 422) < 0.45) continue;
        y = SHORE + 22 + H(i, 423) * 10;
        g.save(); g.translate(x, y); g.scale(0.42, 0.42); paintTowel(g, -10, 4, TOWELS[((i % 4) + 4) % 4]);
        if (H(i, 424) < 0.6) { rect(g, 44, -40, 2.4, 46, '#f4f1ea'); g.fillStyle = ['#ffd24a', '#ff6f7d', '#8cd16a'][((i % 3) + 3) % 3]; g.beginPath(); g.arc(45, -38, 36, PI, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(45, -38); g.arc(45, -38, 36, PI * 1.25, PI * 1.5); g.fill(); g.beginPath(); g.moveTo(45, -38); g.arc(45, -38, 36, PI * 1.75, TAU); g.fill(); }
        g.restore();
      }
    } });

    S.fn(1, function (ctx, va, vb, env) {                 // foam sliding up and down the shore, flags, palms
      var t = env.reduced ? 1.2 : env.t, x, u = sin(t * 0.75), y, i, k;
      ctx.fillStyle = lit('#bfeee6', 0.6); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(va - 6, SHORE - 30);
      for (x = va - 6; x <= vb + 12; x += 12) ctx.lineTo(x, shoreY(x) - 5 + u * 5 + sin(x * 0.045 + t * 1.3) * 1.6);
      ctx.lineTo(vb + 12, SHORE - 30); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.92; ctx.strokeStyle = lit('#ffffff', 0.35); ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      for (x = va - 6; x <= vb + 12; x += 12) { y = shoreY(x) - 5 + u * 5 + sin(x * 0.045 + t * 1.3) * 1.6; if (x === va - 6) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.lineWidth = 1.3; ctx.beginPath();                                              // the last wave's edge, fading
      for (x = va - 6; x <= vb + 12; x += 12) { y = shoreY(x) + 2.5 + sin(x * 0.06 + 2) * 1.4 + cos(t * 0.75) * 1.5; if (x === va - 6) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      for (i = floor(va / 1150) - 1; i * 1150 < vb + 300; i++) flag(ctx, i * 1150 + 911.6, -159, 26, 15, lit(i % 2 ? '#ffd24a' : '#e2574c'), env, i, false);
      for (i = floor(va / 250) - 1; i * 250 < vb + 250; i++) {
        x = i * 250 + 30 + H(i, 431) * 120; if (calmAt(x) || H(i, 432) < 0.2) continue;
        k = ((i % 3) + 3) % 3;
        ctx.fillStyle = 'rgba(120,90,40,.2)'; ctx.beginPath(); ctx.ellipse(x + 16, -4, 44, 5, 0, 0, TAU); ctx.fill();
        putLean(ctx, palms[k], x, -5, 0.92 + H(i, 433) * 0.16, swayAt(x, env) * 9);
      }
    });

    S.strip({ name: 'boardwalk', p: 1, top: 40, bot: 300, ground: true, rk: 0.25, paint: paveBeach });

    S.fn(1, function (ctx, va, vb, env) {                 // FRONT: a crab crossing the sand now and then
      if (env.reduced || LT.night > 0.6) return;
      var T = 19, k = floor(env.t / T), u = (env.t - k * T) / 9, x, y, i;
      if (u >= 1) return;
      x = lerp(va + 60, va + 300, H(k, 441)) + (k % 2 ? -1 : 1) * u * 150; y = 122 + H(k, 442) * 20;
      if (x > 170 && x < 800) return;
      ctx.strokeStyle = lit('#c9432f'); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.moveTo(x + i * 4, y); ctx.lineTo(x + i * 9, y + 2 + sin(env.t * 16 + i) * 1.4); ctx.moveTo(x + i * 3, y + 1); ctx.lineTo(x + i * 7.6, y + 4 - sin(env.t * 16 + i) * 1.4); ctx.moveTo(x + i * 4, y - 1.6); ctx.lineTo(x + i * 8, y - 5.4); ctx.stroke(); }
      ctx.fillStyle = lit('#e2574c'); ctx.beginPath(); ctx.ellipse(x, y, 5.4, 3.5, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x - 8.4, y - 6.4, 2.2, 0, TAU); ctx.arc(x + 8.4, y - 6.4, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1e2430'; ctx.fillRect(x - 2.4, y - 4.6, 1.3, 1.6); ctx.fillRect(x + 1.2, y - 4.6, 1.3, 1.6); ctx.lineCap = 'butt';
    }, true);
  }

  /* ================================================================== DOWNTOWN PLAZA */
  var DPITCH = 170, DOFF = -70, DGAP = 2040, FOUNT = 436, HZ = '#c6d3e0';
  var CITY_WALLS = ['#c98a6e', '#e3cfa6', '#9fb0c2', '#efe6d2', '#b9c7a8', '#b79bb0', '#d9a77e'];
  var SHOPFRONT = ['#2f5d50', '#2b3f66', '#7a2f3a', '#33363f', '#1f6f78', '#8a5a2b'];
  var AWN = [['#e2574c', '#fff6e6'], ['#2f7f8a', '#fff6e6'], ['#f0b445', '#fff6e6'], ['#3f5a9a', '#fff6e6'], ['#5f9e55', '#fff6e6'], ['#d76a9a', '#fff6e6']];
  var SHOPS = ['BAKERY', 'BOOKS', 'CAFE', 'FLORIST', 'RECORDS', 'GELATO', 'TOYS', 'DELI'];
  var GOODS = ['#e2574c', '#f0b445', '#4fb7d8', '#8cd16a', '#d76a9a', '#fff6e6', '#7a5cc0'];
  var SIGN_FONT = '800 11px ' + FONT, DASH = [3, 4];
  var GLASS = [{ g: ['#5f9fd6', '#86bfe6', '#b9def0'], side: 'rgba(16,44,90,.22)', v: 'rgba(255,255,255,.3)', hz: 'rgba(24,56,104,.2)', sh: 'rgba(255,255,255,.17)' },
    { g: ['#4fa5a8', '#79c6c0', '#b6e4d6'], side: 'rgba(10,60,70,.22)', v: 'rgba(255,255,255,.26)', hz: 'rgba(255,255,255,.3)', sh: 'rgba(255,255,255,.15)' },
    { g: ['#7886cc', '#9fb0e2', '#cfdcf3'], side: 'rgba(30,30,100,.2)', v: 'rgba(255,255,255,.3)', hz: 'rgba(40,44,120,.18)', sh: 'rgba(255,255,255,.18)' }];
  var GLASS_WARM = { g: ['#ff8f6b', '#ffb37a', '#ffdca4'], side: 'rgba(120,40,70,.2)', v: 'rgba(255,246,220,.32)', hz: 'rgba(150,60,50,.18)', sh: 'rgba(255,250,228,.34)' };

  /** the plaza opens up behind the stand: three lots in every twelve are left empty */
  function dGap(i) { var m = ((i % 12) + 12) % 12; return m >= 2 && m <= 4; }
  function dShop(i) {
    var sd = i * 37 + 11, x0 = DOFF + i * DPITCH;
    return { sd: sd, x0: x0, x1: x0 + DPITCH, kind: (((i * 3 + 1) % 8) + 8) % 8, h: 178 + floor(H(sd, 1) * 4) * 30,
      calm: calmAt(x0 + 30) || calmAt(x0 + DPITCH - 30), door: x0 + [16, DPITCH / 2 - 15, DPITCH - 46][floor(H(sd, 6) * 3)],
      awn: H(sd, 7) < 0.78, neon: ['#ff8ac2', '#8eeaff', '#ffe27a', '#a8ffb8'][floor(H(sd, 8) * 4)] };
  }
  function dTower(i) {
    var sd = i * 29 + 7, x = i * 150 + H(sd, 1) * 56, m = 0.5 + 0.5 * ridgeY(x, 91, 1300);
    var k = H(sd, 4);
    return { sd: sd, x: x, w: 66 + H(sd, 2) * 50, h: min(468, 200 + (0.4 + 0.6 * H(sd, 3)) * (130 + m * 200)), st: k < 0.44 ? 0 : k < 0.72 ? 2 : 1, skip: H(sd, 5) < 0.14 };
  }

  /** one tower of the middle skyline. `warm` repaints only its glass, in sunset colours, for the reflection overlay */
  function tower(g, S, T, warm) {
    var x = T.x, w = T.w, h = T.h, sd = T.sd, top = -h, y, k, f, c;
    if (T.st === 1) {                                     // stone, stepped crown, a spire
      if (warm) return;
      var c0 = ['#cbc3d3', '#d9cdb9', '#bcc6d4'][floor(H(sd, 6) * 3)], c1 = mixHex(c0, '#5a5f80', 0.3), s1 = w * 0.14, s2 = w * 0.3;
      g.fillStyle = vgrad(g, top, 0, c0, mixHex(c0, '#e6edf2', 0.45));
      g.fillRect(x, top + 44, w, h - 32); g.fillRect(x + s1, top + 20, w - s1 * 2, 30); g.fillRect(x + s2, top, w - s2 * 2, 24);
      rect(g, x + w * 0.78, top + 44, w * 0.22, h - 32, 'rgba(40,40,80,.1)'); rect(g, x, top + 44, 1.6, h - 32, 'rgba(255,255,255,.3)');
      poly(g, [x + s2 + 2, top, x + w / 2, top - 26, x + w - s2 - 2, top], c1); rect(g, x + w / 2 - 0.7, top - 46, 1.4, 22, c1);
      rect(g, x - 1, top + 43, w + 2, 2.4, mixHex(c0, '#ffffff', 0.45)); rect(g, x + s1 - 1, top + 19, w - s1 * 2 + 2, 2, mixHex(c0, '#ffffff', 0.45));
      rect(g, x + w / 2 - 5, top + 6, 10, 12, '#7d93b4'); S.light(x + w / 2 - 5, top + 6, 10, 12, { thr: 0.3, c: '#ffe2a1', g: 22 });
      for (y = top + 52, f = 0; y < -26; y += 12, f++) for (k = x + 6, c = 0; k < x + w - 9; k += 10, c++) {
        rect(g, k, y, 5, 7.4, '#7d93b4');
        if (H(sd, f * 31 + c + 600) < 0.34) S.light(k, y, 5, 7.4, { thr: 0.24 + H(sd, f * 17 + c + 900) * 0.6, c: H(sd, f * 13 + c + 1200) < 0.25 ? '#d6e6ff' : '#ffd98f', k: 0.85 });
      }
      return;
    }
    var pal = warm ? GLASS_WARM : GLASS[T.st === 2 ? 1 : H(sd, 8) < 0.45 ? 2 : 0], slant = T.st === 2 ? 30 : 0;
    g.save(); g.beginPath();
    g.moveTo(x, 12); g.lineTo(x, top + slant); g.lineTo(x + w, top); g.lineTo(x + w, 12); g.closePath();
    g.fillStyle = vgrad(g, top, 0, pal.g[0], pal.g[1], pal.g[2]); g.fill(); g.clip();
    g.fillStyle = pal.sh;                                 // clouds in the glass, and a long diagonal sheen
    for (k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + H(sd, 20 + k) * w, top + 34 + H(sd, 30 + k) * h * 0.5, 28 + H(sd, 40 + k) * 30, 8 + H(sd, 50 + k) * 8, 0, 0, TAU); g.fill(); }
    poly(g, [x - 10, top + h * 0.5, x + w * 0.5, top - 4, x + w * 0.8, top - 4, x - 10, top + h * 0.82]); g.fill();
    g.fillStyle = pal.side; g.fillRect(x + w * 0.76, top - 4, w * 0.24 + 1, h + 20);
    g.fillStyle = pal.hz; for (y = top + 8; y < 10; y += 11) g.fillRect(x, y, w, slant ? 3.2 : 1);
    g.fillStyle = pal.v; for (k = x + 8; k < x + w - 2; k += slant ? 16 : 8) g.fillRect(k, top - 4, 0.9, h + 20);
    g.restore();
    if (warm) return;
    poly(g, [x, 12, x, top + slant, x + 1.8, top + slant - (slant ? 1 : 0), x + 1.8, 12], 'rgba(255,255,255,.4)');
    if (slant) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, top + slant); g.lineTo(x + w, top); g.stroke(); rect(g, x + w - 1.2, top - 30, 1.2, 30, '#8aa5b5'); }
    else {
      rect(g, x - 1.5, top - 3, w + 3, 4, '#93a9bf'); rect(g, x + w * 0.2, top - 15, w * 0.38, 12, '#7c93ab'); rect(g, x + w * 0.2, top - 15, w * 0.38, 2, '#a9bccd');
      rect(g, x + w * 0.7, top - 34, 1.2, 31, '#7c93ab'); rect(g, x + w * 0.7 - 3, top - 26, 7.2, 1, '#7c93ab');
    }
    for (f = 0, y = top + slant + 8; y < -30; y += 11, f++) {    // office floors left on at night
      if (H(sd, 100 + f) < 0.3) continue;
      var sx = x + 2 + H(sd, 200 + f) * w * 0.45, sw = min(w * (0.16 + H(sd, 300 + f) * 0.5), x + w - 2 - sx);
      S.light(sx, y + 2.4, sw, 6.6, { thr: 0.22 + H(sd, 400 + f) * 0.55, c: H(sd, 500 + f) < 0.3 ? '#d6e6ff' : '#ffdc9a', k: 0.7 });
      if (sx - x > w * 0.26 && H(sd, 550 + f) < 0.5) S.light(x + 2, y + 2.4, (sx - x) * 0.6, 6.6, { thr: 0.25 + H(sd, 450 + f) * 0.55, c: '#ffdc9a', k: 0.6 });
    }
  }

  function waterTank(g, x, y, sc, c) {                    // the rooftop kind, feet on y
    var dk = mixHex(c, '#2a2030', 0.3);
    g.strokeStyle = dk; g.lineWidth = 1.2 * sc; g.beginPath(); g.moveTo(x - 7 * sc, y); g.lineTo(x - 5 * sc, y - 10 * sc); g.moveTo(x + 7 * sc, y); g.lineTo(x + 5 * sc, y - 10 * sc); g.moveTo(x - 6 * sc, y - 2 * sc); g.lineTo(x + 5.6 * sc, y - 8 * sc); g.stroke();
    g.fillStyle = hgrad(g, x - 9 * sc, x + 9 * sc, mixHex(c, '#ffffff', 0.15), c, dk); g.fillRect(x - 9 * sc, y - 28 * sc, 18 * sc, 19 * sc);
    rect(g, x - 9 * sc, y - 22 * sc, 18 * sc, 0.9 * sc, 'rgba(0,0,0,.2)'); rect(g, x - 9 * sc, y - 15 * sc, 18 * sc, 0.9 * sc, 'rgba(0,0,0,.2)');
    poly(g, [x - 10.5 * sc, y - 28 * sc, x, y - 38 * sc, x + 10.5 * sc, y - 28 * sc], dk);
  }

  function shopDisplay(g, kind, xa, xb, sd) {
    var n = floor((xb - xa - 6) / 13), k, x, c;
    rect(g, xa, -31, xb - xa, 1.8, 'rgba(60,40,30,.45)'); rect(g, xa, -17, xb - xa, 5, 'rgba(60,40,30,.22)');
    for (k = 0; k < n; k++) {
      x = xa + 5 + k * 13 + (xb - xa - 6 - n * 13) / 2; c = GOODS[floor(H(sd, k + 70) * 7)];
      if (kind === 0) { ell(g, x + 5, -35, 5.4, 3.6, '#d9a05a'); ell(g, x + 4.4, -36.2, 3.4, 1.3, '#f0cc92'); if (k % 3 === 1) { rect(g, x + 1, -27, 8, 8, '#fff6e6'); rect(g, x + 1, -27, 8, 2.4, '#f0a6b8'); circ(g, x + 5, -28.4, 1.2, '#e2574c'); } }
      else if (kind === 1) { rect(g, x, -45 + (k % 3), 3.2, 14 - (k % 3), c); rect(g, x + 3.8, -43, 3, 12, GOODS[(k + 3) % 7]); rect(g, x + 7.4, -46, 3.4, 15, GOODS[(k + 5) % 7]); rect(g, x + 1, -22, 9, 2, GOODS[(k + 1) % 7]); rect(g, x + 2, -24, 8, 2, GOODS[(k + 4) % 7]); }
      else if (kind === 2) { seg(g, x + 5, -70, x + 5, -58, 'rgba(40,30,30,.6)', 0.7); g.fillStyle = '#f0b445'; g.beginPath(); g.arc(x + 5, -55, 4.4, PI, TAU); g.fill(); rr(g, x + 2, -37, 6, 6, 1.2, '#fff6e6'); g.strokeStyle = '#fff6e6'; g.lineWidth = 0.9; g.beginPath(); g.arc(x + 8.4, -34.4, 1.8, -1.2, 1.2); g.stroke(); }
      else if (kind === 3) { poly(g, [x + 2, -31, x + 8, -31, x + 7, -24, x + 3, -24], '#b9744e'); flowers(g, x, -30, 10, sd + k, BLOOMS, 5); g.fillStyle = '#5fa24a'; g.beginPath(); g.ellipse(x + 5, -33, 5, 2.6, 0, 0, TAU); g.fill(); flowers(g, x, -31, 10, sd + k + 40, BLOOMS, 4); }
      else if (kind === 4) { circ(g, x + 5, -39, 6.2, '#22252c'); circ(g, x + 5, -39, 4.2, '#2f333c'); circ(g, x + 5, -39, 2.2, c); circ(g, x + 5, -39, 0.6, '#22252c'); rect(g, x + 1, -27, 8.6, 9, GOODS[(k + 2) % 7]); circ(g, x + 5.3, -22.5, 2.6, 'rgba(20,20,30,.6)'); }
      else if (kind === 5) { poly(g, [x + 2, -38, x + 8, -38, x + 5, -31], '#d9a05a'); circ(g, x + 5, -40, 3.6, c); circ(g, x + 4, -41, 1.1, 'rgba(255,255,255,.5)'); rr(g, x + 1.4, -27, 7.6, 8, 1.4, GOODS[(k + 2) % 7]); }
      else if (kind === 6) { if (k % 3 === 0) { circ(g, x + 5, -36, 4.6, '#b9814e'); circ(g, x + 5, -42, 3.4, '#b9814e'); circ(g, x + 2.4, -45, 1.4, '#b9814e'); circ(g, x + 7.6, -45, 1.4, '#b9814e'); } else if (k % 3 === 1) { circ(g, x + 5, -36.6, 5, c); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.beginPath(); g.arc(x + 5, -36.6, 5, 0.4, 2.2); g.stroke(); } else { rect(g, x + 1, -39, 7, 7, c); rect(g, x + 4, -45, 6, 6, GOODS[(k + 3) % 7]); } rect(g, x + 1.4, -26, 8, 7, GOODS[(k + 1) % 7]); }
      else { seg(g, x + 5, -70, x + 5, -62, 'rgba(40,30,30,.6)', 0.7); ell(g, x + 5, -55, 2.5, 7, k % 2 ? '#b4563f' : '#c96f52'); ell(g, x + 5, -34, 5.2, 2.8, '#f0c75e'); rect(g, x - 0.2, -34, 10.4, 2.6, '#f0c75e'); ell(g, x + 5, -31.4, 5.2, 2.8, '#e2b24a'); }
    }
  }

  function shop(g, S, i) {
    var B = dShop(i), sd = B.sd, x0 = B.x0, x1 = B.x1, w = DPITCH, h = B.h, calm = B.calm, k, r, c, y, wx;
    var wall = CITY_WALLS[(((i * 5 + 2) % 7) + 7) % 7], front = SHOPFRONT[(((i * 2 + 1) % 6) + 6) % 6], aw = AWN[(((i * 5 + 3) % 6) + 6) % 6];
    if (calm) { wall = mixHex(wall, '#e9e4dc', 0.35); front = mixHex(front, wall, 0.3); }
    var trim = mixHex(wall, '#ffffff', 0.6), dk = mixHex(wall, '#2a2438', 0.3), fdk = mixHex(front, '#10121c', 0.3), flt = mixHex(front, '#ffffff', 0.22);
    rect(g, x0 + 4, -3, w + 14, 5, 'rgba(40,40,70,.16)');
    g.fillStyle = vgrad(g, -h, -90, mixHex(wall, '#ffffff', 0.12), wall); g.fillRect(x0, -h, w, h - 90);
    if (i % 3 !== 1) {                                    // brick
      g.fillStyle = 'rgba(70,30,30,.075)'; for (y = -h + 5; y < -94; y += 5) g.fillRect(x0, y, w, 0.8);
      g.fillStyle = 'rgba(255,255,255,.06)'; for (k = 0; k < 40; k++) g.fillRect(x0 + H(sd, k + 100) * (w - 10), -h + 5 + floor(H(sd, k + 150) * (h - 104) / 5) * 5 + 0.8, 9, 4.2);
    } else { g.fillStyle = 'rgba(255,255,255,.07)'; for (k = 0; k < 3; k++) g.fillRect(x0 + (k + 1) * w / 4 - 0.6, -h, 1.2, h - 94); }
    rect(g, x1 - 3.4, -h, 3.4, h - 92, 'rgba(0,0,0,.1)'); rect(g, x0, -h, 2, h - 92, 'rgba(255,255,255,.16)');

    var rows = floor((h - 104) / 42), cols = H(sd, 2) < 0.4 ? 4 : 3, ww = cols === 3 ? 26 : 20, gx = (w - cols * ww) / (cols + 1);
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      wx = x0 + gx + c * (ww + gx); y = -h + 18 + r * 42;
      rect(g, wx - 3.4, y - 6.4, ww + 6.8, 3.2, trim); rect(g, wx - 3.4, y - 3.2, ww + 6.8, 1, 'rgba(0,0,0,.1)');
      win(g, S, wx, y, ww, 28, { trim: trim, curt: H(sd, r * 7 + c + 20) < 0.4, glow: 26, box: !calm && r === rows - 1 && H(sd, c + 60) < 0.35 ? '#8a5a3c' : null });
    }
    rect(g, x0 - 3, -h - 7, w + 6, 8, trim); rect(g, x0 - 3, -h + 1, w + 6, 2.6, 'rgba(0,0,0,.15)');                 // cornice
    g.fillStyle = dk; for (k = x0 + 2; k < x1 - 4; k += 7) g.fillRect(k, -h - 1.6, 3.4, 2.6);
    rect(g, x0 - 3, -h - 7, w + 6, 1.6, 'rgba(255,255,255,.5)');
    if (H(sd, 3) < 0.4 && !calm) waterTank(g, x0 + 40 + H(sd, 4) * 80, -h - 7, 1.25, '#9a6f55');
    else if (H(sd, 3) < 0.75) { wx = x0 + 30 + H(sd, 4) * 90; rect(g, wx, -h - 21, 30, 14, mixHex(wall, '#70788a', 0.5)); rect(g, wx, -h - 21, 30, 2, 'rgba(255,255,255,.3)'); rect(g, wx + 20, -h - 30, 4, 9, '#70788a'); }

    // the shop
    g.fillStyle = vgrad(g, -96, 0, flt, front, front); g.fillRect(x0, -96, w, 96);
    rect(g, x0, -98, w, 3.4, flt); rect(g, x0, -94.6, w, 1.4, 'rgba(0,0,0,.18)');
    rect(g, x0, -96, 5, 96, fdk); rect(g, x1 - 5, -96, 5, 96, fdk); rect(g, x0, -96, 1.4, 96, 'rgba(255,255,255,.14)');
    rr(g, x0 + 9, -91, w - 18, 17, 2.5, fdk); rect(g, x0 + 9, -75.4, w - 18, 1.2, 'rgba(255,255,255,.14)');
    g.font = SIGN_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    try { g.letterSpacing = '2.5px'; } catch (e) { /* older browsers: no tracking */ }
    g.fillStyle = calm ? mixHex('#fff3d6', front, 0.25) : '#fff3d6'; g.fillText(SHOPS[B.kind], x0 + w / 2 + 1.2, -82);
    try { g.letterSpacing = '0px'; } catch (e2) { /* same */ }
    var door = B.door, panes = [[x0 + 9, door - 4], [door + 34, x1 - 9]], p, xa, xb;
    rect(g, x0 + 5, -12, w - 10, 12, fdk); rect(g, x0 + 5, -12, w - 10, 1.4, 'rgba(255,255,255,.14)');
    for (p = 0; p < 2; p++) {
      xa = panes[p][0]; xb = panes[p][1]; if (xb - xa < 16) continue;
      g.fillStyle = vgrad(g, -70, -14, '#bfdbe6', '#8fb4c8'); g.fillRect(xa, -70, xb - xa, 56);
      g.save(); g.beginPath(); g.rect(xa, -70, xb - xa, 56); g.clip();
      rect(g, xa, -70, xb - xa, 56, 'rgba(60,50,60,.22)');
      shopDisplay(g, B.kind, xa, xb, sd);
      g.fillStyle = 'rgba(255,255,255,.2)'; poly(g, [xa, -30, xa + 30, -70, xa + 46, -70, xa, -10]); g.fill();
      g.restore();
      S.light(xa, B.awn ? -44.5 : -70, xb - xa, B.awn ? 30.5 : 56, { thr: 0.2 + H(sd, 9) * 0.12, c: '#ffd98a', k: 0.55, g: 0 });
      rect(g, xa - 1.6, -71.6, xb - xa + 3.2, 1.6, flt); rect(g, xa - 1.6, -14, xb - xa + 3.2, 2, flt);
      if (xb - xa > 60) rect(g, (xa + xb) / 2 - 0.8, -70, 1.6, 56, flt);
    }
    S.light(x0 + w / 2 - 1, -36, 2, 2, { thr: 0.22, k: 0.01, g: 100, gc: '#ffb95e' });
    rect(g, door - 2, -72, 34, 72, fdk);                                                                            // door
    g.fillStyle = vgrad(g, -68, -4, mixHex(front, '#ffffff', 0.1), front); g.fillRect(door + 1, -69, 28, 66);
    g.fillStyle = vgrad(g, -64, -24, '#bfdbe6', '#8fb4c8'); g.fillRect(door + 5, -64, 20, 38);
    g.fillStyle = 'rgba(255,255,255,.22)'; poly(g, [door + 5, -40, door + 19, -64, door + 25, -64, door + 5, -30]); g.fill();
    S.light(door + 5, -64, 20, 38, { thr: 0.24, c: '#ffe2a6', k: 0.55 });
    rect(g, door + 24, -22, 2, 9, '#f2cf62'); rect(g, door + 5, -20, 20, 14, 'rgba(0,0,0,.12)');
    rect(g, door - 3, -2.4, 36, 2.4, '#d9d3c7');
    if (B.awn) {
      var n = 10, tw = (w - 26) / n, bw = (w - 8) / n, ay0 = -74, ay1 = -53;
      rect(g, x0 + 6, ay1 + 1, w - 12, 9, 'rgba(20,24,50,.2)');
      for (k = 0; k < n; k++) {
        g.fillStyle = calm ? mixHex(aw[k % 2], wall, 0.3) : aw[k % 2];
        g.beginPath(); g.moveTo(x0 + 13 + k * tw, ay0); g.lineTo(x0 + 13 + (k + 1) * tw + 0.3, ay0); g.lineTo(x0 + 4 + (k + 1) * bw + 0.3, ay1); g.lineTo(x0 + 4 + k * bw, ay1); g.closePath(); g.fill();
        g.beginPath(); g.arc(x0 + 4 + (k + 0.5) * bw, ay1 - 0.2, bw / 2, 0, PI); g.fill();
      }
      g.fillStyle = vgrad(g, ay0, ay1 + 8, 'rgba(255,255,255,.2)', 'rgba(255,255,255,0)', 'rgba(20,20,60,.16)'); poly(g, [x0 + 13, ay0, x1 - 13, ay0, x1 - 4, ay1, x1 - 4, ay1 + 8, x0 + 4, ay1 + 8, x0 + 4, ay1]); g.fill();
      rect(g, x0 + 4, ay1 - 0.6, w - 8, 1.1, 'rgba(0,0,0,.14)');
    } else if (!calm) {                                   // a hanging sign instead
      rect(g, x0 + 10, -122, 20, 1.6, '#33363f'); rect(g, x0 + 14, -121, 0.9, 6, '#33363f'); rect(g, x0 + 25, -121, 0.9, 6, '#33363f');
      rr(g, x0 + 10, -115, 20, 16, 3, aw[0]); circ(g, x0 + 20, -107, 5, '#fff6e6'); circ(g, x0 + 20, -107, 2.6, aw[0]);
    }
  }

  function paintFountain(g, x) {
    var y = -22, st = function (a, b) { return hgrad(g, a, b, '#cfc8bb', '#f1ece2', '#bdb6a9'); };
    ell(g, x + 8, y + 18, 74, 6, 'rgba(60,60,90,.14)');
    g.fillStyle = st(x - 62, x + 62); g.fillRect(x - 62, y, 124, 11); g.beginPath(); g.ellipse(x, y + 11, 62, 10, 0, 0, PI); g.fill();
    g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.ellipse(x, y + 11, 62, 10, 0, 0, PI); g.ellipse(x, y + 8, 62, 10, 0, PI, 0, true); g.fill();
    ell(g, x, y, 62, 10, '#f6f2e9'); g.fillStyle = vgrad(g, y - 8, y + 8, '#a8dcec', '#6fbfdc'); ell(g, x, y + 0.8, 56, 7.8); g.fill();
    g.fillStyle = st(x - 9, x + 9); g.fillRect(x - 6, y - 60, 12, 60); rr(g, x - 11, y - 9, 22, 9, 2.5); g.fill(); rr(g, x - 9, y - 34, 18, 4, 2); g.fill();
    g.fillStyle = st(x - 36, x + 36); g.beginPath(); g.moveTo(x - 36, y - 60); g.quadraticCurveTo(x - 26, y - 45, x, y - 44); g.quadraticCurveTo(x + 26, y - 45, x + 36, y - 60); g.closePath(); g.fill();
    ell(g, x, y - 60, 36, 5.4, '#f6f2e9'); ell(g, x, y - 59.6, 31, 3.8, '#8fd0e6');
    g.fillStyle = st(x - 5, x + 5); g.fillRect(x - 3.6, y - 92, 7.2, 32);
    g.fillStyle = st(x - 18, x + 18); g.beginPath(); g.moveTo(x - 18, y - 92); g.quadraticCurveTo(x - 12, y - 83, x, y - 82.6); g.quadraticCurveTo(x + 12, y - 83, x + 18, y - 92); g.closePath(); g.fill();
    ell(g, x, y - 92, 18, 3, '#f6f2e9'); ell(g, x, y - 91.8, 14.6, 2, '#8fd0e6');
    g.fillStyle = st(x - 3, x + 3); g.fillRect(x - 1.8, y - 104, 3.6, 12); circ(g, x, y - 105.4, 2.8, '#e9e3d7');
  }

  function bistro(g, x) {
    var k, c = '#39424d';
    ell(g, x, 1, 30, 2.6, 'rgba(40,40,70,.16)');
    rect(g, x - 0.9, -25, 1.8, 25, c); ell(g, x, -0.6, 6, 1.4, c); ell(g, x, -25.4, 12, 2.8, '#f4efe6'); rect(g, x - 12, -25.4, 24, 1.6, '#f4efe6'); ell(g, x, -23.8, 12, 2.8, '#d9d3c7');
    ell(g, x, -26, 12, 2.8, '#fbf8f2'); rr(g, x - 5, -32, 4.6, 5.6, 1, '#fff6e6'); rr(g, x + 2, -31, 4, 4.6, 1, '#e2574c');
    g.strokeStyle = c; g.lineWidth = 1.5; g.lineCap = 'round';
    for (k = -1; k <= 1; k += 2) {
      g.beginPath(); g.moveTo(x + k * 17, 0); g.lineTo(x + k * 18, -15); g.lineTo(x + k * 26, -15); g.lineTo(x + k * 27, 0); g.moveTo(x + k * 26, -15); g.lineTo(x + k * 28, -34); g.stroke();
      g.beginPath(); g.arc(x + k * 28, -30, 4.6, k < 0 ? PI * 0.5 : -PI * 0.5, k < 0 ? PI * 1.5 : PI * 0.5); g.stroke();
      rr(g, x + k * 22 - 5.4, -17, 10.8, 2.6, 1.2, '#2f7f8a');
    }
    g.lineCap = 'butt';
  }
  function topiary(g, x, seed) {
    poly(g, [x - 7, -13, x + 7, -13, x + 5.4, 0, x - 5.4, 0], '#b9744e'); rect(g, x - 8, -15, 16, 3, '#c9855c'); rect(g, x - 0.9, -24, 1.8, 10, '#7a5a3c');
    crown(g, x, -33, 11, 12, seed, LEAF.hedge);
  }

  function pavePlaza(g, a, b) {
    var i, j, x, k, y, r, B, rows = [7, 22, 40, 62, 83], tw, off, px;
    // back edge: planters behind the stand and the line, bollards by the fountain, cafe tables and pots by the shops
    for (j = floor(a / DGAP) - 1; j * DGAP < b + 200; j++) {
      x = j * DGAP + 270;
      for (k = 0; k < 3; k++) {
        px = x + 10 + k * 122;
        hedge(g, px + 3, px + 107, -11, 20, j * 9 + k + 60, LEAF.hedge, true);
        g.fillStyle = vgrad(g, -14, 0, '#efe9dd', '#d2cbbd'); g.fillRect(px, -13, 110, 13); rect(g, px - 1.6, -15.4, 113.2, 3.4, '#f7f3ea'); rect(g, px - 1.6, -12, 113.2, 1, 'rgba(0,0,0,.1)');
        rect(g, px, -1.6, 110, 1.6, 'rgba(60,60,80,.16)');
      }
      for (k = 0; k < 5; k++) {
        px = x + 390 + k * 29;
        if (k < 4) { g.strokeStyle = '#6b7280'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(px, -15); g.quadraticCurveTo(px + 14.5, -8, px + 29, -15); g.stroke(); }
        rr(g, px - 2.8, -17, 5.6, 17, 2.4, '#3a4050'); rect(g, px - 2.8, -13, 5.6, 1.6, '#f0b445'); circ(g, px, -17.6, 3.2, '#4a5164'); rect(g, px - 1.6, -17, 1, 15, 'rgba(255,255,255,.2)');
      }
    }
    for (i = floor((a - DOFF) / DPITCH) - 1; DOFF + i * DPITCH < b + DPITCH; i++) {
      if (dGap(i)) continue;
      B = dShop(i); if (B.calm) continue;
      topiary(g, B.door - 9, i + 5); topiary(g, B.door + 41, i + 6);
      if (B.kind === 0 || B.kind === 2 || B.kind === 5) bistro(g, B.door > B.x0 + 60 ? B.x0 + 38 : B.x1 - 46);
      else if (B.kind === 1 || B.kind === 4) { x = B.door > B.x0 + 60 ? B.x0 + 30 : B.x1 - 34; rr(g, x - 8, -27, 16, 24, 2, '#2b6fb0'); rect(g, x - 6, -24, 12, 8, '#dfeaf2'); rect(g, x - 6, -3, 2, 3, '#22252c'); rect(g, x + 4, -3, 2, 3, '#22252c'); rect(g, x - 8, -27, 16, 1.4, 'rgba(255,255,255,.3)'); }
    }
    // plaza pavers: a brick band at the back and the front, stone slabs between, wider toward us
    g.fillStyle = vgrad(g, 0, WALK, '#d2cbc0', '#dfd9ce', '#e6e1d6', '#e9e4da'); g.fillRect(a, 0, b - a, WALK);
    for (r = 0; r < 4; r++) {
      y = rows[r]; tw = 44 + r * 10; off = (r % 2) * tw / 2 + r * 7; var hh = rows[r + 1] - y;
      for (i = floor((a - off) / tw) - 1; i * tw + off < b; i++) {
        x = i * tw + off; k = H(i, 500 + r);
        if (k < 0.28) rect(g, x, y, tw, hh, 'rgba(110,104,128,.075)'); else if (k > 0.8) rect(g, x, y, tw, hh, 'rgba(255,255,255,.2)');
        rect(g, x, y, 1, hh, 'rgba(110,104,96,.3)'); rect(g, x + 1, y, 0.8, hh, 'rgba(255,255,255,.3)');
      }
      rect(g, a, y, b - a, 1, 'rgba(110,104,96,.3)'); rect(g, a, y + 1, b - a, 0.8, 'rgba(255,255,255,.3)');
    }
    for (r = 0; r < 2; r++) {
      y = r ? 83 : 0; rect(g, a, y, b - a, 7, r ? '#cfa58e' : '#c59a84');
      for (i = floor(a / 13) - 1; i * 13 < b; i++) { if (H(i, 520 + r) < 0.3) rect(g, i * 13, y, 13, 7, 'rgba(255,255,255,.14)'); rect(g, i * 13, y, 0.9, 7, 'rgba(110,70,50,.4)'); }
      rect(g, a, y + 7, b - a, 0.9, 'rgba(110,70,50,.35)');
    }
    g.fillStyle = vgrad(g, 0, 11, 'rgba(50,50,80,.3)', 'rgba(50,50,80,0)'); g.fillRect(a, 0, b - a, 11);
    speckle(g, a, b, 2, WALK - 2, 13, 3, 'rgba(120,112,104,.2)', 5, 1.2);
    speckle(g, a, b, 2, WALK - 2, 17, 2, 'rgba(255,255,255,.32)', 9, 1.1);
    for (j = floor(a / DGAP) - 1; j * DGAP < b + 200; j++) {     // a compass rose set into the paving, out of the way
      x = j * DGAP + 870;
      g.save(); g.translate(x, 46); g.scale(1, 0.36); g.globalAlpha = 0.55;
      circ(g, 0, 0, 30, '#c59a84'); circ(g, 0, 0, 26, '#e6e1d6'); g.fillStyle = '#b98a72';
      for (k = 0; k < 8; k++) { g.beginPath(); g.moveTo(cos(k * PI / 4) * (k % 2 ? 15 : 25), sin(k * PI / 4) * (k % 2 ? 15 : 25)); g.lineTo(cos(k * PI / 4 + 0.36) * 6, sin(k * PI / 4 + 0.36) * 6); g.lineTo(cos(k * PI / 4 - 0.36) * 6, sin(k * PI / 4 - 0.36) * 6); g.fill(); }
      g.restore(); g.globalAlpha = 1;
    }
    // granite curb, then the avenue
    rect(g, a, WALK, b - a, 5, '#f1efea'); g.fillStyle = vgrad(g, WALK + 5, WALK + 14, '#b7b4ae', '#93908b'); g.fillRect(a, WALK + 5, b - a, 9);
    for (i = floor(a / 120); i * 120 < b; i++) rect(g, i * 120, WALK, 1, 14, 'rgba(80,78,74,.35)');
    g.fillStyle = vgrad(g, WALK + 14, 300, '#565b68', '#4a4f5b', '#3f444f'); g.fillRect(a, WALK + 14, b - a, 300 - WALK - 14);
    g.fillStyle = vgrad(g, WALK + 14, WALK + 23, 'rgba(16,18,30,.42)', 'rgba(16,18,30,0)'); g.fillRect(a, WALK + 14, b - a, 9);
    speckle(g, a, b, WALK + 16, 298, 10, 5, 'rgba(255,255,255,.08)', 21, 1.3);
    speckle(g, a, b, WALK + 16, 298, 13, 4, 'rgba(12,14,22,.18)', 25, 1.6);
    for (i = floor(a / 96) - 1; i * 96 < b; i++) { rr(g, i * 96 + 10, 209, 52, 5, 1.5, '#e9e6dc'); rect(g, i * 96 + 10, 212.6, 52, 1.4, 'rgba(0,0,0,.12)'); }
    for (j = floor(a / DGAP) - 1; j * DGAP < b + 300; j++) {
      x = j * DGAP + 836;                                 // zebra crossing
      rect(g, x - 16, WALK + 14, 150, 300, 'rgba(70,74,86,.5)');
      for (k = 0; k < 6; k++) { rect(g, x + k * 21, WALK + 19, 12.5, 300, '#eceae2'); rect(g, x + k * 21 + 9.5, WALK + 19, 3, 300, 'rgba(0,0,0,.07)'); }
      x = j * DGAP + 62; ell(g, x, 148, 25, 7.6, '#333843'); ell(g, x, 147.2, 22, 6.3, '#525966');                  // the manhole that steams
      g.strokeStyle = 'rgba(16,18,26,.45)'; g.lineWidth = 0.8; for (k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x - 18, 147.2 + k * 2); g.lineTo(x + 18, 147.2 + k * 2); g.stroke(); }
      x = j * DGAP + 520; rr(g, x, WALK + 6.6, 30, 5.6, 1.5, '#2a2d36');
    }
  }

  function paintSignal(g) {                               // foot at 0,0
    var c = '#2e3440', k;
    rr(g, -5, -9, 10, 9, 1.6, c); rect(g, -2.4, -150, 4.8, 142, c); rect(g, -0.6, -150, 1.2, 142, 'rgba(255,255,255,.18)');
    rr(g, -9.5, -196, 19, 48, 4, '#22262f'); rr(g, -8, -194.5, 16, 45, 3, '#343a47');
    for (k = 0; k < 3; k++) { circ(g, 0, -186 + k * 14, 5.4, '#15181e'); g.fillStyle = '#22262f'; g.beginPath(); g.arc(0, -186 + k * 14, 6.6, PI * 1.08, PI * 1.92); g.lineTo(0, -188 + k * 14); g.fill(); }
    rr(g, -14, -98, 11, 15, 2, '#22262f'); rect(g, -12, -96, 7, 11, '#15181e');
  }

  function downtown(S) {
    S.frontCol = '#3f444f'; S.puddles = [[16, 80, 170], [122, 190, 230]];
    var hi = S.dpr > 1.5 ? 0.62 : 0.9;
    var lamp = S.sprite(40, 162, 8, 160, function (g) { paintLamp(g, 'city'); });
    var signal = S.sprite(34, 204, 20, 200, paintSignal);
    var cars = [carSprite(S, '#f2c230', 'taxi'), carSprite(S, '#f2c230', 'taxi'), carSprite(S, '#d9dde3', 'car'), carSprite(S, '#3f5a9a', 'car'), carSprite(S, '#c64a43', 'car'), carSprite(S, '#2f3440', 'van'), carSprite(S, '#f4f1ea', 'van')];
    var planeT = [0, 0];

    S.strip({ name: 'far skyline', p: 0.16, top: 400, bot: 12, res: 0.5, rk: 0.3, paint: function (g, a, b, S) {
      var i, x, w, h, k, y, row, c0, c1, m;
      for (row = 0; row < 2; row++) {
        c0 = row ? '#93aecd' : '#afc4dc'; c1 = row ? '#c3d3e4' : '#d2deeb';
        for (i = floor(a / 44) - 2; i * 44 < b + 60; i++) {
          if (H(i, 607 + row) < 0.2) continue;
          m = 0.5 + 0.5 * ridgeY(i * 44, 95 + row, 1000 + row * 300);
          x = i * 44 + H(i, 601 + row) * 24; w = 24 + H(i, 603 + row) * 30; h = (row ? 70 : 110) + (0.3 + 0.7 * H(i, 605 + row)) * (60 + m * (row ? 150 : 200));
          g.fillStyle = vgrad(g, -h, 0, c0, c1); g.fillRect(x, -h, w, h + 12);
          k = H(i, 609 + row);
          if (k < 0.25) { g.fillRect(x + w * 0.25, -h - 12, w * 0.5, 12); g.fillRect(x + w / 2 - 0.6, -h - 30, 1.2, 18); }
          else if (k < 0.45) poly(g, [x, -h + 0.5, x + w, -h + 0.5, x + w, -h - 14], c0);
          else if (k < 0.6) rect(g, x + w * 0.1, -h - 5, w * 0.8, 5.5, c0);
          rect(g, x + w * 0.72, -h, w * 0.28, h + 12, 'rgba(40,70,120,.08)');
          g.fillStyle = 'rgba(255,255,255,.17)'; for (y = -h + 6; y < -20; y += 9) g.fillRect(x + 2, y, w - 4, 1.2);
          for (k = 0; k < 9; k++) if (H(i, 620 + k + row * 20) < 0.6) S.light(x + 3 + H(i, 640 + k + row * 20) * (w - 8), -h + 8 + H(i, 660 + k + row * 20) * (h - 40), 2.4, 3, { thr: 0.2 + H(i, 680 + k + row * 20) * 0.6, k: 0.8 });
        }
      }
      g.fillStyle = vgrad(g, -110, 12, 'rgba(222,232,242,0)', 'rgba(222,232,242,.7)'); g.fillRect(a, -110, b - a, 122);
    } });

    var towers = { name: 'towers', p: 0.42, top: 474, bot: 12, res: hi, rk: 0.6, paint: function (g, a, b, S) {
      for (var i = floor(a / 150) - 2, T; i * 150 < b + 160; i++) { T = dTower(i); if (!T.skip) tower(g, S, T, false); }
      g.fillStyle = vgrad(g, -100, 12, 'rgba(216,228,240,0)', 'rgba(216,228,240,.62)'); g.fillRect(a, -100, b - a, 112);
    } };
    S.strip(towers);
    var warm = S.strip({ name: 'sunset glass', hidden: true, p: 0.42, top: 474, bot: 12, res: hi * 0.75, paint: function (g, a, b, S) {
      for (var i = floor(a / 150) - 2, T; i * 150 < b + 160; i++) { T = dTower(i); if (!T.skip) tower(g, S, T, true); }
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = vgrad(g, -120, 12, 'rgba(0,0,0,0)', 'rgba(0,0,0,.85)'); g.fillRect(a, -120, b - a, 132);
      g.globalCompositeOperation = 'source-over';
    } });
    S.fn(0.42, function (ctx, va, vb, env) {              // the sunset in the glass, roof steam, beacons, pigeons wheeling
      var im = warm.im, w = env.weather || {}, a = LT.warm * (1 - LT.night * 0.8) * (1 - (w.cloud || 0) * 0.75) * 0.85, i, T, t = env.reduced ? 1 : env.t, bl;
      if (im && a > 0.02) { ctx.globalAlpha = min(1, a); ctx.drawImage(im.c, warm.a, -warm.top, im.c.width / im.ppu, im.c.height / im.ppu); ctx.globalAlpha = 1; }
      bl = clamp((LT.night - 0.25) * 4, 0, 1);
      for (i = floor(va / 150) - 2; i * 150 < vb + 160; i++) {
        T = dTower(i); if (T.skip) continue;
        if (T.st === 0 && H(T.sd, 70) < 0.5 && LT.wet < 0.5) smoke(ctx, T.x + T.w * 0.3, -T.h - 15, env, i, 1.5);
        if (bl > 0.02 && T.h > 300) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, '#ff4a3a', T.st === 1 ? T.x + T.w / 2 : T.x + T.w * (T.st === 2 ? 1 : 0.7), -T.h - (T.st === 1 ? 46 : T.st === 2 ? 30 : 34), 9, bl * (env.reduced ? 0.7 : 0.25 + 0.75 * max(0, sin(t * 2.2 + i * 1.7))));
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
      }
      flock(ctx, va, vb, env, 27, -350, -250, 7, lit('#56607a'));
    });

    S.strip({ name: 'avenue', p: 0.7, top: 350, bot: 8, res: 0.8, rk: 0.5, paint: function (g, a, b, S) {
      var i, x, w = 125, h, c, k, y, r, wx;
      for (i = floor(a / 124) - 1; i * 124 < b + 124; i++) {
        x = i * 124; h = 150 + floor(H(i, 701) * 5) * 22; c = mixHex(CITY_WALLS[(((i * 3 + 2) % 7) + 7) % 7], HZ, 0.52);
        g.fillStyle = vgrad(g, -h, 0, c, mixHex(c, HZ, 0.4)); g.fillRect(x, -h, w, h + 8);
        rect(g, x + w - 4, -h, 3, h, 'rgba(40,50,90,.07)'); rect(g, x - 1, -h - 4, w + 1, 5, mixHex(c, '#ffffff', 0.45)); rect(g, x - 1, -h + 1, w + 1, 1.6, 'rgba(40,50,90,.1)');
        for (r = 0, y = -h + 13; y < -70; y += 26, r++) for (k = 0; k < 4; k++) {
          wx = x + 13 + k * 28; rect(g, wx - 1.4, y - 1.4, 16.8, 18.8, mixHex(c, '#ffffff', 0.4)); rect(g, wx, y, 14, 16, mixHex('#7f9bb8', HZ, 0.4)); rect(g, wx, y, 14, 5, 'rgba(255,255,255,.16)');
          if (H(i, r * 5 + k + 710) < 0.6 && y < -106 && abs(((wx + 7 - 352) % DGAP + DGAP * 1.5) % DGAP - DGAP / 2) > 34) S.light(wx, y, 14, 16, { thr: 0.28 + H(i, r * 5 + k + 760) * 0.45, k: 0.7 });
        }
        rect(g, x, -58, w, 66, mixHex(mixHex(c, '#56607a', 0.3), HZ, 0.2)); rect(g, x + 9, -44, w - 19, 34, mixHex('#a3bccf', HZ, 0.35));
        poly(g, [x + 7, -59, x + w - 8, -59, x + w - 4, -45, x + 3, -45], mixHex(AWN[((i % 6) + 6) % 6][0], HZ, 0.55));
        if (H(i, 703) < 0.3) waterTank(g, x + 30 + H(i, 704) * 60, -h - 4, 0.9, mixHex('#9a6f55', HZ, 0.5));
        else if (H(i, 703) < 0.6) rect(g, x + 20 + H(i, 704) * 60, -h - 14, 26, 10, mixHex(c, '#56607a', 0.2));
      }
      for (i = floor(a / DGAP) - 1; i * DGAP < b + 200; i++) {    // the old clock tower
        x = i * DGAP + 352; c = '#ddd5c8'; var c2 = mixHex('#5f8f9a', HZ, 0.35);
        g.fillStyle = hgrad(g, x - 24, x + 24, '#e6dfd3', c, '#cdc5b9'); g.fillRect(x - 22, -292, 44, 300); g.fillRect(x - 26, -214, 52, 5); g.fillRect(x - 26, -296, 52, 6);
        rect(g, x - 26, -209, 52, 1.6, 'rgba(60,60,90,.12)'); rect(g, x - 26, -290, 52, 1.6, 'rgba(60,60,90,.12)');
        for (k = -1; k <= 1; k += 2) { rect(g, x + k * 9 - 4, -196, 8, 30, mixHex('#8fa6bd', HZ, 0.3)); g.fillStyle = mixHex('#8fa6bd', HZ, 0.3); g.beginPath(); g.arc(x + k * 9, -196, 4, PI, TAU); g.fill(); S.light(x + k * 9 - 4, -196, 8, 30, { thr: 0.5, k: 0.6 }); }
        circ(g, x, -252, 19, '#c9c0b2'); circ(g, x, -252, 16.5, '#fbf8f0');
        g.fillStyle = '#56607a'; for (k = 0; k < 12; k++) g.fillRect(x + cos(k * PI / 6) * 14 - 0.7, -252 + sin(k * PI / 6) * 14 - 0.7, 1.4, 1.4);
        seg(g, x, -252, x - 5.5, -259, '#3a4050', 1.8); seg(g, x, -252, x + 9.5, -257.5, '#3a4050', 1.2); circ(g, x, -252, 1.5, '#3a4050');
        poly(g, [x - 27, -296, x + 27, -296, x + 6, -334, x - 6, -334], c2); poly(g, [x - 27, -296, x - 6, -334, x, -334, x - 9, -296], 'rgba(255,255,255,.18)');
        rect(g, x - 0.8, -350, 1.6, 17, '#8a93a0'); circ(g, x, -351, 2.2, '#e9c46a');
      }
      for (i = floor(a / 92) - 1; i * 92 < b + 92; i++) {           // plane trees along the far side of the plaza
        x = i * 92 + H(i, 721) * 30; rect(g, x - 1.6, -44, 3.2, 44, mixHex('#8a6a52', HZ, 0.4));
        crown(g, x, -62, 27, 25, i + 730, hazePal(i % 3 ? LEAF.deep : LEAF.fresh, HZ, 0.42));
      }
      g.fillStyle = vgrad(g, -46, 8, 'rgba(226,232,238,0)', 'rgba(226,232,238,.6)'); g.fillRect(a, -46, b - a, 54);
    } });
    S.fn(0.7, function (ctx, va, vb) {                    // the clock face lights up
      var a = clamp((LT.night - 0.25) * 4, 0, 1), i, x;
      if (a < 0.02) return;
      for (i = floor(va / DGAP) - 1; i * DGAP < vb + 200; i++) {
        x = i * DGAP + 352; if (x < va - 60 || x > vb + 60) continue;
        ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#fff0c2'; ctx.beginPath(); ctx.arc(x, -252, 16.5, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, '#ffd98f', x, -252, 46, a * 0.5); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    });

    S.strip({ name: 'shops', p: 1, top: 322, bot: 2, paint: function (g, a, b, S) {
      var i, j, x, k;
      for (j = floor(a / DGAP) - 1; j * DGAP < b + 200; j++) {     // the open plaza and its fountain
        x = j * DGAP + 270;
        g.fillStyle = vgrad(g, -50, 2, '#dcd6c8', '#e9e4d8', '#e2dccf'); g.fillRect(x - 2, -50, 514, 52);
        g.fillStyle = 'rgba(120,112,104,.16)'; for (k = 0; k < 4; k++) g.fillRect(x - 2, -44 + k * k * 3.4, 514, 0.8);
        for (k = 0; k <= 12; k++) { g.beginPath(); g.moveTo(lerp(x + 255, x + k * 42.5, 0.82), -50); g.lineTo(lerp(x + 255, x + k * 42.5, 0.82) + 0.8, -50); g.lineTo(x + k * 42.5 + 1, 2); g.lineTo(x + k * 42.5, 2); g.fill(); }
        g.fillStyle = vgrad(g, -50, -38, 'rgba(226,232,238,.7)', 'rgba(226,232,238,0)'); g.fillRect(x - 2, -50, 514, 12);
        paintFountain(g, x + FOUNT);
      }
      for (i = floor((a - DOFF) / DPITCH) - 1; DOFF + i * DPITCH < b + DPITCH; i++) if (!dGap(i)) shop(g, S, i);
    } });

    S.fn(1, function (ctx, va, vb, env) {                 // neon names, the fountain playing, pigeons on its rim
      var t = env.reduced ? 2 : env.t, na = clamp((LT.night - 0.26) * 5, 0, 1), i, j, B, k, x, y, u, fl;
      if (na > 0.02) {
        ctx.font = SIGN_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        try { ctx.letterSpacing = '2.5px'; } catch (e) { /* no tracking */ }
        for (i = floor((va - DOFF) / DPITCH) - 1; DOFF + i * DPITCH < vb + DPITCH; i++) {
          if (dGap(i)) continue;
          B = dShop(i); fl = env.reduced || H(B.sd, 31) > 0.3 ? 1 : (sin(t * 23 + i) > 0.86 || sin(t * 3.1 + i) > 0.97 ? 0.45 : 1);
          ctx.globalAlpha = na * fl * (B.calm ? 0.7 : 1); ctx.fillStyle = B.neon; ctx.fillText(SHOPS[B.kind], B.x0 + DPITCH / 2 + 1.2, -82);
          ctx.globalCompositeOperation = 'lighter'; glow(ctx, B.neon, B.x0 + DPITCH / 2, -82, 52, na * fl * (B.calm ? 0.2 : 0.34), 17); ctx.globalCompositeOperation = 'source-over';
        }
        try { ctx.letterSpacing = '0px'; } catch (e2) { /* same */ }
        ctx.globalAlpha = 1;
      }
      for (j = floor(va / DGAP) - 1; j * DGAP < vb + 200; j++) {
        x = j * DGAP + 270 + FOUNT; y = -22;
        if (x < va - 90 || x > vb + 90) continue;
        if (na > 0.02) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, '#7fe0ff', x, y - 2, 78, na * 0.5, 15); glow(ctx, '#bff2ff', x, y - 62, 44, na * 0.4, 14); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
        ctx.strokeStyle = lit('#ffffff', 0.25); ctx.lineCap = 'round';
        ctx.setLineDash(DASH); ctx.lineDashOffset = -t * 38;
        ctx.globalAlpha = 0.8; ctx.lineWidth = 1.5; ctx.beginPath();                                                 // water spilling bowl to bowl
        for (k = -4; k <= 4; k++) { ctx.moveTo(x + k * 7.4, y - 59); ctx.quadraticCurveTo(x + k * 8.6, y - 44, x + k * 9.4, y - 0.5 + abs(k) * -0.4); }
        ctx.stroke();
        ctx.lineWidth = 1.1; ctx.beginPath();
        for (k = -3; k <= 3; k++) { ctx.moveTo(x + k * 4.6, y - 91.4); ctx.quadraticCurveTo(x + k * 5.6, y - 82, x + k * 6.2, y - 60.4); }
        ctx.stroke();
        ctx.setLineDash(NODASH); ctx.lineDashOffset = 0;
        ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6; ctx.beginPath();                                                 // the jet on top
        for (k = -1; k <= 1; k++) { u = 15 + sin(t * 5 + k * 2) * 2.4; ctx.moveTo(x, y - 106); ctx.quadraticCurveTo(x + k * 3.5, y - 106 - u * 1.5, x + k * 9, y - 93); }
        ctx.stroke(); ctx.lineCap = 'butt';
        ctx.lineWidth = 0.8;                                                                                         // ripples and sparkle in the pool
        for (k = 0; k < 3; k++) { u = env.reduced ? 0.3 + k * 0.25 : (t * 0.5 + k / 3) % 1; ctx.globalAlpha = (1 - u) * 0.7; ctx.beginPath(); ctx.ellipse(x, y + 0.8, 14 + u * 40, 2 + u * 5.4, 0, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = lit('#ffffff', 0.25);
        for (k = 0; k < 8; k++) { u = env.reduced ? 0.6 : sin(t * (2 + H(k, 771)) + k * 2.1); if (u > 0) { ctx.globalAlpha = u * 0.8; ctx.fillRect(x - 48 + H(k, 772) * 96, y - 4 + H(k, 773) * 9, 4 + H(k, 774) * 5, 0.9); } }
        ctx.globalAlpha = 1;
        puff(ctx, x, y - 2, 16, 0.3); puff(ctx, x - 22, y - 1, 9, 0.22); puff(ctx, x + 24, y - 1, 9, 0.22); ctx.globalAlpha = 1;
        if (LT.wet < 0.3) for (k = 0; k < 3; k++) {                                                                  // pigeons
          var px = x + [-52, 44, 57][k], py = y + [3.5, 5, 2.5][k], dir = k ? -1 : 1, bob = env.reduced ? 0 : max(0, sin(t * (2.6 + k * 0.7) + k * 2)) * 2.2;
          ctx.fillStyle = lit(k === 1 ? '#8b93a6' : '#6f7a90'); ctx.beginPath(); ctx.ellipse(px, py - 4, 5, 3.1, dir * -0.2, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.moveTo(px - dir * 4, py - 5); ctx.lineTo(px - dir * 9, py - 2.6); ctx.lineTo(px - dir * 3.4, py - 2.4); ctx.fill();
          ctx.fillStyle = lit('#56607a'); ctx.beginPath(); ctx.arc(px + dir * 4, py - 7.6 + bob, 2.2, 0, TAU); ctx.fill();
          ctx.fillStyle = lit('#7fb89a'); ctx.fillRect(px + dir * 2.4 - 1, py - 6 + bob * 0.6, 2.4, 1.4);
          ctx.fillStyle = lit('#f0a85a'); ctx.fillRect(px + dir * 5.8 - (dir < 0 ? 1.6 : 0), py - 7.6 + bob, 1.6, 0.9);
          ctx.fillStyle = lit('#d9806a'); ctx.fillRect(px - 0.8, py - 1.2, 0.7, 1.6); ctx.fillRect(px + 0.8, py - 1.2, 0.7, 1.6);
        }
      }
    });

    S.strip({ name: 'plaza', p: 1, top: 52, bot: 300, ground: true, rk: 0.25, paint: pavePlaza });

    S.fn(1, function (ctx, va, vb, env) {                 // light spilling from the shops, lamps, the traffic signal
      var i, x, a = clamp((LT.night - 0.3) * 6, 0, 1), sa = clamp((LT.night - 0.22) * 5, 0, 1), t = env.reduced ? 0 : env.t, ph, k;
      if (sa > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        for (i = floor((va - DOFF) / DPITCH) - 1; DOFF + i * DPITCH < vb + DPITCH; i++) if (!dGap(i)) glow(ctx, '#ffc978', DOFF + i * DPITCH + DPITCH / 2, 16, 96, sa * 0.26, 20);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
      for (i = floor((va - 150) / 600) - 1; 150 + i * 600 < vb + 100; i++) { x = 150 + i * 600; put(ctx, lamp, x, 3, 1); lampGlow(ctx, x + 18, -136, a, 30); }
      for (i = floor(va / DGAP) - 1; i * DGAP < vb + 200; i++) {
        x = i * DGAP + 962; if (x < va - 40 || x > vb + 40) continue;
        put(ctx, signal, x, 3, 1);
        ph = (t + i * 3) % 15; k = ph < 6.5 ? 2 : ph < 8 ? 1 : 0;      // green, amber, red
        ctx.fillStyle = ['#ff5346', '#ffc13d', '#52e07c'][k]; ctx.beginPath(); ctx.arc(x, -183 + k * 14, 4.6, 0, TAU); ctx.fill();
        ctx.fillStyle = k === 0 ? '#52e07c' : '#ff5346'; ctx.fillRect(x - 11, -93 + (k === 0 ? 5.5 : 0), 5, 5);
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, ['#ff5346', '#ffc13d', '#52e07c'][k], x, -183 + k * 14, 15 + LT.night * 12, 0.5 + LT.night * 0.4);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    });

    S.fn(1, function (ctx, va, vb, env) {                 // FRONT: steam off a manhole, traffic both ways
      var t = env.t, na = clamp((LT.night - 0.25) * 5, 0, 1), j, k, u, x, n, im, tt;
      for (j = floor(va / DGAP) - 1; j * DGAP < vb + 200; j++) { x = j * DGAP + 62; if (x > va - 60 && x < vb + 60 && LT.wet < 0.6) smoke(ctx, x, 144, env, j + 5, 1.05); }
      if (env.reduced) {                                  // nothing sweeping past: a cab waits at the kerb instead
        for (j = floor(va / DGAP) - 1; j * DGAP < vb + 200; j++) { x = j * DGAP + 150; if (x > va - 100 && x < vb + 100) { put(ctx, cars[0], x, 172, 1); carLights(ctx, x, 172, 1, na * 0.6); } }
        return;
      }
      for (k = 0; k < 4; k++) {                           // two streams a lane; a lane shares one speed so nobody overtakes
        var near = k > 1, T = near ? 8.4 : 7, dur = near ? 3.0 : 3.5;
        tt = t + [0, 3.1, 1.3, 5.2][k]; n = floor(tt / T); u = (tt - n * T) / dur;
        if (u >= 1 || H(n, 950 + k) < 0.12) continue;
        im = cars[floor(H(n, 960 + k) * cars.length)]; x = lerp(va - 120, vb + 120, near ? 1 - u : u);
        if (near) { putFlip(ctx, im, x, 252, 1.14); carLights(ctx, x, 252, -1, na); } else { put(ctx, im, x, 174, 1); carLights(ctx, x, 174, 1, na); }
      }
    }, true);
  }

  /* ================================================================== STARLIGHT CARNIVAL */
  var CPER = 1560, WPER = 3120, WHEEL_X = 530, WHEEL_Y = -252, WHEEL_R = 138, POLE0 = 190, POLE_GAP = 260, POLE_H = 226, CHZ = '#d6d2e6';
  var BAL = ['#ff6f7d', '#ffd24a', '#4fb7d8', '#8cd16a', '#c58cff', '#ff9f43'];
  var BULB = ['#fff3b8', '#ff8a8a', '#fff3b8', '#8ed6ff', '#fff3b8', '#a8f0a0', '#fff3b8', '#ffc46a'];
  var CRED = '#e2574c', CCREAM = '#fff3dc', CGOLD = '#f0b445', CTEAL = '#2f9aa0', CBLUE = '#3f7fb5', CPLUM = '#3a2440';
  var FAIR_FONT = '800 9.5px ' + FONT;

  /** a striped canvas cone: apex (cx, top), eave from cx-hw to cx+hw at y = eave, sides sagging like real canvas */
  function tentRoof(g, cx, top, hw, eave, c1, c2, n) {
    var k, xa, xb, my = (top + eave) / 2 + (eave - top) * 0.2;
    for (k = 0; k < n; k++) {
      xa = cx - hw + 2 * hw * k / n; xb = cx - hw + 2 * hw * (k + 1) / n;
      g.fillStyle = k % 2 ? c2 : c1; g.beginPath(); g.moveTo(cx, top);
      g.quadraticCurveTo(lerp(cx, xa, 0.45), my, xa - 0.2, eave); g.lineTo(xb + 0.2, eave); g.quadraticCurveTo(lerp(cx, xb, 0.45), my, cx, top); g.fill();
    }
    g.fillStyle = hgrad(g, cx - hw, cx + hw, 'rgba(255,255,255,.16)', 'rgba(255,255,255,0)', 'rgba(40,20,70,.1)', 'rgba(40,20,70,.24)');
    g.beginPath(); g.moveTo(cx, top); g.quadraticCurveTo(lerp(cx, cx - hw, 0.45), my, cx - hw, eave); g.lineTo(cx + hw, eave); g.quadraticCurveTo(lerp(cx, cx + hw, 0.45), my, cx, top); g.fill();
  }
  function valance(g, xa, xb, y, d, c1, c2) {             // a scalloped edge hanging from y
    var n = max(1, round((xb - xa) / (d * 2))), w = (xb - xa) / n, k;
    for (k = 0; k < n; k++) { g.fillStyle = k % 2 ? c2 : c1; g.beginPath(); g.rect(xa + k * w, y, w + 0.2, d * 0.5); g.arc(xa + (k + 0.5) * w, y + d * 0.5, w / 2, 0, PI); g.fill(); }
    rect(g, xa, y, xb - xa, 1, 'rgba(0,0,0,.12)');
  }
  function stripes(g, xa, xb, y0, y1, pw, c1, c2) { for (var x = xa, k = 0; x < xb - 0.1; x += pw, k++) rect(g, x, y0, min(pw, xb - x) + 0.2, y1 - y0, k % 2 ? c2 : c1); }
  function bulbRow(g, S, xa, xb, y, gap, thr) {           // painted bulbs that come on at dusk
    for (var x = xa, k = 0; x <= xb + 0.1; x += gap, k++) { circ(g, x, y, 1.7, '#fff6d0'); S.light(x - 1.7, y - 1.7, 3.4, 3.4, { thr: thr + (k % 3) * 0.04, c: '#fffbe0', g: 8, gc: k % 2 ? '#ffcf70' : '#ff9a8a' }); }
  }
  function fairSign(g, x, y, w, h, text, bg, fg) {
    rr(g, x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 4.5, CGOLD); rr(g, x - w / 2, y, w, h, 3.5, bg);
    g.font = FAIR_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    try { g.letterSpacing = '1.6px'; } catch (e) { /* no tracking */ }
    g.fillStyle = fg; g.fillText(text, x + 0.8, y + h / 2 + 0.4);
    try { g.letterSpacing = '0px'; } catch (e2) { /* same */ }
  }
  function coasterY(u) {
    var p = (u - 0.22) / 0.13, q = (u - 0.56) / 0.1, r = (u - 0.82) / 0.07;
    return -34 - 176 * Math.exp(-p * p) - 112 * Math.exp(-q * q) - 70 * Math.exp(-r * r);
  }

  function paintWheel(g, R) {                             // hub at 0,0
    var k, a, N = 12;
    g.lineCap = 'round';
    g.strokeStyle = '#c3cbdb'; g.lineWidth = 1.3; g.beginPath();
    for (k = 0; k < N * 2; k++) { a = k * PI / N; g.moveTo(cos(a) * 10, sin(a) * 10); g.lineTo(cos(a) * R * (k % 2 ? 0.9 : 1), sin(a) * R * (k % 2 ? 0.9 : 1)); }
    g.stroke();
    g.lineWidth = 0.9; g.beginPath();                     // lattice between the two rims
    for (k = 0; k < N * 2; k++) { a = k * PI / N; g.moveTo(cos(a) * R * 0.9, sin(a) * R * 0.9); g.lineTo(cos(a + PI / N) * R, sin(a + PI / N) * R); g.moveTo(cos(a) * R, sin(a) * R); g.lineTo(cos(a + PI / N) * R * 0.9, sin(a + PI / N) * R * 0.9); }
    g.stroke();
    g.strokeStyle = '#e6ebf3'; g.lineWidth = 1.7; circ(g, 0, 0, R * 0.9); g.stroke(); g.lineWidth = 1.2; circ(g, 0, 0, R * 0.52); g.stroke(); circ(g, 0, 0, R * 0.26); g.stroke();
    g.strokeStyle = '#ee6a80'; g.lineWidth = 3.6; circ(g, 0, 0, R); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 0.9; circ(g, 0, 0, R + 1.3); g.stroke();
    for (k = 0; k < 36; k++) { a = k * TAU / 36; circ(g, cos(a) * R, sin(a) * R, 1.8, '#fff6d0'); }
    for (k = 0; k < N; k++) { a = k * TAU / N; circ(g, cos(a) * R * 0.52, sin(a) * R * 0.52, 1.5, '#fff6d0'); }
    circ(g, 0, 0, 16, '#d99a2e'); circ(g, 0, 0, 13.5, CGOLD); circ(g, 0, 0, 10, '#ffd978');
    g.fillStyle = '#fff8e0'; g.beginPath(); for (k = 0; k < 10; k++) { a = k * PI / 5 - PI / 2; g.lineTo(cos(a) * (k % 2 ? 3.6 : 8.4), sin(a) * (k % 2 ? 3.6 : 8.4)); } g.fill();
    g.lineCap = 'butt';
  }
  function gondola(ctx, x, y, col, na) {
    ctx.strokeStyle = lit('#c3cbdb'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 4); ctx.stroke();
    ctx.fillStyle = lit(col);
    ctx.beginPath(); ctx.moveTo(x - 9.4, y + 9.4); ctx.quadraticCurveTo(x, y - 2.4, x + 9.4, y + 9.4); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 7.6, y + 9, 1.3, 6); ctx.fillRect(x + 6.3, y + 9, 1.3, 6);
    if (na > 0.02) { ctx.globalAlpha = na * 0.85; ctx.fillStyle = '#ffe2a1'; ctx.fillRect(x - 6.3, y + 9.4, 12.6, 5); ctx.globalAlpha = 1; ctx.fillStyle = lit(col); }
    ctx.beginPath(); ctx.moveTo(x - 8, y + 14.4); ctx.lineTo(x + 8, y + 14.4); ctx.lineTo(x + 6.6, y + 22); ctx.quadraticCurveTo(x, y + 25, x - 6.6, y + 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.fillRect(x - 7.4, y + 15.4, 14.8, 1.5);
    ctx.fillStyle = 'rgba(30,10,50,.16)'; ctx.fillRect(x + 2.6, y + 14.4, 5, 8);
  }

  function paintHorse(g, body, sad) {                     // the pole passes through 0,0; facing right
    var dk = mixHex(body, '#6a5a78', 0.35);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = dk; g.lineWidth = 3; g.beginPath(); g.moveTo(-9, 6); g.lineTo(-15, 12); g.lineTo(-19, 11); g.moveTo(9, 6); g.lineTo(16, 10); g.lineTo(20, 15); g.stroke();
    g.strokeStyle = sad; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-13, 0); g.quadraticCurveTo(-21, -2, -22, 8); g.stroke();
    ell(g, 0, 3, 14, 7.4, body);
    g.fillStyle = body; g.beginPath(); g.moveTo(6, 0); g.quadraticCurveTo(10, -10, 13.6, -16); g.lineTo(19.4, -12.4); g.quadraticCurveTo(15, -4, 13, 6); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(18.4, -13, 6.4, 3.5, 0.55, 0, TAU); g.fill();
    poly(g, [13.4, -16.6, 14.6, -21.4, 16.8, -17], body); circ(g, 18.4, -14.8, 0.85, '#2a2030');
    g.strokeStyle = sad; g.lineWidth = 2.6; g.beginPath(); g.moveTo(12.6, -17); g.quadraticCurveTo(7.6, -11, 7, -2.4); g.stroke();
    g.strokeStyle = body; g.lineWidth = 3.2; g.beginPath(); g.moveTo(-8, 8); g.lineTo(-11, 15.4); g.lineTo(-15.4, 17); g.moveTo(8, 8); g.lineTo(13.4, 12.6); g.lineTo(12, 18.6); g.stroke();
    rr(g, -6.4, -4.8, 12.8, 8.4, 3, sad); rect(g, -6.4, 0.8, 12.8, 1.4, CGOLD);
    g.strokeStyle = CGOLD; g.lineWidth = 1; g.beginPath(); g.moveTo(15, -10.4); g.lineTo(21, -12); g.moveTo(-6, 5); g.quadraticCurveTo(0, 12.4, 6, 5); g.stroke();
    ell(g, -4, 0.4, 5, 2, 'rgba(255,255,255,.25)');
    g.lineCap = 'butt'; g.lineJoin = 'miter';
  }

  function paintCarousel(g, S, cx) {
    var k, x;
    ell(g, cx + 8, 1, 106, 6, 'rgba(60,40,70,.2)');
    rect(g, cx - 90, -136, 180, 124, 'rgba(70,40,90,.2)');                                                         // the shade inside
    for (k = -2; k <= 2; k++) if (k) rect(g, cx + k * 34 - 0.8, -136, 1.6, 122, 'rgba(240,200,110,.55)');          // poles at the back
    g.fillStyle = hgrad(g, cx - 18, cx + 18, '#cdbbe0', '#f6effc', '#ad9cc4'); g.fillRect(cx - 17, -137, 34, 125);  // mirrored drum
    for (k = 0; k < 3; k++) {
      rr(g, cx - 12.5, -130 + k * 39, 25, 31, 5, '#bfe0ee'); g.fillStyle = 'rgba(255,255,255,.5)'; poly(g, [cx - 12.5, -110 + k * 39, cx + 2, -130 + k * 39, cx + 8, -130 + k * 39, cx - 12.5, -102 + k * 39]); g.fill();
      S.light(cx - 12.5, -130 + k * 39, 25, 31, { thr: 0.1, c: '#fff0c0', k: 0.55, g: k === 1 ? 60 : 0, gc: '#ffc978' });
    }
    rect(g, cx - 19, -139, 38, 4, CGOLD); rect(g, cx - 19, -16, 38, 4, CGOLD);
    g.fillStyle = vgrad(g, -14, 0, '#dc4a62', '#a8324a'); rr(g, cx - 96, -14, 192, 14, 5); g.fill();              // deck
    rect(g, cx - 94, -14, 188, 2.2, '#f6b7c0'); rect(g, cx - 92, -8.4, 184, 1.5, CGOLD);
    for (x = cx - 84; x <= cx + 84; x += 14) circ(g, x, -3.8, 1.5, CCREAM);
    for (k = -1; k <= 1; k += 2) {                                                                                 // twisted posts at the rim
      x = cx + k * 90; rect(g, x - 2, -140, 4, 127, '#f3d488');
      g.fillStyle = '#d99a2e'; for (var y = -138; y < -18; y += 8) { g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + 2, y + 4); g.lineTo(x + 2, y + 6.6); g.lineTo(x - 2, y + 2.6); g.fill(); }
    }
    tentRoof(g, cx, -198, 100, -150, CRED, CCREAM, 12);
    rect(g, cx - 100, -152, 200, 5, CGOLD); rect(g, cx - 100, -152, 200, 1.4, '#ffe2a0');
    valance(g, cx - 100, cx + 100, -147, 8.4, CCREAM, CRED);
    bulbRow(g, S, cx - 94, cx + 94, -149.4, 11.75, 0.03);
    rect(g, cx - 1, -216, 2, 19, '#d99a2e'); circ(g, cx, -198.6, 4.4, CGOLD); circ(g, cx - 1.2, -199.8, 1.4, '#ffe9b0');
  }

  function paintBigTop(g, S, cx, j) {
    var hw = 100, eave = -86, top = -206, c1 = j % 2 ? CBLUE : CRED, k;
    ell(g, cx + 10, 1, hw + 16, 6, 'rgba(60,40,70,.2)');
    seg(g, cx - hw - 4, eave + 2, cx - hw - 26, 0, 'rgba(120,90,60,.7)', 0.8); seg(g, cx + hw + 4, eave + 2, cx + hw + 26, 0, 'rgba(120,90,60,.7)', 0.8);
    rect(g, cx - hw - 28, -5, 3, 6, '#8a6a4c'); rect(g, cx + hw + 25, -5, 3, 6, '#8a6a4c');
    stripes(g, cx - hw, cx + hw, eave, 0, 12.5, CCREAM, c1);
    g.fillStyle = hgrad(g, cx - hw, cx + hw, 'rgba(255,255,255,.1)', 'rgba(255,255,255,0)', 'rgba(40,20,70,.22)'); g.fillRect(cx - hw, eave, 2 * hw, -eave);
    g.fillStyle = vgrad(g, eave, eave + 20, 'rgba(40,20,70,.3)', 'rgba(40,20,70,0)'); g.fillRect(cx - hw, eave, 2 * hw, 20);
    g.fillStyle = vgrad(g, -12, 0, 'rgba(40,20,70,0)', 'rgba(40,20,70,.18)'); g.fillRect(cx - hw, -12, 2 * hw, 12);
    g.fillStyle = CPLUM; g.beginPath(); g.moveTo(cx - 25, 0); g.lineTo(cx - 25, -40); g.quadraticCurveTo(cx, -62, cx + 25, -40); g.lineTo(cx + 25, 0); g.fill();   // the way in
    g.fillStyle = vgrad(g, -50, 0, 'rgba(255,190,110,.12)', 'rgba(255,190,110,.4)'); g.fillRect(cx - 14, -44, 28, 44);
    S.light(cx - 15, -45, 30, 45, { thr: 0.08, c: '#ffcf80', k: 0.7, g: 76, gc: '#ffb04e' });
    for (k = -1; k <= 1; k += 2) { g.fillStyle = mixHex(c1, '#2a1030', 0.18); g.beginPath(); g.moveTo(cx + k * 25, -41); g.quadraticCurveTo(cx + k * 8, -50, cx + k * 5, -50); g.quadraticCurveTo(cx + k * 9, -22, cx + k * 21, 0); g.lineTo(cx + k * 25, 0); g.fill(); rect(g, cx + k * 17 - 3, -24, 6, 2, CGOLD); }
    fairSign(g, cx, -78, 62, 14, 'BIG TOP', CPLUM, '#ffe9a8');
    bulbRow(g, S, cx - 28, cx + 28, -80.6, 8, 0.04);
    tentRoof(g, cx, top, hw + 7, eave, c1, CCREAM, 14);
    valance(g, cx - hw - 7, cx + hw + 7, eave, 7.4, c1, CCREAM);
    rect(g, cx - 0.9, top - 32, 1.8, 33, '#ece6da'); circ(g, cx, top - 0.6, 3.6, CGOLD);
  }

  function paintBooth(g, S, cx, j) {
    var k, x, c1 = j % 2 ? '#d76a9a' : CTEAL, n = 11, tw, bw;
    ell(g, cx + 8, 1, 82, 5, 'rgba(60,40,70,.2)');
    rect(g, cx - 62, -112, 124, 112, '#5a3d70');
    g.fillStyle = vgrad(g, -112, -34, 'rgba(255,200,120,.08)', 'rgba(255,200,120,.3)'); g.fillRect(cx - 62, -112, 124, 78);
    rect(g, cx - 62, -84, 124, 2.4, '#b98a5a'); rect(g, cx - 62, -56, 124, 2.4, '#b98a5a');
    for (k = 0; k < 8; k++) { x = cx - 51 + k * 14.6; ell(g, x, -93, 5.2, 6.6, BAL[(k + j + 600) % 6]); ell(g, x - 1.6, -95.4, 1.3, 2, 'rgba(255,255,255,.45)'); }        // balloons to pop
    for (k = 0; k < 5; k++) {                                                                                                                                   // prizes
      x = cx - 46 + k * 23; var pc = ['#c9925e', '#ff9ac1', '#f4efe6', '#8ed6ff', '#ffd24a'][k];
      circ(g, x, -63.4, 6.4, pc); circ(g, x, -72, 4.6, pc); circ(g, x - 3.6, -75.6, 1.8, pc); circ(g, x + 3.6, -75.6, 1.8, pc); circ(g, x - 1.5, -72.6, 0.7, '#2a2030'); circ(g, x + 1.5, -72.6, 0.7, '#2a2030'); ell(g, x, -70.4, 1.6, 1.1, 'rgba(255,255,255,.6)');
    }
    S.light(cx - 62, -112, 124, 76, { thr: 0.08, c: '#ffd98a', k: 0.3, g: 84, gc: '#ffb95e' });
    for (k = -1; k <= 1; k += 2) { x = cx + k * 63; rect(g, x - 3, -116, 6, 116, '#fbf6ea'); g.fillStyle = CRED; for (var y = -114; y < -6; y += 10) { g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y + 5); g.lineTo(x + 3, y + 9); g.lineTo(x - 3, y + 4); g.fill(); } rect(g, x + 1.6, -116, 1.4, 116, 'rgba(0,0,0,.1)'); }
    stripes(g, cx - 68, cx + 68, -34, 0, 12.4, CCREAM, c1);
    g.fillStyle = vgrad(g, -34, 0, 'rgba(40,20,70,.2)', 'rgba(40,20,70,0)', 'rgba(40,20,70,.14)'); g.fillRect(cx - 68, -34, 136, 34);
    rect(g, cx - 71, -38, 142, 4.6, '#c79a66'); rect(g, cx - 71, -38, 142, 1.3, '#e1bd8c');
    for (k = 0; k < 3; k++) { x = cx - 40 + k * 40; circ(g, x, -41.4, 3.4, '#f4efe6'); circ(g, x + 7, -41, 3, CRED); circ(g, x + 3.4, -45, 3, '#ffd24a'); }       // balls on the counter
    tw = 140 / n; bw = 158 / n;                                                                                                                                 // awning
    for (k = 0; k < n; k++) { g.fillStyle = k % 2 ? CCREAM : c1; g.beginPath(); g.moveTo(cx - 70 + k * tw, -122); g.lineTo(cx - 70 + (k + 1) * tw + 0.3, -122); g.lineTo(cx - 79 + (k + 1) * bw + 0.3, -101); g.lineTo(cx - 79 + k * bw, -101); g.fill(); }
    g.fillStyle = vgrad(g, -122, -101, 'rgba(255,255,255,.18)', 'rgba(40,20,70,.12)'); poly(g, [cx - 70, -122, cx + 70, -122, cx + 79, -101, cx - 79, -101]); g.fill();
    valance(g, cx - 79, cx + 79, -101, 7.2, c1, CCREAM);
    bulbRow(g, S, cx - 72, cx + 72, -100, 12, 0.03);
    fairSign(g, cx, -142, 66, 15, 'PRIZES', CRED, '#fff6d8');
    rect(g, cx - 24, -126, 2, 4, '#8a6a4c'); rect(g, cx + 22, -126, 2, 4, '#8a6a4c');
    for (k = -1; k <= 1; k += 2) { g.fillStyle = '#ffd24a'; g.beginPath(); for (var q = 0; q < 10; q++) { var an = q * PI / 5 - PI / 2, rd = q % 2 ? 2.6 : 6; g.lineTo(cx + k * 42 + cos(an) * rd, -134.4 + sin(an) * rd); } g.fill(); }
  }

  function paintRoundTent(g, S, cx, j) {
    var hw = 68, eave = -66, top = -150, c1 = [CBLUE, '#8a5cc0', '#2f9aa0', '#e9912f'][((j % 4) + 4) % 4];
    ell(g, cx + 8, 1, hw + 12, 5, 'rgba(60,40,70,.2)');
    stripes(g, cx - hw, cx + hw, eave, 0, 11.4, CCREAM, c1);
    g.fillStyle = hgrad(g, cx - hw, cx + hw, 'rgba(255,255,255,.1)', 'rgba(255,255,255,0)', 'rgba(40,20,70,.22)'); g.fillRect(cx - hw, eave, 2 * hw, -eave);
    g.fillStyle = vgrad(g, eave, eave + 18, 'rgba(40,20,70,.3)', 'rgba(40,20,70,0)'); g.fillRect(cx - hw, eave, 2 * hw, 18);
    g.fillStyle = CPLUM; g.beginPath(); g.moveTo(cx - 3, -52); g.lineTo(cx + 16, 0); g.lineTo(cx - 22, 0); g.fill();
    g.fillStyle = mixHex(c1, '#ffffff', 0.25); g.beginPath(); g.moveTo(cx - 3, -52); g.quadraticCurveTo(cx - 14, -30, cx - 30, -10); g.lineTo(cx - 22, 0); g.fill();
    S.light(cx - 14, -30, 22, 30, { thr: 0.1, c: '#ffcf80', k: 0.5, g: 50, gc: '#ffb04e' });
    tentRoof(g, cx, top, hw + 6, eave, c1, CCREAM, 10);
    valance(g, cx - hw - 6, cx + hw + 6, eave, 6.8, c1, CCREAM);
    rect(g, cx - 0.8, top - 26, 1.6, 27, '#ece6da'); circ(g, cx, top - 0.4, 3, CGOLD);
  }

  function paintTickets(g, S, cx) {
    ell(g, cx + 6, 1, 38, 4, 'rgba(60,40,70,.2)');
    stripes(g, cx - 27, cx + 27, -92, 0, 9, CCREAM, CRED);
    g.fillStyle = hgrad(g, cx - 27, cx + 27, 'rgba(255,255,255,.1)', 'rgba(255,255,255,0)', 'rgba(40,20,70,.2)'); g.fillRect(cx - 27, -92, 54, 92);
    g.fillStyle = CPLUM; g.beginPath(); g.moveTo(cx - 15, -40); g.lineTo(cx - 15, -62); g.quadraticCurveTo(cx, -80, cx + 15, -62); g.lineTo(cx + 15, -40); g.fill();
    S.light(cx - 13, -62, 26, 22, { thr: 0.1, c: '#ffd98a', k: 0.7, g: 30 });
    rect(g, cx - 19, -41, 38, 4, '#c79a66'); rect(g, cx - 19, -41, 38, 1.2, '#e1bd8c');
    fairSign(g, cx, -30, 48, 13, 'TICKETS', CBLUE, '#fff6d8');
    rect(g, cx - 31, -96, 62, 5, CGOLD);
    poly(g, [cx - 35, -96, cx + 35, -96, cx, -134], CBLUE); poly(g, [cx - 35, -96, cx, -134, cx - 2, -96], 'rgba(255,255,255,.2)');
    valance(g, cx - 35, cx + 35, -96, 5.6, CBLUE, CCREAM);
    rect(g, cx - 0.8, -150, 1.6, 17, '#ece6da'); circ(g, cx, -134.6, 2.8, CGOLD);
  }

  function paveCarnival(g, a, b) {
    var i, x, k, y, an, CONF = ['#ff6f7d', '#ffd24a', '#4fb7d8', '#8cd16a', '#c58cff', '#ffffff'];
    for (x = floor(a / 9) * 9; x < b + 9; x += 9) {       // grass creeping out from under the fence
      i = x / 9; ell(g, x, -0.5, 5 + H(i, 1001) * 4, 1.5 + H(i, 1002) * 1.8, '#86b862');
      if (!calmAt(x) && H(i, 1003) < 0.22) tuft(g, x, 1, 3.4 + H(i, 1004) * 2, '#6ea552');
    }
    // the midway: packed sandy earth, straw, a little confetti
    g.fillStyle = vgrad(g, 0, WALK, '#d6b888', '#e2c797', '#e9d0a3', '#ecd5aa'); g.fillRect(a, 0, b - a, WALK);
    g.fillStyle = vgrad(g, 0, 10, 'rgba(80,50,60,.3)', 'rgba(80,50,60,0)'); g.fillRect(a, 0, b - a, 10);
    rect(g, a, 29, b - a, 6, 'rgba(150,110,60,.075)'); rect(g, a, 60, b - a, 7.4, 'rgba(150,110,60,.075)');
    speckle(g, a, b, 2, WALK - 2, 10, 4, 'rgba(150,115,70,.3)', 5, 1.4);
    speckle(g, a, b, 2, WALK - 2, 12, 3, 'rgba(255,246,214,.6)', 9, 1.3);
    g.lineWidth = 0.7; g.lineCap = 'round';
    for (i = floor(a / 14) - 1; i * 14 < b; i++) for (k = 0; k < 2; k++) {
      x = i * 14 + H(i, 1011 + k) * 14; y = 4 + H(i, 1021 + k) * 82; an = H(i, 1031 + k) * PI;
      g.strokeStyle = k ? 'rgba(250,234,176,.85)' : 'rgba(180,140,84,.5)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cos(an) * 4.6, y + sin(an) * 1.6); g.stroke();
    }
    g.lineCap = 'butt';
    for (k = 0; k < 6; k++) speckle(g, a, b, 4, WALK - 4, 54, 1, CONF[k], 1041 + k * 7, 1.9);
    // candy-striped kerb board, trodden grass in front
    rect(g, a, WALK, b - a, 3.4, '#fbf6ea');
    for (i = floor(a / 28) - 1; i * 28 < b; i++) rect(g, i * 28, WALK + 3.4, 28.2, 8.6, i % 2 ? CRED : '#fbf1de');
    g.fillStyle = vgrad(g, WALK + 3.4, WALK + 12, 'rgba(40,10,30,0)', 'rgba(40,10,30,.24)'); g.fillRect(a, WALK + 3.4, b - a, 8.6);
    g.fillStyle = vgrad(g, WALK + 12, 300, '#7fb868', '#6ea95d', '#5f9d58'); g.fillRect(a, WALK + 12, b - a, 300 - WALK - 12);
    g.fillStyle = vgrad(g, WALK + 12, WALK + 25, 'rgba(30,60,30,.36)', 'rgba(30,60,30,0)'); g.fillRect(a, WALK + 12, b - a, 13);
    speckle(g, a, b, WALK + 14, 298, 12, 3, 'rgba(30,80,40,.22)', 61, 2.2);
    speckle(g, a, b, WALK + 14, 298, 16, 2, 'rgba(255,255,255,.28)', 65, 1.4);
    for (x = floor(a / 29) * 29; x < b; x += 29) { i = x / 29; tuft(g, x + H(i, 1051) * 20, WALK + 24 + H(i, 1052) * 170, 4 + H(i, 1053) * 3, H(i, 1054) < 0.5 ? '#5a9650' : '#93c873'); }
    for (k = 0; k < 6; k++) speckle(g, a, b, WALK + 16, 296, 40, 1, CONF[k], 1061 + k * 7, 2.3);
    for (i = floor(a / 210) - 1; i * 210 < b; i++) {      // dropped popcorn and a ticket stub
      x = i * 210 + H(i, 1071) * 150; y = WALK + 22 + H(i, 1072) * 22;
      for (k = 0; k < 7; k++) circ(g, x + H(i, 1080 + k) * 22, y + H(i, 1090 + k) * 8, 1.5 + H(i, 1100 + k), k % 3 ? '#fff8e2' : '#ffe9a0');
      g.save(); g.translate(x + 62, y + 12); g.rotate(H(i, 1073) - 0.5); rr(g, -7, -3, 14, 6, 1, '#ffd24a'); rect(g, -3, -3, 0.8, 6, 'rgba(160,110,20,.6)'); g.restore();
    }
  }

  function paintBale(g) {                                 // sits on 0,0
    var k;
    ell(g, 2, 1, 27, 3.4, 'rgba(30,60,30,.3)');
    g.fillStyle = vgrad(g, -27, 0, '#f0d47c', '#d9b558'); rr(g, -24, -27, 48, 27, 4); g.fill();
    g.strokeStyle = 'rgba(150,110,40,.45)'; g.lineWidth = 0.7; for (k = 0; k < 16; k++) { g.beginPath(); g.moveTo(-22 + H(k, 1201) * 40, -25 + H(k, 1202) * 22); g.lineTo(-22 + H(k, 1201) * 40 + 5, -24 + H(k, 1202) * 22); g.stroke(); }
    g.strokeStyle = 'rgba(255,244,200,.7)'; for (k = 0; k < 10; k++) { g.beginPath(); g.moveTo(-22 + H(k, 1203) * 40, -25 + H(k, 1204) * 22); g.lineTo(-22 + H(k, 1203) * 40 + 4, -25.4 + H(k, 1204) * 22); g.stroke(); }
    rect(g, -12, -27, 2.2, 27, '#b0523f'); rect(g, 10, -27, 2.2, 27, '#b0523f'); rect(g, -24, -27, 48, 2, 'rgba(255,255,255,.3)');
  }
  function paintBarrel(g) {
    var k;
    ell(g, 2, 1, 17, 3, 'rgba(30,60,30,.3)');
    g.save(); g.beginPath(); g.moveTo(-12, 0); g.quadraticCurveTo(-16.5, -19, -12, -38); g.lineTo(12, -38); g.quadraticCurveTo(16.5, -19, 12, 0); g.closePath(); g.clip();
    for (k = 0; k < 7; k++) rect(g, -16 + k * 4.7, -40, 4.8, 42, k % 2 ? CCREAM : CRED);
    g.fillStyle = hgrad(g, -16, 16, 'rgba(255,255,255,.2)', 'rgba(255,255,255,0)', 'rgba(40,20,70,.3)'); g.fillRect(-17, -40, 34, 42);
    rect(g, -17, -31, 34, 2.6, CGOLD); rect(g, -17, -10, 34, 2.6, CGOLD); g.restore();
    ell(g, 0, -38, 12, 3, '#c79a66'); ell(g, 0, -38, 9.6, 2, '#a87a48');
  }
  function paintCrate(g) {
    var k;
    ell(g, 2, 1, 22, 3, 'rgba(30,60,30,.3)');
    circ(g, -5, -30, 7.6, '#c9925e'); circ(g, -10.6, -36, 2.8, '#c9925e'); circ(g, 0.6, -36, 2.8, '#c9925e'); circ(g, -7.4, -31, 0.9, '#2a2030'); circ(g, -2.6, -31, 0.9, '#2a2030'); ell(g, -5, -27.6, 2.6, 1.8, '#f0d9b8');
    circ(g, 9, -27, 5.6, '#ffd24a'); poly(g, [13.6, -27.6, 18, -26, 13.6, -24.6], '#ff9f43'); circ(g, 10.6, -28.6, 0.8, '#2a2030');
    rect(g, -18, -24, 36, 24, '#c79a66'); rect(g, -18, -24, 36, 3, '#e1bd8c');
    g.fillStyle = 'rgba(90,60,30,.35)'; for (k = 1; k < 4; k++) g.fillRect(-18 + k * 9, -21, 0.9, 21);
    rect(g, -18, -13, 36, 3, '#b98a5a'); rect(g, -18, -1.6, 36, 1.6, 'rgba(0,0,0,.18)');
  }

  var beamCache = {};
  function beamSpr(hex) {                                 // a soft cone of light, source at the bottom middle
    var c = beamCache[hex], g, k, gr;
    if (c) return c;
    c = mk(96, 256); g = c.getContext('2d');
    gr = g.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, rgba(hex, 0.34)); gr.addColorStop(0.45, rgba(hex, 0.13)); gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr;
    for (k = 0; k < 5; k++) { g.beginPath(); g.moveTo(45, 256); g.lineTo(51, 256); g.lineTo(96 - k * 8, 0); g.lineTo(k * 8, 0); g.closePath(); g.fill(); }
    return (beamCache[hex] = c);
  }
  function balloon(ctx, x, y, r, col, sway) {
    ctx.strokeStyle = lit('#f4f0f6', 0.5); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y + r * 1.2); ctx.quadraticCurveTo(x + sway, y + r * 2.3, x - sway * 0.5, y + r * 3.6); ctx.stroke();
    ctx.fillStyle = lit(col); ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r * 1.08, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.98); ctx.lineTo(x + r * 0.24, y + r * 1.32); ctx.lineTo(x - r * 0.24, y + r * 1.32); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.42, r * 0.2, r * 0.34, -0.5, 0, TAU); ctx.fill();
  }

  function carnival(S) {
    S.frontCol = '#5f9d58'; S.wetCol = '#1a2a1c'; S.puddles = [[18, 78, 200]];
    var R = WHEEL_R, wheel = S.sprite(2 * R + 20, 2 * R + 20, R + 10, R + 10, function (g) { paintWheel(g, R); }, { rk: 0, nk: 0.7, res: S.dpr > 1.5 ? 0.8 : 1 });
    var horses = [S.sprite(50, 46, 25, 24, function (g) { paintHorse(g, '#fbf6ee', CRED); }), S.sprite(50, 46, 25, 24, function (g) { paintHorse(g, '#f1d9b0', CBLUE); }), S.sprite(50, 46, 25, 24, function (g) { paintHorse(g, '#e9e3f2', '#8a5cc0'); })];
    var bale = S.sprite(60, 36, 30, 32, paintBale), barrel = S.sprite(40, 46, 20, 42, paintBarrel), crate = S.sprite(48, 46, 24, 42, paintCrate);

    S.strip({ name: 'fairground hills', p: 0.18, top: 290, bot: 12, res: 0.5, rk: 0.3, paint: function (g, a, b, S) {
      var j, k, x, y, u, x0, W = 470, L, y1;
      ridge(g, a, b, -150, 70, 1050, 61, vgrad(g, -224, -60, '#a9c3de', '#cddcea'), 12);
      rect(g, a, -112, b - a, 124, '#9ccaae'); treeRow(g, a, b, -108, 38, 14, 23, '#9ccaae', '#aed6ba', 21);
      for (j = floor(a / 1900) - 1; j * 1900 < b + 600; j++) {    // the wooden coaster
        x0 = j * 1900 + 30;
        g.strokeStyle = '#ece6f2'; g.lineWidth = 0.9; g.beginPath();
        for (k = 0; k <= 46; k++) {
          u = k / 46; x = x0 + u * W; y = coasterY(u); g.moveTo(x, y); g.lineTo(x, 12);
          if (k < 46) { y1 = max(y, coasterY((k + 1) / 46)); for (L = -24; L > y1 + 5; L -= 26) { g.moveTo(x, L); g.lineTo(x + W / 46, L); if ((k + round(L / 26)) % 2 === 0 && L - 26 > y1 + 5) { g.moveTo(x, L); g.lineTo(x + W / 46, L - 26); } } }
        }
        g.stroke();
        g.lineJoin = 'round'; g.strokeStyle = '#d98494'; g.lineWidth = 2.8; g.beginPath(); for (k = 0; k <= 140; k++) g.lineTo(x0 + k / 140 * W, coasterY(k / 140)); g.stroke();
        g.strokeStyle = '#f6dfe4'; g.lineWidth = 0.9; g.beginPath(); for (k = 0; k <= 140; k++) g.lineTo(x0 + k / 140 * W, coasterY(k / 140) - 1.6); g.stroke();
        for (k = 2; k <= 44; k += 3) { u = k / 46; S.light(x0 + u * W - 1.2, coasterY(u) - 4.4, 2.4, 2.4, { thr: 0.06 + (k % 4) * 0.05, c: '#fff3c4', g: 7, gc: k % 2 ? '#ffcf70' : '#ff9ac1' }); }
      }
      rect(g, a, -74, b - a, 86, '#84bd8a'); treeRow(g, a, b, -70, 46, 16, 26, '#84bd8a', '#98cb98', 25);
      g.fillStyle = vgrad(g, -60, 12, 'rgba(226,236,232,0)', 'rgba(226,236,232,.55)'); g.fillRect(a, -60, b - a, 72);
    } });
    S.fn(0.18, function (ctx, va, vb, env) {              // a train on the coaster, birds
      var j, k, u, x, y, t = env.t, x0;
      if (!env.reduced) for (j = floor(va / 1900) - 1; j * 1900 < vb + 600; j++) {
        x0 = j * 1900 + 30; if (x0 > vb + 20 || x0 + 470 < va - 20) continue;
        for (k = 0; k < 4; k++) {
          u = ((t * 0.075 + j * 0.3) % 1.25) - k * 0.016; if (u <= 0.005 || u >= 0.995) continue;
          x = x0 + u * 470; y = coasterY(u);
          ctx.save(); ctx.translate(x, y - 1.6); ctx.rotate(Math.atan2(coasterY(u + 0.004) - coasterY(u - 0.004), 0.008 * 470));
          ctx.fillStyle = lit(k ? BAL[(k + 1) % 6] : '#ffd24a'); ctx.fillRect(-3, -4.4, 6, 4); ctx.fillStyle = lit('#3a2440'); ctx.fillRect(-1.6, -6.2, 1.6, 2);
          ctx.restore();
        }
      }
      flock(ctx, va, vb, env, 37, -360, -270, 5, lit('#5a5f7a'));
    });

    S.fn(0.5, function (ctx, va, vb, env) {               // the big wheel
      var t = env.reduced ? 3 : env.t, rot = t * 0.105, na = clamp((LT.night - 0.05) * 5, 0, 1), j, x, k, a, i, u, y = WHEEL_Y;
      for (j = floor(va / WPER) - 1; j * WPER < vb + 300; j++) {
        x = j * WPER + WHEEL_X; if (x + R + 40 < va || x - R - 40 > vb) continue;
        ctx.lineCap = 'round'; ctx.strokeStyle = lit('#a9b2c8'); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 54, 6); ctx.moveTo(x, y); ctx.lineTo(x + 54, 6); ctx.stroke();
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); put(ctx, wheel, 0, 0, 1); ctx.restore();
        for (k = 0; k < 12; k++) { a = rot + k * TAU / 12; gondola(ctx, x + cos(a) * R, y + sin(a) * R, BAL[k % 6], na); }
        ctx.strokeStyle = lit('#e3e8f1'); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 78, 6); ctx.moveTo(x, y); ctx.lineTo(x + 78, 6); ctx.stroke();
        ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x - 78 * 0.5, lerp(y, 6, 0.5)); ctx.lineTo(x + 78 * 0.5, lerp(y, 6, 0.5)); ctx.moveTo(x - 78 * 0.78, lerp(y, 6, 0.78)); ctx.lineTo(x + 78 * 0.78, lerp(y, 6, 0.78)); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = lit('#d99a2e'); ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill(); ctx.fillStyle = lit('#ffd978'); ctx.beginPath(); ctx.arc(x, y, 4.6, 0, TAU); ctx.fill();
        if (na > 0.02) {
          ctx.globalCompositeOperation = 'lighter';
          for (i = 0; i < 36; i++) { a = rot + i * TAU / 36; u = env.reduced ? 0.8 : 0.35 + 0.65 * max(0, sin(t * 2.6 - i * TAU / 12)); glow(ctx, i % 3 === 0 ? '#ff8ac2' : i % 3 === 1 ? '#ffe9a8' : '#8ed6ff', x + cos(a) * R, y + sin(a) * R, 8.5, na * u); }
          for (k = 0; k < 12; k++) { a = rot + k * TAU / 12; for (i = 1; i <= 3; i++) { u = env.reduced ? 0.7 : 0.3 + 0.7 * max(0, sin(t * 3.2 - i * 1.3)); glow(ctx, i === 2 ? '#ff8ac2' : '#ffe9a8', x + cos(a) * R * i * 0.26, y + sin(a) * R * i * 0.26, 6.5, na * u); } }
          glow(ctx, '#ffd98f', x, y, 36, na * 0.9); glow(ctx, '#ff9ac1', x, y, R * 1.3, na * 0.15);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
      }
    });

    S.strip({ name: 'far tents', p: 0.5, top: 200, bot: 8, res: 0.8, rk: 0.4, paint: function (g, a, b, S) {
      var i, x, hw, ev, tp, c1, c2 = mixHex(CCREAM, CHZ, 0.4), cols = [CRED, CBLUE, '#e9a23a', CTEAL, '#b06ac0'];
      rect(g, a, -34, b - a, 42, '#a9cf9c');
      for (i = floor(a / 120) - 1; i * 120 < b + 120; i++) { x = i * 120 + H(i, 1301) * 60; rect(g, x - 1.6, -58, 3.2, 30, mixHex('#8a6a52', CHZ, 0.45)); crown(g, x, -76, 30, 27, i + 1310, hazePal(i % 2 ? LEAF.deep : LEAF.fresh, CHZ, 0.45)); }
      for (i = floor(a / 176) - 1; i * 176 < b + 176; i++) {
        if (H(i, 1321) < 0.18) continue;
        x = i * 176 + H(i, 1322) * 60; hw = 48 + H(i, 1323) * 26; ev = -46 - H(i, 1324) * 16; tp = ev - 54 - H(i, 1325) * 34; c1 = mixHex(cols[floor(H(i, 1326) * 5)], CHZ, 0.48);
        stripes(g, x - hw, x + hw, ev, 8, hw / 4, c2, c1);
        g.fillStyle = hgrad(g, x - hw, x + hw, 'rgba(255,255,255,.1)', 'rgba(255,255,255,0)', 'rgba(60,50,110,.16)'); g.fillRect(x - hw, ev, 2 * hw, 8 - ev);
        g.fillStyle = vgrad(g, ev, ev + 14, 'rgba(60,50,110,.2)', 'rgba(60,50,110,0)'); g.fillRect(x - hw, ev, 2 * hw, 14);
        tentRoof(g, x, tp, hw + 4, ev, c1, c2, 8); valance(g, x - hw - 4, x + hw + 4, ev, 5, c1, c2);
        rect(g, x - 0.7, tp - 18, 1.4, 19, mixHex('#ece6da', CHZ, 0.3)); poly(g, [x + 0.7, tp - 18, x + 13, tp - 14.6, x + 0.7, tp - 11], mixHex(cols[(floor(H(i, 1326) * 5) + 2) % 5], CHZ, 0.35));
        S.light(x - 7, ev + 20, 14, -ev - 20, { thr: 0.12 + H(i, 1327) * 0.2, c: '#ffcf80', k: 0.45, g: 40, gc: '#ffb95e' });
      }
      g.fillStyle = vgrad(g, -40, 8, 'rgba(230,232,240,0)', 'rgba(230,232,240,.5)'); g.fillRect(a, -40, b - a, 48);
    } });

    S.fn(1, function (ctx, va, vb, env) {                 // searchlights from behind the tents, balloons that got away
      var a = clamp((LT.night - 0.42) * 3, 0, 1) * 0.9, t = env.reduced ? 1.4 : env.t, j, k, x, y, u, i, im, w = env.wind || 0;
      if (a > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        for (j = floor(va / CPER) - 1; j * CPER < vb + 600; j++) for (k = 0; k < 3; k++) {
          x = j * CPER + [60, 905, 1300][k]; if (x < va - 420 || x > vb + 420) continue;
          im = beamSpr(['#fff0c8', '#ffc2e2', '#bfe4ff'][k]);
          ctx.save(); ctx.translate(x, -84); ctx.rotate(sin(t * (0.34 + k * 0.09) + k * 2.1 + j) * 0.62 + (k - 1) * 0.12);
          ctx.globalAlpha = a; ctx.drawImage(im, -86, -640, 172, 640); ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
      a = 1 - LT.wet * 2.5;
      if (a > 0.02) for (i = floor(va / 310) - 1; i * 310 < vb + 310; i++) {
        x = i * 310 + H(i, 1401) * 230; if (x > 290 && x < 720) continue;
        u = env.reduced ? 0.25 + H(i, 1402) * 0.4 : (t / (17 + H(i, 1403) * 9) + H(i, 1402)) % 1;
        y = -70 - u * 600; k = sin(t * 0.8 + i * 1.7) * 7;
        ctx.globalAlpha = min(1, a) * min(1, u * 9);
        balloon(ctx, x + k + w * u * 90, y, 8.4 + H(i, 1404) * 2.4, BAL[((i % 6) + 6) % 6], k * 0.5);
      }
      ctx.globalAlpha = 1;
    });

    S.strip({ name: 'midway', p: 1, top: 244, bot: 2, paint: function (g, a, b, S) {
      var j, x, X, calm, c, i;
      for (x = floor(a / 24) * 24 - 24; x < b + 24; x += 24) {    // the canvas fence the whole length of the midway
        calm = calmAt(x + 12); c = calm ? '#e9aa9c' : CRED;
        rect(g, x, -62, 12.2, 62, calm ? '#f6ecd6' : '#f8eed8'); rect(g, x + 12, -62, 12.2, 62, calm ? '#f0dfc2' : '#f2bfae');
        rect(g, x, -66, 24.2, 4.4, c); g.fillStyle = c; g.beginPath(); g.arc(x + 6, -61.8, 6, 0, PI); g.arc(x + 18, -61.8, 6, 0, PI); g.fill();
      }
      g.fillStyle = vgrad(g, -62, 0, 'rgba(60,30,80,0)', 'rgba(60,30,80,0)', 'rgba(60,30,80,.16)'); g.fillRect(a, -62, b - a, 62);
      rect(g, a, -66, b - a, 1.2, 'rgba(255,255,255,.4)');
      for (i = floor(a / 96) - 1; i * 96 < b + 96; i++) { x = i * 96 + 46; rect(g, x - 2, -76, 4, 76, '#c9a878'); rect(g, x + 0.8, -76, 1.2, 76, 'rgba(0,0,0,.14)'); circ(g, x, -77.4, 3, calmAt(x) ? '#ecc98a' : CGOLD); }
      for (j = floor(a / CPER) - 1; j * CPER < b + 400; j++) {
        X = j * CPER;
        paintTickets(g, S, X + 1447); paintRoundTent(g, S, X + 1290, j); paintBooth(g, S, X + 1112, j);
        paintBigTop(g, S, X + 888, j); paintCarousel(g, S, X + 95);
      }
      for (i = floor((a - POLE0) / POLE_GAP) - 1; POLE0 + i * POLE_GAP < b + 20; i++) {       // poles for the strings of bulbs
        x = POLE0 + i * POLE_GAP; calm = calmAt(x + 1);
        rr(g, x - 4.4, -9, 8.8, 9, 1.6, '#b9a184'); g.fillStyle = hgrad(g, x - 2.4, x + 2.4, '#fbf4e4', '#f1e6d0', '#d9cab0'); g.fillRect(x - 2.3, -POLE_H, 4.6, POLE_H - 8);
        if (!calm) { g.fillStyle = CRED; for (var y = -POLE_H + 6; y < -16; y += 13) { g.beginPath(); g.moveTo(x - 2.3, y); g.lineTo(x + 2.3, y + 4.6); g.lineTo(x + 2.3, y + 9); g.lineTo(x - 2.3, y + 4.4); g.fill(); } }
        circ(g, x, -POLE_H - 2, 3.6, CGOLD); circ(g, x - 1, -POLE_H - 3, 1.2, '#ffe9b0');
      }
    } });

    S.fn(1, function (ctx, va, vb, env) {                 // horses going round, bulbs twinkling, flags, balloons on a string
      var t = env.reduced ? 2.3 : env.t, on = clamp((LT.night - 0.03) * 7, 0, 1), j, k, i, x, y, u, X, ang, d, sc, x0, sw, tw;
      for (j = floor(va / CPER) - 1; j * CPER < vb + 400; j++) {
        X = j * CPER; x = X + 95;
        if (x > va - 110 && x < vb + 110) for (k = 0; k < 8; k++) {
          ang = t * 0.42 + k * TAU / 8; d = cos(ang); if (d < 0.04) continue;
          u = x + sin(ang) * 70; y = -56 + sin(ang * 3 + k * 1.3) * 7; sc = 0.84 + 0.24 * d;
          ctx.fillStyle = lit('#f3d488'); ctx.fillRect(u - 1, -138, 2, 126);
          ctx.save(); ctx.translate(u, y); ctx.scale(sc * (0.22 + 0.78 * d), sc); put(ctx, horses[k % 3], 0, 0, 1); ctx.restore();
        }
        flag(ctx, X + 95 + 1, -216, 20, 11, lit(CBLUE), env, 1, true);
        flag(ctx, X + 888 + 1, -238, 28, 15, lit('#ffd24a'), env, 2, false);
        flag(ctx, X + 1290 + 1, -176, 20, 11, lit(CRED), env, 3, true);
        flag(ctx, X + 1447 + 1, -150, 16, 9, lit('#ffd24a'), env, 4, true);
        for (k = 0; k < 2; k++) {                         // a bunch of balloons tied by the big top and the booth
          x0 = X + (k ? 1040 : 778); if (x0 < va - 60 || x0 > vb + 60 || LT.wet > 0.4) continue;
          for (i = 0; i < 5; i++) {
            sw = env.reduced ? 0 : sin(t * 1.1 + i * 1.9 + k) * 2.4 + (env.wind || 0) * 9; x = x0 + (i - 2) * 8.4 + sw; y = -116 - (i % 2) * 13 - (i === 2 ? 9 : 0);
            ctx.strokeStyle = lit('#f4f0f6', 0.5); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.quadraticCurveTo(lerp(x, x0, 0.4), y + 40, x0, -66); ctx.stroke();
            ctx.fillStyle = lit(BAL[(i + k * 2) % 6]); ctx.beginPath(); ctx.ellipse(x, y, 7.6, 9.4, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.beginPath(); ctx.ellipse(x - 2.4, y - 3.8, 1.6, 2.8, -0.5, 0, TAU); ctx.fill();
          }
        }
      }
      ctx.lineWidth = 0.7; ctx.strokeStyle = lit('#4a3f58');
      for (k = floor((va - POLE0) / POLE_GAP) - 1; POLE0 + k * POLE_GAP < vb; k++) {          // strings of bulbs, pole to pole
        x0 = POLE0 + k * POLE_GAP; sw = env.reduced ? 0 : swayAt(x0, env) * 2;
        ctx.beginPath(); ctx.moveTo(x0, -POLE_H); ctx.quadraticCurveTo(x0 + POLE_GAP / 2 + sw, -POLE_H + 60, x0 + POLE_GAP, -POLE_H); ctx.stroke();
        for (i = 0; i < 17; i++) {
          u = (i + 0.5) / 17; x = x0 + POLE_GAP * u + 2 * u * (1 - u) * sw; y = -POLE_H + 120 * u * (1 - u);
          ctx.fillStyle = lit(BULB[(i + k * 3 + 800) % 8], 0.45); ctx.fillRect(x - 1.5, y + 0.6, 3, 3.8);
        }
      }
      if (on > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        for (k = floor((va - POLE0) / POLE_GAP) - 1; POLE0 + k * POLE_GAP < vb; k++) {
          x0 = POLE0 + k * POLE_GAP; sw = env.reduced ? 0 : swayAt(x0, env) * 2;
          for (i = 0; i < 17; i++) {
            u = (i + 0.5) / 17; x = x0 + POLE_GAP * u + 2 * u * (1 - u) * sw; y = -POLE_H + 120 * u * (1 - u) + 2.4;
            tw = clamp((LT.night - 0.03 - H(i, k + 1500) * 0.14) * 9, 0, 1) * (env.reduced ? 0.85 : 0.62 + 0.38 * sin(t * (2 + H(i, k + 1510) * 2.4) + i * 2.1 + k));
            if (tw <= 0.01) continue;
            glow(ctx, BULB[(i + k * 3 + 800) % 8], x, y, 10, tw * 0.9); glow(ctx, '#fffbe6', x, y, 3, tw);
          }
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    });

    S.strip({ name: 'midway ground', p: 1, top: 40, bot: 300, ground: true, rk: 0.25, paint: paveCarnival });

    S.fn(1, function (ctx, va, vb) {                      // light spilling out of the tents on to the midway
      var a = clamp((LT.night - 0.1) * 4, 0, 1), j, X;
      if (a < 0.02) return;
      ctx.globalCompositeOperation = 'lighter';
      for (j = floor(va / CPER) - 1; j * CPER < vb + 400; j++) {
        X = j * CPER; glow(ctx, '#ffb95e', X + 888, 12, 70, a * 0.4, 16); glow(ctx, '#ffc978', X + 95, 10, 120, a * 0.3, 18); glow(ctx, '#ffc978', X + 1112, 10, 90, a * 0.3, 16); glow(ctx, '#ffb95e', X + 1284, 10, 50, a * 0.3, 12);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    });

    S.fn(1, function (ctx, va, vb) {                      // FRONT: hay bales, a barrel and a crate of prizes off to the sides
      for (var j = floor(va / CPER) - 1, X; j * CPER < vb + 200; j++) {
        X = j * CPER;
        if (X + 130 > va && X < vb) { put(ctx, bale, X + 50, 139, 1); put(ctx, bale, X + 97, 142, 0.92); }
        if (X + 1010 > va && X + 900 < vb) { put(ctx, barrel, X + 934, 141, 1); put(ctx, crate, X + 972, 143, 1); }
        if (X + 1420 > va && X + 1300 < vb) put(ctx, bale, X + 1360, 140, 1);
      }
    }, true);
  }

  /* ================================================================== registry and API */
  var LOCS = { street: street, park: park, beach: beach, downtown: downtown, carnival: carnival };

  SS.Backdrops = {
    update: function (dt, view, env) {
      if (!view || !env) return;
      try { tick(view, env); ticked = true; } catch (e) { warn('update', e); }
    },
    drawBack: function (ctx, view, env) {
      if (!ctx || !view || !env) return;
      if (!ticked) { try { tick(view, env); } catch (e) { warn('update', e); } }
      treeBoxes.length = 0;
      draw(ctx, view, env, false);
    },
    /** true when CSS-pixel point (sx, sy) on the scene canvas is on a tree drawn in the last frame */
    treeAt: function (sx, sy) {
      for (var i = treeBoxes.length - 1; i >= 0; i--) { var b = treeBoxes[i]; if (sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1 && onTree(b, sx, sy)) return true; }
      return false;
    },
    drawFront: function (ctx, view, env) {
      ticked = false;
      if (!ctx || !view || !env) return;
      draw(ctx, view, env, true);
    }
  };
})();
