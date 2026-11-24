/* Squeeze Street — actors.js: the stand, the vendor, customers, bubbles, tip coins, the badges
 * over regulars, and Dex the Dealer with his rolling trunk: on the mornings he visits he tows it in and
 * sets up (emitting 'dealer:setup' steps), and at closing he packs up and rolls off.
 * SS.Actors.dealerPos() tells FX where Dex is; dealerReady() says he is open for business.
 * shortcut: one compact rig for all nine customer kinds (props tell them apart), upgrade to
 * per-kind rigs and richer stand tiers if the art needs to carry more. */
(function () {
  'use strict';
  var SS = window.SS, W = SS.W, DATA = SS.DATA, INK = '#1b1f3b', TAU = Math.PI * 2;
  var SKIN = ['#ffd9b3', '#f2c29b', '#d9a273', '#b07a4f', '#8a5a3a', '#6b4226'];
  var HAIR = ['#2b2118', '#5a3a22', '#a8672e', '#e0b050', '#c9452f', '#1b1f3b'];
  var SHIRT = ['#ff6257', '#4cc3f0', '#ffd83d', '#35c977', '#7a5cff', '#ff5d8f', '#ff9f43', '#f4f6ff'];
  var PANTS = ['#2f3a6b', '#3d4a5c', '#6b4a3a', '#1c9655', '#4a4f73', '#8a5a3a'];
  var SIZE = { kid: 0.66, teen: 0.86, parent: 1, jogger: 0.98, elder: 0.92, tourist: 1, office: 1.02, skater: 0.88, vip: 1 };
  var TIER = [
    { body: '#c9a06a', trim: '#a57c48', top: '#b58a55', text: INK },
    { body: '#c98a4b', trim: '#96602e', top: '#a9713a', text: '#fff4b8' },
    { body: '#4cc3f0', trim: '#ffffff', top: '#2487d1', text: INK },
    { body: '#ff6257', trim: '#ffd83d', top: '#d83a30', text: '#ffffff' }
  ];
  var looks = new Map(), tapT = 0, bellT = 0, cheerT = 0;
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
    var h = function (i) { return SS.hash((c.seed | 0) * 13 + i); };
    l = { skin: pick(SKIN, h(1)), hair: c.kind === 'elder' ? '#dcdce6' : pick(HAIR, h(2)),
      shirt: c.kind === 'office' ? '#f4f6ff' : pick(SHIRT, h(3)), pants: pick(PANTS, h(4)),
      s: (SIZE[c.kind] || 1) * (0.95 + h(5) * 0.1) };
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

  /* One person, drawn in world units with the origin at the feet, facing +x.
     o: { kind, phase (walk cycle radians, null = standing), mood, drink (colour|null), armUp 0..1, bob, hideLegs } */
  function person(ctx, l, o) {
    var H = W.CHAR_H * l.s, k = o.kind, walking = o.phase != null, sw = walking ? Math.sin(o.phase) : 0;
    var bob = (walking ? Math.abs(Math.cos(o.phase)) * 3 : Math.sin(o.breath || 0) * 1.2) + (o.bob || 0);
    var hip = -0.42 * H - bob, sh = -0.74 * H - bob, hy = -0.9 * H - bob, hr = 0.15 * H, run = k === 'jogger' ? 1.5 : 1;
    if (k === 'skater') {                                   // rides a board: legs planted
      box(ctx, -24, -7, 48, 5, 2.5, '#ff9f43');
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-15, -1, 3.5, 0, TAU); ctx.arc(15, -1, 3.5, 0, TAU); ctx.fill();
      limb(ctx, -4, hip, -10, -9, 9, l.pants); limb(ctx, 4, hip, 10, -9, 9, l.pants);
    } else if (!o.hideLegs) {
      var reach = 0.2 * H * run;
      limb(ctx, -3, hip, -3 - sw * reach, -2 - Math.max(0, -sw) * 6, 9, l.pants);
      limb(ctx, 3, hip, 3 + sw * reach, -2 - Math.max(0, sw) * 6, 9, l.pants);
    }
    if (k === 'kid') box(ctx, -20, sh + 4, 10, 0.2 * H, 4, '#7a5cff');                 // backpack
    limb(ctx, -2, sh + 5, -4 + sw * 13 * run, sh + 0.3 * H, 7, l.shirt);              // back arm
    box(ctx, -0.14 * H, sh, 0.28 * H, hip - sh + 6, 0.07 * H, l.shirt);               // torso
    if (k === 'office') { ctx.fillStyle = '#ff6257'; ctx.beginPath(); ctx.moveTo(3, sh + 3); ctx.lineTo(8, sh + 0.2 * H); ctx.lineTo(3, sh + 0.26 * H); ctx.lineTo(-1, sh + 0.2 * H); ctx.closePath(); ctx.fill(); }
    if (k === 'tourist') box(ctx, 2, sh + 0.12 * H, 13, 10, 3, '#3d4a5c');             // camera
    var ax = 6 + (o.armUp ? 20 * o.armUp : -sw * 13 * run), ay = sh + 0.3 * H - (o.armUp ? 0.24 * H * o.armUp : 0);
    if (o.drink) { ax = 17; ay = sh + 0.16 * H; }
    limb(ctx, 2, sh + 5, ax, ay, 7, l.shirt);                                          // front arm
    if (o.drink) {
      box(ctx, ax - 2, ay - 15, 11, 15, 2.5, '#ffffff');
      ctx.fillStyle = o.drink; ctx.fillRect(ax, ay - 10, 7, 8);
      ctx.strokeStyle = '#ff6257'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax + 5, ay - 12); ctx.lineTo(ax + 9, ay - 23); ctx.stroke();
    }
    if (k === 'office' && !o.drink) box(ctx, ax - 9, ay + 2, 18, 13, 3, '#6b4a3a');    // briefcase
    if (k === 'elder') { ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax + 2, ay); ctx.lineTo(ax + 6, -1); ctx.stroke(); }
    if (k === 'vip') box(ctx, ax - 4, ay - 14, 12, 15, 2, '#fff4b8');                  // notepad
    // head
    ctx.beginPath(); ctx.arc(0, hy, hr, 0, TAU); ctx.fillStyle = l.skin; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, hy, hr, Math.PI * 1.02, Math.PI * 1.98); ctx.arc(-hr * 0.2, hy - hr * 0.1, hr * 0.95, Math.PI * 1.9, Math.PI * 1.05, true);
    ctx.closePath(); ctx.fillStyle = l.hair; ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hr * 0.2, hy + hr * 0.05, 2.2, 0, TAU); ctx.arc(hr * 0.68, hy + hr * 0.05, 2.2, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
    if (o.mood > 0.25) ctx.arc(hr * 0.45, hy + hr * 0.32, hr * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (o.mood < -0.25) ctx.arc(hr * 0.45, hy + hr * 0.7, hr * 0.3, 1.15 * Math.PI, 1.85 * Math.PI);
    else { ctx.moveTo(hr * 0.2, hy + hr * 0.5); ctx.lineTo(hr * 0.7, hy + hr * 0.5); }
    ctx.stroke();
    // headgear
    if (k === 'kid') { box(ctx, -hr, hy - hr * 1.05, hr * 2, hr * 0.7, hr * 0.5, '#ff6257'); box(ctx, hr * 0.3, hy - hr * 0.55, hr * 1.1, 5, 2.5, '#ff6257'); }
    else if (k === 'teen') { ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, hy, hr * 1.12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); box(ctx, -hr * 0.5, hy - 5, 9, 13, 4, '#7a5cff'); }
    else if (k === 'jogger') { ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, hy, hr * 0.98, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); }
    else if (k === 'tourist') { ctx.fillStyle = '#fff4b8'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, hy - hr * 0.65, hr * 1.7, hr * 0.32, 0, 0, TAU); ctx.fill(); ctx.stroke(); box(ctx, -hr * 0.75, hy - hr * 1.5, hr * 1.5, hr * 0.85, hr * 0.4, '#fff4b8'); }
    else if (k === 'vip') { ctx.fillStyle = '#7a5cff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(-hr * 0.15, hy - hr * 0.85, hr * 1.2, hr * 0.5, -0.2, 0, TAU); ctx.fill(); ctx.stroke(); }
    else if (k === 'elder') { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hr * 0.2, hy + hr * 0.05, 5, 0, TAU); ctx.moveTo(hr * 0.68 + 5, hy + hr * 0.05); ctx.arc(hr * 0.68, hy + hr * 0.05, 5, 0, TAU); ctx.stroke(); }
    return H + bob;
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

  /* dl = how far right of the stand's centre the dealer's left edge is (stand units); when he
     stands close, the sandwich board moves to the left of the stand and the cooler tucks in at the front. */
  function drawStand(ctx, view, env, st, dl) {
    var up = (st && st.upgrades) || {}, today = st && st.today, tier = TIER[SS.clamp(up.stand | 0, 0, 3)];
    var s = view.laneScale(W.STAND_LANE), x = view.toX(W.STAND_X), y = view.laneY(W.STAND_LANE);
    var fl = DATA.byId(DATA.flavors, (st && st.flavor) || 'classic') || DATA.flavors[0], light = SS.light(env.dayT);
    var squash = tapT > 0 ? Math.sin(tapT / 0.22 * Math.PI) * 0.06 : 0, hw = W.STAND_W / 2, tuck = dl < 157;
    shadow(ctx, x, y + 2 * s, 120, s);
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (1 + squash), s * (1 - squash));
    if (up.cooler && !tuck) { box(ctx, 104, -40, 46, 40, 6, '#4cc3f0'); box(ctx, 101, -48, 52, 12, 5, '#ffffff'); }
    if (up.speaker) { box(ctx, -150, -46, 34, 46, 6, '#3d4a5c'); ctx.fillStyle = '#c9cde6'; ctx.beginPath(); ctx.arc(-133, -20, 10 + Math.sin(env.t * 12) * 1.2, 0, TAU); ctx.fill(); }
    if ((up.sign | 0) >= 2) { var bx = dl >= 206 ? 152 : -216; ctx.fillStyle = '#ffd83d'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 16, -62); ctx.lineTo(bx + 46, -62); ctx.lineTo(bx + 60, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); star(ctx, bx + 31, -34, 11, '#ff6257'); }
    // shade
    if ((up.awning | 0) >= 2 || (up.stand | 0) >= 2) {
      var sway = Math.sin(env.t * 1.6) * 3 * (env.wind || 0);
      box(ctx, -hw + 2, -196, 7, 120, 3, tier.trim); box(ctx, hw - 9, -196, 7, 120, 3, tier.trim);
      for (var i = 0; i < 8; i++) {
        var ax = -hw - 14 + i * ((W.STAND_W + 28) / 8), aw = (W.STAND_W + 28) / 8;
        ctx.beginPath(); ctx.moveTo(ax, -214); ctx.lineTo(ax + aw, -214); ctx.lineTo(ax + aw + sway, -184); ctx.arc(ax + aw / 2 + sway, -184, aw / 2, 0, Math.PI); ctx.closePath();
        ctx.fillStyle = i % 2 ? '#ffffff' : (up.awning | 0) >= 2 ? '#ff6257' : '#ffd83d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      }
    } else if (up.awning) {
      box(ctx, 62, -216, 6, 140, 3, '#c9cde6');
      for (var j = 0; j < 6; j++) { ctx.beginPath(); ctx.moveTo(65, -222); ctx.arc(65, -206, 92, Math.PI + j * Math.PI / 6, Math.PI + (j + 1) * Math.PI / 6); ctx.closePath(); ctx.fillStyle = j % 2 ? '#ffffff' : '#ff5d8f'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
    }
    // the crew stands behind the counter
    var brewing = today && today.pitcher && today.pitcher.brew != null, serving = today && today.serving;
    ctx.save(); ctx.translate(-22, -42); ctx.scale(-1, 1);   // on a crate so they clear the counter
    person(ctx, { skin: '#f2c29b', hair: '#a8672e', shirt: '#ffd83d', pants: '#2f3a6b', s: 0.82 }, { kind: 'vendor', hideLegs: true, mood: 1, breath: env.t * 2,
      armUp: serving ? 0.8 : brewing ? 0.5 + Math.sin(env.t * 16) * 0.3 : cheerT > 0 ? 1 : 0, bob: brewing ? Math.abs(Math.sin(env.t * 16)) * 3 : cheerT > 0 ? Math.sin(cheerT / 0.45 * Math.PI) * 8 : 0 });
    ctx.restore();
    if (up.helper) { ctx.save(); ctx.translate(-62, -40); ctx.scale(-1, 1); person(ctx, { skin: '#b07a4f', hair: '#2b2118', shirt: '#35c977', pants: '#2f3a6b', s: 0.74 }, { kind: 'vendor', hideLegs: true, mood: 1, breath: env.t * 2 + 2, armUp: serving ? 0.5 : 0 }); ctx.restore(); }
    // counter
    box(ctx, -hw, -72, W.STAND_W, 72, 8, tier.body);
    box(ctx, -hw - 8, -82, W.STAND_W + 16, 14, 6, tier.top);
    if ((up.stand | 0) === 0) { ctx.strokeStyle = tier.trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-hw + 30, -66); ctx.lineTo(-hw + 30, -4); ctx.moveTo(hw - 38, -66); ctx.lineTo(hw - 38, -4); ctx.stroke(); }
    if ((up.stand | 0) >= 3) {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-hw + 26, 0, 15, 0, TAU); ctx.arc(hw - 26, 0, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9cde6'; ctx.beginPath(); ctx.arc(-hw + 26, 0, 6, 0, TAU); ctx.arc(hw - 26, 0, 6, 0, TAU); ctx.fill();
      for (var b = 0; b < 9; b++) { ctx.fillStyle = (Math.floor(env.t * 3) + b) % 2 ? '#fff4b8' : '#ffd83d'; ctx.beginPath(); ctx.arc(-hw + 10 + b * 20, -75, 3.5, 0, TAU); ctx.fill(); }
    }
    box(ctx, -78, -60, 116, 32, 6, (up.sign | 0) >= 1 || (up.stand | 0) >= 1 ? '#fff4b8' : '#ffffff');
    ctx.font = '17px "Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK; ctx.fillText('LEMONADE', -20, -43, 106);
    if (st) {                                                // live price tag
      ctx.beginPath(); ctx.arc(64, -38, 22, 0, TAU); ctx.fillStyle = '#ff6257'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = '900 13px Figtree, system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(SS.fmtMoney(st.price), 64, -37);
    }
    if ((up.sign | 0) >= 3) {                                // neon, glows after dark
      if (light.night > 0.3) { var g = ctx.createRadialGradient(0, -232, 4, 0, -232, 90); g.addColorStop(0, 'rgba(255,93,143,' + (0.5 * light.night) + ')'); g.addColorStop(1, 'rgba(255,93,143,0)'); ctx.fillStyle = g; ctx.fillRect(-90, -322, 180, 180); }
      box(ctx, -44, -246, 88, 28, 8, INK); ctx.font = '20px "Bagel Fat One", system-ui, sans-serif'; ctx.fillStyle = '#ff8fb3'; ctx.fillText('OPEN', 0, -231);
    }
    if (up.cooler && tuck) { box(ctx, -124, -24, 40, 24, 5, '#4cc3f0'); box(ctx, -127, -31, 46, 10, 4, '#ffffff'); }
    // on the counter: bell, cups, tip jar, pitcher
    ctx.save(); ctx.translate(-70, -82); ctx.rotate(bellT > 0 ? Math.sin(bellT * 26) * 0.5 * bellT : 0);
    ctx.beginPath(); ctx.arc(0, -2, 9, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#ffd83d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    for (var q = 0; q < 3; q++) box(ctx, -46 + q * 3, -98 - q * 3, 12, 16, 2, '#ffffff');
    if (up.tipjar) { box(ctx, 66, -106, 18, 24, 5, up.tipjar >= 2 ? '#ffd83d' : 'rgba(205,238,255,.8)'); ctx.fillStyle = '#f2ae00'; ctx.fillRect(69, -92, 12, 7); }
    var lvl = up.pitcher | 0, pw = 28 + lvl * 5, ph = 38 + lvl * 6, px = 26, py = -82;
    var frac = today && today.pitcher ? SS.clamp(today.pitcher.cups / Math.max(1, today.pitcher.max), 0, 1) : 0.85;
    if (brewing) frac = SS.clamp(today.pitcher.brew, 0, 1);
    ctx.save(); rr(ctx, px - pw / 2, py - ph, pw, ph, 6); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(px - pw / 2, py - ph, pw, ph);
    var surf = py - ph * frac * 0.92;
    ctx.fillStyle = fl.color; ctx.beginPath(); ctx.moveTo(px - pw / 2, py);
    for (var w = 0; w <= 6; w++) ctx.lineTo(px - pw / 2 + pw * w / 6, surf + Math.sin(env.t * 5 + w) * (brewing ? 3 : 1.2));
    ctx.lineTo(px + pw / 2, py); ctx.closePath(); ctx.fill();
    ctx.restore();
    rr(ctx, px - pw / 2, py - ph, pw, ph, 6); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(px + pw / 2 + 2, py - ph * 0.55, 9, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    if (brewing) {                                           // batch progress ring + tap hint
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(27,31,59,.25)'; ctx.beginPath(); ctx.arc(px, py - ph - 26, 15, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#35c977'; ctx.beginPath(); ctx.arc(px, py - ph - 26, 15, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
      if (!env.reduced) { ctx.strokeStyle = 'rgba(255,216,61,' + (0.5 + 0.5 * Math.sin(env.t * 6)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py - ph - 26, 22 + Math.sin(env.t * 6) * 2, 0, TAU); ctx.stroke(); }
    }
    if (today && today.soldOut) {
      ctx.save(); ctx.translate(-12, -112); ctx.rotate(-0.06); box(ctx, -62, -17, 124, 34, 7, '#ff6257');
      ctx.font = '21px "Bagel Fat One", system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('SOLD OUT', 0, 1); ctx.restore();
    }
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
    update: function (dt, view, env) {
      tapT = Math.max(0, tapT - dt); bellT = Math.max(0, bellT - dt); cheerT = Math.max(0, cheerT - dt);
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
      for (; i < n; i++) drawCustomer(ctx, view, env, list[i], fl.color);
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
