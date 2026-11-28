/* Squeeze Street — actors.js: the stand, the vendor, customers, bubbles, tip coins, the badges
 * over regulars, and Dex the Dealer with his rolling trunk: on the mornings he visits he tows it in and
 * sets up (emitting 'dealer:setup' steps), and at closing he packs up and rolls off.
 * SS.Actors.dealerPos() tells FX where Dex is; dealerReady() says he is open for business.
 * shortcut: one compact rig for all nine customer kinds (props tell them apart), upgrade to
 * per-kind rigs and richer stand tiers if the art needs to carry more. */
(function () {
  'use strict';
  var SS = window.SS, W = SS.W, DATA = SS.DATA, INK = '#1b1f3b', TAU = Math.PI * 2;
  var SKIN = ['#ffe0c2', '#ffd2ad', '#f2c29b', '#e3ab7f', '#d29a6a', '#b07a4f', '#8f5d3b', '#6b4226'];
  var HAIR = ['#2b2118', '#3b2a1f', '#5a3a22', '#7a4a2a', '#a8572e', '#d9773a', '#e8c15a', '#f3dc8e', '#1b1f3b'];
  var GREY = ['#e6e7ef', '#cfd2de', '#b6b9c9', '#f6f6fa', '#8f92a6'];      // elders: white, silver, salt and pepper
  var FUN = ['#ff7eb6', '#5aa9ff', '#9b7bff', '#35c9a5'];                  // a teen sometimes dyes it
  var SHIRT = ['#ff6257', '#4cc3f0', '#ffd83d', '#35c977', '#7a5cff', '#ff5d8f', '#ff9f43', '#f4f6ff', '#2fb7a8', '#ffb3c7', '#9be15d', '#5a7bea'];
  var PANTS = ['#2f3a6b', '#3d4a5c', '#6b4a3a', '#1c9655', '#4a4f73', '#8a5a3a', '#d9b27c', '#5b7fd1'];
  var SUIT = ['#2f3a6b', '#3d4a5c', '#4a4f73', '#6b4a3a'];
  var INNER = ['#f4f6ff', '#fff4b8', '#cdeeff', '#ffd9e6'];                // inner shirts and polo collars
  var SHOE = ['#ffffff', '#ff6257', '#4cc3f0', '#6b4a3a', '#3d4a5c', '#ffd83d'];
  var FRAME = [INK, '#7a5cff', '#d83a30', '#6b4a3a'];
  var SIZE = { kid: 0.66, teen: 0.86, parent: 1, jogger: 0.98, elder: 0.92, tourist: 1, office: 1.02, skater: 0.88, vip: 1 };
  var HEAD = { kid: 1.18, teen: 1.06 };                                      // head size over the adult's: kids read younger
  // hairstyles per group: A shorter cuts, B longer ones, hat* the ones that fit under a hat, elder grey cuts
  var STYLES = { A: ['crop', 'side', 'quiff', 'spiky', 'curly', 'afro', 'bun', 'side', 'crop'],
    B: ['pony', 'pigtails', 'long', 'bob', 'braids', 'buns', 'curly', 'afro', 'bun', 'side'],
    hatA: ['crop', 'side', 'curly'], hatB: ['pony', 'long', 'bob', 'braids', 'pigtails', 'curly'],
    elder: ['crop', 'side', 'bun', 'bob', 'curly', 'side'] };
  var LIFT = { quiff: 0.42, spiky: 0.36, afro: 0.62, bun: 0.4, buns: 0.3, curly: 0.14, side: 0.08, bob: 0.1, long: 0.08 };   // hair over the scalp, head radii
  var EARLESS = { long: 1, bob: 1 };                                         // hair covers the ear
  var HL = { side: 'swoop', pony: 'swoop', long: 'long', quiff: 'high', spiky: 'high', buns: 'fringe', pigtails: 'fringe', bob: 'bob' };   // hairline per style, else 'crop'
  var FRONT = { crop: -0.55, swoop: -0.24, long: -0.24, high: -0.7, fringe: -0.3, bob: -0.3 };   // where the hairline meets the face's edge, y in head radii
  var PROP = ['#7a5cff', '#ff6257', '#35c977', '#4cc3f0', '#ff9f43', '#ff5d8f'];   // caps, backpacks, headphones, headbands, hair ties
  var BLUSH = 'rgba(255,107,129,.42)', FRECK = 'rgba(150,84,46,.8)', SHINE = {};
  var TOPS = { kid: ['tee', 'stripe', 'overalls', 'hoodie', 'dress', 'tee'], teen: ['hoodie', 'tee', 'stripe', 'jacket', 'dress', 'hoodie'],
    parent: ['tee', 'polo', 'stripe', 'jacket', 'dress', 'hoodie', 'overalls'], jogger: ['tee'], elder: ['jacket', 'polo', 'dress', 'jacket'],
    tourist: ['stripe', 'tee', 'polo'], office: ['jacket'], skater: ['hoodie', 'tee', 'stripe'], vip: ['jacket', 'dress'] };
  var BOTTOMS = { kid: ['shorts', 'trousers', 'skirt'], jogger: ['shorts'], tourist: ['shorts'], office: ['trousers'], elder: ['trousers', 'skirt', 'trousers'],
    skater: ['shorts', 'trousers'], parent: ['trousers', 'shorts', 'skirt', 'trousers'] };
  var LONG = { hoodie: 1, jacket: 1 };                                       // tops with long sleeves
  var C86 = Math.cos(Math.PI * 0.86), S86 = Math.sin(Math.PI * 0.86);        // where the hair starts at the nape
  var TIER = [
    { body: '#c9a06a', trim: '#a57c48', top: '#b58a55', text: INK },
    { body: '#c98a4b', trim: '#96602e', top: '#a9713a', text: '#fff4b8' },
    { body: '#4cc3f0', trim: '#ffffff', top: '#2487d1', text: INK },
    { body: '#ff6257', trim: '#ffd83d', top: '#d83a30', text: '#ffffff' }
  ];
  var looks = new Map(), tapT = 0, pokeT = 0, bellT = 0, cheerT = 0;   // pokeT: a tap with nothing to squeeze still gets a small squish
  // Dex the Dealer: his colours, the glow of each boost bottle, and what he is up to
  var DEX = { skin: '#d9a273', hair: '#2a1f4d', blazer: '#6c3fd6', lapel: '#46289a', pants: '#2b2a4a', gold: '#ffd83d', square: '#ffe14d', trunk: '#b4562e', drawer: '#96421f', velvet: '#2c1e46' };
  var EMPTY = [], dex = { on: false, offers: EMPTY, cols: [], sold: false, lim: false, edge: 1e9, hudL: 1e9, hudB: -1e9, at: -1e9 };
  var spot = { x: 0, y: 0, s: 1, off: 64, tx: 0, lift: 0, dx: 0, edge: 1e9 };
  var dealT = 0, lookT = 0, lookCD = 0, limT = 0, glowT = {}, glows = {};
  /* Dex's show: he tows his trunk in on the mornings he visits and sets up, and packs up and rolls off at closing.
     mode AWAY (not in the scene), IN (arriving; t < 0 waits for the screen change), SET (open for business), OUT (leaving).
     q = this show's 'dealer:setup' steps with their times; qi = the next one to emit.
     LEAVE = seconds before closing time (at the game's speed) he starts packing up, so it plays in the scene, not under the results sheet. */
  var AWAY = 0, IN = 1, SET = 2, OUT = 3, WAIT = 0.7, TADA = 1.65, TOW = 86, PUSH = 80, LEAVE = 2.4;
  var show = { mode: AWAY, ph: '', t: 0, since: 0, hold: false, q: [], qi: 0, roll: 1.2, tP: 0, tO: 0, tS: 0, po: 1, dur: 1, d0: 0, d1: 0, tada: 99 };
  var idle0 = 0;                                           // env.t his idle cycle counts from: its neutral first frame lands as the ta-da ends
  // this frame: where Dex (x) and his trunk (tx) are, his pose, and how far along each moving part of the trunk is (all 1 = open)
  var cur = { x: 0, tx: 0, y: 0, s: 1, face: -1, pose: -1, k: 0, wk: null, hop: 0, note: -1, grip: 0 };
  var A = { lid: 1, bar: 1, awn: 1, pole: 1, fold: 1, sway: 0, bulbs: 99, neon: 1, wheel: 0, spin: 0, rock: 0, sq: 0, bounce: 0, hdl: 0, hx: 0, hy: 0, bk: [], fl: [] };
  var GRIP = { 7: { lean: 0.2, x: 30, y: 20 }, 13: { lean: 0.12, x: -27, y: 25 } }, G = { x: 0, y: 0 }, G2 = { x: 0, y: 0 };   // the hand on the trunk's handle: pushing, towing
  SS.on('brew:tap', function () { tapT = 0.22; });
  SS.on('bell', function () { bellT = 0.9; });
  SS.on('sale', function () { cheerT = 0.45; if (lookCD <= 0) { lookT = 1.3; lookCD = 4.5; } });   // Dex reacts, but not to every single cup
  SS.on('dealer:buy', function () { dealT = 1.5; lookT = 0; dex.at = -1e9; });
  SS.on('boost:on', function (p) { if (p && p.id) glowT[p.id] = 1.6; dex.at = -1e9; });
  SS.on('phase', function () { dex.at = -1e9; show.since = 0; show.hold = false; });

  function pick(list, r) { return list[Math.min(list.length - 1, Math.floor(r * list.length))]; }
  function lookOf(c) {
    var l = looks.get(c.id);
    if (l) return l;
    if (looks.size > 400) looks.clear();
    var h = function (i) { return SS.hash((c.seed | 0) * 37 + i); };     // all from the seed, so a regular looks the same every visit
    var k = c.kind, fem = h(10) < 0.5, hat = k === 'kid' || k === 'tourist' || k === 'vip', tops = TOPS[k] || TOPS.parent;
    var wear = pick(tops, h(6)), legs = pick(BOTTOMS[k] || BOTTOMS.parent, h(7)), shirt = pick(k === 'office' ? SUIT : SHIRT, h(3));
    if (!fem && wear === 'dress') wear = tops[0];
    if (!fem && legs === 'skirt') legs = 'trousers';
    l = { skin: pick(SKIN, h(1)), hair: k === 'elder' ? pick(GREY, h(2)) : k === 'teen' && h(11) < 0.2 ? pick(FUN, h(2)) : pick(HAIR, h(2)),
      style: pick(STYLES[k === 'elder' ? 'elder' : (hat ? 'hat' : '') + (fem ? 'B' : 'A')], h(8)),
      wear: wear, legs: legs, shirt: shirt,
      shirt2: wear === 'stripe' ? (shirt === '#f4f6ff' || h(12) < 0.4 ? '#2f3a6b' : '#ffffff') : k === 'office' ? '#f4f6ff' : pick(INNER, h(12)),
      pants: wear === 'overalls' ? '#4f7fd6' : k === 'office' ? shirt : pick(PANTS, h(4)), shoe: pick(SHOE, h(9)),
      eye: Math.floor(h(15) * 4), glasses: h(13) < (k === 'elder' ? 0.6 : 0.14) ? pick(FRAME, h(16)) : null,
      freckles: h(14) < 0.2, blush: k === 'kid' || h(17) < 0.6, prop: pick(PROP, h(18)),
      s:(SIZE[k] || 1) * (0.95 + h(5) * 0.1) };
    looks.set(c.id, l);
    return l;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function box(ctx, x, y, w, h, r, fill) { rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
  /** a limb: ink underlay then colour, so it reads as outlined */
  function limb(ctx, x1, y1, x2, y2, w, col) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = INK; ctx.lineWidth = w + 5; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  function star(ctx, x, y, r, fill) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  }
  function shadow(ctx, x, y, rx, s) {
    ctx.fillStyle = 'rgba(19,26,58,.22)'; ctx.beginPath(); ctx.ellipse(x, y, rx * s, rx * 0.26 * s, 0, 0, TAU); ctx.fill();
  }

  function oval(ctx, x, y, rx, ry, rot) { ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function arcAt(ctx, x, y, rad, a0, a1) { ctx.moveTo(x + rad * Math.cos(a0), y + rad * Math.sin(a0)); ctx.arc(x, y, rad, a0, a1); }
  function dot(ctx, x, y, rad, fill, lw) { ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(); } }
  function tint(hex) {                                      // the hair's shine colour, made once per colour
    var v = SHINE[hex], n;
    if (!v) {
      n = parseInt(String(hex).slice(1, 7), 16) || 0;
      v = SHINE[hex] = 'rgb(' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (c) { return Math.round(c + (255 - c) * 0.4); }).join(',') + ')';
    }
    return v;
  }

  /* Hair, in head units (origin at the head's centre, r its radius, facing +x). hairBack() draws the style's
     silhouette behind the head; the head then covers its inside, and hairFront() fills the scalp over the head's
     outline and inks only the hairline. So every cut shows volume round the head, and hats sit on top of it. */
  var NC = 0.455 * Math.PI;                                // long hair covers the head's back right down to the neck
  function napeAt(t) { return t === 'long' || t === 'bob' ? NC : 0.86 * Math.PI; }
  function hairBack(ctx, r, st, col, sw, prop) {
    var t = HL[st] || 'crop', R = r + 3.5, i, a, q;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, napeAt(t), TAU + Math.asin(FRONT[t])); ctx.closePath();
    // every extra shape winds clockwise like the arcs, so the nonzero fill unites them into one silhouette
    switch (st) {
      case 'side': oval(ctx, 0.25 * r, -0.86 * r, 0.62 * r, 0.3 * r, -0.25); break;
      case 'quiff': oval(ctx, 0.42 * r, -1.02 * r, 0.55 * r, 0.36 * r, -0.45); break;
      case 'spiky':
        ctx.moveTo(0, 0);
        for (i = 0; i <= 8; i++) { a = Math.PI * (0.95 + i * 0.11); q = i % 2 ? 1.42 * r : R - 1; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
        ctx.closePath(); break;
      case 'curly': for (i = 0; i < 7; i++) { a = Math.PI * (0.88 + i * 0.16); oval(ctx, Math.cos(a) * 0.98 * r, Math.sin(a) * 0.98 * r, 0.3 * r, 0.3 * r, 0); } break;
      case 'afro':
        oval(ctx, -0.1 * r, -0.3 * r, r, r, 0);
        for (i = 0; i < 9; i++) { a = Math.PI * (0.7 + i * 0.15); oval(ctx, -0.1 * r + Math.cos(a) * r, -0.3 * r + Math.sin(a) * r, 0.32 * r, 0.32 * r, 0); }
        break;
      case 'bun': oval(ctx, -0.45 * r, -1.1 * r, 0.36 * r, 0.36 * r, 0); break;
      case 'buns': oval(ctx, -0.62 * r, -0.92 * r, 0.32 * r, 0.32 * r, 0); oval(ctx, 0.3 * r, -1.1 * r, 0.32 * r, 0.32 * r, 0); break;
      case 'pony': oval(ctx, -1.2 * r, 0.15 * r, 0.3 * r, 0.66 * r, 0.5 + sw * 0.12); break;
      case 'pigtails': oval(ctx, -1.0 * r, 0.75 * r, 0.24 * r, 0.46 * r, 0.35 + sw * 0.08); oval(ctx, -1.32 * r, -0.25 * r, 0.24 * r, 0.46 * r, 1.1 + sw * 0.08); break;
      case 'long':
        ctx.moveTo(-r, -0.3 * r); ctx.lineTo(0.28 * r, 0.3 * r); ctx.lineTo(0.22 * r, 1.55 * r);
        ctx.quadraticCurveTo(-0.4 * r, 1.95 * r, -r, 1.6 * r); ctx.quadraticCurveTo(-1.2 * r, 0.6 * r, -r, -0.3 * r); break;
      case 'bob':
        ctx.moveTo(-r, -0.3 * r); ctx.lineTo(0.3 * r, 0.2 * r); ctx.lineTo(0.3 * r, r); ctx.lineTo(-1.06 * r, r);
        ctx.quadraticCurveTo(-1.2 * r, 0.3 * r, -r, -0.3 * r); break;
      case 'braids': for (i = 0; i < 4; i++) { q = (0.25 - i * 0.02) * r; oval(ctx, (-0.98 - i * 0.04 + sw * i * 0.05) * r, (0.36 + i * 0.37) * r, q, q, 0); } break;
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.fillStyle = col; ctx.fill();
    if (st === 'braids') dot(ctx, (-1.1 + sw * 0.15) * r, 1.66 * r, 0.11 * r, prop, 2);
  }
  function hairline(ctx, r, t) {                            // from the front of the face's edge round to the nape
    var f = FRONT[t];
    ctx.moveTo(Math.sqrt(1 - f * f) * r, f * r);
    if (t === 'high') ctx.quadraticCurveTo(0.4 * r, -0.62 * r, 0.12 * r, -0.4 * r);
    else if (t === 'swoop' || t === 'long') ctx.quadraticCurveTo(0.5 * r, -0.3 * r, 0.1 * r, -0.62 * r);   // side part: the fringe sweeps down to the front
    else if (t === 'fringe' || t === 'bob') { ctx.quadraticCurveTo(0.8 * r, -0.18 * r, 0.6 * r, -0.32 * r); ctx.quadraticCurveTo(0.42 * r, -0.2 * r, 0.16 * r, -0.36 * r); }
    else ctx.quadraticCurveTo(0.5 * r, -0.62 * r, 0.12 * r, -0.42 * r);
    if (t === 'long' || t === 'bob') { ctx.quadraticCurveTo(0.02 * r, 0, 0.16 * r, 0.6 * r); ctx.lineTo(Math.cos(NC) * r, Math.sin(NC) * r); }   // falls over the ear
    else { ctx.quadraticCurveTo(-0.04 * r, -0.12 * r, 0.02 * r, 0.16 * r); ctx.quadraticCurveTo(-0.5 * r, 0.5 * r, C86 * r, S86 * r); }
  }
  function hairFront(ctx, r, st, col, prop) {
    var t = HL[st] || 'crop';
    ctx.beginPath(); hairline(ctx, r, t); ctx.arc(0, 0, r + 2, napeAt(t), TAU + Math.asin(FRONT[t])); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); hairline(ctx, r, t); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 1.16 * Math.PI, 1.36 * Math.PI); ctx.strokeStyle = tint(col); ctx.lineWidth = 2.4; ctx.stroke();   // shine, lit from the top left
    if (st === 'pony') dot(ctx, -0.93 * r, -0.4 * r, 0.13 * r, prop, 2);
    else if (st === 'pigtails') { dot(ctx, -0.86 * r, 0.36 * r, 0.14 * r, prop, 2); dot(ctx, -0.93 * r, -0.42 * r, 0.14 * r, prop, 2); }
  }
  var FRK = [0.02, 0.3, 0.13, 0.35, 0.04, 0.43, 0.76, 0.3, 0.86, 0.35];   // freckles, head units
  function features(ctx, r, l, mood) {
    var e = 0.13 * r + 0.4, ey = 0.04 * r, x1 = 0.2 * r, x2 = 0.66 * r, happy = mood > 0.25, sad = mood < -0.25, i, q;
    var by = -0.25 * r - (happy ? 0.05 * r : 0), t1 = sad ? 0.09 * r : 0, t2 = sad ? 0.03 * r : 0, arch = happy ? 0.07 * r : 0.025 * r, mx = 0.45 * r, my = 0.56 * r;
    ctx.strokeStyle = INK;
    if (!EARLESS[l.style]) {
      ctx.beginPath(); oval(ctx, -0.12 * r, 0.16 * r, 0.15 * r, 0.21 * r, 0); ctx.fillStyle = l.skin; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.1 * r, 0.17 * r, 0.07 * r, 0.6 * Math.PI, 1.5 * Math.PI); ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (l.blush) { ctx.beginPath(); oval(ctx, 0.1 * r, 0.42 * r, 0.15 * r, 0.09 * r, 0); oval(ctx, 0.84 * r, 0.4 * r, 0.1 * r, 0.08 * r, 0); ctx.fillStyle = BLUSH; ctx.fill(); }
    if (l.freckles) { ctx.beginPath(); for (i = 0; i < FRK.length; i += 2) arcAt(ctx, FRK[i] * r, FRK[i + 1] * r, 0.035 * r + 0.3, 0, TAU); ctx.fillStyle = FRECK; ctx.fill(); }
    ctx.fillStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath();
    if (mood > 0.7) { arcAt(ctx, x1, ey + 0.5 * e, 1.1 * e, 1.15 * Math.PI, 1.85 * Math.PI); arcAt(ctx, x2, ey + 0.5 * e, 1.1 * e, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }   // beaming
    else {
      if (l.eye === 1) { oval(ctx, x1, ey, 0.78 * e, 1.22 * e, 0); oval(ctx, x2, ey, 0.78 * e, 1.22 * e, 0); }
      else { q = l.eye === 2 ? 1.15 * e : e; arcAt(ctx, x1, ey, q, 0, TAU); arcAt(ctx, x2, ey, q, 0, TAU); }
      ctx.fill();
      if (l.eye === 2) { ctx.beginPath(); arcAt(ctx, x1 - 0.35 * e, ey - 0.4 * e, 0.42 * e, 0, TAU); arcAt(ctx, x2 - 0.35 * e, ey - 0.4 * e, 0.42 * e, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); }
      else if (l.eye === 3) { ctx.beginPath(); ctx.moveTo(x1 + 0.6 * e, ey - 0.75 * e); ctx.lineTo(x1 + 1.5 * e, ey - 1.3 * e); ctx.moveTo(x2 + 0.6 * e, ey - 0.75 * e); ctx.lineTo(x2 + 1.5 * e, ey - 1.3 * e); ctx.lineWidth = 1.6; ctx.stroke(); }
    }
    ctx.beginPath();                                        // brows: raised when happy, worried (inner ends up) when sad
    ctx.moveTo(x1 - 0.13 * r, by + t2); ctx.quadraticCurveTo(x1, by - arch - t1 * 0.5, x1 + 0.12 * r, by - t1);
    ctx.moveTo(x2 - 0.11 * r, by - t1); ctx.quadraticCurveTo(x2, by - arch - t1 * 0.5, x2 + 0.13 * r, by + t2);
    ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.46 * r, 0.13 * r); ctx.quadraticCurveTo(0.6 * r, 0.3 * r, 0.42 * r, 0.31 * r); ctx.lineWidth = 2; ctx.stroke();   // nose
    ctx.beginPath();
    if (mood > 0.7) {
      ctx.moveTo(mx - 0.22 * r, my - 0.08 * r); ctx.quadraticCurveTo(mx, my + 0.36 * r, mx + 0.24 * r, my - 0.1 * r); ctx.closePath();
      ctx.fillStyle = INK; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); oval(ctx, mx + 0.02 * r, my + 0.07 * r, 0.09 * r, 0.045 * r, 0); ctx.fillStyle = '#ff6b81'; ctx.fill();
    } else {
      if (happy) arcAt(ctx, mx, my - 0.18 * r, 0.22 * r, 0.2 * Math.PI, 0.8 * Math.PI);
      else if (sad) arcAt(ctx, mx, my + 0.2 * r, 0.2 * r, 1.2 * Math.PI, 1.8 * Math.PI);
      else { ctx.moveTo(mx - 0.13 * r, my); ctx.lineTo(mx + 0.13 * r, my); }
      ctx.lineWidth = 2.2; ctx.stroke();
    }
    if (l.glasses) {
      q = 0.22 * r; ctx.beginPath(); arcAt(ctx, x1, ey, q, 0, TAU); arcAt(ctx, x2, ey, q, 0, TAU);
      ctx.moveTo(x1 + q, ey); ctx.lineTo(x2 - q, ey); ctx.moveTo(x1 - q, ey); ctx.lineTo(-0.04 * r, ey - 0.04 * r);
      ctx.strokeStyle = l.glasses; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  function lemonAt(ctx, x, y, s) {                          // a tiny Squeezy-yellow lemon with a leaf
    ctx.beginPath(); oval(ctx, x, y, s, s * 0.72, -0.35); ctx.fillStyle = '#ffd83d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); oval(ctx, x + s * 0.45, y - s * 0.8, s * 0.42, s * 0.22, -0.6); ctx.fillStyle = '#35c977'; ctx.fill(); ctx.stroke();
  }
  // headgear, in head units; ht = the top of the hair, so every hat sits on the hair rather than on a bald scalp
  function capOn(ctx, r, ht, col, lemon) {
    var cy = -0.36 * r, ry = cy - ht + 2;
    ctx.beginPath(); ctx.moveTo(-r - 5.5, cy); ctx.ellipse(0, cy, r + 5.5, ry, 0, Math.PI, TAU); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.45 * r, cy); ctx.quadraticCurveTo(1.3 * r, cy - 0.1 * r, 1.62 * r, cy + 0.14 * r);
    ctx.quadraticCurveTo(1.1 * r, cy + 0.26 * r, 0.45 * r, cy + 0.14 * r); ctx.closePath(); ctx.fill(); ctx.stroke();   // brim
    if (lemon) lemonAt(ctx, 0.42 * r, cy - ry * 0.45, 0.2 * r);
    else dot(ctx, 0, cy - ry, 0.1 * r + 1, col, 2);
  }
  function sunHat(ctx, r, ht, col, band) {
    var by = -0.6 * r, top = ht - 12;
    rr(ctx, -0.98 * r, top, 1.96 * r, by - top + 2, 0.45 * r); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    rr(ctx, -0.98 * r, by - 0.3 * r, 1.96 * r, 0.22 * r, 0.05 * r); ctx.fillStyle = band; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); oval(ctx, 0.12 * r, by, 1.6 * r, 0.3 * r, 0); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  }
  function fedora(ctx, r, ht) {
    var by = -0.62 * r, top = ht - 7;
    ctx.beginPath(); ctx.moveTo(-0.92 * r, by); ctx.lineTo(-0.8 * r, top + 3); ctx.quadraticCurveTo(-0.4 * r, top - 2, 0.02 * r, top + 4);
    ctx.quadraticCurveTo(0.4 * r, top - 2, 0.8 * r, top + 3); ctx.lineTo(0.92 * r, by); ctx.closePath();
    ctx.fillStyle = '#7a5cff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    rr(ctx, -0.9 * r, by - 0.26 * r, 1.8 * r, 0.2 * r, 0.04 * r); ctx.fillStyle = '#ffd83d'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); oval(ctx, 0.06 * r, by, 1.4 * r, 0.26 * r, -0.06); ctx.fillStyle = '#7a5cff'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  }
  function torso(ctx, top, bot, w0, w1, rad) {               // rounded shoulders, a little narrower at the waist
    ctx.beginPath(); ctx.moveTo(-w0 + rad, top); ctx.lineTo(w0 - rad, top); ctx.quadraticCurveTo(w0, top, w0, top + rad);
    ctx.lineTo(w1, bot - 4); ctx.quadraticCurveTo(w1, bot, w1 - 4, bot); ctx.lineTo(-w1 + 4, bot); ctx.quadraticCurveTo(-w1, bot, -w1, bot - 4);
    ctx.lineTo(-w0, top + rad); ctx.quadraticCurveTo(-w0, top, -w0 + rad, top); ctx.closePath();
  }
  function skirtOf(ctx, top, bot, w0, w1, col) {
    ctx.beginPath(); ctx.moveTo(-w0, top); ctx.lineTo(w0, top); ctx.lineTo(w1, bot - 3); ctx.quadraticCurveTo(w1, bot, w1 - 3, bot);
    ctx.lineTo(-w1 + 3, bot); ctx.quadraticCurveTo(-w1, bot, -w1, bot - 3); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  }
  function legOf(ctx, l, x1, y1, x2, y2, w, legs, bare) {
    if (bare || legs === 'shorts') {
      limb(ctx, x1, y1, x2, y2, w * 0.82, l.skin);
      if (!bare) limb(ctx, x1, y1, x1 + (x2 - x1) * 0.42, y1 + (y2 - y1) * 0.42, w + 1.5, l.pants);
    } else limb(ctx, x1, y1, x2, y2, w, l.pants);
    box(ctx, x2 - 0.55 * w, y2 - 0.45 * w, 1.5 * w, 0.8 * w, 0.4 * w, l.shoe || '#ffffff');   // shoe, toe forward
  }
  function armOf(ctx, l, x1, y1, x2, y2, w, sl) {            // sl: how far down the arm the sleeve reaches
    limb(ctx, x1, y1, x2, y2, w, sl >= 1 ? l.shirt : l.skin);
    if (sl < 1) limb(ctx, x1, y1, x1 + (x2 - x1) * sl, y1 + (y2 - y1) * sl, w + 2, l.shirt);
  }
  function handAt(ctx, l, x, y, w) { dot(ctx, x, y, w * 0.5 + 1.6, l.skin, 2.5); }

  /* One person, drawn in world units with the origin at the feet, facing +x. Returns the height of the top of the
     head, hair included (hats not: hatLift() adds those). Also SS.Actors.drawPerson, for other modules.
     o: { kind, phase (walk cycle radians, null = standing), breath, mood -1..1, drink (colour|null), armUp 0..1, bob, hideLegs }
     l, a look (lookOf() makes customers'; only skin, hair, shirt, pants and s are required, the rest have defaults):
       skin, hair, shirt, pants: colours        s: size, 1 = an adult
       style: hair, 'crop' | 'side' | 'quiff' | 'spiky' | 'curly' | 'afro' | 'bun' | 'buns' | 'pony' | 'pigtails' | 'long' | 'bob' | 'braids' (default 'side')
       wear: 'tee' | 'stripe' | 'polo' | 'hoodie' | 'jacket' | 'overalls' | 'dress'     legs: 'trousers' | 'shorts' | 'skirt'
       shirt2: stripes, collar or inner shirt   shoe, prop (cap, backpack, headphones, headband, hair ties, tie): colours
       eye: 0..3 eye shape   glasses: frame colour | null   freckles, blush: true | false
       apron: colour, an apron with a round lemon badge   cap: colour, a cap with a tiny lemon (together: the Squeezy uniform) */
  function person(ctx, l, o) {
    var H = W.CHAR_H * l.s, k = o.kind, walking = o.phase != null, sw = walking ? Math.sin(o.phase) : 0, mood = o.mood || 0;
    var bob = (walking ? Math.abs(Math.cos(o.phase)) * 3 : Math.sin(o.breath || 0) * 1.2) + (o.bob || 0);
    var hip = -0.42 * H - bob, sh = -0.74 * H - bob, r = 0.165 * H * (HEAD[k] || 1), hy = sh - 0.86 * r, run = k === 'jogger' ? 1.5 : 1;
    var th = 0.62 + 0.38 * Math.min(1, l.s), lw = 9 * th, aw = 7 * th, tw = 0.14 * H, bw = 0.125 * H;   // limbs a little thinner on small people
    var st = l.style || 'side', wear = l.wear || 'tee', legs = l.legs || 'trousers', bare = wear === 'dress' || legs === 'skirt', sl = LONG[wear] ? 1 : 0.45;
    var ht = -(r * (1 + (LIFT[st] || 0)) + 3.5), prop = l.prop || '#7a5cff', ax, ay, y;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (k === 'skater') {                                   // rides a board: legs planted
      box(ctx, -24, -7, 48, 5, 2.5, '#ff9f43');
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-15, -1, 3.5, 0, TAU); ctx.arc(15, -1, 3.5, 0, TAU); ctx.fill();
      legOf(ctx, l, -4, hip, -10, -9, lw, legs, bare); legOf(ctx, l, 4, hip, 10, -9, lw, legs, bare);
    } else if (!o.hideLegs) {
      var reach = 0.2 * H * run;
      legOf(ctx, l, -3, hip, -3 - sw * reach, -2 - Math.max(0, -sw) * 6, lw, legs, bare);
      legOf(ctx, l, 3, hip, 3 + sw * reach, -2 - Math.max(0, sw) * 6, lw, legs, bare);
    }
    if (k === 'kid') box(ctx, -tw - 9 * th, sh + 3, 12 * th, 0.25 * H, 4, prop);       // backpack
    // 3/4 view: the far arm hangs behind the chest's front edge, the near one down the back edge, so the chest stays visible
    ax = 0.11 * H + sw * 13 * run; ay = sh + 0.3 * H;
    armOf(ctx, l, 0.07 * H, sh + 5, ax, ay, aw, sl); handAt(ctx, l, ax, ay, aw);    // far arm
    if (wear === 'hoodie') { ctx.beginPath(); oval(ctx, -0.07 * H, sh + 0.01 * H, 0.1 * H, 0.055 * H, 0); ctx.fillStyle = l.shirt; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }   // hood
    torso(ctx, sh, hip + 6, tw, bw, 0.08 * H); ctx.fillStyle = l.shirt; ctx.fill();
    if (wear === 'stripe') { ctx.save(); ctx.clip(); ctx.fillStyle = l.shirt2 || '#ffffff'; for (y = sh + 0.07 * H; y < hip + 6; y += 0.1 * H) ctx.fillRect(-tw, y, 2 * tw, 0.045 * H); ctx.restore(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    switch (wear) {
      case 'polo':
        ctx.beginPath(); ctx.moveTo(-0.03 * H, sh - 1); ctx.lineTo(0.04 * H, sh + 0.065 * H); ctx.lineTo(0.05 * H, sh - 1); ctx.closePath();
        ctx.moveTo(0.05 * H, sh - 1); ctx.lineTo(0.06 * H, sh + 0.065 * H); ctx.lineTo(0.12 * H, sh - 1); ctx.closePath();
        ctx.fillStyle = l.shirt2 || '#f4f6ff'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0.05 * H, sh + 0.07 * H); ctx.lineTo(0.05 * H, sh + 0.14 * H); ctx.stroke();
        break;
      case 'jacket':
        ctx.beginPath(); ctx.moveTo(-0.01 * H, sh + 1); ctx.lineTo(0.12 * H, sh + 1); ctx.lineTo(0.055 * H, sh + 0.21 * H); ctx.closePath();
        ctx.fillStyle = l.shirt2 || '#f4f6ff'; ctx.fill(); ctx.lineWidth = 2.2; ctx.stroke();
        if (k === 'office') {
          ctx.beginPath(); ctx.moveTo(0.04 * H, sh + 0.035 * H); ctx.lineTo(0.07 * H, sh + 0.035 * H); ctx.lineTo(0.085 * H, sh + 0.22 * H); ctx.lineTo(0.055 * H, sh + 0.27 * H); ctx.lineTo(0.025 * H, sh + 0.22 * H); ctx.closePath();
          ctx.fillStyle = prop; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
        } else { dot(ctx, 0.06 * H, sh + 0.26 * H, 1.6, INK, 0); dot(ctx, 0.06 * H, sh + 0.33 * H, 1.6, INK, 0); }
        break;
      case 'hoodie':
        rr(ctx, -0.075 * H, hip - 0.13 * H, 0.18 * H, 0.1 * H, 0.03 * H); ctx.lineWidth = 2; ctx.stroke();   // pocket
        ctx.beginPath(); ctx.moveTo(0.025 * H, sh + 0.02 * H); ctx.lineTo(0.03 * H, sh + 0.1 * H); ctx.moveTo(0.075 * H, sh + 0.02 * H); ctx.lineTo(0.08 * H, sh + 0.1 * H); ctx.lineWidth = 1.8; ctx.stroke();
        break;
      case 'overalls':
        rr(ctx, -0.095 * H, sh + 0.13 * H, 0.2 * H, hip + 6 - sh - 0.13 * H, 0.03 * H); ctx.fillStyle = l.pants; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
        limb(ctx, -0.08 * H, sh + 1, -0.075 * H, sh + 0.14 * H, 2.5, l.pants); limb(ctx, 0.09 * H, sh + 1, 0.085 * H, sh + 0.14 * H, 2.5, l.pants);
        dot(ctx, -0.075 * H, sh + 0.15 * H, 1.8, '#ffd83d', 1.2); dot(ctx, 0.085 * H, sh + 0.15 * H, 1.8, '#ffd83d', 1.2);
        break;
      default:                                              // tee, stripe, dress: a round neckline
        ctx.beginPath(); ctx.arc(0.04 * H, sh - 1, 0.055 * H, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 2; ctx.stroke();
    }
    if (wear === 'dress') skirtOf(ctx, hip - 6, hip + 0.22 * H, bw, 0.2 * H, l.shirt);
    else if (legs === 'skirt' && !o.hideLegs) skirtOf(ctx, hip - 4, hip + 0.15 * H, bw, 0.17 * H, l.pants);
    if (l.apron) {                                          // the Squeezy uniform
      ctx.beginPath(); ctx.moveTo(-0.07 * H, sh + 0.09 * H); ctx.lineTo(-0.01 * H, sh); ctx.moveTo(0.11 * H, sh + 0.09 * H); ctx.lineTo(0.07 * H, sh);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      rr(ctx, -0.085 * H, sh + 0.08 * H, 0.21 * H, hip - sh + 0.06 * H, 0.035 * H); ctx.fillStyle = l.apron; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
      dot(ctx, 0.02 * H, sh + 0.19 * H, 0.055 * H, '#ffffff', 2); lemonAt(ctx, 0.02 * H, sh + 0.19 * H, 0.03 * H);
    }
    if (k === 'kid') limb(ctx, -0.06 * H, sh + 1, -0.03 * H, sh + 0.22 * H, 2.5, prop);   // backpack strap
    if (k === 'tourist') {
      ctx.beginPath(); ctx.moveTo(-0.05 * H, sh + 1); ctx.lineTo(0.06 * H, sh + 0.13 * H); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      box(ctx, 2, sh + 0.12 * H, 14, 10, 3, '#3d4a5c'); dot(ctx, 9, sh + 0.12 * H + 5, 3, '#9fd8ff', 1.5);   // camera
    }
    ctx.translate(0, hy); hairBack(ctx, r, st, l.hair, sw, prop); ctx.translate(0, -hy);   // behind the head, over the back
    ax = o.armUp ? 6 + 20 * o.armUp : -0.05 * H - sw * 13 * run; ay = sh + 0.3 * H - (o.armUp ? 0.24 * H * o.armUp : 0);
    if (o.drink) { ax = 17; ay = sh + 0.16 * H; }
    armOf(ctx, l, -0.06 * H, sh + 5, ax, ay, aw, sl);                                  // near arm
    if (o.drink) {
      box(ctx, ax - 2, ay - 15, 11, 15, 2.5, '#ffffff');
      ctx.fillStyle = o.drink; ctx.fillRect(ax, ay - 10, 7, 8);
      ctx.strokeStyle = '#ff6257'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax + 5, ay - 12); ctx.lineTo(ax + 9, ay - 23); ctx.stroke();
    }
    if (k === 'office' && !o.drink) box(ctx, ax - 9, ay + 2, 18, 13, 3, '#6b4a3a');    // briefcase
    if (k === 'elder') {                                    // cane
      ctx.beginPath(); ctx.moveTo(ax + 6, -1); ctx.lineTo(ax + 2, ay - 2); ctx.arc(ax - 2, ay - 2, 4, 0, Math.PI, true);
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = '#b4562e'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    if (k === 'vip') box(ctx, ax - 4, ay - 14, 12, 15, 2, '#fff4b8');                  // notepad
    handAt(ctx, l, ax, ay, aw);
    ctx.translate(0, hy);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = l.skin; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    hairFront(ctx, r, st, l.hair, prop);
    features(ctx, r, l, mood);
    if (l.cap) capOn(ctx, r, ht, l.cap, true);
    else if (k === 'kid') capOn(ctx, r, ht, prop, false);
    else if (k === 'teen') {                                // headphones: band over the hair, cup on the ear
      ctx.beginPath(); ctx.ellipse(0.3 * r, 0.1 * r, 0.52 * r, 0.1 * r - ht + 2, 0, Math.PI, 1.62 * Math.PI);
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = prop; ctx.lineWidth = 2.5; ctx.stroke();
      box(ctx, -0.33 * r, -0.12 * r, 0.42 * r, 0.56 * r, 0.18 * r, prop);
    } else if (k === 'jogger') {                            // sweatband round the forehead
      ctx.beginPath(); ctx.ellipse(0, -0.64 * r, r + 2.5, 0.2 * r, 0, 0, Math.PI);
      ctx.strokeStyle = INK; ctx.lineWidth = 7.5; ctx.stroke(); ctx.strokeStyle = prop; ctx.lineWidth = 4; ctx.stroke();
    } else if (k === 'tourist') sunHat(ctx, r, ht, '#fff4b8', prop);
    else if (k === 'vip') fedora(ctx, r, ht);
    ctx.translate(0, -hy);
    return -hy - ht;
  }

  /* Bubble pictograms, drawn around (0,0) inside a ~12px radius. */
  function glyph(ctx, type) {
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK;
    function drop(col) { ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(9, 0, 8, 9, 0, 9); ctx.bezierCurveTo(-8, 9, -9, 0, 0, -10); ctx.fillStyle = col; ctx.fill(); ctx.stroke(); }
    function face(col, m) {
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-3.5, -2.5, 1.5, 0, TAU); ctx.arc(3.5, -2.5, 1.5, 0, TAU); ctx.fill();
      ctx.beginPath(); if (m > 0) ctx.arc(0, 1, 5, 0.15 * Math.PI, 0.85 * Math.PI); else if (m < 0) ctx.arc(0, 8, 5, 1.2 * Math.PI, 1.8 * Math.PI); else { ctx.moveTo(-4, 4); ctx.lineTo(4, 4); } ctx.stroke();
    }
    function text(t, col) { ctx.font = '900 19px Figtree, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(t, 0, 1); }
    switch (type) {
      case 'thirsty': drop('#4cc3f0'); break;
      case 'watery': drop('#cdeeff'); text('?', INK); break;
      case 'pricey': text('$$', '#d83a30'); break;
      case 'wait': ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 0); ctx.lineTo(5, 3); ctx.stroke(); break;
      case 'soldout': ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(7, -8); ctx.lineTo(5, 9); ctx.lineTo(-5, 9); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#d83a30'; ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(9, 10); ctx.stroke(); break;
      case 'happy': face('#ffd83d', 1); break;
      case 'meh': face('#e6e8f4', 0); break;
      case 'angry': face('#ff6257', -1); break;
      case 'love': ctx.beginPath(); ctx.moveTo(0, 9); ctx.bezierCurveTo(-14, -1, -8, -12, 0, -4); ctx.bezierCurveTo(8, -12, 14, -1, 0, 9); ctx.fillStyle = '#ff5d8f'; ctx.fill(); ctx.stroke(); break;
      case 'sour': ctx.beginPath(); ctx.ellipse(0, 0, 11, 8, -0.3, 0, TAU); ctx.fillStyle = '#ffd83d'; ctx.fill(); ctx.stroke(); break;
      case 'sweet': box(ctx, -8, -8, 16, 16, 3, '#ffffff'); ctx.fillStyle = '#ff5d8f'; ctx.fillRect(-4, -4, 8, 8); break;
      case 'warm': ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fillStyle = '#ff9f43'; ctx.fill(); ctx.stroke(); for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.stroke(); } break;
      case 'tip': ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fillStyle = '#ffd83d'; ctx.fill(); ctx.stroke(); text('$', '#96602e'); break;
      case 'star': star(ctx, 0, 0, 11, '#ffd83d'); break;
      default: text('!', INK);
    }
  }
  function bubble(ctx, b, x, y, s) {
    var max = b.max || 2.5, k = SS.ease.outBack(SS.clamp((max - b.ttl) / 0.18, 0, 1)) * SS.clamp(b.ttl / 0.15, 0, 1);
    if (k <= 0.02) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(s * k, s * k);
    ctx.beginPath(); ctx.moveTo(-5, 14); ctx.lineTo(0, 24); ctx.lineTo(7, 13); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    glyph(ctx, b.type); ctx.restore();
  }

  function drawCustomer(ctx, view, env, c, flavorCol) {
    var s = view.laneScale(c.lane), x = view.toX(c.x), y = view.laneY(c.lane), l = lookOf(c);
    var standing = c.state === 'queue' || c.state === 'order' || !(c.speed > 1);
    var face = standing && (c.state === 'queue' || c.state === 'order') ? 1 : (c.dir < 0 ? -1 : 1);
    // a regular on a long streak waves at the vendor as they walk up
    var wave = c.regularId && c.streak >= 5 && !c.hasDrink && (c.state === 'approach' || (c.state === 'queue' && c.stateT < 1.4));
    shadow(ctx, x, y, 22 * l.s, s);
    ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s);
    var top = person(ctx, l, {
      kind: c.kind, phase: standing ? null : c.x * 0.11, breath: env.t * 2 + c.id, mood: c.mood || 0,
      drink: c.hasDrink ? flavorCol : null, armUp: c.state === 'order' ? 0.7 : wave ? 0.78 + 0.22 * Math.sin(env.t * 15 + c.id) : 0,
      bob: c.state === 'queue' && c.patience < 0.4 ? Math.abs(Math.sin(env.t * 9 + c.id)) * 2 : 0
    });
    l.top = top; l.brolly = env.weather.wet > 0.4 && !standing;
    if (l.brolly) {                                         // umbrella in the rain
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, -top * 0.6); ctx.lineTo(8, -top - 26); ctx.stroke();
      ctx.beginPath(); ctx.arc(8, -top - 22, 34, Math.PI, 0); ctx.closePath(); ctx.fillStyle = l.shirt; ctx.fill(); ctx.stroke();
    }
    if (c.kind === 'vip') star(ctx, 0, -top - 14 + Math.sin(env.t * 4) * 2, 7, '#ffd83d');
    ctx.restore();
  }

  /* A passer-by in front of the stand fades to about half, so the sign and the line stay readable. The figure is drawn whole on a
     scratch canvas and laid down at once: alpha on each part would show the arms and legs through one another. */
  var ghost = null;
  function drawFront(ctx, view, env, c, col) {
    var a = c.state === 'walk' || c.state === 'leave' ? 0.55 + 0.45 * SS.clamp((Math.abs(c.x - W.STAND_X) - 100) / 40, 0, 1) : 1;
    if (a >= 1 || !ctx.getTransform) { drawCustomer(ctx, view, env, c, col); return; }
    var cv = ctx.canvas, m = ctx.getTransform(), s = view.laneScale(c.lane), x = view.toX(c.x), y = view.laneY(c.lane);
    var l = Math.max(0, Math.floor(m.a * (x - 70 * s) + m.e)), t = Math.max(0, Math.floor(m.d * (y - 200 * s) + m.f));
    var w = Math.min(cv.width, Math.ceil(m.a * (x + 70 * s) + m.e)) - l, h = Math.min(cv.height, Math.ceil(m.d * (y + 16 * s) + m.f)) - t;
    if (w <= 0 || h <= 0) return;
    if (!ghost) ghost = document.createElement('canvas').getContext('2d');
    if (ghost.canvas.width !== cv.width || ghost.canvas.height !== cv.height) { ghost.canvas.width = cv.width; ghost.canvas.height = cv.height; }
    ghost.save(); ghost.setTransform(1, 0, 0, 1, 0, 0); ghost.clearRect(l, t, w, h);
    ghost.beginPath(); ghost.rect(l, t, w, h); ghost.clip();      // nothing lands outside the box, so the next one starts clean
    ghost.setTransform(m); drawCustomer(ghost, view, env, c, col); ghost.restore();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.drawImage(ghost.canvas, l, t, w, h, l, t, w, h); ctx.restore();
  }

  /* Everything that floats over a head, drawn after all the bodies so nobody walks over it.
     Stacked upward so nothing collides: regular's badge and name, patience bar, speech bubble. */
  function drawOverhead(ctx, view, env, c, st, today) {
    var s = view.laneScale(c.lane), x = view.toX(c.x), y = view.laneY(c.lane), l = lookOf(c), top = l.top || W.CHAR_H;
    var cy = y - (top + 10) * s, qi = inLine(c) && today && today.queue ? today.queue.indexOf(c.id) : -1, a, b;
    if (c.regularId) cy = regMarks(ctx, env, c, st, x + 2 * s, qi >= 0 && qBase[qi] < 1e9 ? qBase[qi] : cy - hatLift(c, l) * s, s, qi >= 0);
    if (qi >= 0) {                                          // in line: float above the neighbours' badges
      a = qTop[qi - 1]; b = qTop[qi + 1];
      if (a < cy) cy = a - 2 * s;
      if (b < cy) cy = b - 2 * s;
    }
    if (c.state === 'queue' && c.patience < 0.4) {         // patience running out
      var bw = 34 * s, bx = x - bw / 2;
      ctx.fillStyle = INK; ctx.fillRect(bx - 2, cy - 9, bw + 4, 9);
      ctx.fillStyle = c.patience < 0.18 ? '#ff6257' : '#ffd83d'; ctx.fillRect(bx, cy - 7, bw * SS.clamp(c.patience / 0.4, 0, 1), 5);
      cy -= 12;
    }
    if (c.bubble && c.bubble.ttl > 0) bubble(ctx, c.bubble, x + 4 * s, cy - 24 * s, s);
  }

  /* Regulars: a heart badge with their loyalty multiplier, a flame with the streak from 3 up,
     and their name while they are in line. Drawn in world units around (x, cy), bottom edge at cy. */
  var F_BADGE = '900 11px Figtree, system-ui, sans-serif', F_NAME = '800 11px Figtree, system-ui, sans-serif', F_FLAME = '900 10px Figtree, system-ui, sans-serif';
  var wBadge = new Map(), wName = new Map();               // measured text widths, one map per font
  function textW(ctx, font, map, txt) {
    var w = map.get(txt);
    if (w === undefined) { if (map.size > 200) map.clear(); ctx.font = font; w = ctx.measureText(txt).width; map.set(txt, w); }
    return w;
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { wBadge.clear(); wName.clear(); });
  function heartPath(ctx, x, y, r) {
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.95);
    ctx.bezierCurveTo(x - r * 1.55, y - r * 0.05, x - r * 0.9, y - r * 1.3, x, y - r * 0.42);
    ctx.bezierCurveTo(x + r * 0.9, y - r * 1.3, x + r * 1.55, y - r * 0.05, x, y + r * 0.95);
    ctx.closePath();
  }
  function pill(ctx, x, y, w, h, fill) { rr(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); }
  function inkText(ctx, txt, x, y, fill, lw) { ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y); }
  function flame(ctx, x, y, r, wob) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1 - wob * 0.5, 1 + wob);
    ctx.beginPath(); ctx.moveTo(0, -r * 1.45);
    ctx.bezierCurveTo(r * 0.5, -r * 0.75, r * 1.05, -r * 0.4, r * 0.95, r * 0.25); ctx.arc(0, r * 0.25, r * 0.95, 0, Math.PI);
    ctx.bezierCurveTo(-r * 1.05, -r * 0.35, -r * 0.35, -r * 0.5, 0, -r * 1.45); ctx.closePath();
    ctx.fillStyle = '#ff7a1a'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r * 0.55); ctx.quadraticCurveTo(r * 0.62, 0, r * 0.5, r * 0.4); ctx.arc(0, r * 0.4, r * 0.5, 0, Math.PI); ctx.quadraticCurveTo(-r * 0.62, 0, 0, -r * 0.55);
    ctx.fillStyle = '#ffd83d'; ctx.fill();
    ctx.restore();
  }
  function regName(st, id) {
    var r = st && st.regulars;
    if (r) for (var i = 0; i < r.length; i++) if (r[i] && r[i].id === id) return r[i].name || null;
    return null;
  }
  function inLine(c) { return c.state === 'queue' || c.state === 'order'; }
  function hatLift(c, l) { return l.brolly ? 50 : c.kind === 'tourist' ? 14 : c.kind === 'vip' ? 20 : 0; }
  /* Regulars standing next to each other in line: the odd slots lift their badges clear of
     their neighbours', so name pills never collide (screen px, per line slot). */
  var qBase = [], qTop = [], qH = [];
  function lineMarks(view, list, today, st) {
    var q = today && today.queue, i, c, qi, l, s, nb;
    qBase.length = qTop.length = qH.length = 0;
    if (!q) return;
    for (i = 0; i < q.length; i++) { qBase[i] = qTop[i] = 1e9; qH[i] = 0; }
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (!c.regularId || !inLine(c) || (qi = q.indexOf(c.id)) < 0) continue;
      l = lookOf(c); s = view.laneScale(c.lane);
      qBase[qi] = view.laneY(c.lane) - ((l.top || W.CHAR_H) + 10 + hatLift(c, l)) * s;
      qH[qi] = (regName(st, c.regularId) ? 44 : 24) * s; qTop[qi] = qBase[qi] - qH[qi];
    }
    for (qi = 1; qi < q.length; qi += 2) {
      if (!qH[qi]) continue;
      nb = Math.min(qTop[qi - 1], qi + 1 < q.length ? qTop[qi + 1] : 1e9) - 3;
      if (nb < qBase[qi]) { qBase[qi] = nb; qTop[qi] = nb - qH[qi]; }
    }
  }
  function regMarks(ctx, env, c, st, x, cy, s, named) {
    var name = named ? regName(st, c.regularId) : null, l = lookOf(c), streak = c.streak | 0, fl = streak >= 3, label;
    if (l.mk !== c.mult || l.sk !== streak) { l.mk = c.mult; l.sk = streak; l.lab = SS.fmtMult(c.mult > 0 ? c.mult : SS.loyaltyMult(streak)); l.num = String(streak); }   // labels made once, not every frame
    label = l.lab;
    ctx.save(); ctx.translate(x, cy); ctx.scale(s, s);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var tw = textW(ctx, F_BADGE, wBadge, label), w = tw + 27, gw = w + (fl ? 13 : 0), L = -gw / 2;
    pill(ctx, L + w / 2, -9, w, 17, '#e8407a');
    heartPath(ctx, L + 9.5, -9.5, 7); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = F_BADGE; ctx.fillStyle = '#ffffff'; ctx.fillText(label, L + 19 + tw / 2, -8.5);
    if (fl) {
      flame(ctx, L + w + 4, -11, 8.5, env.reduced ? 0 : 0.06 * Math.sin(env.t * 13 + c.id));
      ctx.font = F_FLAME; inkText(ctx, l.num, L + w + 4, -8, '#ffffff', 3);
    }
    var h = 20;
    if (name) {
      var nw = textW(ctx, F_NAME, wName, name) + 14;
      pill(ctx, 0, -h - 9, nw, 16, '#ffffff');
      ctx.font = F_NAME; ctx.fillStyle = INK; ctx.fillText(name, 0, -h - 8.5);
      h += 20;
    }
    ctx.restore();
    return cy - (h + 4) * s;
  }

  /* ------------------------------------------------------------------ *
   * The stand. Drawn in stand units: origin on the ground under the middle of the counter, y up negative.
   * Its look comes from state.custom.stand (DATA.custom.stand options); the crew juice and pour in step with state.today.
   * ------------------------------------------------------------------ */
  var CUS = DATA.custom && DATA.custom.stand, DEF_LOOK = null, NOUP = {}, COL = {}, suitWave = 0;
  var WOOD = '#c98b55', SQZ = '#ffd83d', BAGEL = '"Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif', FIG = 'Figtree, system-ui, sans-serif';
  var BALLOON = ['#ff6257', '#4cc3f0', '#ffd83d'], FLAG = ['#ff6257', '#ffd83d', '#35c977', '#4cc3f0', '#ff5d8f'];
  var BULB = ['#fff4b8', '#ffd83d', '#ff9f43', '#ff8fb3', '#8fd3ff'], BLOOM = ['#ff5d8f', '#ffffff', '#ff9f43', '#b9a2ff'];
  var SLICES = [[-80, -56], [-62, -14], [-30, -66], [-18, -12], [14, -64], [24, -14], [64, -8], [82, -50]];
  function standLook(st) {
    return (st && st.custom && st.custom.stand) || DEF_LOOK || (DEF_LOOK = DATA.customDefaults ? DATA.customDefaults().stand : { decor: [] });
  }
  function opt(slot, id) { var list = CUS && CUS[slot]; return (list && id && DATA.byId(list, id)) || null; }
  function has(look, id) { return !!(look.decor && look.decor.indexOf(id) >= 0); }
  var shadeMap = new Map();
  /** a hex colour mixed toward white (k > 0) or black (k < 0); cached, the same few are asked for every frame */
  function shadeHex(hex, k) {
    var key = hex + k, v = shadeMap.get(key);
    if (v) return v;
    var n = parseInt(String(hex).slice(1, 7), 16) || 0, to = k < 0 ? 0 : 255, a = Math.abs(k);
    function c(x) { return Math.round(x + (to - x) * a); }
    v = 'rgb(' + c(n >> 16 & 255) + ',' + c(n >> 8 & 255) + ',' + c(n & 255) + ')';
    if (shadeMap.size > 300) shadeMap.clear();
    shadeMap.set(key, v);
    return v;
  }
  var fits = new Map();
  /** sets ctx.font to the biggest size up to `max` that fits txt in maxW (measured once per text and font) */
  function fitText(ctx, txt, pre, fam, max, maxW) {
    var k = pre + max + fam + '|' + maxW + '|' + txt, px = fits.get(k);
    if (px == null) {
      ctx.font = pre + max + 'px ' + fam;
      var w = ctx.measureText(txt).width;
      px = w > maxW ? Math.max(5, Math.floor(max * maxW / w * 4) / 4) : max;
      if (fits.size > 200) fits.clear();
      fits.set(k, px);
    }
    ctx.font = pre + px + 'px ' + fam;
    return px;
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { fits.clear(); });
  var glows2 = {};
  /** a soft round glow, painted once per colour ('r,g,b') */
  function glowAt(ctx, x, y, r, rgb, a) {
    if (!(a > 0.01)) return;
    var c = glows2[rgb];
    if (!c) {
      c = glows2[rgb] = document.createElement('canvas'); c.width = c.height = 64;
      var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + rgb + ',.85)'); gr.addColorStop(0.4, 'rgba(' + rgb + ',.3)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
    var ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';                         // additive, like the street lamps, so the night grade does not swallow it
    ctx.globalAlpha = ga * Math.min(1, a); ctx.drawImage(c, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
  }
  function pip(ctx, x, y, r, fill, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(); } }
  function inked(ctx, fill, lw) { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(); }
  function lemonShape(ctx, x, y, rx, ry, rot, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); inked(ctx, fill || SQZ, 2);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(x - rx * 0.35, y - ry * 0.35, rx * 0.3, ry * 0.22, rot, 0, TAU); ctx.fill();
  }

  /* Props on the ground beside the counter, packed outward from each end. The right side stops short of Dex (dl) and of
     the screen edge (vr), so whatever does not fit there goes left (behind the line); the cooler tucks in at the front. */
  var PROP_W = { costume: 58, cutout: 48, cooler: 46, sandwich: 60, speaker: 34, plant: 34, menu: 42 };
  var RIGHT = ['costume', 'cutout', 'cooler', 'sandwich'], LEFT = ['speaker', 'sandwich', 'costume', 'cutout', 'plant', 'menu'];
  var props = { tuck: false };
  function placeProps(up, look, dl, vr) {
    var r = 104, l = -116, lim = Math.min(dl + 6, vr), i, id, w, on = props;
    on.costume = has(look, 'costume'); on.cutout = has(look, 'cutout'); on.cooler = !!up.cooler; on.sandwich = (up.sign | 0) >= 2;
    on.speaker = !!up.speaker; on.plant = has(look, 'plant'); on.menu = has(look, 'menu');
    for (id in PROP_W) props[id + 'X'] = null;
    for (i = 0; i < RIGHT.length; i++) {
      id = RIGHT[i]; w = PROP_W[id];
      if (on[id] && r + w <= lim && (id !== 'cooler' || dl >= 157)) { props[id + 'X'] = r; r += w + 2; }
    }
    props.tuck = on.cooler && props.coolerX == null;
    for (i = 0; i < LEFT.length; i++) {
      id = LEFT[i]; w = PROP_W[id];
      if (on[id] && props[id + 'X'] == null) { props[id + 'X'] = l - w; l -= w + 6; }
    }
    return props;
  }

  function stripesIn(ctx, x0, w, y0, h) {
    ctx.fillStyle = '#ffffff';
    for (var i = x0 - h; i < x0 + w; i += 26) { ctx.beginPath(); ctx.moveTo(i, y0 + h); ctx.lineTo(i + 13, y0 + h); ctx.lineTo(i + 13 + h, y0); ctx.lineTo(i + h, y0); ctx.closePath(); ctx.fill(); }
  }
  function grainIn(ctx, x0, w, y0, h, col) {
    ctx.strokeStyle = shadeHex(col, -0.22); ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath();
    for (var y = y0 + 18; y < y0 + h - 4; y += 18) { ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); }
    for (var i = 0, gy = y0 + 7; gy < y0 + h; i++, gy += 9) {
      var gx = x0 + 10 + ((i * 37) % Math.max(20, w - 50));
      ctx.moveTo(gx, gy); ctx.bezierCurveTo(gx + 12, gy - 3, gx + 22, gy + 3, gx + 34, gy);
    }
    ctx.stroke();
  }
  function slice(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); inked(ctx, '#fff4b8', 1.6);
    ctx.beginPath(); ctx.arc(x, y, r * 0.76, 0, TAU); ctx.fillStyle = '#ffe066'; ctx.fill();
    ctx.strokeStyle = '#fff4b8'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (var i = 0; i < 6; i++) { var a = i * TAU / 6; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.76, y + Math.sin(a) * r * 0.76); }
    ctx.stroke();
  }

  /** the counter body, its paint and pattern, the top, and the tier extras (plank lines, wheels, bulbs) */
  function counter(ctx, env, up, tier, c) {
    var hw = W.STAND_W / 2, i;
    box(ctx, -hw, -72, W.STAND_W, 72, 8, c.body);
    if (c.pattern) {
      ctx.save(); rr(ctx, -hw, -72, W.STAND_W, 72, 8); ctx.clip();
      if (c.pattern === 'stripes') stripesIn(ctx, -hw, W.STAND_W, -72, 72);
      else if (c.pattern === 'wood') grainIn(ctx, -hw, W.STAND_W, -72, 72, c.body);
      else for (i = 0; i < SLICES.length; i++) slice(ctx, SLICES[i][0], SLICES[i][1], 8);
      ctx.restore(); rr(ctx, -hw, -72, W.STAND_W, 72, 8); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    }
    box(ctx, -hw - 8, -82, W.STAND_W + 16, 14, 6, c.lip);
    if ((up.stand | 0) === 0 && !c.pattern) { ctx.strokeStyle = c.trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-hw + 30, -66); ctx.lineTo(-hw + 30, -4); ctx.moveTo(hw - 38, -66); ctx.lineTo(hw - 38, -4); ctx.stroke(); }
    if ((up.stand | 0) >= 3) {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-hw + 26, 0, 15, 0, TAU); ctx.arc(hw - 26, 0, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9cde6'; ctx.beginPath(); ctx.arc(-hw + 26, 0, 6, 0, TAU); ctx.arc(hw - 26, 0, 6, 0, TAU); ctx.fill();
      for (var b = 0; b < 9; b++) { ctx.fillStyle = (Math.floor(env.t * 3) + b) % 2 ? '#fff4b8' : '#ffd83d'; ctx.beginPath(); ctx.arc(-hw + 10 + b * 20, -75, 3.5, 0, TAU); ctx.fill(); }
    }
  }

  /** the shade: full awning on posts (stand or awning upgrade 2+), the umbrella (awning 1), or, with neither, a small
      canopy only when a custom awning was picked. Returns where strings (bunting, lights) hang: {x, y} or null */
  var hangAt = { x: 0, y: 0, poles: false };
  function shadeOf(ctx, env, up, look, c) {
    var hw = W.STAND_W / 2, aw = opt('awning', look.awning), cols = aw && aw.colors, i, sway = Math.sin(env.t * 1.6) * 3 * (env.wind || 0);
    if ((up.awning | 0) >= 2 || (up.stand | 0) >= 2) {
      box(ctx, -hw + 2, -196, 7, 120, 3, c.post); box(ctx, hw - 9, -196, 7, 120, 3, c.post);
      for (i = 0; i < 8; i++) {
        var ax = -hw - 14 + i * ((W.STAND_W + 28) / 8), pw = (W.STAND_W + 28) / 8;
        ctx.beginPath(); ctx.moveTo(ax, -214); ctx.lineTo(ax + pw, -214); ctx.lineTo(ax + pw + sway, -184); ctx.arc(ax + pw / 2 + sway, -184, pw / 2, 0, Math.PI); ctx.closePath();
        inked(ctx, cols ? cols[i % cols.length] : i % 2 ? '#ffffff' : (up.awning | 0) >= 2 ? '#ff6257' : '#ffd83d', 3);
      }
      hangAt.x = hw + 8; hangAt.y = -186; hangAt.poles = false;
      return hangAt;
    }
    if (up.awning) {
      box(ctx, 62, -216, 6, 140, 3, '#c9cde6');
      for (var j = 0; j < 6; j++) { ctx.beginPath(); ctx.moveTo(65, -222); ctx.arc(65, -206, 92, Math.PI + j * Math.PI / 6, Math.PI + (j + 1) * Math.PI / 6); ctx.closePath(); inked(ctx, cols ? cols[j % cols.length] : j % 2 ? '#ffffff' : '#ff5d8f', 3); }
    } else if (cols) {
      box(ctx, -hw + 4, -186, 6, 106, 3, c.post); box(ctx, hw - 10, -186, 6, 106, 3, c.post);
      box(ctx, -hw - 8, -200, W.STAND_W + 16, 14, 5, cols[0]);
      for (i = 0; i < 10; i++) {
        var sx = -hw - 8 + i * (W.STAND_W + 16) / 10, sw2 = (W.STAND_W + 16) / 10;
        ctx.beginPath(); ctx.moveTo(sx, -187); ctx.lineTo(sx + sw2, -187); ctx.arc(sx + sw2 / 2, -187, sw2 / 2, 0, Math.PI); ctx.closePath();
        inked(ctx, cols[(i + 1) % cols.length], 2.5);
      }
      hangAt.x = hw + 4; hangAt.y = -180; hangAt.poles = false;
      return hangAt;
    }
    hangAt.x = hw - 3; hangAt.y = -176; hangAt.poles = true;            // no shade to hang from: two thin poles
    return hangAt;
  }

  function strung(ctx, x0, x1, y, sag) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + 2 * sag, x1, y); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke(); }
  function bunting(ctx, env, hx, y) {
    var n = Math.max(5, Math.round(hx * 2 / 15)), sag = 9, wind = env.wind || 0, i;
    strung(ctx, -hx, hx, y, sag);
    for (i = 0; i < n; i++) {
      var u = (i + 0.5) / n, x = -hx + 2 * hx * u, yy = y + 4 * sag * u * (1 - u), fl = env.reduced ? 0 : Math.sin(env.t * 4 + i * 1.3) * (0.8 + 2 * Math.abs(wind));
      ctx.beginPath(); ctx.moveTo(x - 5.5, yy); ctx.lineTo(x + 5.5, yy); ctx.lineTo(x + fl + wind * 3, yy + 12); ctx.closePath();
      ctx.lineJoin = 'round'; inked(ctx, FLAG[i % FLAG.length], 1.8);
    }
  }
  function fairyLights(ctx, env, hx, y, night) {
    var n = Math.max(6, Math.round(hx * 2 / 13)), sag = 13, i;
    if (night > 0.05) glowAt(ctx, 0, y + 30, hx * 1.35, '255,206,130', 0.45 * night);   // warm light spilling over the counter
    strung(ctx, -hx, hx, y, sag);
    for (i = 0; i < n; i++) {
      var u = (i + 0.5) / n, x = -hx + 2 * hx * u, yy = y + 4 * sag * u * (1 - u) + 3, col = BULB[i % BULB.length];
      var tw = env.reduced ? 1 : 0.7 + 0.3 * Math.sin(env.t * 3 + i * 2.1);
      if (night > 0.05) glowAt(ctx, x, yy + 2, 17, hexRgb(col), 1.3 * night * tw);
      ctx.fillStyle = INK; ctx.fillRect(x - 1.5, yy - 2.5, 3, 3);
      ctx.beginPath(); ctx.ellipse(x, yy + 2.5, 2.6, 3.4, 0, 0, TAU); inked(ctx, night > 0.3 ? '#ffffff' : col, 1.3);
      if (night > 0.3) { ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(x, yy + 2.5, 1.6, 2.4, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }
  function balloons(ctx, env) {
    var kx = -W.STAND_W / 2 - 6, ky = -76, w = env.wind || 0, i;
    for (i = 0; i < 3; i++) {
      var bob = env.reduced ? 0 : Math.sin(env.t * 1.6 + i * 2.1) * 4, sway = w * 12 + (env.reduced ? 0 : Math.sin(env.t * 0.9 + i * 1.7) * 3);
      var x = -122 - i * 15 + sway, y = [-178, -200, -168][i] + bob;
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.quadraticCurveTo(kx - 14 + sway * 0.4, (ky + y) / 2, x, y + 14); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 3, y + 16); ctx.lineTo(x + 3, y + 16); ctx.lineTo(x, y + 11); ctx.closePath(); inked(ctx, BALLOON[i], 1.5);
      ctx.beginPath(); ctx.ellipse(x, y, 10.5, 13, 0, 0, TAU); inked(ctx, BALLOON[i], 2.5);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(x - 4, y - 5, 2.4, 4, 0.4, 0, TAU); ctx.fill();
    }
  }
  function flowerBoxes(ctx, env, up) {
    var wheels = (up.stand | 0) >= 3, w = wheels ? 36 : 48, xs = wheels ? [-44, 8] : [-86, 38], i, j;
    for (i = 0; i < 2; i++) {
      for (j = 0; j < 4; j++) {
        var fx = xs[i] + 6 + j * (w - 12) / 3, sw = env.reduced ? 0 : Math.sin(env.t * 2 + j + i * 3) * (0.8 + 2 * Math.abs(env.wind || 0)), fy = -23 - (j % 2) * 5;
        ctx.strokeStyle = '#1c9655'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(fx, -12); ctx.lineTo(fx + sw, fy); ctx.stroke();
        ctx.beginPath(); ctx.arc(fx + sw, fy, 4.4, 0, TAU); inked(ctx, BLOOM[(i * 4 + j) % BLOOM.length], 1.8);
        ctx.fillStyle = SQZ; ctx.beginPath(); ctx.arc(fx + sw, fy, 1.7, 0, TAU); ctx.fill();
      }
      box(ctx, xs[i], -15, w, 15, 4, '#a8672e');
      ctx.strokeStyle = 'rgba(27,31,59,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xs[i] + 4, -8); ctx.lineTo(xs[i] + w - 4, -8); ctx.stroke();
    }
  }
  function crate(ctx, x, w, h) {
    box(ctx, x - w / 2, -h, w, h, 4, WOOD);
    ctx.strokeStyle = shadeHex(WOOD, -0.25); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - w / 2 + 4, -h / 2); ctx.lineTo(x + w / 2 - 4, -h / 2); ctx.stroke();
  }
  function showcase(ctx) {
    var x = 8, i;
    for (i = 0; i < 7; i++) lemonShape(ctx, x - 20 + (i % 4) * 13 + (i >= 4 ? 6 : 0), -19 - (i >= 4 ? 6 : 0), 7, 5.4, (i % 3 - 1) * 0.3);
    crate(ctx, x, 58, 17);
    box(ctx, x - 14, -14, 28, 10, 3, '#fff4b8');
    ctx.font = '900 7px ' + FIG; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText('FRESH', x, -8.7);
  }
  function lemonTree(ctx, env, x) {
    var c = x + PROP_W.plant / 2, sw = (env.reduced ? 0 : Math.sin(env.t * 1.3) * 1.5) + (env.wind || 0) * 3, i;
    limb(ctx, c, -24, c + sw, -66, 4, '#8a5a3a');
    var blobs = [[-11, -70, 14], [11, -72, 14], [0, -86, 16]];
    ctx.beginPath(); for (i = 0; i < 3; i++) { ctx.moveTo(c + sw + blobs[i][0] + blobs[i][2], blobs[i][1]); ctx.arc(c + sw + blobs[i][0], blobs[i][1], blobs[i][2], 0, TAU); }
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.fillStyle = '#35c977'; ctx.fill();
    ctx.fillStyle = '#5fdc93'; ctx.beginPath(); ctx.arc(c + sw - 4, -90, 7, 0, TAU); ctx.fill();
    lemonShape(ctx, c + sw - 12, -66, 4.4, 3.5, 0.3); lemonShape(ctx, c + sw + 9, -78, 4.4, 3.5, -0.2);
    lemonShape(ctx, c + sw + 13, -64, 4.4, 3.5, 0.5); lemonShape(ctx, c + sw - 3, -82, 4.4, 3.5, 0);
    ctx.beginPath(); ctx.moveTo(c - 14, -22); ctx.lineTo(c + 14, -22); ctx.lineTo(c + 10, 0); ctx.lineTo(c - 10, 0); ctx.closePath(); inked(ctx, '#d9773a', 3);
    box(ctx, c - 16, -27, 32, 7, 3, '#e98b4a');
  }
  function menuBoard(ctx, x, st, fl) {
    var c = x + PROP_W.menu / 2;
    limb(ctx, c - 12, 0, c - 5, -72, 3, WOOD); limb(ctx, c + 12, 0, c + 5, -72, 3, WOOD);
    box(ctx, c - 20, -80, 40, 46, 4, WOOD); box(ctx, c - 16, -76, 32, 38, 2, '#28352f');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '8px ' + BAGEL; ctx.fillStyle = '#fff4b8'; ctx.fillText('MENU', c, -69);
    fitText(ctx, fl.name || 'Lemonade', '800 ', FIG, 6.5, 28); ctx.fillStyle = '#f4f6ff'; ctx.fillText(fl.name || 'Lemonade', c, -59);
    ctx.font = '900 10px ' + FIG; ctx.fillStyle = SQZ; ctx.fillText(SS.fmtMoney(st ? st.price : 1), c, -47);
    ctx.strokeStyle = 'rgba(244,246,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c - 10, -64); ctx.lineTo(c + 10, -64); ctx.stroke();
  }
  function cutout(ctx, env, x) {
    var c = x + PROP_W.cutout / 2, rot = (env.reduced ? 0 : Math.sin(env.t * 1.2) * 0.03) + (env.wind || 0) * 0.05;
    ctx.beginPath(); ctx.moveTo(c + 2, -46); ctx.lineTo(c + 16, 0); ctx.lineTo(c + 10, 0); ctx.closePath(); inked(ctx, '#a8672e', 2);
    if (SS.Mascot && SS.Mascot.sprite && SS.Mascot.sprite(56)) SS.Mascot.draw(ctx, c, -50, 58, { rot: rot });
    else { ctx.beginPath(); ctx.ellipse(c, -50, 24, 17, -0.35, 0, TAU); inked(ctx, SQZ, 3); }
    box(ctx, c - 13, -9, 26, 9, 3, WOOD);
  }

  /* Squeezy in person: a helper in the lemon suit beside the stand. Dances, waves when someone walks by (live.wave),
     and holds a sign pointing at the counter. face: -1 when standing right of the stand (turned toward it). */
  function costume(ctx, env, x, wave, face) {
    var c = x + PROP_W.costume / 2, t = env.t, red = env.reduced;
    var bob = red ? 0 : Math.abs(Math.sin(t * 4)) * 4, lean = red ? 0 : Math.sin(t * 2) * 0.08, lift = red ? 0 : Math.max(0, Math.sin(t * 4)) * 6;
    ctx.save(); ctx.translate(c, 0); ctx.scale(face, 1);
    limb(ctx, -7, -30, -9, -4 - lift, 8, '#2f3a6b'); limb(ctx, 7, -30, 9, -4 - (red ? 0 : Math.max(0, -Math.sin(t * 4)) * 6), 8, '#2f3a6b');
    box(ctx, -18, -9 - lift, 16, 8, 4, '#ffffff'); box(ctx, 3, -9 - (red ? 0 : Math.max(0, -Math.sin(t * 4)) * 6), 16, 8, 4, '#ffffff');
    ctx.rotate(lean); ctx.translate(0, -bob);
    // sign arm (toward the stand) and its stick, then the waving arm
    var wv = red ? 1 : wave, wa = wv * (0.5 + 0.5 * Math.sin(t * 10)), hx = -20 - 6 * wa * (red ? 0 : 1), hy = -60 - 34 * wv;
    var pump = (1 - wv) * (red ? 0 : Math.abs(Math.sin(t * 4)) * 14);
    limb(ctx, 12, -56, 24, -46, 7, SQZ); pip(ctx, 24, -46, 5, '#ffffff', 2);
    limb(ctx, 26, -40, 26, -104, 3, '#8a5a3a');
    ctx.save(); ctx.translate(26, -112); ctx.rotate(-lean * 1.5); ctx.scale(face, 1);   // the sign reads the right way round; its arrow points at the stand
    box(ctx, -22, -11, 44, 22, 4, '#ffffff');
    ctx.font = '900 8.5px ' + FIG; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff6257'; ctx.fillText('FRESH!', -face * 4, 0.5);
    ctx.beginPath(); ctx.moveTo(face * 18, 0); ctx.lineTo(face * 12, -4); ctx.lineTo(face * 12, 4); ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
    ctx.restore();
    box(ctx, -16, -64, 32, 38, 13, SQZ);
    ctx.fillStyle = '#f2ae00'; ctx.beginPath(); ctx.ellipse(0, -34, 11, 4, 0, 0, Math.PI); ctx.fill();
    limb(ctx, -12, -56, hx, hy + pump, 7, SQZ); pip(ctx, hx, hy + pump, 5.5, '#ffffff', 2);
    if (SS.Mascot && SS.Mascot.sprite && SS.Mascot.sprite(64)) SS.Mascot.draw(ctx, 0, -82, 66, { rot: red ? 0 : Math.sin(t * 4 + 1) * 0.06 });
    else { ctx.beginPath(); ctx.ellipse(0, -82, 28, 19, -0.3, 0, TAU); inked(ctx, SQZ, 3); }
    ctx.restore();
  }

  /** the board on the counter front: the stand's name in the chosen sign style, fitted to the board */
  function signBoard(ctx, env, look, up, night) {
    var kind = look.sign || 'classic', name = String(look.name || 'LEMONADE'), x = -78, y = -60, w = 116, h = 32, cx = -20, cy = -43, maxW = 104, i;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (kind === 'chalk') {
      box(ctx, x, y, w, h, 5, WOOD); box(ctx, x + 4, y + 4, w - 8, h - 8, 3, '#28352f');
      fitText(ctx, name, '', BAGEL, 15, maxW - 8); ctx.fillStyle = 'rgba(244,246,255,.92)'; ctx.fillText(name, cx, cy);
      ctx.strokeStyle = 'rgba(255,216,61,.75)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx - 26, cy + 8); ctx.quadraticCurveTo(cx, cy + 11, cx + 26, cy + 8); ctx.stroke();
    } else if (kind === 'wood') {
      box(ctx, x, y, w, h, 4, WOOD);
      ctx.save(); rr(ctx, x, y, w, h, 4); ctx.clip(); grainIn(ctx, x, w, y - 12, h + 12, WOOD); ctx.restore();
      pip(ctx, x + 5, y + 5, 1.6, INK, 0); pip(ctx, x + w - 5, y + 5, 1.6, INK, 0); pip(ctx, x + 5, y + h - 5, 1.6, INK, 0); pip(ctx, x + w - 5, y + h - 5, 1.6, INK, 0);
      fitText(ctx, name, '', BAGEL, 17, maxW - 8);
      ctx.fillStyle = '#f6d29b'; ctx.fillText(name, cx, cy + 1.2); ctx.fillStyle = '#5a3a22'; ctx.fillText(name, cx, cy);
    } else if (kind === 'marquee') {
      box(ctx, x, y, w, h, 6, '#d83a30');
      var step = Math.floor(env.t * 5), n = 0;
      for (i = 0; i < 11; i++) {
        for (var e = 0; e < 2; e++) {
          var bx = x + 6 + i * (w - 12) / 10, by = e ? y + h - 4 : y + 4, lit = env.reduced || (n + step) % 3 !== 0;
          if (lit && night > 0.05) glowAt(ctx, bx, by, 11, '255,228,140', 1.2 * night);
          pip(ctx, bx, by, 2.4, lit ? '#fff4b8' : '#a8672e', 1); n++;
        }
      }
      fitText(ctx, name, '', BAGEL, 15, maxW - 10); ctx.fillStyle = '#fff4b8'; ctx.fillText(name, cx, cy + 0.5);
    } else if (kind === 'neon') {
      if (night > 0.05) glowAt(ctx, cx, cy, 80, '255,93,143', 0.55 * night);
      box(ctx, x, y, w, h, 7, '#232744');
      fitText(ctx, name, 'italic 900 ', FIG, 19, maxW - 6);
      var on = night > 0.3 ? 1 : 0.55;
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,93,143,' + (0.35 * on) + ')'; ctx.lineWidth = 5; ctx.strokeText(name, cx, cy);
      ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 2.2; ctx.strokeText(name, cx, cy);
      ctx.fillStyle = on > 0.9 ? '#ffe3ee' : '#ffb3cc'; ctx.fillText(name, cx, cy);
    } else if (kind === 'squeezy') {
      box(ctx, x, y, w, h, 16, SQZ);
      ctx.strokeStyle = '#35c977'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 22, y + h - 5); ctx.lineTo(x + w - 10, y + h - 5); ctx.stroke();
      fitText(ctx, name, '', BAGEL, 16, maxW - 34); ctx.fillStyle = INK; ctx.fillText(name, cx + 14, cy - 1);
      if (SS.Mascot && SS.Mascot.sprite && SS.Mascot.sprite(40)) SS.Mascot.draw(ctx, x + 6, cy - 2, 44, { rot: env.reduced ? 0 : Math.sin(env.t * 2) * 0.06 });
      else { ctx.beginPath(); ctx.arc(x + 6, cy - 2, 15, 0, TAU); inked(ctx, SQZ, 3); }
    } else {
      box(ctx, x, y, w, h, 6, (up.sign | 0) >= 1 || (up.stand | 0) >= 1 ? '#fff4b8' : '#ffffff');
      fitText(ctx, name, '', BAGEL, 17, maxW); ctx.fillStyle = INK; ctx.fillText(name, cx, cy);
    }
  }

  function cupAt(ctx, x, y, fill, col, straw) {          // a stand cup, bottom centre at (x, y), with Squeezy's sticker
    ctx.beginPath(); ctx.moveTo(x - 7.5, y - 18); ctx.lineTo(x + 7.5, y - 18); ctx.lineTo(x + 5.5, y); ctx.lineTo(x - 5.5, y); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    if (fill > 0.01) {
      ctx.save(); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(x - 9, y - 16.5 * fill, 18, 16.5 * fill); ctx.restore();
      ctx.beginPath(); ctx.moveTo(x - 7.5, y - 18); ctx.lineTo(x + 7.5, y - 18); ctx.lineTo(x + 5.5, y); ctx.lineTo(x - 5.5, y); ctx.closePath();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y - 8, 3.2, 2.4, -0.4, 0, TAU); inked(ctx, SQZ, 1.1);
    ctx.fillStyle = '#35c977'; ctx.beginPath(); ctx.arc(x + 2.6, y - 10.4, 1.2, 0, TAU); ctx.fill();
    if (straw) { ctx.strokeStyle = '#ff6257'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + 2, y - 12); ctx.lineTo(x + 5, y - 25); ctx.stroke(); }
  }

  /* ---- the crew, the juicer and the pitcher ------------------------------------------------------------------
     Everything follows state.today: pitcher.brew (0..1) drives the juicing cycle (a few lemons a batch: pick one up,
     cut it, load it, press it, then ice), serving.p drives the pour and the hand-over. Positions are stand units. */
  var VENDOR = { skin: '#f2c29b', hair: '#a8672e', style: 'pony', wear: 'tee', legs: 'trousers', shirt: '#ffd83d', shirt2: '#fff4b8', pants: '#2f3a6b',
    shoe: '#ffffff', eye: 0, glasses: null, freckles: true, blush: true, s: 0.86, apron: '#ffffff', cap: SQZ };
  var HELPER = { skin: '#b07a4f', hair: '#2b2118', style: 'crop', wear: 'tee', legs: 'trousers', shirt: '#35c977', shirt2: '#f4f6ff', pants: '#2f3a6b',
    shoe: '#ffffff', eye: 1, glasses: null, freckles: false, blush: true, s: 0.78, apron: '#ffffff', cap: SQZ };
  var V_FEET = -50, H_FEET = -45, TOP = -82, LEMONS = [2, 3, 3, 4];
  var JCOL = ['#ff6257', '#ff6257', '#f4f6ff', '#c9cde6'];
  // where things stand this frame (layout() fills it from the upgrades and the look)
  var LAY = { f: 1, flip: false, pw: 28, ph: 38, px: 0, rim: -120, jl: 0, jw: 0, jx: 0, T: -136, ox: 0, oy: 0, home: -10, brew: 40, cx: -62, hx: -62, bell: 58, tip: 80, stack: -86 };
  // the scene's followers (smoothed so nothing pops when the sim jumps: a tap, the end of a batch, a new customer)
  var RIG = { vx: 36, face: -1, vb: -1, lvl: 0.85, tx: null, tf: -1 }, IDLE = { vx: 36, face: -1, vb: -1, lvl: 0.85 };
  // this frame's pose: hands, props and streams
  var PO = { vfx: 0, vfy: 0, vbx: 0, vby: 0, vbob: 0, hfx: 0, hfy: 0, hbx: 0, hby: 0, hbob: 0, bx: 0, by: 0, a: 0, lvl: 0,
    cup: false, cupX: 0, cupY: 0, fill: 0, lem: 0, lx: 0, ly: 0, gap: 0, sq: 0, ls: 1, knife: false, kx: 0, ky: 0,
    pr: 0, run: false, stream: 0, drip: false, pour: false, sx: 0, sy: 0, ring: -1, ice: 0 };
  var ICE = [{ x: 0, y: 0, s: -1 }, { x: 0, y: 0, s: -1 }, { x: 0, y: 0, s: -1 }];
  var SPOUT = { x: 0, y: 0 }, GRIPPT = { x: 0, y: 0 };

  /* The juicer stands behind the pitcher with its press head over the mouth, so juice drops straight in and the
     vendor works from beside the pitcher (the right side; the left one when the layout is flipped) without walking. */
  function layout(up, look) {
    var f = look && look.layout === 'flipped' ? -1 : 1, pl = SS.clamp(up.pitcher | 0, 0, 3), jl = SS.clamp(up.juicer | 0, 0, 3);
    LAY.f = f; LAY.flip = f < 0; LAY.pw = 28 + pl * 5; LAY.ph = 34 + pl * 3; LAY.px = 0; LAY.rim = TOP - LAY.ph; LAY.jl = jl;
    LAY.jw = jl === 1 ? 10 : jl === 2 ? LAY.pw + 4 : jl === 3 ? LAY.pw + 6 : 0; LAY.jx = jl === 1 ? LAY.px - f * (LAY.pw / 2 + 3) : LAY.px; LAY.T = LAY.rim - 10; LAY.ox = LAY.px + f * 2; LAY.oy = LAY.rim - 5;
    LAY.home = LAY.brew = LAY.px + f * (LAY.pw / 2 + 18); LAY.cx = -62; LAY.hx = -70 * f;
    LAY.bell = LAY.flip ? 82 : 58; LAY.tip = LAY.flip ? -81 : 80; LAY.stack = LAY.flip ? 60 : -86;
    return LAY;
  }
  function ease(e) { e = SS.clamp(e, 0, 1); return e * e * (3 - 2 * e); }
  function seg(p, a, b) { return SS.clamp((p - a) / (b - a), 0, 1); }
  function rotPt(x, y, a, out) { var c = Math.cos(a), s = Math.sin(a); out.x = x * c - y * s; out.y = x * s + y * c; return out; }
  /** the hand press's knob (juicer 1) for press amount pr: a lever hinged on the far side of the press head */
  function knob(pr, out) {
    var hx = LAY.jx, hy = LAY.rim - 16, len = LAY.pw / 2 + 21, th = -0.32 + 0.4 * pr;
    out.x = hx + LAY.f * len * Math.cos(th); out.y = hy + len * Math.sin(th); return out;
  }
  var KN = { x: 0, y: 0 };

  /* Works out the pose for this frame. R: the followers (RIG live, IDLE in the preview). Sets PO.vxT, where the vendor
     wants to stand (the followers catch up next frame). */
  function posePlan(env, st, today, R, up) {
    var f = LAY.f, sv = today && today.serving, P = today && today.pitcher, vx = R.vx, t = env.t, i, e;
    var helps = !!up.helper && !LAY.flip;
    PO.lem = 0; PO.knife = false; PO.pr = 0; PO.run = false; PO.stream = 0; PO.drip = false; PO.pour = false; PO.cup = false; PO.ring = -1; PO.ice = 0;
    PO.iceN = st && st.recipe && !(st.recipe.ice > 0) ? 0 : 3;
    PO.bx = LAY.px; PO.by = TOP; PO.a = 0; PO.vbob = 0; PO.hbob = 0; PO.ls = 1; PO.sq = 0; PO.gap = 0; PO.vxT = LAY.home; PO.faceT = -1;
    var cd = R.face < 0 ? -1 : 1;                                     // the way the vendor faces right now
    PO.vfx = vx + cd * 14; PO.vfy = TOP - 3; PO.vbx = vx - cd * 6; PO.vby = TOP - 2;
    PO.hfx = LAY.hx - 14; PO.hfy = TOP - 3; PO.hbx = LAY.hx + 6; PO.hby = TOP - 2;
    var base = P ? SS.clamp(P.cups / Math.max(1, P.max), 0, 1) : 0.85, lvl = base;
    if (R.vb >= 0 && P) {
      var n = LEMONS[LAY.jl], q = Math.min(R.vb, 0.9999) * n, u = q - Math.floor(q), jl = LAY.jl, dir = -f;
      var hx = vx + dir * 16, hy = -104, dipx = vx + dir * 6, dipy = TOP + 16;
      var dx = jl === 3 ? LAY.jx : LAY.ox, dy = jl === 3 ? LAY.T - 30 : jl === 2 ? LAY.rim - 24 : LAY.rim - 21;    // where the halves go
      PO.faceT = dir; lvl = R.vb; PO.ring = P.brew;
      if (u < 0.18) {                                               // pick a lemon out of the crate under the counter
        e = u / 0.18;
        if (e < 0.5) { PO.vfx = SS.lerp(vx + dir * 14, dipx, ease(e * 2)); PO.vfy = SS.lerp(TOP - 3, dipy, ease(e * 2)); }
        else { PO.vfx = SS.lerp(dipx, hx, ease(e * 2 - 1)); PO.vfy = SS.lerp(dipy, hy, ease(e * 2 - 1)); PO.lem = 1; PO.lx = PO.vfx; PO.ly = PO.vfy - 5; }
        PO.vbx = SS.lerp(vx - dir * 6, vx - dir * 2, ease(e)); PO.vby = SS.lerp(TOP - 2, dipy, ease(e));
        if (e > 0.6) { PO.vbx = SS.lerp(vx - dir * 2, hx - dir * 2, ease((e - 0.6) / 0.4)); PO.vby = SS.lerp(dipy, -128, ease((e - 0.6) / 0.4)); PO.knife = true; }
      } else if (u < 0.36) {                                        // cut it in two
        e = (u - 0.18) / 0.18;
        PO.vfx = hx; PO.vfy = hy; PO.lx = hx; PO.ly = hy - 5; PO.lem = e < 0.5 ? 1 : 2; PO.gap = e < 0.5 ? 0 : 5 * ease((e - 0.5) * 2);
        PO.vbx = hx - dir * 2; PO.vby = e < 0.5 ? SS.lerp(-128, -108, Math.pow(e * 2, 2)) : SS.lerp(-108, -128, ease(e * 2 - 1)); PO.knife = true;
      } else if (u < 0.48) {                                        // load the press (by hand, or a toss into it)
        e = (u - 0.36) / 0.12;
        PO.vbx = SS.lerp(hx - dir * 2, vx - dir * 2, ease(e)); PO.vby = SS.lerp(-128, dipy, ease(e)); PO.knife = true;
        if (jl === 0) { PO.vfx = SS.lerp(hx, LAY.ox, ease(e)); PO.vfy = SS.lerp(hy, LAY.oy - 8, ease(e)) - 8 * Math.sin(Math.PI * e); PO.lem = 2; PO.gap = 5 * (1 - ease(e)); PO.lx = PO.vfx; PO.ly = PO.vfy - 5; }
        else {
          var fx2 = SS.lerp(hx, dx, 0.3);
          if (jl === 1) knob(0, KN); else { KN.x = jl === 3 ? LAY.jx + f * (LAY.jw / 2 + 2) : LAY.ox; KN.y = jl === 3 ? LAY.T + 4 : dy - 6; }
          if (e < 0.35) { PO.vfx = SS.lerp(hx, fx2, ease(e / 0.35)); PO.vfy = SS.lerp(hy, -120, ease(e / 0.35)); }
          else { PO.vfx = SS.lerp(fx2, KN.x, ease((e - 0.35) / 0.65)); PO.vfy = SS.lerp(-120, KN.y, ease((e - 0.35) / 0.65)); }
          PO.lem = 2;
          if (e < 0.3) { PO.gap = 5; PO.lx = PO.vfx; PO.ly = PO.vfy - 5; }
          else { var s2 = (e - 0.3) / 0.7; PO.gap = 5 * (1 - s2); PO.lx = SS.lerp(fx2, dx, s2); PO.ly = SS.lerp(-124, dy, s2) - 20 * Math.sin(Math.PI * s2); }
        }
      } else {                                                      // press (two pumps, or the turbo's run), then let go
        e = u < 0.92 ? (u - 0.48) / 0.44 : 1;
        var back = u < 0.92 ? 0 : ease((u - 0.92) / 0.08), px2, py2;
        PO.pr = jl === 3 ? 0.3 + 0.2 * Math.sin(t * 40) : Math.pow(Math.sin(Math.PI * ((e * 2) % 1)), 2);
        PO.run = jl >= 2 && e > 0.05 && e < 0.95 && back === 0;
        PO.lem = 2; PO.gap = jl === 3 ? 0 : 1.5; PO.sq = jl === 3 ? 0 : 0.25 + 0.5 * e; PO.ls = 1 - back;
        if (jl === 0) { px2 = LAY.ox; py2 = LAY.oy - 8 + 3 * PO.pr; PO.drip = PO.pr > 0.25 && back === 0; }
        else if (jl === 1) { knob(PO.pr, KN); px2 = KN.x; py2 = KN.y; PO.lx = dx; PO.ly = dy + 3 * PO.pr; PO.stream = PO.pr > 0.2 && back === 0 ? 2.4 : 0; }
        else if (jl === 2) { px2 = LAY.ox; py2 = dy - 6 + 3 * PO.pr; PO.lx = dx; PO.ly = dy; PO.stream = PO.run ? 3.2 : 0; }
        else { px2 = LAY.jx + f * (LAY.jw / 2 + 2); py2 = LAY.T + 4 + 2 * PO.pr; PO.lx = dx; PO.ly = dy + 10 * Math.min(1, e * 3); PO.ls = Math.max(0, 1 - e * 1.6); PO.stream = PO.run ? 4.6 : 0; }
        PO.vfx = SS.lerp(px2, vx + dir * 14, back); PO.vfy = SS.lerp(py2, TOP - 3, back);
        if (jl === 0) { PO.lx = PO.vfx; PO.ly = PO.vfy - 4; }
      }
      if (tapT > 0) {                                               // a tap slams the press
        var k = Math.sin(tapT / 0.22 * Math.PI);
        PO.pr = Math.max(PO.pr, k); PO.sq = Math.max(PO.sq, k * 0.8);
        if (jl === 1 && u >= 0.48) { knob(PO.pr, KN); PO.vfx = KN.x; PO.vfy = KN.y; }
      }
      if (PO.iceN) {                                                // ice plops in at the end of the batch
        for (i = 0; i < 3; i++) {
          var t0 = 0.78 + i * 0.055, s3 = (R.vb - t0) / 0.08, c = ICE[i];
          c.s = s3;
          if (s3 >= 0 && s3 < 1) {
            var x0 = vx - dir * 4, y0 = TOP + 12, x1 = LAY.px + (i - 1) * 7, y1 = TOP - LAY.ph * Math.max(lvl, 0.2) * 0.92;
            c.x = SS.lerp(x0, x1, s3); c.y = SS.lerp(y0, y1, s3) - 46 * Math.sin(Math.PI * s3 * 0.9);
          }
        }
        PO.ice = 1; PO.iceN = (ICE[0].s >= 1) + (ICE[1].s >= 1) + (ICE[2].s >= 1);
      }
    } else if (sv && P) {
      var p = SS.clamp(sv.p, 0, 1), qty = 1, cs = today.customers, A = -1.0, fill = ease((p - 0.27) / 0.47);
      for (i = 0; cs && i < cs.length; i++) if (cs[i].id === sv.id) { qty = cs[i].qty || 1; break; }
      lvl = Math.max(0, base - qty / Math.max(1, P.max) * fill);
      PO.cup = true; PO.fill = fill;
      var rise = ease(p / 0.12), give = ease((p - 0.86) / 0.14);
      PO.cupX = SS.lerp(LAY.cx, -104, give); PO.cupY = TOP + 22 * (1 - rise) - 14 * give;
      rotPt(-LAY.pw / 2 - 4, -LAY.ph + 1, A, SPOUT);                 // the pour pose: spout over the cup
      var b1x = LAY.cx + 1 - SPOUT.x, b1y = TOP - 26 - SPOUT.y, a = 0, bx = LAY.px, by = TOP;
      if (p >= 0.1 && p < 0.26) { e = ease(seg(p, 0.1, 0.26)); bx = SS.lerp(LAY.px, b1x, e); by = SS.lerp(TOP, b1y, e) - 16 * Math.sin(Math.PI * e); a = A * e; }
      else if (p >= 0.26 && p < 0.74) { bx = b1x; by = b1y; a = A - 0.18 * seg(p, 0.26, 0.74); }
      else if (p >= 0.74 && p < 0.86) { e = ease(seg(p, 0.74, 0.86)); bx = SS.lerp(b1x, LAY.px, e); by = SS.lerp(b1y, TOP, e) - 12 * Math.sin(Math.PI * e); a = (A - 0.18) * (1 - e); }
      PO.bx = bx; PO.by = by; PO.a = a;
      // held by the handle from the right, or by the body from the left (flipped)
      if (LAY.flip) rotPt(-LAY.pw / 2 - 1, -LAY.ph * 0.62, a, GRIPPT); else rotPt(LAY.pw / 2 + 9, -LAY.ph * 0.55, a, GRIPPT);
      GRIPPT.x += bx; GRIPPT.y += by;
      if (p < 0.86) {                                             // stand beside the handle, never behind the pitcher
        if (!LAY.flip) PO.vxT = Math.min(LAY.home, GRIPPT.x + 34);
        else { PO.vxT = Math.min(LAY.home, GRIPPT.x - 34); if (p >= 0.1) PO.faceT = 1; }   // flipped: step past the cup and face the pitcher
      }
      if (p < 0.1) { e = ease(p / 0.1); PO.vfx = SS.lerp(vx - 14, GRIPPT.x, e); PO.vfy = SS.lerp(TOP - 3, GRIPPT.y, e); }
      else if (p < 0.86) { PO.vfx = GRIPPT.x; PO.vfy = GRIPPT.y; }
      else if (!helps) {
        e = ease(seg(p, 0.86, 0.9)); PO.vfx = SS.lerp(GRIPPT.x, PO.cupX + 9, e); PO.vfy = SS.lerp(GRIPPT.y, PO.cupY - 9, e);
        PO.vxT = PO.cupX + 36;
      }
      if (p >= 0.27 && p < 0.74) { rotPt(-LAY.pw / 2 - 4, -LAY.ph + 1, a, SPOUT); PO.pour = true; PO.sx = SPOUT.x + bx; PO.sy = SPOUT.y + by; }
      if (helps) {
        if (p < 0.14) { PO.hfx = PO.cupX + 8; PO.hfy = PO.cupY - 8; }
        else if (p >= 0.84) { e = ease(seg(p, 0.84, 0.88)); PO.hfx = SS.lerp(LAY.hx - 14, PO.cupX + 8, e); PO.hfy = SS.lerp(TOP - 3, PO.cupY - 9, e); }
      }
    }
    PO.lvl = lvl;
    if (cheerT > 0 && R.vb < 0) {                                  // a sale: a little fist pump
      var ch = Math.sin(cheerT / 0.45 * Math.PI);
      PO.vbx = vx - cd * 8; PO.vby = -132 - 16 * ch; PO.vbob = ch * 3;
      if (up.helper) { PO.hbx = LAY.hx + 8; PO.hby = -122 - 16 * ch; PO.hbob = ch * 3; }
    }
    return PO;
  }

  function crewArm(ctx, l, x1, y1, x2, y2, w) {
    limb(ctx, x1, y1, x2, y2, w, l.skin);
    limb(ctx, x1, y1, x1 + (x2 - x1) * 0.4, y1 + (y2 - y1) * 0.4, w + 2, l.shirt);
    pip(ctx, x2, y2, w * 0.5 + 1.6, l.skin, 2.5);
  }
  /* A crew member behind the counter at x (feet at y `feet`, hidden by the counter), facing `face` (-1 left .. 1 right,
     squashing through 0 as they turn). The head comes from person(), clipped at the shoulders, so the crew match the
     characters; the torso, Squeezy apron and both arms are drawn here so the hands can reach the stand-unit targets. */
  function crew(ctx, l, x, feet, face, bob, breath, fx, fy, bx, by) {
    var H = W.CHAR_H * l.s, b = Math.sin(breath) * 1.2 + bob, sh = -0.74 * H - b, hip = -0.42 * H - b, tw = 0.14 * H;
    var sg = face < 0 ? -1 : 1, aw = 7 * (0.62 + 0.38 * Math.min(1, l.s));
    ctx.save(); ctx.translate(x, feet); ctx.scale(sg * Math.max(0.2, Math.abs(face)), 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    crewArm(ctx, l, -2, sh + 5, (bx - x) * sg, by - feet, aw);
    box(ctx, -tw, sh, tw * 2, hip - sh + 6, 0.08 * H, l.shirt);
    ctx.beginPath(); ctx.moveTo(-0.07 * H, sh + 0.09 * H); ctx.lineTo(-0.01 * H, sh); ctx.moveTo(0.11 * H, sh + 0.09 * H); ctx.lineTo(0.07 * H, sh);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    rr(ctx, -0.085 * H, sh + 0.08 * H, 0.21 * H, hip - sh + 0.06 * H, 0.035 * H); inked(ctx, l.apron, 2.5);
    pip(ctx, 0.02 * H, sh + 0.19 * H, 0.055 * H, '#ffffff', 2);
    ctx.beginPath(); ctx.ellipse(0.02 * H, sh + 0.19 * H, 0.034 * H, 0.025 * H, -0.4, 0, TAU); inked(ctx, SQZ, 1.2);
    ctx.save(); ctx.beginPath(); ctx.rect(-90, sh - 140, 180, 143); ctx.clip();
    person(ctx, l, { kind: 'vendor', hideLegs: true, mood: 1, breath: breath, bob: bob });
    ctx.restore();
    crewArm(ctx, l, 2, sh + 5, (fx - x) * sg, fy - feet, aw);
    ctx.restore();
  }

  /** the pitcher, bottom centre at (x, y), tilted by a; liquid level lvl 0..1 stays level as it tilts */
  function pitcher(ctx, env, x, y, a, lvl, col, ice, slosh) {
    var pw = LAY.pw, ph = LAY.ph;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    function shape() { rr(ctx, -pw / 2, -ph, pw, ph, 6); ctx.moveTo(-pw / 2 + 1, -ph + 2); ctx.lineTo(-pw / 2 - 5, -ph + 1); ctx.lineTo(-pw / 2 + 1, -ph + 9); }
    ctx.beginPath(); shape(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    ctx.save(); ctx.beginPath(); rr(ctx, -pw / 2, -ph, pw, ph, 6); ctx.clip(); ctx.rotate(-a);
    if (lvl > 0.003) {
      rotPt(0, -ph * lvl * 0.92, a, SPOUT);
      var sy = SPOUT.y, i, amp = env.reduced ? 0.6 : slosh;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-70, 70); ctx.lineTo(-70, sy);
      for (i = -6; i <= 6; i++) ctx.lineTo(i * 10, sy + Math.sin(env.t * 5 + i) * amp);
      ctx.lineTo(70, sy); ctx.lineTo(70, 70); ctx.closePath(); ctx.fill();
      if (ice && lvl > 0.08) {
        ctx.globalAlpha = Math.min(1, lvl * 6);
        for (i = 0; i < ice; i++) { rr(ctx, SPOUT.x + (i - 1) * 8.5 - 2.5, sy - 1 + [0.5, 2, -0.5][i] + Math.sin(env.t * 3 + i * 2) * 0.8, 5.5, 5, 1.5); ctx.fillStyle = 'rgba(235,250,255,.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(27,31,59,.35)'; ctx.lineWidth = 1.1; ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    ctx.beginPath(); shape(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(pw / 2 + 2, -ph * 0.55, 9, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-pw / 2 + 4, -ph + 6, 3, ph * 0.5);
    ctx.restore();
  }
  function halves(ctx, x, y, gap, sq, sc) {
    if (sc <= 0.02) return;
    var rx = 6.5 * sc * (1 + sq * 0.35), ry = 5.5 * sc * (1 - sq * 0.45);
    for (var i = -1; i <= 1; i += 2) {
      var cx = x + i * gap / 2;
      ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, i < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, i < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
      ctx.closePath(); inked(ctx, SQZ, 1.8);
      ctx.fillStyle = '#fff4b8'; ctx.beginPath(); ctx.ellipse(cx + i * 0.5, y, Math.max(0.5, rx * 0.18), ry * 0.78, 0, 0, TAU); ctx.fill();
    }
  }
  function knife(ctx, x, y, d) {
    ctx.save(); ctx.translate(x, y); ctx.scale(d, 1);
    box(ctx, -2.5, -9, 5, 9, 2, '#6b4a3a');
    ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.lineTo(3, 13); ctx.lineTo(-1.5, 9); ctx.closePath(); inked(ctx, '#e6e7ef', 1.8);
    ctx.restore();
  }
  function streamTo(ctx, env, x0, y0, x1, y1, w, col) {
    var wob = env.reduced ? 0 : Math.sin(env.t * 31) * 0.7;
    ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.2 + wob, (y0 + y1) / 2, x1 + wob, y1);
    ctx.strokeStyle = INK; ctx.lineWidth = w + 3; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  function droplet(ctx, x, y, r, col) { ctx.beginPath(); ctx.moveTo(x, y - r * 1.8); ctx.quadraticCurveTo(x + r, y - r * 0.3, x, y + r); ctx.quadraticCurveTo(x - r, y - r * 0.3, x, y - r * 1.8); inked(ctx, col, 1.3); }

  /** the juicer for upgrade level LAY.jl (0 = squeezed by hand), standing behind the pitcher with its head over the
      mouth; drawn before the pitcher. pr = press 0..1, run = motor on */
  function juicer(ctx, env, pr, run) {
    var jl = LAY.jl, f = LAY.f, x = LAY.jx, w = LAY.jw, rim = LAY.rim, ox = LAY.ox, i;
    var sh = run && !env.reduced ? Math.sin(env.t * 70) * (jl === 3 ? 1.1 : 0.45) : 0;
    if (!jl) return;
    ctx.save(); ctx.translate(sh, 0); ctx.lineJoin = 'round';
    if (jl === 1) {                                                // hand press: a red post, a cone over the mouth, a lever
      box(ctx, x - 5, rim - 18, 10, TOP - rim + 18, 3, JCOL[1]);
      limb(ctx, x, rim - 8, ox, rim - 8, 4, '#d83a30');
      ctx.beginPath(); ctx.moveTo(ox - 10, rim - 12); ctx.lineTo(ox + 10, rim - 12); ctx.lineTo(ox + 5, rim - 5); ctx.lineTo(ox - 5, rim - 5); ctx.closePath(); inked(ctx, '#f4f6ff', 2.2);
      ctx.beginPath(); ctx.moveTo(ox - 6, rim - 12); ctx.lineTo(ox, rim - 19); ctx.lineTo(ox + 6, rim - 12); ctx.closePath(); inked(ctx, '#fff4b8', 1.6);
      knob(pr, KN);
      var hy = rim - 16, mx = SS.lerp(x, KN.x, (ox - x) / (KN.x - x || 1)), my = SS.lerp(hy, KN.y, (ox - x) / (KN.x - x || 1));
      ctx.beginPath(); ctx.ellipse(mx, my + 4, 8, 4.5, 0, 0, Math.PI); ctx.closePath(); inked(ctx, '#ff6257', 2);
      limb(ctx, x, hy, KN.x, KN.y, 4, '#d83a30');
      pip(ctx, x, hy, 3, '#ff9f43', 1.8); pip(ctx, KN.x, KN.y, 4.5, INK, 0);
    } else if (jl === 2) {                                         // electric: a white base, a reamer that spins
      box(ctx, x - w / 2, rim - 8, w, TOP - rim + 8, 9, JCOL[2]);
      box(ctx, x - w / 2 + 2, rim - 12, w - 4, 7, 3.5, '#4cc3f0');
      pip(ctx, x + f * (w / 2 - 6), rim - 2, 2.4, run ? '#35c977' : '#9aa0bf', 1.2);
      var ry = rim - 12;
      ctx.save(); ctx.beginPath(); ctx.moveTo(ox - 9, ry); ctx.quadraticCurveTo(ox, ry - 17, ox + 9, ry); ctx.closePath(); ctx.fillStyle = '#fff4b8'; ctx.fill(); ctx.clip();
      ctx.strokeStyle = 'rgba(242,174,0,.85)'; ctx.lineWidth = 1.4; var sp = run && !env.reduced ? env.t * 18 : 0;
      ctx.beginPath(); for (i = 0; i < 4; i++) { var rx = ox - 10 + ((i * 5 + sp) % 20); ctx.moveTo(rx, ry); ctx.lineTo(rx + 2, ry - 14); } ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(ox - 9, ry); ctx.quadraticCurveTo(ox, ry - 17, ox + 9, ry); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      if (run && !env.reduced) { ctx.strokeStyle = 'rgba(27,31,59,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ox, ry - 6, 15, Math.PI * 1.1, Math.PI * 1.35); ctx.moveTo(ox + 15 * Math.cos(Math.PI * 1.65), ry - 6 + 15 * Math.sin(Math.PI * 1.65)); ctx.arc(ox, ry - 6, 15, Math.PI * 1.65, Math.PI * 1.9); ctx.stroke(); }
    } else {                                                       // turbo: chrome, a hopper, blinking lights, a big red button
      var T = LAY.T;
      box(ctx, x - w / 2, T, w, TOP - T, 7, JCOL[3]);
      ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillRect(x - w / 2 + 4, T + 3, 3, TOP - T - 8);
      for (i = 0; i < 3; i++) pip(ctx, x - 8 + i * 8, T + 5, 2.3, run && (Math.floor(env.t * 9) + i) % 2 ? ['#ff6257', '#ffd83d', '#35c977'][i] : '#6b7194', 1.1);
      ctx.beginPath(); ctx.arc(x + f * w / 2, T + 6, 6, f > 0 ? -Math.PI / 2 : Math.PI / 2, f > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.closePath(); inked(ctx, '#ff6257', 2.2);
    }
    ctx.restore();
  }
  function hopperFront(ctx, env, run) {                            // turbo's glass hopper, drawn over the lemons inside it
    var x = LAY.jx, T = LAY.T, sh = run && !env.reduced ? Math.sin(env.t * 70) * 1.1 : 0;
    ctx.beginPath(); ctx.moveTo(x - 15 + sh, T - 30); ctx.lineTo(x + 15 + sh, T - 30); ctx.lineTo(x + 6 + sh, T); ctx.lineTo(x - 6 + sh, T); ctx.closePath();
    ctx.fillStyle = 'rgba(205,238,255,.45)'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3 + sh, T - 22); ctx.lineTo(x + 3 + sh, T - 22); ctx.lineTo(x - 1 + sh, T - 15); ctx.lineTo(x + 4 + sh, T - 15); ctx.lineTo(x - 3 + sh, T - 5); ctx.lineTo(x - 1 + sh, T - 12); ctx.lineTo(x - 5 + sh, T - 12); ctx.closePath();
    ctx.fillStyle = run ? SQZ : 'rgba(255,216,61,.6)'; ctx.fill();
  }

  /* The crew behind the counter (drawn before the counter so it hides their legs and anything they reach down for). */
  function drawCrew(ctx, env, up, R, live) {
    var br = env.t * 2;
    if (up.helper) crew(ctx, HELPER, LAY.hx, H_FEET, -1, PO.hbob, br + 2, PO.hfx, PO.hfy, PO.hbx, PO.hby);
    crew(ctx, VENDOR, R.vx, V_FEET, R.face, PO.vbob, br, PO.vfx, PO.vfy, PO.vbx, PO.vby);
  }

  /* On the counter: the cups, bell, tip jar, juicer, pitcher, and whatever is in the crew's hands. */
  function drawCounterTop(ctx, env, st, up, fl, R) {
    var q, red = env.reduced;
    for (q = 0; q < 3; q++) cupAt(ctx, LAY.stack + q * 2.5, TOP - q * 4, 0, fl.color, false);
    ctx.save(); ctx.translate(LAY.bell, TOP); ctx.rotate(bellT > 0 ? Math.sin(bellT * 26) * 0.5 * bellT : 0);
    box(ctx, -7, -3, 14, 3, 1.5, '#c9cde6'); ctx.beginPath(); ctx.arc(0, -3, 9, Math.PI, 0); ctx.closePath(); inked(ctx, '#ffd83d', 2.5); pip(ctx, 0, -13, 2, INK, 0); ctx.restore();
    if (up.tipjar) {
      box(ctx, LAY.tip - 9, -106, 18, 24, 5, up.tipjar >= 2 ? '#ffd83d' : 'rgba(205,238,255,.8)');
      ctx.fillStyle = '#f2ae00'; ctx.fillRect(LAY.tip - 6, -92, 12, 7); pip(ctx, LAY.tip - 2, -94, 2.6, SQZ, 1.2);
    }
    if (LAY.jl !== 1) juicer(ctx, env, PO.pr, PO.run);
    var surf = TOP - LAY.ph * PO.lvl * 0.92;
    if (PO.stream) streamTo(ctx, env, LAY.ox, LAY.oy + 2, LAY.ox, surf, PO.stream, fl.color);
    pitcher(ctx, env, PO.bx, PO.by, PO.a, PO.lvl, fl.color, PO.iceN, R.vb >= 0 ? 2.6 : 1.2);
    // held and loaded lemons (anything below the counter top is behind the counter)
    ctx.save(); ctx.beginPath(); ctx.rect(-400, -600, 800, 600 + TOP + 1); ctx.clip();
    if (PO.lem === 1) lemonShape(ctx, PO.lx, PO.ly, 7, 5.6, 0.2);
    else if (PO.lem === 2) halves(ctx, PO.lx, PO.ly, PO.gap, PO.sq, PO.ls);
    if (PO.knife) knife(ctx, PO.vbx, PO.vby + 2, LAY.flip ? 1 : -1);
    if (PO.ice) for (q = 0; q < 3; q++) {
      var c = ICE[q];
      if (c.s >= 0 && c.s < 1) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.s * 4); rr(ctx, -4, -4, 8, 8, 2); ctx.fillStyle = 'rgba(225,246,255,.95)'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore(); }
      else if (c.s >= 1 && c.s < 1.7 && !red) {               // plop
        var k = (c.s - 1) / 0.7, sy = TOP - LAY.ph * PO.lvl * 0.92;
        for (var d = -1; d <= 1; d += 2) droplet(ctx, LAY.px + (q - 1) * 7 + d * (3 + k * 7), sy - 9 * Math.sin(Math.PI * k), 1.8 * (1 - k * 0.5), fl.color);
      }
    }
    ctx.restore();
    if (LAY.jl === 3) hopperFront(ctx, env, PO.run);
    if (PO.drip) { var dk = (env.t * 3) % 1; droplet(ctx, LAY.ox, SS.lerp(LAY.oy, surf - 2, dk), 2, fl.color); if (PO.pr > 0.6) droplet(ctx, LAY.ox + 3, SS.lerp(LAY.oy, surf - 2, (dk + 0.5) % 1), 1.6, fl.color); }
    if (tapT > 0 && R.vb >= 0) {                                   // a tap squirts juice out of the lemon
      var k2 = 1 - tapT / 0.22, ox = PO.lem ? (LAY.jl === 0 ? PO.vfx : PO.lx) : LAY.ox, oy = PO.lem ? (LAY.jl === 0 ? PO.vfy - 5 : PO.ly) : LAY.oy;
      for (q = 0; q < 5; q++) { var an = -Math.PI / 2 + (q - 2) * 0.5; droplet(ctx, ox + Math.cos(an) * 26 * k2, oy + Math.sin(an) * 22 * k2 + 30 * k2 * k2, 2.2 * (1 - k2 * 0.4), fl.color); }
    }
    if (PO.cup) {
      ctx.save(); ctx.beginPath(); ctx.rect(-400, -600, 800, 600 + TOP + 1); ctx.clip();
      if (PO.pour) streamTo(ctx, env, PO.sx, PO.sy, PO.cupX + 1, PO.cupY - Math.max(2, 16.5 * PO.fill), 3, fl.color);
      cupAt(ctx, PO.cupX, PO.cupY, PO.fill, fl.color, PO.fill >= 0.99);
      ctx.restore();
    }
    if (PO.ring >= 0) {                                    // batch progress, and a nudge to tap the stand
      var rx = LAY.px - LAY.f * (LAY.pw / 2 + 22), ry = LAY.rim - 40;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(27,31,59,.25)'; ctx.beginPath(); ctx.arc(rx, ry, 15, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#35c977'; ctx.beginPath(); ctx.arc(rx, ry, 15, -Math.PI / 2, -Math.PI / 2 + TAU * SS.clamp(PO.ring, 0, 1)); ctx.stroke();
      if (!red) { ctx.strokeStyle = 'rgba(255,216,61,' + (0.5 + 0.5 * Math.sin(env.t * 6)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(rx, ry, 22 + Math.sin(env.t * 6) * 2, 0, TAU); ctx.stroke(); }
    }
  }

  /** moves the scene's followers toward what the sim says is happening (dt real seconds, 0 while paused) */
  function stepRig(dt, st, up) {
    if (!(dt > 0)) return;
    var td = st && st.phase === 'day' ? st.today : null, sp = (st && st.settings && st.settings.speed) || 1, R = RIG;
    var b = td && td.pitcher && td.pitcher.brew != null ? td.pitcher.brew : -1;
    if (b < 0) R.vb = -1;
    else R.vb = R.vb < 0 || b < R.vb ? b : R.vb + (b - R.vb) * (1 - Math.exp(-dt * 22 * sp));
    R.vx += ((R.tx != null ? R.tx : LAY.home) - R.vx) * (1 - Math.exp(-dt * 16 * sp));
    var tf = R.tf || -1;
    R.face = tf > R.face ? Math.min(tf, R.face + dt * 8 * sp) : Math.max(tf, R.face - dt * 8 * sp);
  }

  /* dl = how far right of the stand's centre the dealer's left edge is (stand units); props on the right stop short of
     him, and the cooler tucks in at the front when he stands close. */
  function drawStand(ctx, view, env, st, dl) {
    var s = view.laneScale(W.STAND_LANE), x = view.toX(W.STAND_X), y = view.laneY(W.STAND_LANE);
    var squash = tapT > 0 ? Math.sin(tapT / 0.22 * Math.PI) * 0.06 : pokeT > 0 ? Math.sin(pokeT / 0.12 * Math.PI) * 0.03 : 0;
    shadow(ctx, x, y + 2 * s, 120, s);
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (1 + squash), s * (1 - squash));
    standRig(ctx, env, st, standLook(st), dl, (view.x1 - W.STAND_X) * view.scale / s, st && st.today, true);
    ctx.restore();
    if (props.costumeX != null && env.dt > 0) {             // the suit waves while someone walks past it
      var cs = st && st.today && st.today.customers, wx = W.STAND_X + (props.costumeX + PROP_W.costume / 2) * s / view.scale, near = 0, i;
      for (i = 0; cs && i < cs.length; i++) if (cs[i].state === 'walk' && Math.abs(cs[i].x - wx) < 110) { near = 1; break; }
      suitWave += (near - suitWave) * (1 - Math.exp(-env.dt * 4));
    }
  }

  /* The whole stand at the origin. today: the live day (null in the customise preview); live: the scene's own
     animation state may be read (false for the preview, which must not disturb the scene). */
  function standRig(ctx, env, st, look, dl, vr, today, live) {
    var up = (st && st.upgrades) || NOUP, tier = TIER[SS.clamp(up.stand | 0, 0, 3)], hw = W.STAND_W / 2;
    var fl = DATA.byId(DATA.flavors, (st && st.flavor) || 'classic') || DATA.flavors[0], night = SS.light(env.dayT).night;
    var paint = opt('paint', look.paint), trim = opt('trim', look.trim), P = placeProps(up, look, dl, vr), i;
    var c = COL;
    c.body = paint && paint.color || tier.body; c.pattern = paint && paint.pattern;
    c.lip = trim && trim.color || (paint && paint.color ? shadeHex(paint.color, -0.16) : tier.top);
    c.trim = trim && trim.color || (paint && paint.color ? shadeHex(paint.color, -0.3) : tier.trim);
    c.post = trim && trim.color || tier.trim;
    if (has(look, 'balloons')) balloons(ctx, env);
    if (P.coolerX != null) { box(ctx, P.coolerX, -40, 46, 40, 6, '#4cc3f0'); box(ctx, P.coolerX - 3, -48, 52, 12, 5, '#ffffff'); }
    if (P.speakerX != null) { box(ctx, P.speakerX, -46, 34, 46, 6, '#3d4a5c'); ctx.fillStyle = '#c9cde6'; ctx.beginPath(); ctx.arc(P.speakerX + 17, -20, 10 + Math.sin(env.t * 12) * 1.2, 0, TAU); ctx.fill(); }
    if (P.sandwichX != null) { var bx = P.sandwichX; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 16, -62); ctx.lineTo(bx + 46, -62); ctx.lineTo(bx + 60, 0); ctx.closePath(); inked(ctx, '#ffd83d', 3); star(ctx, bx + 31, -34, 11, '#ff6257'); }
    if (P.plantX != null) lemonTree(ctx, env, P.plantX);
    if (P.menuX != null) menuBoard(ctx, P.menuX, st, fl);
    if (P.cutoutX != null) cutout(ctx, env, P.cutoutX);
    if (P.costumeX != null) costume(ctx, env, P.costumeX, live ? suitWave : 0.5 + 0.5 * Math.sin(env.t * 0.7), P.costumeX > 0 ? -1 : 1);
    if ((up.sign | 0) >= 3) {                                // neon OPEN sign, glows after dark
      if (night > 0.3) glowAt(ctx, 0, -232, 90, '255,93,143', 0.6 * night);
      box(ctx, -44, -246, 88, 28, 8, INK); ctx.font = '20px ' + BAGEL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff8fb3'; ctx.fillText('OPEN', 0, -231);
    }
    var hang = shadeOf(ctx, env, up, look, c), strings = has(look, 'bunting') || has(look, 'lights');
    if (strings && hang.poles) { box(ctx, -hang.x - 3, -182, 5, 100, 2.5, c.post); box(ctx, hang.x - 2, -182, 5, 100, 2.5, c.post); }
    layout(up, look);
    var R = live ? RIG : IDLE;
    if (!live) IDLE.vx = LAY.home;
    if (live) stepRig(env.dt, st, up);
    posePlan(env, st, today, R, up);
    if (live) { R.tx = PO.vxT; R.tf = PO.faceT; R.lvl += (PO.lvl - R.lvl) * (1 - Math.exp(-(env.dt || 0) * 16 * ((st && st.settings && st.settings.speed) || 1))); PO.lvl = R.lvl; }
    if (LAY.jl === 1) juicer(ctx, env, PO.pr, PO.run);   // the hand press's lever reaches toward the vendor: behind them, so it never crosses the face
    drawCrew(ctx, env, up, R);
    if (has(look, 'bunting')) bunting(ctx, env, hang.x, hang.y);
    if (has(look, 'lights')) fairyLights(ctx, env, hang.x, hang.y + (has(look, 'bunting') ? 6 : 0), night);
    counter(ctx, env, up, tier, c);
    if (has(look, 'flowers')) flowerBoxes(ctx, env, up);
    signBoard(ctx, env, look, up, night);
    if (st) {                                                // live price tag
      ctx.beginPath(); ctx.arc(64, -38, 22, 0, TAU); inked(ctx, '#ff6257', 3);
      ctx.font = '900 13px ' + FIG; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(SS.fmtMoney(st.price), 64, -37);
    }
    if (look.layout === 'showcase') showcase(ctx);
    if (P.tuck) { box(ctx, -124, -24, 40, 24, 5, '#4cc3f0'); box(ctx, -127, -31, 46, 10, 4, '#ffffff'); }
    drawCounterTop(ctx, env, st, up, fl, R);
    if (today && today.soldOut) {
      ctx.save(); ctx.translate(-12, -112); ctx.rotate(-0.06); box(ctx, -62, -17, 124, 34, 7, '#ff6257');
      ctx.font = '21px ' + BAGEL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('SOLD OUT', 0, 1); ctx.restore();
    }
  }

  /** the customise screen: the stand with the current upgrades and the given look, centred and scaled to fit w x h */
  function drawStandPreview(ctx, w, h, look, t) {
    var st = SS.state, up = (st && st.upgrades) || NOUP, tall = (up.sign | 0) >= 3 ? 262 : 232;
    var lk = look || standLook(st), d = lk.decor || [], left = d.indexOf('balloons') >= 0 ? 168 : 112, right = 112, k;
    var P = placeProps(up, lk, 1e9, 1e9);
    for (k in PROP_W) if (P[k + 'X'] != null) { left = Math.max(left, -P[k + 'X'] + 6); right = Math.max(right, P[k + 'X'] + PROP_W[k] + 6); }
    if (d.indexOf('costume') >= 0) tall = Math.max(tall, 132);
    var s = Math.min(w / (left + right), h / (tall + 24)), red = SS.reduced ? SS.reduced() : false;
    var env = { t: red ? 0 : t || 0, dt: 0, dayT: 0.42, wind: 0.25, reduced: red, weather: { wet: 0, heat: 0, cloud: 0, storm: 0 } };
    ctx.save();
    ctx.translate(w / 2 + (left - right) / 2 * s, h - 14 * s);
    ctx.fillStyle = 'rgba(19,26,58,.18)'; ctx.beginPath(); ctx.ellipse(0, 2 * s, (left + right) / 2 * s * 0.9, 16 * s, 0, 0, TAU); ctx.fill();
    ctx.scale(s, s);
    standRig(ctx, env, st, lk, 1e9, 1e9, null, false);
    ctx.restore();
  }

  function drawTips(ctx, view, env, tips) {
    for (var i = 0; i < tips.length; i++) {
      var t = tips[i];
      if (t.ttl < 1 && Math.sin(env.t * 30) < 0) continue;  // blink before it disappears
      var s = view.laneScale(t.lane), x = view.toX(t.x), y = view.laneY(t.lane) - (10 + Math.abs(Math.sin(env.t * 4 + t.id)) * 8) * s;
      shadow(ctx, x, view.laneY(t.lane), 10, s);
      ctx.beginPath(); ctx.ellipse(x, y, 10 * s * Math.max(0.25, Math.abs(Math.cos(env.t * 3 + t.id))), 10 * s, 0, 0, TAU);
      ctx.fillStyle = '#ffd83d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 3 * s, y - 3 * s, 2 * s, 0, TAU); ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ *
   * Dex the Dealer and his rolling trunk
   * ------------------------------------------------------------------ */
  /** is Dex here? Re-read a few times a second (and on his events), not every frame.
      When he is not, the last stock and layout are kept: his exit at closing still draws them. */
  function dexOn(st) {
    var now = performance.now(), ph = st && st.phase, info = null, on = false, offers = EMPTY, i, o, f, sh, sc, r, c;
    if (now - dex.at < 250) return dex.on;
    dex.at = now;
    if (ph === 'prep' || ph === 'day') {
      if (SS.Sim && SS.Sim.dealerInfo) { try { info = SS.Sim.dealerInfo(); } catch (e) { info = null; } }
      if (info) { on = !!info.present; offers = info.offers || EMPTY; }
      else if (st.dealer && st.dealer.day === st.day) { on = true; offers = st.dealer.offers || EMPTY; }
    }
    if (!(dex.on = on)) return false;
    dex.offers = offers; dex.edge = 1e9; dex.hudL = 1e9; dex.hudB = -1e9;
    dex.cols.length = 0; dex.sold = dex.offers.length > 0; dex.lim = false;
    for (i = 0; i < dex.offers.length; i++) {
      o = dex.offers[i] || {};
      f = DATA.byId(o.kind === 'limited' ? DATA.flavors : DATA.boosts || EMPTY, o.id);
      dex.cols.push(o.color || (f && f.color) || '#ffd83d');
      if (!o.sold) dex.sold = false;
      if (o.kind === 'limited' && !o.sold) dex.lim = true;
    }
    sh = document.getElementById('sheet'); sc = document.getElementById('scene');      // a sheet docked on the right hides that part of the scene
    if (sh && sc && !sh.hidden && sh.dataset.mode !== 'center') {
      r = sh.getBoundingClientRect(); c = sc.getBoundingClientRect();
      if (r.width && r.height && r.width < c.width * 0.8) dex.edge = r.left - c.left;
    }
    sh = document.querySelectorAll('#hud > .hud-stats, #hud > .hud-deals');        // the pills over the top right of the scene
    for (i = 0; sc && i < sh.length; i++) {
      r = sh[i].getBoundingClientRect(); c = sc.getBoundingClientRect();
      if (r.width && r.height) { dex.hudL = Math.min(dex.hudL, r.left - c.left); dex.hudB = Math.max(dex.hudB, r.bottom - c.top); }
    }
    return true;
  }
  /** where Dex and his trunk stand, in screen px. Beside the stand when there is room; on narrow
      screens he shrinks a little, stays fully on screen and the trunk tucks in behind him. */
  function dexLayout(view) {
    var s = view.laneScale(W.DEALER_LANE), ls = view.laneScale(W.STAND_LANE), sx = view.toX(W.STAND_X), xw = view.toX(W.DEALER_X);
    var edge = Math.min(view.w, dex.edge) - 3, y = view.laneY(W.DEALER_LANE), up = (SS.state && SS.state.upgrades) || {}, xmin, lim;
    if (y - 200 * s < dex.hudB) edge = Math.min(edge, dex.hudL - 6);       // a short scene: keep his sign out from under the HUD
    // the stand's counter, and its awning if it has one (the beach umbrella reaches further right)
    var aw = (up.awning | 0) >= 2 || (up.stand | 0) >= 2 ? 108 : up.awning ? 160 : 0, standR = sx + 100 * ls, awR = sx + aw * ls;
    var x = Math.min(xw, edge - 106 * s), off = 64;
    if (x - 26 * s < standR) {
      s *= SS.clamp((edge - standR) / (80 * s), 0.8, 1);
      xmin = standR + 32 * s;                                // a step clear of the counter
      off = SS.clamp((edge - 42 * s - xmin) / s, 14, 64);
      x = Math.min(Math.max(xmin, edge - (off + 42) * s), xw, edge - 22 * s);
    }
    spot.x = x; spot.y = y; spot.s = s; spot.off = off; spot.tx = x + off * s; spot.edge = edge;
    spot.lift = off < 44 ? 26 : 0;                         // trunk behind him: lift the sign clear of his hair
    lim = (spot.lift ? 31 : 48);
    spot.dx = Math.min(0, (edge - lim * s - spot.tx) / s);   // and slide it left so it stays readable
    // no room for the sign beside the awning: hang it higher, above the awning
    if (aw && spot.tx + (spot.dx - (spot.lift ? 27 : 42)) * s < awR) spot.lift = Math.max(spot.lift, Math.ceil(222 * ls / s - 116));
    return spot;
  }
  function hexRgb(h) { var n = parseInt(String(h).slice(1, 7), 16); if (!(n >= 0)) n = 0xffd83d; return (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255); }
  /** a soft round glow, painted once per colour */
  function glowOf(col) {
    var g = glows[col], x, gr, rgb;
    if (g) return g;
    g = document.createElement('canvas'); g.width = g.height = 64; x = g.getContext('2d'); rgb = hexRgb(col);
    gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.18, 'rgba(' + rgb + ',0.85)'); gr.addColorStop(0.5, 'rgba(' + rgb + ',0.32)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (glows[col] = g);
  }
  function shoe(ctx, x, dy) { dy = dy || 0; box(ctx, x - 6, dy - 8, 18, 8, 4, '#ffffff'); ctx.fillStyle = INK; ctx.fillRect(x - 5, dy - 6.5, 5, 5); }
  /** one arm: blazer sleeve in two parts, a shirt cuff and a hand. hand: 0 fist, 1 open palm, 2 thumb up, 3 finger gun, 4 beckoning finger */
  function arm(ctx, sx, sy, ex, ey, hx, hy, hand, fa) {
    limb(ctx, sx, sy, ex, ey, 9, DEX.blazer); limb(ctx, ex, ey, hx, hy, 8, DEX.blazer);
    var ux = hx - ex, uy = hy - ey, d = Math.sqrt(ux * ux + uy * uy) || 1;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx - ux / d * 2, hy - uy / d * 2, 4.4, 0, TAU); ctx.fill();
    if (hand === 2) limb(ctx, hx + 1, hy - 3, hx + 1, hy - 11, 3, DEX.skin);
    else if (hand === 3) { limb(ctx, hx + 2, hy - 1, hx + 11, hy - 2, 3, DEX.skin); limb(ctx, hx, hy - 3, hx + 1, hy - 9, 2.6, DEX.skin); }
    else if (hand === 4) limb(ctx, hx, hy - 2, hx + Math.cos(fa) * 8, hy - 2 + Math.sin(fa) * 8, 2.8, DEX.skin);
    ctx.beginPath();
    if (hand === 1) ctx.ellipse(hx + 1, hy, 6.5, 4.2, -0.25, 0, TAU); else ctx.arc(hx, hy, 5, 0, TAU);
    ctx.fillStyle = DEX.skin; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  }
  /* Dex himself, facing +x, origin at his feet.
     pose: 0 idle, 1 beckon, 2 coin flip, 3 presenting the trunk, 4 double thumbs-up, 5 relaxed, 6 finger guns,
     7 pushing the trunk, 8 walking, 9 ta-da, 10 double finger guns, 11 stamping the brake, 12 pointing up, 13 towing the trunk;
     k = 0..1 through it; wk = walk-cycle phase in radians (null = standing) */
  function dexRig(ctx, env, pose, k, wk) {
    var t = env.t, red = env.reduced, H = 116, walk = wk != null, sw = walk ? Math.sin(wk) : 0, bob = walk ? Math.abs(Math.cos(wk)) * 2.2 : 0, g = GRIP[pose];
    var dn = pose === 10 ? SS.smooth((k - 0.64) / 0.36) : 0;   // the finger guns come down to rest over the ta-da's last 0.25 s
    var br = Math.sin(t * 2.2) * (red ? 0.6 : 1.3), lean = g ? g.lean : pose === 5 ? -0.14 : pose === 6 ? 0.06 : pose === 10 ? 0.06 * (1 - dn) : pose === 11 ? -0.06 : 0;
    var hip = -0.44 * H - bob, sh = -0.77 * H - br - bob, hy = -0.905 * H - br - bob, hr = 0.15 * H, e, a, fx, fy, ex, ey, hx, hy2, u, pump, f1, f2;
    if (walk) {                                            // a stride: the feet swing about the hips and the lifted one clears the ground
      f1 = 2.5 - sw * 13; f2 = 2.5 + sw * 13; a = Math.max(0, -sw) * 5; u = Math.max(0, sw) * 5;
      limb(ctx, -3, hip, f1, -6 - a, 10, DEX.pants); limb(ctx, 4, hip, f2, -6 - u, 10, DEX.pants);
      shoe(ctx, f1, -a); shoe(ctx, f2, -u);
    } else if (pose === 11) {                              // the front foot comes up, then stamps the brake down
      u = k < 0.4 ? Math.sin(Math.PI / 2 * k / 0.4) : k < 0.5 ? Math.cos(Math.PI / 2 * (k - 0.4) / 0.1) : 0;
      limb(ctx, -3, hip, -6, -6, 10, DEX.pants); limb(ctx, 4, hip, 11 + 7 * u, -6 - 13 * u, 10, DEX.pants);
      shoe(ctx, -6); shoe(ctx, 11 + 7 * u, -13 * u);
    } else {
      limb(ctx, -3, hip, -6, -6, 10, DEX.pants); limb(ctx, 4, hip, 11, -6, 10, DEX.pants);
      shoe(ctx, -6); shoe(ctx, 11);
    }
    ctx.save(); ctx.translate(0, hip); ctx.rotate(lean); ctx.translate(0, -hip);
    pump = red ? 0 : -Math.abs(Math.sin(k * TAU * 2.5)) * 3;
    e = pose === 9 ? SS.ease.outBack(SS.clamp(k / 0.3, 0, 1)) : 0;
    // back arm: hand on hip, behind his head (relaxed), up for the second thumb, or one of the show's poses
    if (pose === 5) arm(ctx, -6, sh + 7, -23, sh - 9, -9, hy - 1, 0);
    else if (pose === 7) arm(ctx, -6, sh + 7, 10, sh + 21, 26, sh + 21, 0);
    else if (pose === 13) arm(ctx, -6, sh + 7, -17, sh + 15, g.x, sh + g.y, 0);
    else if (pose === 8) arm(ctx, -6, sh + 7, -5 + sw * 6, sh + 19, -3 + sw * 13, sh + 30, 1);
    else if (pose === 9) arm(ctx, -6, sh + 7, SS.lerp(-14, -20, e), SS.lerp(sh + 22, sh + 1, e), SS.lerp(-12, -30, e), SS.lerp(sh + 33, sh - 12, e), 1);
    else if (pose === 10) arm(ctx, -6, sh + 7, SS.lerp(8, -20, dn), sh + 22 + 3 * dn, SS.lerp(24, -13, dn), SS.lerp(sh + 18 + pump, hip + 3, dn), dn > 0.5 ? 0 : 3);
    else if (pose === 11) arm(ctx, -6, sh + 7, -18, sh + 16, -26, sh + 6, 1);
    else if (pose !== 4) arm(ctx, -6, sh + 7, -20, sh + 25, -13, hip + 3, 0);
    // blazer, shirt, lapels, gold chain, pocket square, buttons
    box(ctx, -0.165 * H, sh, 0.33 * H, hip - sh + 11, 0.07 * H, DEX.blazer);
    ctx.beginPath(); ctx.moveTo(-3, sh + 1.5); ctx.lineTo(15, sh + 1.5); ctx.lineTo(6, sh + 25); ctx.closePath(); ctx.fillStyle = '#fff6e8'; ctx.fill();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = DEX.lapel; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(-4, sh + 2); ctx.lineTo(6, sh + 28); ctx.lineTo(16, sh + 2); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.arc(6, sh + 2, 10, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.strokeStyle = DEX.gold; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(6, sh + 13.5, 3.6, 0, TAU); ctx.fillStyle = DEX.gold; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, sh + 17); ctx.lineTo(-8.5, sh + 9.5); ctx.lineTo(-5.5, sh + 17); ctx.closePath();
    ctx.fillStyle = '#fff4b8'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-15.5, sh + 17); ctx.quadraticCurveTo(-14, sh + 9, -11.5, sh + 7.5); ctx.quadraticCurveTo(-10.5, sh + 12, -8, sh + 17); ctx.closePath();
    ctx.fillStyle = DEX.square; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = DEX.lapel; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-16, sh + 17.5); ctx.lineTo(-5, sh + 17.5); ctx.stroke();
    ctx.fillStyle = DEX.gold; ctx.beginPath(); ctx.arc(6, sh + 34, 2, 0, TAU); ctx.arc(6, sh + 42, 2, 0, TAU); ctx.fill();
    if (pose === 4) arm(ctx, -6, sh + 7, 4, sh + 25, 13, sh + 2 + pump, 2);
    if (pose === 5) arm(ctx, 5, sh + 7, 18, sh - 12, 3, hy - 4, 0);
    // head: ear, pompadour, shades, big grin with a gold tooth
    ctx.fillStyle = DEX.skin; ctx.fillRect(-4, hy + hr * 0.6, 9, 9);
    ctx.beginPath(); ctx.arc(0, hy, hr, 0, TAU); ctx.fillStyle = DEX.skin; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(-hr * 0.3, hy + hr * 0.12, hr * 0.22, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-hr * 0.55, hy + hr * 0.4); ctx.lineTo(-hr * 0.98, hy - hr * 0.05);
    ctx.bezierCurveTo(-hr * 1.18, hy - hr * 1.05, -hr * 0.2, hy - hr * 1.55, hr * 0.55, hy - hr * 1.58);
    ctx.bezierCurveTo(hr * 1.3, hy - hr * 1.62, hr * 1.5, hy - hr * 1.0, hr * 1.08, hy - hr * 0.74);
    ctx.bezierCurveTo(hr * 0.8, hy - hr * 0.55, hr * 0.32, hy - hr * 0.74, -hr * 0.08, hy - hr * 0.56);
    ctx.quadraticCurveTo(-hr * 0.36, hy - hr * 0.2, -hr * 0.28, hy + hr * 0.4); ctx.closePath();
    ctx.fillStyle = DEX.hair; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-hr * 0.55, hy - hr * 1.02); ctx.quadraticCurveTo(0, hy - hr * 1.42, hr * 0.68, hy - hr * 1.4); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(hr * 0.05, hy - hr * 0.12); ctx.lineTo(-hr * 0.34, hy - hr * 0.04); ctx.stroke();
    rr(ctx, hr * 0.02, hy - hr * 0.32, hr * 1.02, hr * 0.44, hr * 0.18); ctx.fillStyle = '#231d4a'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hr * 0.28, hy - hr * 0.24); ctx.lineTo(hr * 0.44, hy - hr * 0.0); ctx.moveTo(hr * 0.72, hy - hr * 0.24); ctx.lineTo(hr * 0.8, hy - hr * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hr * 0.1, hy + hr * 0.3); ctx.quadraticCurveTo(hr * 0.52, hy + hr * 1.0, hr * 0.98, hy + hr * 0.2); ctx.quadraticCurveTo(hr * 0.55, hy + hr * 0.42, hr * 0.1, hy + hr * 0.3); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.fillStyle = DEX.gold; ctx.fillRect(hr * 0.5, hy + hr * 0.37, hr * 0.15, hr * 0.17);
    if (!red && pose === 0 && (((t - idle0) % 7.2) + 7.2) % 7.2 > 2.1 && (((t - idle0) % 7.2) + 7.2) % 7.2 < 2.45) star(ctx, hr * 0.62, hy + hr * 0.42, 4.5, '#fff4b8');   // ting!
    // front arm
    if (pose === 1) {                                      // "come here": arm up, the hand curls in again and again
      e = SS.smooth(Math.min(k, 1 - k) / 0.16); a = -1.45 - 0.35 * Math.sin(k * TAU * 3);
      ex = SS.lerp(12, 25, e); ey = SS.lerp(sh + 27, sh + 21, e);
      arm(ctx, 5, sh + 7, ex, ey, SS.lerp(22, ex + Math.cos(a) * 15, e), SS.lerp(sh + 31, ey + Math.sin(a) * 15, e), e > 0.5 ? 4 : 1, a - 1.3 - 0.9 * Math.sin(k * TAU * 3));
    } else if (pose === 2) {                               // flips a coin and catches it
      u = SS.clamp((k - 0.12) / 0.72, 0, 1); hx = 22; hy2 = sh + 17 - (k < 0.14 || u >= 1 ? 3 : 0);
      arm(ctx, 5, sh + 7, 13, sh + 26, hx, hy2, 0);
      fx = hx + 1; fy = hy2 - 7 - Math.sin(Math.PI * u) * 50;
      ctx.beginPath(); ctx.ellipse(fx, fy, 4.6 * Math.max(0.15, Math.abs(Math.cos(u * Math.PI * 7))), 4.6, 0, 0, TAU);
      ctx.fillStyle = DEX.gold; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
    } else if (pose === 3) arm(ctx, 5, sh + 7, 19, sh + 19, 33, sh + 15, 1);
    else if (pose === 4) arm(ctx, 5, sh + 7, 17, sh + 22, 25, sh + 4 + pump, 2);
    else if (pose === 6) arm(ctx, 5, sh + 7, 17, sh + 17, 28, sh + 13, 3);
    else if (pose === 7) arm(ctx, 5, sh + 7, 19, sh + 21, g.x, sh + g.y, 0);
    else if (pose === 8 || pose === 13) arm(ctx, 5, sh + 7, 9 - sw * 5, sh + 19, 6 - sw * 13, sh + 30, 1);
    else if (pose === 9) arm(ctx, 5, sh + 7, SS.lerp(12, 20, e), SS.lerp(sh + 27, sh + 1, e), SS.lerp(22, 31, e), SS.lerp(sh + 31, sh - 12, e), 1);
    else if (pose === 10) arm(ctx, 5, sh + 7, SS.lerp(17, 12, dn), sh + 17 + 10 * dn, SS.lerp(28, 22, dn), SS.lerp(sh + 13 + pump, sh + 31, dn), dn > 0.5 ? 1 : 3);
    else if (pose === 11) arm(ctx, 5, sh + 7, 17, sh + 14, 27, sh + 8, 1);
    else if (pose === 12) arm(ctx, 5, sh + 7, 15, sh - 6, 19, sh - 22, 4, -1.35);
    else if (pose !== 5) arm(ctx, 5, sh + 7, 12, sh + 27, 22, sh + 31 + Math.sin(t * 1.7) * 1.5, 1);
    ctx.restore();
  }
  function bottle(ctx, x, y, col, big) {
    var w = big ? 11 : 9, h = big ? 21 : 16;
    rr(ctx, x - w / 2, y - h, w, h, 3); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x - w / 2 + 1, y - h + 1, w - 2, h * 0.28);
    rr(ctx, x - w / 2, y - h, w, h, 3); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - w / 2 + 2.4, y - h * 0.6); ctx.lineTo(x - w / 2 + 2.4, y - 4); ctx.stroke();
    box(ctx, x - 2.4, y - h - 6, 4.8, 7, 1.5, 'rgba(255,255,255,.9)');
    if (big) star(ctx, x, y - h - 9, 5, '#ffd83d');
    else box(ctx, x - 3, y - h - 9, 6, 4, 1.5, '#d9a273');
  }
  /** a four-point twinkle */
  function twinkle(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * 0.17, y - r * 0.17, x + r, y); ctx.quadraticCurveTo(x + r * 0.17, y + r * 0.17, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.17, y + r * 0.17, x - r, y); ctx.quadraticCurveTo(x - r * 0.17, y - r * 0.17, x, y - r); ctx.fill();
  }
  /** three spokes in each wheel so you can see them turn (a = angle, al = how much they show) */
  function spokes(ctx, a, al) {
    var w, j, q;
    ctx.globalAlpha = al; ctx.strokeStyle = '#c9cde6'; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.beginPath();
    for (w = -21; w <= 21; w += 42) for (j = 0; j < 3; j++) { q = a + j * TAU / 3; ctx.moveTo(w, -7); ctx.lineTo(w + Math.cos(q) * 5.6, -7 + Math.sin(q) * 5.6); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  /** the lid, hinged along the trunk's top edge: v 0 = shut over the display, 1 = swung up edge-on behind the awning, above 1 = its velvet inside shows */
  function lid(ctx, v) {
    var c = Math.cos(v * Math.PI / 2), i;
    if (c > -0.03 && c < 0.03) return;
    ctx.save(); ctx.translate(0, -88); ctx.scale(1, c);
    if (c > 0) {                                           // the outside: leather, two straps, gold corners, his monogram and the clasp
      box(ctx, -34, 0, 68, 50, 7, DEX.trunk);
      ctx.fillStyle = 'rgba(255,236,200,.16)'; ctx.fillRect(-29, 4, 58, 5);
      for (i = -1; i <= 1; i += 2) {
        box(ctx, i * 16 - 4, 0, 8, 50, 2, '#7a3418');
        box(ctx, i * 16 - 6, 32, 12, 10, 2.5, DEX.gold); ctx.fillStyle = '#7a3418'; ctx.fillRect(i * 16 - 2.5, 35, 5, 4);
      }
      for (i = 0; i < 4; i++) box(ctx, (i & 1 ? 25 : -34), (i & 2 ? 41 : 0), 9, 9, 2.5, DEX.gold);
      ctx.beginPath(); ctx.ellipse(0, 19, 10.5, 8.5, 0, 0, TAU); ctx.fillStyle = DEX.gold; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 19, 7.6, 5.8, 0, 0, TAU); ctx.strokeStyle = '#c98a1a'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.font = '8px "Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#7a3418'; ctx.fillText('DEX', 0, 19.5, 15);
      box(ctx, -5, 43, 10, 9, 2.5, DEX.gold); ctx.fillStyle = INK; ctx.fillRect(-1, 46, 2, 3.5);
    } else {                                               // the inside: velvet lining
      box(ctx, -34, 0, 68, 50, 7, DEX.lapel);
      box(ctx, -28, 5, 56, 40, 5, DEX.velvet);
    }
    ctx.restore();
  }
  function stripes(ctx) {
    for (var i = 0, bx; i < 6; i++) {
      bx = -38 + i * 76 / 6;
      ctx.beginPath(); ctx.moveTo(bx, -106); ctx.lineTo(bx + 76 / 6, -106); ctx.lineTo(bx + 76 / 6, -93); ctx.arc(bx + 38 / 6, -93, 38 / 6, 0, Math.PI); ctx.closePath();
      ctx.fillStyle = i & 1 ? '#ffe14d' : '#7a5cff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
  /** the awning on its bar. Shut, the bar sits on the trunk on top of the rolled-up awning; it rises on two struts and the awning unrolls down */
  function awning(ctx) {
    var by = -110 + 9 * (1 - A.bar), u = A.awn, cy = by + 6 + 18 * u, rh = 7 * Math.sqrt(Math.max(0, 1 - u)), i;
    if (u >= 1 && A.bar >= 1) { stripes(ctx); box(ctx, -40, -110, 80, 6, 3, '#7a5cff'); return; }
    ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-35, -88); ctx.lineTo(-35, by + 5); ctx.moveTo(35, -88); ctx.lineTo(35, by + 5);
    ctx.strokeStyle = INK; ctx.lineWidth = 3.6; ctx.stroke(); ctx.strokeStyle = '#8a8fb5'; ctx.lineWidth = 1.6; ctx.stroke();
    if (u > 0) { ctx.save(); ctx.beginPath(); ctx.rect(-44, by, 88, cy - by + rh / 2 + 0.5); ctx.clip(); ctx.translate(0, by + 110); stripes(ctx); ctx.restore(); }
    if (rh > 0.4) {                                        // the roll, thinner the further it has unrolled
      box(ctx, -39, cy, 78, rh, rh / 2, '#ffe14d');
      if (rh > 3.5) { ctx.fillStyle = '#7a5cff'; for (i = 0; i < 6; i++) ctx.fillRect(-36 + i * 76 / 6 + 3, cy + 1.6, 5, rh - 3.2); }
    }
    box(ctx, -40, by, 80, 6, 3, '#7a5cff');
  }
  /** the trunk itself (behind Dex): wheels, leather, the display of glowing bottles behind its lid, the striped awning.
      A says how far along each moving part is; all at rest = open for business */
  function trunkBody(ctx, env, st) {
    var t = env.t, red = env.reduced, offers = dex.offers, n = offers.length, act = st && st.boosts, i, o, bx, r, a, g, k, f;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-21, -7, 7.5, 0, TAU); ctx.moveTo(28.5, -7); ctx.arc(21, -7, 7.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c9cde6'; ctx.beginPath(); ctx.arc(-21, -7, 2.6, 0, TAU); ctx.moveTo(23.6, -7); ctx.arc(21, -7, 2.6, 0, TAU); ctx.fill();
    if (A.spin > 0.02) spokes(ctx, A.wheel, A.spin);
    box(ctx, -34, -88, 68, 76, 7, DEX.trunk);
    box(ctx, -27, -81, 54, 41, 5, DEX.velvet);
    box(ctx, -24, -36, 48, 18, 4, DEX.drawer);
    box(ctx, -8, -30, 16, 5, 2.5, DEX.gold);
    for (i = 0; i < 4; i++) box(ctx, (i & 1 ? 25 : -34), (i & 2 ? -21 : -88), 9, 9, 2.5, DEX.gold);
    // glows first, added light on the dark velvet; then the bottles (each pops up with a flash of its colour as he sets up)
    if (n && A.lid > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < n; i++) {
        o = offers[i] || {}; k = A.bk[i]; f = A.fl[i] || 0;
        if ((o.kind === 'limited' && o.sold) || !(k > 0)) continue;
        bx = -24 + 48 * (i + 0.5) / n; g = glowT[o.id] || 0;
        a = act && act.indexOf(o.id) >= 0 ? 0.95 : red ? 0.55 : 0.5 + 0.22 * Math.sin(t * 3 + i * 1.7);
        r = (o.kind === 'limited' ? 17 : 13) * (1 + (act && act.indexOf(o.id) >= 0 ? 0.25 : 0) + (g > 0 ? 0.9 * g / 1.6 * (red ? 0.6 : 1 + 0.25 * Math.sin(t * 18)) : 0));
        if (k < 1 || f > 0) r *= Math.min(1, k) * (1 + 1.4 * f);
        ctx.globalAlpha = Math.min(1, a + g + f); ctx.drawImage(glowOf(dex.cols[i]), bx - r, -54 - r, 2 * r, 2 * r);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      for (i = 0; i < n; i++) {
        o = offers[i] || {}; k = A.bk[i]; f = A.fl[i] || 0;
        if ((o.kind === 'limited' && o.sold) || !(k > 0)) continue;
        bx = -24 + 48 * (i + 0.5) / n;
        if (k === 1) bottle(ctx, bx, -44, dex.cols[i], o.kind === 'limited');
        else { ctx.save(); ctx.translate(bx, -44 + Math.max(0, 1 - k) * 10); ctx.scale(k, k); bottle(ctx, 0, 0, dex.cols[i], o.kind === 'limited'); ctx.restore(); }
        if (f > 0) twinkle(ctx, bx + 6, -66 - 6 * (1 - f), 9 * f, '#ffffff');
        if (k === 1 && act && act.indexOf(o.id) >= 0) {   // yours today: a gold twinkle over the bottle
          ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(bx, -81); ctx.quadraticCurveTo(bx + 1, -76, bx + 5, -75); ctx.quadraticCurveTo(bx + 1, -74, bx, -69);
          ctx.quadraticCurveTo(bx - 1, -74, bx - 5, -75); ctx.quadraticCurveTo(bx - 1, -76, bx, -81); ctx.fill();
        }
      }
    }
    box(ctx, -29, -47, 58, 5, 2, '#e8b04a');                 // the shelf
    if (A.lid !== 1) lid(ctx, A.lid);
    awning(ctx);
    if (dex.sold && A.awn > 0.05) {
      ctx.save(); ctx.translate(0, -62); ctx.rotate(-0.16); if (A.awn < 1) ctx.scale(A.awn, A.awn); box(ctx, -34, -10, 68, 20, 5, '#ff6257');
      ctx.font = '15px "Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.fillText('SOLD OUT', 0, 1, 60); ctx.restore();
    }
    if (dealT > 0) {                                       // the trunk lights up when you buy
      a = Math.pow(dealT / 1.5, 2) * (red ? 0.3 : 0.75);
      rr(ctx, -34, -88, 68, 76, 7); ctx.fillStyle = 'rgba(255,250,214,' + a.toFixed(3) + ')'; ctx.fill();
    }
  }
  /** the hanging DEX'S DEALS sign and the LIMITED starburst, drawn over Dex, the passers-by and their bubbles so they always read.
      pole = true draws only the pole it hangs from (behind Dex, with the trunk); it stays on screen */
  /** one marquee bulb; j = its place in the switch-on order around the edge (bulbs light one by one as he sets up) */
  function bulb(ctx, x, y, j, lit) {
    var on = A.bulbs - j;
    ctx.fillStyle = on > 0 ? lit : '#5f4f9c';
    ctx.beginPath(); ctx.arc(x, y, on > 0 && on < 1 ? 1.9 + 1.6 * (1 - on) : 1.9, 0, TAU); ctx.fill();
  }
  function trunkTop(ctx, env, p, pole) {
    var t = env.t, red = env.reduced, dx = p.dx, tight = p.lift > 0, hw = tight ? 25 : 40, hh = tight ? 31 : 22, sy = -116 - p.lift, top = sy - hh, i, r, k, sc, a, n, x, tr;
    var px = Math.min(30, (p.edge - p.tx) / p.s - 4);
    ctx.lineCap = 'round';
    if (pole) {                                            // it telescopes up out of the awning bar, then the arm swings out
      if (A.pole <= 0) return;
      ctx.beginPath(); ctx.moveTo(px, -110);
      if (A.pole >= 1) { ctx.lineTo(px, top - 7); ctx.lineTo(Math.min(px, dx - hw + 10), top - 7); }
      else {
        ctx.lineTo(px, SS.lerp(-110, top - 7, SS.ease.outCubic(Math.min(1, A.pole / 0.6))));
        if (A.pole > 0.6) ctx.lineTo(SS.lerp(px, Math.min(px, dx - hw + 10), SS.ease.outCubic((A.pole - 0.6) / 0.4)), top - 7);
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = '#8a8fb5'; ctx.lineWidth = 2.5; ctx.stroke();
      return;
    }
    if (A.fold <= 0.01) return;
    tr = A.fold !== 1 || A.sway !== 0;                     // dropping in (or folding away): it hangs from its chains and swings
    if (tr) { ctx.save(); ctx.translate(dx, top - 7); ctx.rotate(A.sway); ctx.scale(1, A.fold); ctx.translate(-dx, 7 - top); }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(dx - hw + 14, top - 7); ctx.lineTo(dx - hw + 14, top); ctx.moveTo(dx + hw - 14, top - 7); ctx.lineTo(dx + hw - 14, top); ctx.stroke();
    box(ctx, dx - hw, top, hw * 2, hh, 7, '#3b2a7a');
    k = red ? 0 : Math.floor(t * 5); n = tight ? 5 : 8;
    if (A.bulbs >= 2 * n) {
      for (i = 0; i < n; i++) {                             // marquee bulbs chase along the edges
        ctx.fillStyle = (i + k) % 2 ? '#fff4b8' : '#ff8fb3';
        ctx.beginPath(); ctx.arc(dx - hw + 8 + i * (hw * 2 - 16) / (n - 1), top + 2.5, 1.9, 0, TAU); ctx.arc(dx - hw + 8 + i * (hw * 2 - 16) / (n - 1), sy - 2.5, 1.9, 0, TAU); ctx.fill();
      }
    } else {
      for (i = 0; i < n; i++) {                             // switching on one by one, along the top and back along the bottom
        x = dx - hw + 8 + i * (hw * 2 - 16) / (n - 1);
        bulb(ctx, x, top + 2.5, i, (i + k) % 2 ? '#fff4b8' : '#ff8fb3'); bulb(ctx, x, sy - 2.5, 2 * n - 1 - i, (i + k) % 2 ? '#fff4b8' : '#ff8fb3');
      }
    }
    ctx.font = '12px "Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = A.neon >= 1 || (A.neon > 0 && (A.neon * 5 | 0) % 2 === 1) ? '#ffd83d' : '#776596';   // the neon buzzes on
    if (tight) { ctx.fillText('DEX\'S', dx, top + 10.5, 42); ctx.fillText('DEALS', dx, top + 21.5, 42); }
    else ctx.fillText('DEX\'S DEALS', dx, top + 11.5, 66);
    if (dex.lim && !dex.sold && (limT > 0 || red)) {       // a limited flavour is still for sale: slams in once he is set up
      a = 1;
      if (red) sc = 1;
      else if (limT < 0.22) { r = limT / 0.22; sc = 1.9 - 0.9 * r * r * r; a = Math.min(1, r * 2.5); }
      else { r = limT - 0.22; sc = 1 + 0.16 * Math.sin(r * 26) * Math.exp(-r * 8); }
      if (!red) sc *= 1 + 0.07 * Math.sin(t * 5);
      if (tight) sc *= 0.8;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(dx + (tight ? 0 : 10), top - (tight ? 21 : 26)); ctx.scale(sc, sc); ctx.rotate(red ? -0.12 : -0.12 + 0.07 * Math.sin(t * 1.7));
      ctx.beginPath();
      for (i = 0; i < 32; i++) { a = i * Math.PI / 16; r = i % 2 ? 21 : 28; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fillStyle = '#ff6257'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.strokeStyle = '#ffd83d'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.font = '900 10.5px Figtree, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      inkText(ctx, 'LIMITED', 0, 0.5, '#ffffff', 3);
      ctx.restore();
    }
    if (tr) ctx.restore();
  }
  /* ------------------------------------------------------------------ *
   * Dex's show. Each morning he visits he tows his trunk in from the right, stamps the brake,
   * opens the lid, pops the bottles up one by one, hangs his sign and takes a bow. At closing he
   * packs it all away and pushes the trunk off. Steps go out on the bus as 'dealer:setup'.
   * ------------------------------------------------------------------ */
  function say(step, i, quiet) {
    var p = { step: step };
    if (i != null) p.i = i;
    if (quiet) p.quiet = true;                             // snapped into place with no show: listeners skip their fanfare
    SS.emit('dealer:setup', p);
  }
  function due(step, at, i) { show.q.push({ s: step, at: at, i: i }); }
  /** units from his parking spot to where the trunk starts: far enough right that Dex, walking ahead of it, is out of sight too */
  function entry(p, view) { return Math.max(130, (Math.min(view.w, dex.edge) - p.tx) / p.s + TOW + 34); }
  function begin(mode, ph, view, t0) {
    var p = dexLayout(view), n = dex.offers.length, i, b;
    show.mode = mode; show.ph = ph; show.t = t0; show.q.length = 0; show.qi = 0; show.tada = 99;
    if (mode === IN) {
      limT = 0;                                            // yesterday's LIMITED slam must not show as the sign drops
      show.d0 = entry(p, view);
      show.roll = SS.clamp(0.7 + show.d0 / 260, 1.1, 1.6);
      show.tP = show.roll + 0.575; show.tO = show.tP + 0.2;
      due('arrive', 0); due('park', show.tP); due('open', show.tO);
      for (i = 0, b = show.tO + 0.42; i < n; i++, b += 0.17) due('bottle', b, i);
      show.tS = n ? b + 0.08 : show.tO + 0.55;
      due('sign', show.tS); due('ready', show.tS + 0.84);
    } else {
      show.po = 1.02;
      show.d1 = Math.max(80, (view.w + 110 * p.s - p.tx) / p.s);
      show.dur = SS.clamp(0.6 + show.d1 / 450, 0.85, 1.3);
      due('leave', 0); due('gone', show.po + show.dur);
    }
  }
  function setUp(quiet) {
    show.mode = SET; show.q.length = 0; show.tada = quiet ? 99 : 0; limT = quiet ? 9 : -0.5;
    say('ready', null, quiet);                             // after: listeners already see dealerReady() and his parked dealerPos()
  }
  /** gone with no show (the game moved on): close the sequence so listeners never wait on him */
  function away() {
    if (show.mode === IN && show.qi === 0) { show.mode = AWAY; return; }   // never got as far as arriving
    if (show.mode === IN || show.mode === SET) say('leave', null, true);
    if (show.mode !== AWAY) say('gone', null, true);
    show.mode = AWAY;
  }
  function fire() {
    var q = show.q, e;
    while (show.qi < q.length && show.t >= q[show.qi].at) {
      e = q[show.qi++];
      if (e.s === 'ready') { setUp(false); return; }
      say(e.s, e.i);
      if (e.s === 'gone') { show.mode = AWAY; return; }
    }
  }
  /** advance the show; runs in update, so it freezes while paused */
  function showStep(dt, view, env) {
    var st = SS.state, ph = st ? st.phase : '', on = dexOn(st), frozen = !!(SS.debugEnv && SS.debugEnv.t != null), quick = env.reduced || frozen;
    show.since += dt;
    if (show.mode === AWAY) {
      if (!on || show.hold) return;
      if (ph === 'prep' && !quick) { begin(IN, ph, view, Math.min(0, show.since - WAIT)); return; }
      if (ph === 'prep' && !frozen) { say('arrive'); setUp(false); return; }   // reduced motion: he is simply there, all set up
      setUp(true);                                         // loading into the day: already set up
    } else if (show.mode === IN) {
      if (!on) { away(); return; }
      if (ph !== show.ph || quick) { setUp(true); return; }   // opened for business mid-show: snap into place
      if (show.t < 0) show.d0 = entry(dexLayout(view), view);   // while the camera and sheet settle: always just past the edge
      show.t += dt; fire();
    } else if (show.mode === SET) {
      show.tada += dt;
      if (show.tada >= TADA && show.tada - dt < TADA) idle0 = env.t - (show.tada - TADA);
      if (on && ph === 'day' && !quick && st.today && (SS.DAY_LENGTH - st.today.clock) / ((st.settings && st.settings.speed) || 1) <= LEAVE) {
        begin(OUT, ph, view, 0); fire(); show.hold = true; return;   // closing in: pack up where you can see it (held away for the rest of the day)
      }
      if (on) return;
      if (ph === 'results' && !quick) { begin(OUT, ph, view, 0); fire(); } else away();
    } else {
      if ((ph !== show.ph && ph !== 'results') || quick) { say('gone', null, true); show.mode = AWAY; return; }   // a pack-up begun in the day runs on into results
      show.t += dt; fire();
    }
  }

  /** where Dex and his trunk are this frame and how far along each moving part is (cur, A); at rest outside a show */
  function place(view) {
    var p = dexLayout(view), n = dex.offers.length, i;
    A.lid = A.bar = A.awn = A.pole = A.fold = A.neon = 1; A.bulbs = 99;
    A.sway = A.spin = A.wheel = A.rock = A.sq = A.bounce = A.hdl = 0;
    for (i = 0; i < n; i++) { A.bk[i] = 1; A.fl[i] = 0; }
    cur.x = p.x; cur.tx = p.tx; cur.y = p.y; cur.s = p.s; cur.face = -1; cur.pose = -1; cur.k = 0; cur.wk = null; cur.hop = 0; cur.note = -1; cur.grip = 0;
    if (show.mode === IN) placeIn(p, n); else if (show.mode === OUT) placeOut(p, n);
    return cur;
  }
  function placeIn(p, n) {
    var s = p.s, t = show.t, R = show.roll, u, e, d, k, i, b, g, v, x0;
    A.lid = A.bar = A.awn = A.pole = A.fold = A.neon = A.bulbs = 0;
    for (i = 0; i < n; i++) A.bk[i] = 0;
    if (t < R) {                                           // towing it in, tipped back on one wheel, slowing to a stop
      u = Math.max(0, t) / R; e = 1 - (1 - u) * (1 - u); v = Math.min(1, (1 - u) * 2.2);
      d = show.d0 * (1 - e);
      cur.tx = p.tx + d * s; cur.x = cur.tx - TOW * s;
      A.wheel = d / 7.5; A.spin = 1; A.hdl = 1; cur.grip = 1;
      A.rock = -0.15 + 0.03 * Math.sin(d * 0.21) * v; A.bounce = -Math.abs(Math.sin(d * 0.21)) * 1.5 * v;
      cur.pose = 13; cur.wk = (show.d0 - d) * 0.13; cur.note = t;
      return;
    }
    k = t - R; x0 = p.tx - TOW * s;
    // he lets go: the handle zips in, the trunk drops onto both wheels, rocks and settles; the brake gives it a jolt
    A.hdl = Math.max(0, 1 - k / 0.16); A.hx = -18; A.hy = -10; cur.grip = 2;
    A.spin = Math.max(0, 1 - k / 0.3);
    if (k < 0.16) A.rock = -0.15 * Math.cos(k / 0.16 * Math.PI / 2);
    else if (k < 0.36) A.rock = 0.045 * Math.sin((k - 0.16) / 0.2 * Math.PI);
    g = k - 0.16; if (g > 0 && g < 0.6) A.sq = 0.075 * Math.sin(g * 24) * Math.exp(-g * 8);
    g = t - show.tP; if (g > 0 && g < 0.4) A.sq += 0.035 * Math.sin(g * 30) * Math.exp(-g * 12);
    if (t < show.tO) {
      if (k >= 0.45) { cur.x = p.x; cur.face = 1; cur.pose = 11; cur.k = (k - 0.45) / 0.25; cur.hop = 4 * Math.sin(Math.PI * Math.min(1, cur.k / 0.5)); }
      else if (k >= 0.2) { cur.x = SS.lerp(x0, p.x, SS.ease.inOutSine((k - 0.2) / 0.25)); cur.face = 1; cur.pose = 8; cur.wk = Math.abs(cur.x - x0) / s * 0.13; }
      else { cur.x = x0; cur.pose = 0; cur.face = k < 0.08 ? -1 : -Math.cos(Math.PI * (k - 0.08) / 0.12); }
      return;
    }
    // open up: the lid swings past upright and settles, the bar rises, the awning unrolls
    g = t - show.tO; cur.face = 1; cur.pose = t >= show.tS ? 12 : 3;
    u = SS.clamp((g - 0.04) / 0.55, 0, 1); A.lid = u >= 1 ? 1 : 1 - (1 - u) * (1 - u) * Math.cos(8.6 * u);
    A.bar = SS.ease.outBack(SS.clamp((g - 0.12) / 0.26, 0, 1));
    A.awn = SS.ease.outCubic(SS.clamp((g - 0.3) / 0.38, 0, 1));
    for (i = 0; i < n; i++) {                              // bottles spring up one at a time
      b = t - (show.tO + 0.42 + i * 0.17);
      if (b <= 0) continue;
      k = Math.min(1, b / 0.36); A.bk[i] = k >= 1 ? 1 : 1 - (1 - k) * (1 - k) * (1 - k) * Math.cos(k * 11);
      v = Math.max(0, 1 - b / 0.5); A.fl[i] = v * v;
    }
    g = t - show.tS;
    if (g <= 0) return;
    // the pole shoots up, the sign drops in on its chains and swings, the bulbs light one by one, the neon buzzes on
    A.pole = SS.clamp(g / 0.3, 0, 1);
    v = SS.clamp((g - 0.22) / 0.34, 0, 1); A.fold = v >= 1 ? 1 : 1 - Math.pow(1 - v, 4) * Math.cos(9 * v);
    d = g - 0.3; A.sway = d > 0 ? 0.2 * Math.sin(d * 12) * Math.exp(-d * 7) : 0;
    A.bulbs = Math.max(0, (g - 0.34) / 0.02);
    A.neon = SS.clamp((g - 0.6) / 0.22, 0, 1);
  }
  function placeOut(p, n) {
    var s = p.s, t = show.t, i, b, c, u, d, w, tg = p.tx - PUSH * s;
    A.bulbs = Math.max(0, 16 * (1 - t / 0.15)); A.neon = t < 0.06 ? 1 : 0;
    c = SS.clamp((t - 0.06) / 0.22, 0, 1); A.fold = 1 - c * c; A.sway = -0.12 * Math.sin(Math.PI * c);
    A.pole = 1 - SS.smooth((t - 0.24) / 0.22);
    for (i = 0; i < n; i++) { b = SS.clamp((t - 0.28 - i * 0.045) / 0.16, 0, 1); A.bk[i] = Math.max(0, 1 - (2.70158 * b - 1.70158) * b * b); }
    c = SS.clamp((t - 0.42) / 0.24, 0, 1); A.awn = 1 - c * c;
    A.bar = 1 - SS.smooth((t - 0.62) / 0.14);
    c = SS.clamp((t - 0.6) / 0.24, 0, 1); A.lid = 1 - c * c;
    w = t - 0.84; if (w > 0 && w < 0.5) A.sq = 0.06 * Math.sin(w * 26) * Math.exp(-w * 10);   // the lid slams shut
    A.hdl = SS.smooth((t - 0.8) / 0.14); A.hx = -10; A.hy = -5; cur.grip = 2;
    if (t < 0.68) { cur.pose = 0; return; }
    if (t < 0.8) { cur.pose = 0; cur.face = -Math.cos(Math.PI * (t - 0.68) / 0.12); return; }
    cur.face = 1;
    if (t < show.po) { cur.x = SS.lerp(p.x, tg, SS.ease.inOutSine((t - 0.8) / (show.po - 0.8))); cur.pose = 8; cur.wk = Math.abs(cur.x - p.x) / s * 0.13; return; }
    // and off he goes, pushing, faster and faster
    u = SS.clamp((t - show.po) / show.dur, 0, 1); d = show.d1 * u * u;
    cur.tx = p.tx + d * s; cur.x = cur.tx - PUSH * s; cur.pose = 7; cur.wk = d * 0.13; cur.grip = 1;
    A.wheel = d / 7.5; A.spin = Math.min(1, u * 5); A.bounce = -Math.abs(Math.sin(d * 0.21)) * 1.4 * Math.min(1, u * 3); A.rock = 0.02 * Math.sin(d * 0.21);
  }
  /** screen point of the hand on the trunk's handle (same maths as dexRig's arm) -> G */
  function gripAt(c, env) {
    var g = GRIP[c.pose] || GRIP[7], bob = c.wk != null ? Math.abs(Math.cos(c.wk)) * 2.2 : 0, br = Math.sin(env.t * 2.2) * (env.reduced ? 0.6 : 1.3);
    var hip = -0.44 * 116 - bob, y = -0.77 * 116 - br - bob + g.y - hip, cs = Math.cos(g.lean), sn = Math.sin(g.lean);
    G.x = c.x + c.face * c.s * (g.x * cs - y * sn); G.y = c.y - c.hop * c.s + c.s * (hip + g.x * sn + y * cs);
  }
  /** screen point where the handle meets the trunk's left side, through the trunk's tilt and squash -> G2 */
  function attachAt(c) {
    var px = -34 * (1 + A.sq), py = -60 * (1 - A.sq), pv = A.rock < 0 ? -21 : 21, cs = Math.cos(A.rock), sn = Math.sin(A.rock), rx = px - pv;
    G2.x = c.tx + c.s * (pv + rx * cs - py * sn); G2.y = c.y + c.s * (A.bounce + rx * sn + py * cs);
  }
  /** the chrome handle he tows and pushes the trunk by; it slides out of the trunk's side and back in */
  function towBar(ctx, c, env) {
    var s = c.s, ex, ey;
    attachAt(c);
    if (c.grip === 1) { gripAt(c, env); ex = G.x; ey = G.y; } else { ex = G2.x + A.hx * A.hdl * s; ey = G2.y + A.hy * A.hdl * s; }
    ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(G2.x, G2.y); ctx.lineTo(ex, ey);
    ctx.strokeStyle = INK; ctx.lineWidth = 5.5 * s; ctx.stroke(); ctx.strokeStyle = '#c9cde6'; ctx.lineWidth = 2.4 * s; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, 3.4 * s, 0, TAU); ctx.fillStyle = '#2b2a4a'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2 * s; ctx.stroke();
  }
  /** a whistled note: white with an ink rim, like the ones the FX use */
  function noteGlyph(ctx, x, y, r) {
    ctx.beginPath(); ctx.moveTo(x + 3 * r, y); ctx.lineTo(x + 3 * r, y - 11 * r); ctx.quadraticCurveTo(x + 8 * r, y - 9.5 * r, x + 7.5 * r, y - 4.5 * r);
    ctx.strokeStyle = INK; ctx.lineWidth = 4.6 * r; ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * r; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, 4 * r, 3.1 * r, -0.4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2 * r; ctx.stroke();
  }
  /** he whistles while he walks: notes float up from his lips and drift behind him */
  function whistle(ctx, c, t) {
    var s = c.s, i, u, a, w = t - 0.1;
    if (w <= 0) return;
    ctx.save(); ctx.lineCap = 'round';
    for (i = 0; i < 2; i++) {
      if (w < i * 0.45) continue;
      u = (w * 1.1 + i * 0.5) % 1; a = Math.sin(Math.PI * u);
      ctx.globalAlpha = Math.min(1, a * 1.8);
      noteGlyph(ctx, c.x + c.face * (16 - 24 * u) * s + Math.sin(u * 9 + i * 2) * 2.5 * s, c.y - (100 + 34 * u) * s, s * (0.7 + 0.3 * u));
    }
    ctx.restore();
  }
  function drawDealer(ctx, view, env, st) {
    var c = cur, s = c.s, t = env.t, red = env.reduced, T = 7.2, ph = (((t - idle0) % T) + T) % T, pose = 0, k = 0, face = -1, hop = 0, wk = null, e, u, pv;
    shadow(ctx, c.tx, c.y + s, 44, s);
    ctx.save(); ctx.translate(c.tx, c.y + A.bounce * s); ctx.scale(s, s);
    if (A.rock) { pv = A.rock < 0 ? -21 : 21; ctx.translate(pv, 0); ctx.rotate(A.rock); ctx.translate(-pv, 0); }
    if (A.sq) ctx.scale(1 + A.sq, 1 - A.sq);
    trunkBody(ctx, env, st); trunkTop(ctx, env, spot, true); ctx.restore();
    if (A.hdl > 0.02) towBar(ctx, c, env);
    if (c.pose >= 0) { pose = c.pose; k = c.k; face = c.face; hop = red ? 0 : c.hop; wk = c.wk; }
    else {
      if (dex.sold) pose = 5;                               // nothing left to sell: he kicks back
      else if (ph < 1.4) { pose = 1; k = ph / 1.4; }
      else if (ph >= 3 && ph < 4.1) { pose = 2; k = (ph - 3) / 1.1; }
      else if (ph >= 5.5 && ph < 6.7) { pose = 3; k = (ph - 5.5) / 1.2; face = -1 + 2 * SS.smooth(Math.min(k, 1 - k) / 0.12); }
      if (show.tada < TADA && !red) {                       // all set up: a spin to face you, ta-da, then finger guns
        u = show.tada;
        if (u < 0.42) { e = u / 0.42; face = Math.cos(Math.PI * 3 * e); hop = Math.sin(Math.PI * e) * 12; pose = 9; k = e * 0.1; }
        else if (u < 0.95) { pose = 9; k = 0.1 + (u - 0.42) / 0.53 * 0.9; face = -1; }
        else { pose = 10; k = (u - 0.95) / (TADA - 0.95); face = -1; }
      }
      if (lookT > 0 && SS.state && SS.state.phase === 'day') { pose = 6; k = 1 - lookT / 1.3; face = -1; }   // a sale: he turns to the customer
      if (dealT > 0) {                                      // you bought something: a spin, then two thumbs up
        e = 1 - dealT / 1.5; pose = 4; k = e; face = -1; hop = 0;
        if (!red && e < 0.34) { u = e / 0.34; face = -Math.cos(u * TAU); hop = Math.sin(u * Math.PI) * 14; pose = 0; }
      }
    }
    if (Math.abs(face) < 0.08) face = face < 0 ? -0.08 : 0.08;
    shadow(ctx, c.x, c.y, 24, s * (1 - hop / 50));
    ctx.save(); ctx.translate(c.x, c.y - hop * s); ctx.scale(s * face, s); dexRig(ctx, env, pose, k, wk); ctx.restore();
    if (c.note >= 0 && !red) whistle(ctx, c, c.note);
  }

  SS.Actors = {
    drawPerson: person,                                     // (ctx, look, opts) -> head-top height; look and opts are documented above person()
    update: function (dt, view, env) {
      tapT = Math.max(0, tapT - dt); pokeT = Math.max(0, pokeT - dt); bellT = Math.max(0, bellT - dt); cheerT = Math.max(0, cheerT - dt);
      dealT = Math.max(0, dealT - dt); lookT = Math.max(0, lookT - dt); lookCD -= dt;
      for (var id in glowT) if (glowT[id] > 0) glowT[id] = Math.max(0, glowT[id] - dt);
      if (view && view.toX && env) showStep(dt, view, env);
      if (show.mode === SET) limT = dex.on && dex.lim ? limT + dt : 0;
    },
    draw: function (ctx, view, env) {
      var st = SS.state, today = st && st.today, list = today && today.customers ? today.customers.slice() : [];
      var fl = DATA.byId(DATA.flavors, (st && st.flavor) || 'classic') || DATA.flavors[0], on = show.mode !== AWAY, dl = 1e9, n = list.length, i = 0;
      list.sort(function (a, b) { return a.lane - b.lane; });
      if (on) { place(view); dl = (spot.x - 26 * spot.s - view.toX(W.STAND_X)) / view.laneScale(W.STAND_LANE); }
      for (; i < n && list[i].lane < W.STAND_LANE; i++) drawCustomer(ctx, view, env, list[i], fl.color);
      drawStand(ctx, view, env, st, dl);
      for (; i < n && list[i].lane < W.DEALER_LANE; i++) drawCustomer(ctx, view, env, list[i], fl.color);
      if (on) drawDealer(ctx, view, env, st);
      for (; i < n; i++) drawFront(ctx, view, env, list[i], fl.color);
      if (today && today.tips && today.tips.length) drawTips(ctx, view, env, today.tips);
      lineMarks(view, list, today, st);
      for (i = 0; i < n; i++) drawOverhead(ctx, view, env, list[i], st, today);
      if (on) { ctx.save(); ctx.translate(cur.tx, cur.y); ctx.scale(spot.s, spot.s); trunkTop(ctx, env, spot); ctx.restore(); }   // his sign reads over the walkers and their bubbles
    },
    /** screen-space hit test: tips first (generous), then Dex and his trunk (once he is set up), then the stand */
    hit: function (sx, sy) {
      var st = SS.state, today = st && st.today, view = SS.view, i, p, s;
      if (!st || !view) return null;
      var tips = (today && today.tips) || [];
      for (i = 0; i < tips.length; i++) {
        var t = tips[i], r = Math.max(28, 20 * view.laneScale(t.lane));
        var dx = sx - view.toX(t.x), dy = sy - (view.laneY(t.lane) - 12 * view.laneScale(t.lane));
        if (dx * dx + dy * dy <= r * r) return { type: 'tip', id: t.id };
      }
      if (dexOn(st) && show.mode === SET) {
        p = dexLayout(view); s = p.s;
        if (sx >= Math.min(p.x - 34 * s, p.tx + (p.dx - 46) * s) && sx <= Math.max(p.x + 30 * s, p.tx + 46 * s) &&
          sy <= p.y + 14 && sy >= p.y - (150 + p.lift + (dex.lim && !dex.sold ? 48 : 0)) * s) return { type: 'dealer' };
      }
      if (!today) return null;
      s = view.laneScale(W.STAND_LANE); var x = view.toX(W.STAND_X), y = view.laneY(W.STAND_LANE);
      if (Math.abs(sx - x) <= 104 * s && sy <= y + 6 && sy >= y - 220 * s) return { type: 'stand' };
      return null;
    },
    /** where Dex's feet (x, y), height (h), trunk (tx, ty) and sign (sx, sy) are drawn right now in screen px; null when he is not in the scene */
    dealerPos: function () {
      var view = SS.view, c;
      if (!view || !view.toX || show.mode === AWAY) return null;
      c = place(view);
      return { x: c.x, y: c.y, h: 120 * c.s, tx: c.tx, ty: c.y - 60 * c.s, sx: c.tx + spot.dx * c.s, sy: c.y - (116 + spot.lift + (spot.lift > 0 ? 15.5 : 11)) * c.s };
    },
    /** true once Dex is set up today (after 'dealer:setup' 'ready'); false while he is away or mid-show */
    dealerReady: function () { return show.mode === SET && dexOn(SS.state); },
    /** main.js: a tap on the stand that the sim turned down (nothing to squeeze yet, or too soon after the last) */
    poke: function () { pokeT = 0.12; },
    /** the customise screen's live preview of the stand with a given look (never touches the scene) */
    drawStandPreview: drawStandPreview,
    /** debug.js: play his entrance ('arrive') or his exit ('leave') right now */
    replay: function (kind) {
      var view = SS.view, st = SS.state, ph = st ? st.phase : '';
      if (!view || !view.toX) return;
      dex.at = -1e9;
      if (kind === 'leave') { if (show.mode === IN || show.mode === SET) { begin(OUT, ph, view, 0); fire(); show.hold = true; } return; }
      show.hold = false;
      if (show.mode !== AWAY) away();
      if (dexOn(st)) begin(IN, ph, view, 0);
    }
  };
})();
