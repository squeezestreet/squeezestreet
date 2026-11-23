/* Squeeze Street — fx.js
 * The juice: one pooled particle system plus a short list of "acts" (stamps, rings, flashes,
 * float text, the phase wipe, the fireworks show) drawn on the overlay canvas ABOVE the DOM UI.
 * Listens to the bus by itself. Everything lives in screen pixels; world positions from
 * events convert through SS.view. Nothing runs when there is nothing to draw.
 *
 * SS.FX = {
 *   update(dt, view, env)  draw(ctx, view, env)
 *   shake(magPx, seconds)  shakeOffset() -> {x, y}   (shared object; always 0,0 when reduced)
 *   floatText(text, sx, sy, {color, size})
 *   confetti({x, y, count})
 *   burst(kind, sx, sy, {count, angle, power})   kind: spark twinkle star heart note drop slice
 *                                                puff dust steam leaf confetti coin (default spark)
 *   coinsTo(sx, sy, target, count)               target = DOM element | {x, y} | null (cash readout)
 * }
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var SS = (root.SS = root.SS || {}), W = SS.W;
  var TAU = Math.PI * 2, HALF = Math.PI / 2, rnd = Math.random;
  var CAP = 900;                       // hard limit on live particles
  var SP = 2;                          // sprites are painted at 2x and scaled when blitted
  var INK = '#1b1f3b';
  var FONT = "'Bagel Fat One', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif";
  var RGB = [[255, 98, 87], [255, 216, 61], [53, 201, 119], [76, 195, 240], [122, 92, 255], [255, 93, 143], [255, 255, 255]];
  var HEX = ['#ff6257', '#ffd83d', '#35c977', '#4cc3f0', '#7a5cff', '#ff5d8f', '#ffffff'];
  // Where things sit on the counter, world units from STAND_X (the counter top is ~95 up).
  var PITCHER_DX = 0, CUP_DX = -62, BELL_DX = 58, COUNTER_UP = 97;
  var END_POP = 1, END_SPLASH = 2, END_BOOM = 3;

  var S = null;                        // sprites, built on first use
  var pool = [], live = 0, steal = 0;
  var acts = [];
  var lowMo = false;                   // reduced motion right now
  var U = 1;                           // size factor: effects grow with the camera zoom so they keep pace with the scene
  var sh = { x: 0, y: 0 }, shMag = 0, shDur = 0, shT = 0, shClock = 0;
  var P = { x: 0, y: 0 }, T = { x: 0, y: 0 };            // scratch points (source, target)
  var ptr = { x: 0, y: 0, at: -1e9 };
  var tcache = new Map(), mctx = null, fxEl = null, fatFont = false;
  var seenPhase = false, wipeDir = -1, lastMilestone = -1e9;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v) { return typeof v === 'number' && v === v; }
  function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* ------------------------------------------------------------------ *
   * Sprites: painted once to offscreen canvases, blitted every frame
   * ------------------------------------------------------------------ */
  function mk(w, h, paint) {
    w = Math.ceil(w); h = Math.ceil(h);
    var c = document.createElement('canvas');
    c.width = w * SP; c.height = h * SP;
    var g = c.getContext('2d');
    g.scale(SP, SP); g.translate(w / 2, h / 2); g.lineJoin = g.lineCap = 'round';
    paint(g, w, h);
    return { c: c, w: w, h: h };
  }
  function blob(g, x, y, r, c, a) {                       // soft-edged disc
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.55, rgba(c, a * 0.85)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  function inked(g, fill, lw) { g.fillStyle = fill; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); }
  function disc(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry == null ? rx : ry, rot || 0, 0, TAU); g.fill(); }
  function plate(g, hw, hh, r) {                          // rounded rectangle path centred on 0,0
    g.beginPath(); g.moveTo(-hw + r, -hh); g.arcTo(hw, -hh, hw, hh, r); g.arcTo(hw, hh, -hw, hh, r);
    g.arcTo(-hw, hh, -hw, -hh, r); g.arcTo(-hw, -hh, hw, -hh, r); g.closePath();
  }

  function glowSprite(c) {
    return mk(32, 32, function (g) {
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, rgba(c, 0.95));
      gr.addColorStop(0.5, rgba(c, 0.38)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.fillRect(-16, -16, 32, 32);
    });
  }
  function coinSprite(i, n) {
    return mk(26, 26, function (g) {
      var a = i / n * Math.PI, cw = Math.abs(Math.cos(a)), rx = Math.max(1.5, 10 * cw), ed = 3.2 * Math.sin(a);
      g.fillStyle = INK; disc(g, 0, 0, rx + 1.9 + ed * 0.5, 11.9);
      g.fillStyle = '#c47d00'; disc(g, ed * 0.5, 0, rx, 10);                 // the rim, seen edge-on
      g.fillStyle = '#ffc928'; disc(g, -ed * 0.5, 0, rx, 10);                // the face
      if (cw > 0.3) {
        g.strokeStyle = '#e39a00'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(-ed * 0.5, 0, rx * 0.62, 6.2, 0, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.8)'; disc(g, -ed * 0.5 - rx * 0.36, -4.2, rx * 0.2, 2.6, -0.5);
      }
    });
  }
  function sliceSprite(d, rind, flesh) {
    return mk(d, d, function (g) {
      var r = d / 2 - d * 0.045, i, a;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); inked(g, rind, d * 0.055);
      g.fillStyle = '#fff6c9'; disc(g, 0, 0, r * 0.83);
      g.fillStyle = flesh;
      for (i = 0; i < 8; i++) {
        a = i * TAU / 8 + 0.08;
        g.beginPath(); g.moveTo(Math.cos(a + 0.31) * r * 0.13, Math.sin(a + 0.31) * r * 0.13);
        g.arc(0, 0, r * 0.73, a, a + TAU / 8 - 0.16); g.closePath(); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = d * 0.035;
      g.beginPath(); g.arc(0, 0, r * 0.56, -2.5, -1.5); g.stroke();
    });
  }
  function dropSprite(col) {                              // round end down, tail up
    return mk(14, 20, function (g) {
      g.beginPath(); g.moveTo(0, -8.5); g.bezierCurveTo(1.5, -4, 5.4, -0.5, 5.4, 3.6);
      g.arc(0, 3.6, 5.4, 0, Math.PI); g.bezierCurveTo(-5.4, -0.5, -1.5, -4, 0, -8.5); g.closePath();
      inked(g, col, 1.6);
      g.fillStyle = 'rgba(255,255,255,.8)'; disc(g, -1.8, 2.6, 1.3, 2, 0.4);
    });
  }
  function puffSprite(c, rim) {
    var b = [-6, 3, 13, 7, 4, 12, 0, -6, 13, 1, 3, 12];
    return mk(48, 48, function (g) {
      for (var k = 0; k < 12; k += 3) blob(g, b[k], b[k + 1], b[k + 2] + 3.5, rim, 0.55);    // darker rim so it reads on pale ground
      for (k = 0; k < 12; k += 3) blob(g, b[k], b[k + 1], b[k + 2], c, 1);
    });
  }
  function leafSprite(c, vein) {
    return mk(24, 16, function (g) {
      g.beginPath(); g.moveTo(-10, 0); g.quadraticCurveTo(-1, -9, 10, 0); g.quadraticCurveTo(-1, 9, -10, 0); g.closePath();
      inked(g, c, 1.5);
      g.strokeStyle = vein; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-7, 0); g.lineTo(6, 0); g.stroke();
    });
  }

  function build() {
    if (S) return true;
    if (typeof document === 'undefined') return false;
    var s = {}, i;
    s.glows = RGB.map(glowSprite);
    s.glow = s.glows[1]; s.glowW = s.glows[6];
    s.ember = mk(24, 24, function (g) {
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, 12);
      gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.4, 'rgba(255,196,40,.85)'); gr.addColorStop(1, 'rgba(255,160,0,0)');
      g.fillStyle = gr; g.fillRect(-12, -12, 24, 24);
    });
    s.coin = []; for (i = 0; i < 8; i++) s.coin.push(coinSprite(i, 8));
    s.sparkle = mk(32, 32, function (g) {
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, 16);
      gr.addColorStop(0, 'rgba(255,244,184,.9)'); gr.addColorStop(0.35, 'rgba(255,216,61,.32)'); gr.addColorStop(1, 'rgba(255,216,61,0)');
      g.fillStyle = gr; g.fillRect(-16, -16, 32, 32);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -14.5);
      g.quadraticCurveTo(1.7, -1.7, 14.5, 0); g.quadraticCurveTo(1.7, 1.7, 0, 14.5);
      g.quadraticCurveTo(-1.7, 1.7, -14.5, 0); g.quadraticCurveTo(-1.7, -1.7, 0, -14.5); g.fill();
    });
    s.heart = mk(28, 28, function (g) {
      g.beginPath(); g.moveTo(0, -4); g.bezierCurveTo(-3, -10, -11, -8, -10, -1); g.bezierCurveTo(-9.5, 4, -3, 7, 0, 10.5);
      g.bezierCurveTo(3, 7, 9.5, 4, 10, -1); g.bezierCurveTo(11, -8, 3, -10, 0, -4); g.closePath();
      inked(g, '#ff5d8f', 2.2);
      g.fillStyle = 'rgba(255,255,255,.75)'; disc(g, -5.2, -3.6, 2.2, 1.5, -0.6);
    });
    s.star = mk(30, 30, function (g) {
      g.beginPath();
      for (var k = 0; k < 10; k++) { var a = -HALF + k * Math.PI / 5, r = k & 1 ? 5.6 : 11.6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); inked(g, '#ffd83d', 2.4);
      g.fillStyle = 'rgba(255,255,255,.7)'; disc(g, -2.8, -3.4, 2.3, 1.3, -0.7);
    });
    s.slice = sliceSprite(36, '#f2ae00', '#ffd83d');
    s.sliceBig = [sliceSprite(168, '#f2ae00', '#ffd83d'), sliceSprite(168, '#ee8f1c', '#ffb640')];
    s.drops = {}; s.drop = s.drops['#ffe14d'] = dropSprite('#ffe14d');
    s.conf = [];
    HEX.forEach(function (c, k) {
      s.conf.push(mk(12, 8, function (g) { g.fillStyle = c; g.fillRect(-5, -3, 10, 6); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(-5, -3, 10, 2.2); g.strokeStyle = 'rgba(27,31,59,.4)'; g.lineWidth = 0.8; g.strokeRect(-5, -3, 10, 6); }));
      s.conf.push(mk(10, 10, function (g) {
        g.beginPath();
        if (k & 1) g.arc(0, 0, 3.6, 0, TAU); else { g.moveTo(0, -4.2); g.lineTo(4.2, 3.4); g.lineTo(-4.2, 3.4); g.closePath(); }
        g.fillStyle = c; g.fill(); g.strokeStyle = 'rgba(27,31,59,.4)'; g.lineWidth = 0.8; g.stroke();
      }));
    });
    s.puff = puffSprite([255, 255, 255], [150, 160, 200]); s.dust = puffSprite([236, 222, 190], [150, 124, 84]); s.steam = puffSprite([255, 122, 108], [190, 50, 44]);
    s.leaf = [leafSprite('#35c977', '#1c9655'), leafSprite('#ffae42', '#c97a10'), leafSprite('#ffd83d', '#d99a00'), leafSprite('#8fd94f', '#4e9a22')];
    s.lemon = mk(34, 26, function (g) {
      g.fillStyle = INK; disc(g, 0, 0, 12.3, 9.8); disc(g, -12.2, 0, 3.6); disc(g, 12.2, 0, 3.6);
      g.fillStyle = '#ffd83d'; disc(g, 0, 0, 11, 8.5); disc(g, -12.2, 0, 2.3); disc(g, 12.2, 0, 2.3);
      g.strokeStyle = 'rgba(242,174,0,.95)'; g.lineWidth = 2.4; g.beginPath(); g.ellipse(0, 0, 8.4, 5.9, 0, 0.35, 2.3); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.8)'; disc(g, -4.2, -3.6, 2.6, 1.4, -0.5);
    });
    s.note = mk(24, 30, function (g) {
      function stem(lw, col) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(2, 7); g.lineTo(2, -9); g.quadraticCurveTo(7.5, -8, 7.5, -2); g.stroke(); }
      stem(6.6, INK); g.fillStyle = INK; disc(g, -2, 7.4, 6.4, 5.3, -0.35);
      stem(2.6, '#fff'); g.fillStyle = '#fff'; disc(g, -2, 7.4, 4.3, 3.2, -0.35);
    });
    s.tag = mk(28, 22, function (g) {
      g.beginPath(); g.moveTo(-11, 0); g.lineTo(-5, -7.5); g.lineTo(11, -7.5); g.lineTo(11, 7.5); g.lineTo(-5, 7.5); g.closePath();
      inked(g, '#ff6257', 2.2);
      g.fillStyle = '#fff'; disc(g, -5.4, 0, 1.7);
      g.font = '900 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SS.CURRENCY || '$', 3.6, 0.6);
    });
    s.scrib = mk(46, 36, function (g) {
      var b = [[-9, 3, 9], [8, 4, 8.5], [0, -4, 10], [-1, 5, 8]], z = [-11, 2, -7, -4, -3, 3, 1, -4, 5, 3, 9, -3, 12, 1], k;
      g.fillStyle = INK; b.forEach(function (c) { disc(g, c[0], c[1], c[2] + 2); });
      g.fillStyle = '#6b7096'; b.forEach(function (c) { disc(g, c[0], c[1], c[2]); });
      g.strokeStyle = '#fff'; g.lineWidth = 2.2; g.beginPath();
      for (k = 0; k < z.length; k += 2) g.lineTo(z[k], z[k + 1]);
      g.stroke();
    });
    s.rays = mk(256, 256, function (g) {
      var gr = g.createRadialGradient(0, 0, 6, 0, 0, 128), k, a, hw;
      gr.addColorStop(0, 'rgba(255,250,214,.95)'); gr.addColorStop(0.45, 'rgba(255,216,61,.62)'); gr.addColorStop(1, 'rgba(255,216,61,0)');
      g.fillStyle = gr;
      for (k = 0; k < 12; k++) { a = k * TAU / 12; hw = k & 1 ? 0.09 : 0.15; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 128, a - hw, a + hw); g.closePath(); g.fill(); }
      blob(g, 0, 0, 62, [255, 246, 196], 0.85);
    });
    s.streak = mk(48, 200, function (g) { g.scale(1, 200 / 48); blob(g, 0, 0, 24, [255, 255, 255], 0.95); });
    for (i = 0; i < CAP; i++) pool.push({ spr: null, frames: null, mode: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, rot: 0, vr: 0, t: 0, life: 1, delay: 0,
      s0: 1, s1: 1, a: 1, fi: 0, fo: 0.3, layer: 1, pop: 0, aim: 0, flip: 0, tw: 0, str: 0, flut: 0, vfl: 0, sway: 0, floor: 0, end: 0, trail: 0, tr: 0, ci: 0,
      fr: 0, vf: 0, x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0 });
    mctx = document.createElement('canvas').getContext('2d');
    S = s;
    return true;
  }

  /** chunky display text with an ink outline, cached by content */
  function textSprite(text, size, color, framed) {
    var key = text + '|' + size + '|' + color + (framed ? '|f' : ''), s = tcache.get(key);
    if (s) return s;
    if (tcache.size > 40) tcache.clear();
    var font = (fatFont ? '400 ' : '900 ') + size + 'px ' + FONT;   // the display face has one weight; fallbacks need their boldest
    mctx.font = font;
    var w = Math.ceil(mctx.measureText(text).width + size * (framed ? 1.3 : 0.7)), h = Math.ceil(size * (framed ? 1.95 : 1.55));
    s = mk(w, h, function (g) {
      if (framed) {                                       // a sign plate: paper, ink edge, coloured inner rule
        plate(g, w / 2 - size * 0.1, h / 2 - size * 0.1, size * 0.34); inked(g, '#fff', size * 0.11);
        plate(g, w / 2 - size * 0.26, h / 2 - size * 0.26, size * 0.22); g.strokeStyle = color; g.lineWidth = size * 0.07; g.stroke();
      }
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      var y = size * 0.03;
      g.strokeStyle = INK; g.lineWidth = size * 0.24; g.strokeText(text, 0, y + size * 0.085); g.strokeText(text, 0, y);
      g.fillStyle = color; g.fillText(text, 0, y);
      g.save(); g.beginPath(); g.rect(-w / 2, -h / 2, w, h * 0.47); g.clip();       // glossy top half
      g.fillStyle = 'rgba(255,255,255,.32)'; g.fillText(text, 0, y); g.restore();
    });
    tcache.set(key, s);
    return s;
  }
  // text painted before the display font arrived is repainted once it has
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    try {
      document.fonts.load("20px 'Bagel Fat One'").then(function (faces) { fatFont = !!(faces && faces.length); tcache.clear(); }, function () {});
    } catch (e) { /* fallback fonts are fine */ }
  }

  /* ------------------------------------------------------------------ *
   * Particles
   * Recipe fields: spr sprite key (array = random pick, frames:1 = animated strip), z layer
   * (0 glow under, 1 normal, 2 glow over), a/sp launch angle and spread, v0..v1 speed, up extra
   * upward kick, g gravity, drag, l0..l1 life, s0..s1 size, e end-size factor, al alpha,
   * fi fade-in seconds, fo fade-out fraction, vr spin, rot start-tilt range, pop overshoot in,
   * aim point along velocity, str stretch along velocity, flip flutter, tw twinkle,
   * fl flutter speed, sway sideways swing, j / jw position jitter (px / fraction of width),
   * dl stagger per particle, wind px/s per unit of env.wind.
   * ------------------------------------------------------------------ */
  var R = {
    spark: { spr: 'sparkle', z: 2, v0: 70, v1: 250, g: 260, drag: 2.4, l0: 0.32, l1: 0.6, s0: 0.3, s1: 0.75, e: 0.1, vr: 5 },
    twinkle: { spr: 'sparkle', z: 2, v0: 0, v1: 26, l0: 0.4, l1: 0.8, s0: 0.4, s1: 0.9, e: 0.15, vr: 2, j: 24, dl: 0.05, pop: 1 },
    pop: { spr: 'glow', z: 0, v0: 0, v1: 0, l0: 0.22, l1: 0.22, s0: 0.7, s1: 0.7, e: 3.2, al: 0.85, fo: 1 },
    boom: { spr: 'glow', z: 0, v0: 0, v1: 0, l0: 0.32, l1: 0.32, s0: 2, s1: 2, e: 2.8, al: 0.9, fo: 1 },
    trail: { spr: 'ember', z: 0, v0: 0, v1: 18, g: 60, l0: 0.24, l1: 0.38, s0: 0.5, s1: 0.7, e: 0.15, al: 0.9, fo: 1 },
    trail2: { spr: 'sparkle', z: 2, v0: 0, v1: 34, g: 130, l0: 0.3, l1: 0.55, s0: 0.2, s1: 0.42, e: 0.1, vr: 3, fo: 1 },
    star: { spr: 'star', v0: 150, v1: 380, g: 520, drag: 1.9, l0: 0.65, l1: 1, s0: 0.5, s1: 0.95, e: 0.55, vr: 7, pop: 1 },
    riseStar: { spr: 'star', a: -HALF, sp: 0.9, v0: 45, v1: 85, g: -24, drag: 0.7, l0: 1, l1: 1.35, s0: 0.62, s1: 0.9, rot: 0.6, sway: 26, fl: 5, pop: 1, dl: 0.09, j: 12 },
    heart: { spr: 'heart', a: -HALF, sp: 0.9, v0: 45, v1: 85, g: -24, drag: 0.7, l0: 1, l1: 1.35, s0: 0.7, s1: 1, rot: 0.5, sway: 26, fl: 5, pop: 1, dl: 0.09, j: 12 },
    note: { spr: 'note', a: -HALF, sp: 1.1, v0: 55, v1: 100, g: -20, drag: 0.6, l0: 0.9, l1: 1.3, s0: 0.65, s1: 0.85, rot: 0.5, sway: 30, fl: 6, pop: 1, dl: 0.1, j: 10 },
    drop: { spr: 'drop', a: -HALF, sp: 1.5, v0: 110, v1: 300, g: 900, drag: 0.5, l0: 0.4, l1: 0.7, s0: 0.45, s1: 0.85, e: 0.6, aim: 1 },
    drip: { spr: 'drop', a: -HALF, sp: 1.7, v0: 50, v1: 130, g: 800, l0: 0.3, l1: 0.45, s0: 0.3, s1: 0.5, aim: 1, dl: 0.09, j: 6 },
    slice: { spr: 'slice', a: -HALF, sp: 3.3, v0: 150, v1: 440, g: 760, drag: 1.1, l0: 0.75, l1: 1.05, s0: 0.55, s1: 0.85, vr: 9, pop: 1 },
    lemon: { spr: 'lemon', a: HALF, sp: 0.5, v0: 30, v1: 90, g: 1500, l0: 1.2, l1: 1.2, s0: 0.7, s1: 0.82, vr: 9, fi: 0.08 },
    puff: { spr: 'puff', v0: 20, v1: 80, g: -30, drag: 2.6, l0: 0.45, l1: 0.8, s0: 0.35, s1: 0.6, e: 1.9, al: 0.85, fo: 0.6, vr: 1 },
    dust: { spr: 'dust', a: -HALF, sp: 1.6, v0: 90, v1: 260, g: -20, drag: 3.6, l0: 0.45, l1: 0.8, s0: 0.4, s1: 0.7, e: 2.1, al: 0.95, fo: 0.7, vr: 1, j: 8 },
    steam: { spr: 'steam', a: -HALF, sp: 2.4, v0: 60, v1: 150, g: -60, drag: 3, l0: 0.45, l1: 0.7, s0: 0.25, s1: 0.45, e: 1.8, al: 0.9, fo: 0.6, vr: 1 },
    grumble: { spr: 'scrib', a: -HALF, sp: 0.5, v0: 14, v1: 26, drag: 0.5, l0: 1, l1: 1.2, s0: 0.8, s1: 0.95, rot: 0.3, sway: 22, fl: 16, pop: 1, dl: 0.14, j: 10 },
    tag: { spr: 'tag', a: -1.1, sp: 0.5, v0: 150, v1: 190, g: 760, l0: 0.6, l1: 0.7, s0: 0.7, s1: 0.8, vr: 8, pop: 1 },
    leaf: { spr: 'leaf', a: HALF, sp: 0.6, v0: 70, v1: 130, g: 14, drag: 0.25, l0: 3.4, l1: 4.8, s0: 0.85, s1: 1.3, vr: 1.6, sway: 46, fl: 2.2, flip: 1, jw: 1, dl: 0.2, fi: 0.3, fo: 0.25, wind: 40 },
    confetti: { spr: 'conf', v0: 160, v1: 600, up: 160, g: 380, drag: 2.2, l0: 1.7, l1: 2.9, s0: 0.8, s1: 1.3, vr: 8, flip: 1, fl: 11, sway: 30, fo: 0.2 },
    cannon: { spr: 'conf', sp: 0.8, v0: 450, v1: 1500, g: 380, drag: 2.2, l0: 1.9, l1: 3.1, s0: 0.8, s1: 1.35, vr: 8, flip: 1, fl: 11, sway: 30, fo: 0.2 },
    rain: { spr: 'conf', a: HALF, sp: 0.4, v0: 60, v1: 120, g: 20, drag: 0.2, l0: 2.6, l1: 3.6, s0: 0.9, s1: 1.3, vr: 3, flip: 1, fl: 5, sway: 20, jw: 1, dl: 0.06, fi: 0.2, fo: 0.25, wind: 20 },
    coin: { spr: 'coin', frames: 1, a: -HALF, sp: 2.2, v0: 120, v1: 240, g: 1100, drag: 0.3, l0: 0.7, l1: 0.95, s0: 0.8, s1: 0.95, fo: 0.35, rot: 0.6 },
    shell: { spr: 'glowW', z: 2, v0: 0, v1: 0, l0: 1, l1: 1, s0: 0.55, s1: 0.55, str: 0.004, fo: 0.05, force: 1 },
    fw: { spr: 'glow', z: 2, v0: 50, v1: 340, g: 110, drag: 1.7, l0: 0.85, l1: 1.5, s0: 0.6, s1: 1.1, e: 0.25, str: 0.011, fo: 0.5 },
    fwRing: { spr: 'glow', z: 2, v0: 268, v1: 288, g: 110, drag: 1.7, l0: 0.95, l1: 1.35, s0: 0.8, s1: 1, e: 0.25, str: 0.011, fo: 0.5 },
    fall: { spr: 'sparkle', z: 2, v0: 20, v1: 130, g: 75, drag: 1.5, l0: 1.3, l1: 2.2, s0: 0.3, s1: 0.6, e: 0.4, tw: 1, fl: 9, vr: 2, fo: 0.5 }
  };

  /** scale a particle count for reduced motion and for how full the pool is */
  function budget(n) {
    if (lowMo) n *= 0.25;
    var room = (CAP - live) / CAP;
    if (room < 0.3) n *= room / 0.3;
    return Math.max(room > 0.02 ? 1 : 0, Math.round(n));
  }
  function fresh(force) {
    var p = live < CAP ? pool[live++] : force ? pool[(steal = (steal + 97) % CAP)] : null;
    if (!p) return null;
    p.mode = 0; p.vx = p.vy = p.g = p.drag = p.rot = p.vr = p.t = p.delay = 0; p.life = 1;
    p.s0 = p.s1 = 1; p.a = 1; p.fi = 0; p.fo = 0.3; p.layer = 1;
    p.pop = p.aim = p.flip = p.tw = 0; p.str = 0; p.flut = rnd() * TAU; p.vfl = p.sway = 0;
    p.floor = p.end = p.trail = p.tr = p.ci = 0; p.frames = null; p.fr = p.vf = 0;
    return p;
  }
  /** spawn n particles from a recipe; returns the last one (or null) */
  function emit(rec, n, x, y, ang, pow, spr) {
    var src = spr || S[rec.spr], V = SS.view, env = SS.env, p = null, i, a, v, s;
    n = budget(n);
    for (i = 0; i < n; i++) {
      if (!(p = fresh(rec.force))) break;
      a = (ang == null ? rec.a || 0 : ang) + (rnd() - 0.5) * (rec.sp == null ? TAU : rec.sp);
      v = (rec.v0 + rnd() * (rec.v1 - rec.v0)) * (pow || 1) * U;
      p.x = x + (rec.j ? (rnd() - 0.5) * rec.j * U : 0) + (rec.jw ? (rnd() - 0.5) * rec.jw * V.w : 0);
      p.y = y + (rec.j ? (rnd() - 0.5) * rec.j * U : 0);
      p.vx = Math.cos(a) * v + (rec.wind && env ? rec.wind * (env.wind || 0) : 0);
      p.vy = Math.sin(a) * v - (rec.up || 0) * U;
      p.g = (rec.g || 0) * U; p.drag = rec.drag || 0;
      p.vr = (rnd() - 0.5) * 2 * (rec.vr || 0);
      p.rot = (rnd() - 0.5) * (rec.rot == null ? (rec.vr ? TAU : 0) : rec.rot);
      p.life = rec.l0 + rnd() * (rec.l1 - rec.l0); p.delay = (rec.dl || 0) * i;
      s = (rec.s0 + rnd() * (rec.s1 - rec.s0)) * U; p.s0 = s; p.s1 = s * (rec.e == null ? 1 : rec.e);
      p.a = rec.al || 1; p.fi = rec.fi || 0; p.fo = rec.fo || 0.3; p.layer = rec.z == null ? 1 : rec.z;
      p.pop = rec.pop | 0; p.aim = rec.aim | 0; p.flip = rec.flip | 0; p.tw = rec.tw | 0; p.str = rec.str || 0;
      if (rec.fl) p.vfl = rec.fl * (0.6 + rnd() * 0.8);
      p.sway = (rec.sway || 0) * U;
      if (rec.frames) { p.frames = src; p.spr = src[0]; p.fr = rnd() * 8; p.vf = 12 + rnd() * 10; }
      else p.spr = src.length ? src[(rnd() * src.length) | 0] : src;
    }
    return p;
  }
  function kill(i) {
    var p = pool[i], end = p.end, x = p.x, y = p.y, ci = p.ci;
    live--; pool[i] = pool[live]; pool[live] = p;
    if (end === END_POP) { emit(R.pop, 1, x, y); emit(R.spark, 2, x, y, null, 0.5); }
    else if (end === END_SPLASH) emit(R.drop, 4, x, y, -HALF, 0.6, juice());
    else if (end === END_BOOM) boom(x, y, ci);
  }
  /** a droplet in today's flavour colour */
  function juice() {
    var st = SS.state, f = st && st.flavor && SS.DATA ? SS.DATA.byId(SS.DATA.flavors, st.flavor) : null, col = (f && f.color) || '#ffe14d';
    return S.drops[col] || (S.drops[col] = dropSprite(col));
  }

  /** things that burst out of (sx,sy), hang for a beat, then get pulled into the target */
  function fly(sx, sy, target, n, spr, trail) {
    var tx = target.x, ty = target.y;
    if (lowMo) { emit(R.twinkle, 4, tx, ty); return; }    // no sweeping motion: just a glint where it lands
    n = clamp(Math.round(n) || 0, 0, 24);
    var dx = tx - sx, dy = ty - sy, dist = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / dist, ny = dx / dist, i, p, a, m, bend;
    for (i = 0; i < n; i++) {
      if (!(p = fresh(true))) return;
      a = -HALF + (rnd() - 0.5) * 2.8; m = Math.min(150, 46 + dist * 0.25) * (0.55 + rnd() * 0.9); bend = (rnd() - 0.5) * 0.5 * dist;
      p.mode = 1; p.x = p.x0 = sx; p.y = p.y0 = sy;
      p.x1 = sx + Math.cos(a) * m * 1.5; p.y1 = sy + Math.sin(a) * m * 1.5;
      p.x2 = sx + dx * 0.65 + nx * bend; p.y2 = sy + dy * 0.65 + ny * bend;
      p.x3 = tx + (rnd() - 0.5) * 10; p.y3 = ty + (rnd() - 0.5) * 6;
      p.life = 0.52 + rnd() * 0.2 + dist / 2800; p.delay = i * 0.035;
      p.s0 = U; p.s1 = 0.62 * U; p.pop = 1; p.fo = 0.04; p.end = END_POP; p.trail = trail ? 1 : 0;
      if (spr.length) { p.frames = spr; p.spr = spr[0]; p.fr = rnd() * 8; p.vf = 14 + rnd() * 10; }
      else { p.spr = spr; p.vr = 9; }
    }
  }

  /* ------------------------------------------------------------------ *
   * Positions
   * ------------------------------------------------------------------ */
  function ready() {
    var V = SS.view;
    if (!(V && V.w > 1 && V.toX && build())) return false;
    U = clamp((V.scale || 1) / 1.15, 0.85, 1.7);
    return true;
  }
  function cvRect() { fxEl = fxEl || document.getElementById('fx'); return fxEl ? fxEl.getBoundingClientRect() : { left: 0, top: 0 }; }
  /** a customer (or a tip: anything with x and lane); up = fraction of body height above the feet */
  function cust(p, up) {
    var V = SS.view, c = p.c || p, x = num(p.x) ? p.x : num(c.x) ? c.x : W.SERVE_X, lane = num(p.lane) ? p.lane : num(c.lane) ? c.lane : W.QUEUE_LANE;
    P.x = V.toX(x); P.y = V.laneY(lane) - W.CHAR_H * V.laneScale(lane) * up;
    return P;
  }
  /** a spot on the stand: dx world units from its centre, up world units above its base */
  function stand(dx, up) {
    var V = SS.view;
    P.x = V.toX(W.STAND_X + dx); P.y = V.laneY(W.STAND_LANE) - up * V.laneScale(W.STAND_LANE);
    return P;
  }
  /** where the big stamps go: over the stand, kept on screen */
  function stage() {
    var V = SS.view;
    P.x = clamp(V.toX(W.STAND_X), V.w * 0.3, V.w * 0.7); P.y = clamp(V.groundY - 150 * V.scale, V.h * 0.22, V.h * 0.6);
    return P;
  }
  /** resolve a fly-to target: element, {x,y}, or the HUD readout with that id (else top-right corner) */
  function aim(target, id) {
    var V = SS.view, el = null, r, c;
    if (target && target.getBoundingClientRect) el = target;
    else if (target && num(target.x)) { T.x = target.x; T.y = num(target.y) ? target.y : 0; return T; }
    else if (typeof document !== 'undefined') el = document.getElementById(id);
    if (el) {
      r = el.getBoundingClientRect();
      if (r.width > 0) { c = cvRect(); T.x = r.left + r.width / 2 - c.left; T.y = r.top + r.height / 2 - c.top; return T; }
    }
    T.x = V.w - 64; T.y = 36;
    return T;
  }
  /** true when DOM UI sits on top of that canvas point */
  function covered(x, y) {
    var c = cvRect(), el = document.elementFromPoint(x + c.left, y + c.top);
    return !!el && el.id !== 'scene' && el.id !== 'game' && el.id !== 'ui' && el !== document.body && el !== document.documentElement;
  }

  /* ------------------------------------------------------------------ *
   * Acts
   * ------------------------------------------------------------------ */
  function act(a) { if (acts.length > 70) acts.shift(); acts.push(a); return a; }
  function ring(x, y, r0, r1, sec, col, lw, delay) { act({ type: 'ring', z: 0, t: -(delay || 0), max: sec, x: x, y: y, r0: r0, r1: r1, col: col, lw: lw || 4 }); }
  function flash(col, a, sec) { if (!lowMo) act({ type: 'flash', z: 0, t: 0, max: sec, col: col, a: a }); }
  function stampSize(k) { var V = SS.view; return Math.round(clamp(Math.min(V.w, V.h * 1.3) * 0.19, 52, 112) * k / 2) * 2; }
  /** o: {color, size, framed, slam, rot, max, delay, hit}  hit: 1 sparkle, 2 heavy dust, 3 light dust */
  function stamp(text, x, y, o) {
    var V = SS.view, spr = textSprite(text, o.size, o.color, o.framed), i;
    for (i = acts.length - 1; i >= 0; i--) if (acts[i].type === 'stamp' && acts[i].text === text) acts.splice(i, 1);
    act({ type: 'stamp', z: 1, t: -(o.delay || 0), max: o.max, text: text, spr: spr, x: x, y: y, fit: Math.min(1, V.w * 0.9 / spr.w),
      slam: o.slam | 0, rot: o.rot || 0, hit: o.hit | 0, hitAt: o.slam ? 0.15 : 0.03 });
  }
  function impact(a, code) {
    var hw = a.spr.w * a.fit * 0.42, y = a.y + a.spr.h * a.fit * 0.36;
    if (code === 1) { emit(R.star, 10, a.x, a.y, null, 1.6); emit(R.spark, 14, a.x, a.y, null, 2); return; }
    emit(R.dust, code === 2 ? 6 : 4, a.x - hw, y, -HALF - 1.1); emit(R.dust, code === 2 ? 6 : 4, a.x + hw, y, -HALF + 1.1);
    FX.shake(code === 2 ? 6 : 2.5, 0.25);
  }
  function starBurst(x, y, k) {
    emit(R.star, 12 * k, x, y, null, k); emit(R.spark, 10 * k, x, y, null, 1.2 * k); emit(R.pop, 1, x, y);
    ring(x, y, 8, 80 * k, 0.45, '#ffd83d', 5);
  }
  function launch() {
    var V = SS.view, G = 760, v = Math.sqrt(2 * G * V.h * (0.42 + rnd() * 0.36)), p = emit(R.shell, 1, V.w * (0.1 + rnd() * 0.8), V.h + 8);
    if (!p) return;
    p.vx = (rnd() - 0.5) * 140; p.vy = -v; p.g = G; p.life = v / G * 0.93; p.trail = 2; p.end = END_BOOM; p.ci = (rnd() * 6) | 0;
  }
  function boom(x, y, ci) {
    var kind = rnd(), c2 = (ci + 1 + ((rnd() * 5) | 0)) % 7;
    emit(R.boom, 1, x, y, null, 1, S.glows[ci]);
    if (kind < 0.3) { emit(R.fwRing, 34, x, y, null, 1, S.glows[ci]); emit(R.fw, 16, x, y, null, 0.5, S.glows[c2]); }
    else if (kind < 0.6) { emit(R.fw, 26, x, y, null, 1, S.glows[ci]); emit(R.fw, 22, x, y, null, 0.6, S.glows[c2]); }
    else emit(R.fw, 50, x, y, null, 1, S.glows[ci]);
    emit(R.fall, 9, x, y);
  }

  /* ------------------------------------------------------------------ *
   * Update
   * ------------------------------------------------------------------ */
  function update(dt, view, env) {
    if (!live && !acts.length && shT <= 0) return;
    lowMo = !!(env && env.reduced);
    var i, p, a, k, e, u, d;

    if (shT > 0) {
      shT -= dt; shClock += dt;
      if (shT <= 0 || lowMo) { shT = 0; sh.x = sh.y = 0; }
      else {
        k = shMag * Math.pow(shT / shDur, 1.5);
        sh.x = Math.round(k * (Math.sin(shClock * 83) + Math.sin(shClock * 47 + 1.3))) / 2;
        sh.y = Math.round(k * (Math.sin(shClock * 71 + 0.7) + Math.sin(shClock * 53 + 2.1))) / 2;
      }
    }
    if (dt <= 0) { sh.x = sh.y = 0; return; }             // paused: hold everything, but never freeze the scene off-centre

    for (i = acts.length - 1; i >= 0; i--) {
      a = acts[i]; a.t += dt;
      if (a.t >= a.max) { acts.splice(i, 1); continue; }
      if (a.t < 0) continue;
      if (a.hit && a.t >= a.hitAt) { k = a.hit; a.hit = 0; impact(a, k); }
      if (a.type === 'show' && (a.next -= dt) <= 0) {
        launch();
        a.next = a.t > a.max - 1.3 ? 0.1 + rnd() * 0.1 : 0.24 + rnd() * 0.36;
      }
    }

    // newest first: anything spawned mid-loop lands past the end and waits for the next frame
    for (i = live - 1; i >= 0; i--) {
      p = pool[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.mode === 1) {                                 // flight: quick burst out, a hang, then the pull in
        k = p.t / p.life; if (k > 1) k = 1;
        if (k < 0.35) { e = 1 - k / 0.35; e = 0.22 * (1 - e * e * e); } else { e = (k - 0.35) / 0.65; e = 0.22 + 0.78 * e * e * e; }
        u = 1 - e;
        p.x = u * u * u * p.x0 + 3 * u * u * e * p.x1 + 3 * u * e * e * p.x2 + e * e * e * p.x3;
        p.y = u * u * u * p.y0 + 3 * u * u * e * p.y1 + 3 * u * e * e * p.y2 + e * e * e * p.y3;
      } else {
        p.vy += p.g * dt;
        d = 1 - p.drag * dt; if (d < 0) d = 0;
        p.vx *= d; p.vy *= d;
        p.x += (p.sway ? p.vx + Math.sin(p.flut) * p.sway : p.vx) * dt; p.y += p.vy * dt;
        if (p.floor && p.y >= p.floor && p.vy > 0) { p.y = p.floor; kill(i); continue; }
      }
      p.rot += p.vr * dt; p.flut += p.vfl * dt; p.fr += p.vf * dt;
      if (p.trail && (p.tr += dt) > 0.03) { p.tr = 0; if (live < CAP - 120) emit(p.trail === 1 ? R.trail : R.trail2, 1, p.x, p.y); }
      if (p.t >= p.life) kill(i);
    }
  }

  /* ------------------------------------------------------------------ *
   * Draw
   * ------------------------------------------------------------------ */
  function blit(ctx, spr, dpr, x, y, sx, sy, rot, alpha) {
    var c = Math.cos(rot) * dpr, s = Math.sin(rot) * dpr;
    ctx.setTransform(c * sx, s * sx, -s * sy, c * sy, x * dpr, y * dpr);
    ctx.globalAlpha = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    ctx.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
  }
  function drawLayer(ctx, dpr, layer) {
    var i, p, k, al, r, s, sx, sy, rot, q;
    for (i = 0; i < live; i++) {
      p = pool[i];
      if (p.layer !== layer || p.delay > 0) continue;
      k = p.t / p.life; al = p.a;
      if (p.fi && p.t < p.fi) al *= p.t / p.fi;
      r = (1 - k) / p.fo; if (r < 1) al *= r;
      if (p.tw) al *= 0.55 + 0.45 * Math.sin(p.flut * 3);
      if (al <= 0.01) continue;
      s = p.s0 + (p.s1 - p.s0) * k;
      if (p.pop && p.t < 0.16) { q = p.t / 0.16 - 1; s *= 1 + 2.70158 * q * q * q + 1.70158 * q * q; }
      sx = sy = s; rot = p.rot;
      if (p.aim) rot = Math.atan2(p.vy, p.vx) - HALF;
      else if (p.str) { rot = Math.atan2(p.vy, p.vx); sx = s * (1 + Math.sqrt(p.vx * p.vx + p.vy * p.vy) * p.str); }
      if (p.flip) sy = s * Math.cos(p.flut);
      blit(ctx, p.frames ? p.frames[(p.fr | 0) % p.frames.length] : p.spr, dpr, p.x, p.y, sx, sy, rot, al);
    }
  }
  function drawWipe(ctx, a, V) {
    var w = V.w, h = V.h, c = clamp(Math.max(w, h) / 6, 96, 230), rowH = c * 0.86, sc = c * 1.3 / S.sliceBig[0].w;
    var rows = Math.ceil(h / rowH) + 1, cols = Math.ceil(w / c) + 1, r, q, n = 0, x, xn, tin, tout, s;
    for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) {
      x = q * c + (r & 1 ? c / 2 : 0); n++;
      xn = clamp(x / w, 0, 1); if (a.dir < 0) xn = 1 - xn;
      xn += (SS.hash(n) - 0.5) * 0.1;
      tin = (a.t - 0.07 * xn) / 0.08; tout = (a.t - 0.13 - 0.14 * xn) / 0.1;
      if (tin <= 0 || tout >= 1) continue;
      s = (tin < 1 ? SS.ease.outBack(tin) : 1) * (tout > 0 ? 1 - tout * tout * tout : 1) * sc;
      blit(ctx, S.sliceBig[n % 5 === 0 ? 1 : 0], V.dpr, x, r * rowH, s, s, a.t * 9 * a.dir + n * 1.7, 1);
    }
  }
  function drawAct(ctx, a, V) {
    var dpr = V.dpr, t = a.t, k = t / a.max, s, sx, sy, al, y, rot, q, out;
    switch (a.type) {
      case 'flash':
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = a.a * (1 - k) * (1 - k);
        ctx.fillStyle = a.col; ctx.fillRect(0, 0, V.w, V.h);
        break;
      case 'ring':
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1 - k * k;
        ctx.strokeStyle = a.col; ctx.lineWidth = a.lw * (1 - k) + 0.5;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r0 + (a.r1 - a.r0) * SS.ease.outCubic(k), 0, TAU); ctx.stroke();
        break;
      case 'sun':
        s = a.size / S.rays.w * (t < 0.3 ? SS.ease.outBack(t / 0.3) : 1 + (t - 0.3) * 0.12);
        blit(ctx, S.rays, dpr, a.x, a.y, s, s, t * 0.8, Math.min(1, (a.max - t) / 0.45) * 0.92);
        break;
      case 'shine':
        q = a.x0 + (a.x1 - a.x0) * SS.ease.inOutCubic(k); al = Math.sin(Math.PI * k) * 0.85; s = a.h / S.streak.h;
        ctx.globalCompositeOperation = 'lighter';
        blit(ctx, S.streak, dpr, q, a.y, s * 1.3, s * 1.3, 0.34, al);
        blit(ctx, S.streak, dpr, q - a.h * 0.2, a.y, s * 0.55, s * 1.2, 0.34, al * 0.6);
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'text':
        al = Math.min(1, (a.max - t) / 0.28); s = 1;
        if (lowMo) al *= Math.min(1, t / 0.1); else if (t < 0.2) s = SS.ease.outBack(t / 0.2);
        blit(ctx, a.spr, dpr, a.x, a.y - a.rise * (lowMo ? 0.3 : 1) * SS.ease.outCubic(k), s, s, lowMo ? 0 : a.tilt, al);
        break;
      case 'stamp':
        out = (a.max - t) / 0.28; al = out < 1 ? out : 1; sx = sy = a.fit; y = a.y; rot = a.rot;
        if (lowMo) al *= Math.min(1, t / 0.1);
        else if (a.slam) {                                // drops in big, lands with a squash
          if (t < 0.15) { q = t / 0.15; sx = sy = a.fit * (2.6 - 1.6 * q * q * q); al *= Math.min(1, t / 0.07); }
          else { q = Math.sin((t - 0.15) * 30) * Math.exp(-(t - 0.15) * 10) * 0.13; sx *= 1 + q; sy *= 1 - q; }
          if (out < 1) y += (1 - out) * 10;
        } else {                                          // pops out with an overshoot, swells as it fades
          if (t < 0.26) sx = sy = a.fit * SS.ease.outBack(t / 0.26); else rot += Math.sin((t - 0.26) * 9) * 0.03;
          if (out < 1) { q = 1 + (1 - out) * (1 - out) * 0.22; sx *= q; sy *= q; }
        }
        blit(ctx, a.spr, dpr, a.x, y, sx, sy, rot, al);
        break;
      case 'wipe': drawWipe(ctx, a, V); break;
    }
  }
  function drawActs(ctx, V, z) {
    for (var i = 0; i < acts.length; i++) if (acts[i].z === z && acts[i].t >= 0) drawAct(ctx, acts[i], V);
  }

  function draw(ctx, view) {
    if (!S || (!live && !acts.length)) return;
    var dpr = view.dpr || 1;
    drawActs(ctx, view, 0);
    if (live) {
      ctx.globalCompositeOperation = 'lighter'; drawLayer(ctx, dpr, 0);
      ctx.globalCompositeOperation = 'source-over'; drawLayer(ctx, dpr, 1);
      ctx.globalCompositeOperation = 'lighter'; drawLayer(ctx, dpr, 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawActs(ctx, view, 1);
    drawActs(ctx, view, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */
  var FX = (SS.FX = {
    update: update,
    draw: draw,
    shake: function (mag, sec) {
      if (SS.reduced && SS.reduced()) return;
      mag = clamp(+mag || 0, 0, 24); sec = clamp(+sec || 0.3, 0.05, 2);
      if (mag >= (shT > 0 ? shMag * Math.pow(shT / shDur, 1.5) : 0)) { shMag = mag; shDur = shT = sec; }
    },
    shakeOffset: function () {
      if (shT <= 0 || (SS.env ? SS.env.reduced : SS.reduced())) sh.x = sh.y = 0;
      return sh;
    },
    floatText: function (text, sx, sy, o) {
      if (!ready() || text == null) return;
      o = o || {};
      var V = SS.view, size = Math.round(clamp(+o.size || 26, 10, 96)), spr = textSprite(String(text), size, o.color || '#ffd83d'), hw = spr.w / 2 + 4;
      act({ type: 'text', z: 1, t: 0, max: 1.05, spr: spr, x: clamp((+sx || 0) + (rnd() - 0.5) * size, hw, Math.max(hw, V.w - hw)), y: Math.max(+sy || 0, spr.h / 2 + size * 1.7), rise: size * 1.7, tilt: (rnd() - 0.5) * 0.16 });
    },
    confetti: function (o) {
      if (!ready()) return;
      o = o || {};
      var V = SS.view, x = num(o.x) ? o.x : V.w / 2, y = num(o.y) ? o.y : V.h * 0.3;
      emit(R.confetti, num(o.count) ? o.count : 80, x, y);
      emit(R.spark, 8, x, y, null, 1.4);
    },
    burst: function (kind, sx, sy, o) {
      if (!ready()) return;
      o = o || {};
      var rec = (Object.prototype.hasOwnProperty.call(R, kind) && R[kind]) || R.spark;
      emit(rec, num(o.count) ? o.count : 8, +sx || 0, +sy || 0, num(o.angle) ? o.angle : null, num(o.power) ? o.power : 1, rec.spr === 'drop' ? juice() : null);
    },
    coinsTo: function (sx, sy, target, count) {
      if (!ready()) return;
      fly(+sx || 0, +sy || 0, aim(target, 'hud-cash'), count == null ? 6 : count, S.coin, true);
    }
  });

  /* ------------------------------------------------------------------ *
   * Bus wiring. Payloads may be empty (debug emits), so every field is optional.
   * ------------------------------------------------------------------ */
  function on(evt, fn) {
    if (!SS.on) return;
    SS.on(evt, function (p) { if (!ready()) return; lowMo = SS.reduced(); fn(p || {}, SS.view); });
  }

  on('sale', function (p, V) {
    var q = cust(p, 0.62), x = q.x, y = q.y, qty = num(p.qty) ? p.qty : 1, total = num(p.price) ? p.price * qty : NaN;
    FX.coinsTo(x, y, null, clamp(Math.round(2 + qty * 2 + (total || 0) * 0.5), 3, 14));
    emit(R.spark, 5, x, y);
    if (total === total) FX.floatText('+' + SS.fmtMoney(total), x, y - W.CHAR_H * V.scale * 0.5, { size: 23 + Math.min(qty, 4) * 3 });
  });
  on('tip:drop', function (p) {
    var q = cust(p.tip || {}, 0.08);
    emit(R.twinkle, 5, q.x, q.y); ring(q.x, q.y, 3, 22, 0.4, '#ffd83d', 3);
  });
  on('tip:collect', function (p) {
    var tip = p.tip || {}, q = cust(tip, 0.1), x = q.x, y = q.y;
    emit(R.spark, p.auto ? 5 : 11, x, y); emit(R.pop, 1, x, y);
    FX.coinsTo(x, y, null, 1);
    if (num(tip.amount)) FX.floatText('+' + SS.fmtMoney(tip.amount) + ' tip', x, y - 22, { size: 19, color: '#fff4b8' });
  });
  on('review', function (p) {
    var mood = num(p.mood) ? p.mood : 1, q = cust(p, 1.06), x = q.x, y = q.y, rep;
    if (mood > 0.7) {
      emit(R.heart, 4, x, y);
      rep = typeof document !== 'undefined' && document.getElementById('hud-rep');      // one star for the rating
      if (rep && rep.getBoundingClientRect().width > 0) fly(x, y, aim(rep), 1, S.star, false);
    } else if (mood > 0.25) emit(R.riseStar, 3, x, y);
    else if (mood < -0.25) emit(R.grumble, mood < -0.7 ? 2 : 1, x, y - 6);
  });
  on('brew:start', function (p, V) {
    var q = stand(PITCHER_DX, COUNTER_UP), x = q.x, y = q.y, ls = V.laneScale(W.STAND_LANE), n = budget(4), i, o;
    for (i = 0; i < n; i++) {
      o = emit(R.lemon, 1, x + (rnd() - 0.5) * 30 * ls, y - (130 + rnd() * 70) * ls);
      if (o) { o.delay = i * 0.13; o.floor = y - 6 * ls; o.end = END_SPLASH; }
    }
  });
  on('brew:tap', function () {
    var q = stand(PITCHER_DX, COUNTER_UP + 8);
    emit(R.drop, 7, q.x, q.y, -HALF, 0.8, juice()); emit(R.spark, 3, q.x, q.y);
    FX.shake(3, 0.14);
  });
  on('brew:done', function (p, V) {
    var q = stand(PITCHER_DX, COUNTER_UP + 10), x = q.x, y = q.y;
    emit(R.slice, 8, x, y); emit(R.drop, 16, x, y, -HALF, 1.1, juice()); emit(R.spark, 8, x, y, null, 1.3); emit(R.pop, 1, x, y);
    ring(x, y, 10, 96 * V.scale, 0.5, '#ffd83d', 6);
  });
  on('pour', function () {
    var q = stand(CUP_DX, COUNTER_UP + 4);
    emit(R.drip, 6, q.x, q.y, null, 1, juice());
  });
  on('soldout', function (p, V) {
    var q = stand(0, 60);
    stamp('SOLD OUT', clamp(q.x, V.w * 0.3, V.w * 0.7), q.y, { color: '#ff6257', size: stampSize(0.56), framed: true, slam: 1, rot: -0.12, max: 1.25, hit: lowMo ? 0 : 2 });
  });
  on('bell', function (p, V) {
    var q = stand(BELL_DX, COUNTER_UP + 10), x = q.x, y = q.y, i;
    for (i = 0; i < (lowMo ? 1 : 3); i++) ring(x, y, 6, (70 + i * 26) * V.scale, 0.6, i === 1 ? '#ffffff' : '#ffd83d', 5, i * 0.11);
    emit(R.note, 4, x, y - 8);
  });
  on('customer:quit', function (p) {
    var q = cust(p, 1.05);
    emit(R.steam, 7, q.x, q.y);
  });
  on('customer:balk', function (p) {
    if (p.reason && p.reason !== 'pricey') return;
    var q = cust(p, 1.1);
    emit(R.tag, 1, q.x + 8, q.y);
  });
  on('milestone', function (p, V) {
    if (now() - lastMilestone < 400) return;              // several goals at once share one cannon volley
    lastMilestone = now();
    var pw = clamp(V.h / 720, 0.75, 1.35);
    if (lowMo) { emit(R.rain, 80, V.w / 2, -12); return; }
    emit(R.cannon, 72, -6, V.h + 6, -1.05, pw / U); emit(R.cannon, 72, V.w + 6, V.h + 6, -Math.PI + 1.05, pw / U);
    emit(R.spark, 8, 10, V.h - 10, -0.9, 2); emit(R.spark, 8, V.w - 10, V.h - 10, -Math.PI + 0.9, 2);
    flash('#ffd83d', 0.3, 0.45);
    FX.shake(3, 0.2);
  });
  on('win', function (p, V) {
    if (lowMo) { emit(R.rain, 110, V.w / 2, -12); emit(R.twinkle, 30, V.w / 2, V.h * 0.3); return; }
    for (var i = acts.length - 1; i >= 0; i--) if (acts[i].type === 'show') acts.splice(i, 1);
    act({ type: 'show', z: 0, t: 0, max: 6.2, next: 0 });
    flash('#ffd83d', 0.26, 0.5);
  });
  function bought(p, V) {
    var q = stand(0, 80), x = q.x, y = q.y, hid = covered(x, y), el, r, c;
    if (hid) {                                            // the shop is in the way: celebrate where the player is looking
      el = document.activeElement;
      if (now() - ptr.at < 800) { x = ptr.x; y = ptr.y; }
      else if (el && el !== document.body && el.getBoundingClientRect) { r = el.getBoundingClientRect(); c = cvRect(); x = r.left + r.width / 2 - c.left; y = r.top + r.height / 2 - c.top; }
      starBurst(x, y, 0.75);
      return;
    }
    starBurst(x, y, 1);
    if (!lowMo) act({ type: 'shine', z: 1, t: 0, max: 0.55, x0: V.toX(W.STAND_X - 120), x1: V.toX(W.STAND_X + 120), y: y, h: 200 * V.laneScale(W.STAND_LANE) });
  }
  on('upgrade:buy', bought); on('flavor:buy', bought); on('location:unlock', bought);
  on('day:start', function (p, V) {
    var q = stage(), x = q.x, y = q.y, d = lowMo ? 0 : 0.2;                 // let the phase wipe clear first
    if (!lowMo) act({ type: 'sun', z: 0, t: -d, max: 1.05, x: x, y: y, size: Math.min(V.w, V.h) * 1.2 });
    stamp('OPEN!', x, y, { color: '#ffd83d', size: stampSize(1), max: 1.05, delay: d, rot: -0.05, hit: lowMo ? 0 : 1 });
  });
  on('day:end', function (p, V) {
    var q = stage(), d = lowMo ? 0 : 0.2;
    stamp('CLOSED', q.x, q.y, { color: '#ff6257', size: stampSize(0.9), slam: 1, rot: 0.06, max: 1.1, delay: d, hit: lowMo ? 0 : 3 });
    emit(R.leaf, 14, V.w / 2, -16);
  });
  on('weather:change', function (p) {
    if (p.type !== 'storm' || lowMo) return;
    flash('#ffffff', 0.8, 0.3);
    FX.shake(7, 0.7);
  });
  on('phase', function (p) {
    if (!seenPhase || p.from === null) { seenPhase = true; return; }     // boot: nothing to cover yet
    if (lowMo) return;
    for (var i = acts.length - 1; i >= 0; i--) if (acts[i].type === 'wipe') acts.splice(i, 1);
    act({ type: 'wipe', z: 2, t: 0, max: 0.38, dir: (wipeDir = -wipeDir) });
  });
  on('cash', function (p) {
    if (!(p.delta < 0)) return;
    var q = aim(null, 'hud-cash');
    emit(R.coin, clamp(1 + -p.delta / 4, 2, 8), q.x, q.y);
  });

  // UI juice: a spark where the player presses any big action button
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', function (e) {
      var c = cvRect(), b = e.target && e.target.closest ? e.target.closest('.btn--go, .btn--primary') : null;
      ptr.x = e.clientX - c.left; ptr.y = e.clientY - c.top; ptr.at = now();
      // frozen frames while paused would leave the sparks hanging in the air
      if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true' || SS.paused || !ready()) return;
      lowMo = SS.reduced();
      emit(R.spark, 9, ptr.x, ptr.y); emit(R.pop, 1, ptr.x, ptr.y);
    }, true);
  }
})();
