/* Squeeze Street — actors.js: the stand, the vendor, customers, bubbles and tip coins.
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
  SS.on('brew:tap', function () { tapT = 0.22; });
  SS.on('bell', function () { bellT = 0.9; });
  SS.on('sale', function () { cheerT = 0.45; });

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
    shadow(ctx, x, y, 22 * l.s, s);
    ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s);
    var top = person(ctx, l, {
      kind: c.kind, phase: standing ? null : c.x * 0.11, breath: env.t * 2 + c.id, mood: c.mood || 0,
      drink: c.hasDrink ? flavorCol : null, armUp: c.state === 'order' ? 0.7 : 0,
      bob: c.state === 'queue' && c.patience < 0.4 ? Math.abs(Math.sin(env.t * 9 + c.id)) * 2 : 0
    });
    if (env.weather.wet > 0.4 && !standing) {              // umbrella in the rain
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, -top * 0.6); ctx.lineTo(8, -top - 26); ctx.stroke();
      ctx.beginPath(); ctx.arc(8, -top - 22, 34, Math.PI, 0); ctx.closePath(); ctx.fillStyle = l.shirt; ctx.fill(); ctx.stroke();
    }
    if (c.kind === 'vip') star(ctx, 0, -top - 14 + Math.sin(env.t * 4) * 2, 7, '#ffd83d');
    ctx.restore();
    if (c.state === 'queue' && c.patience < 0.4) {         // patience running out
      var bw = 34 * s, bx = x - bw / 2, by = y - (top + 12) * s;
      ctx.fillStyle = INK; ctx.fillRect(bx - 2, by - 2, bw + 4, 9);
      ctx.fillStyle = c.patience < 0.18 ? '#ff6257' : '#ffd83d'; ctx.fillRect(bx, by, bw * SS.clamp(c.patience / 0.4, 0, 1), 5);
    }
    if (c.bubble && c.bubble.ttl > 0) bubble(ctx, c.bubble, x + 4 * s, y - (top + 34) * s, s);
  }

  function drawStand(ctx, view, env, st) {
    var up = (st && st.upgrades) || {}, today = st && st.today, tier = TIER[SS.clamp(up.stand | 0, 0, 3)];
    var s = view.laneScale(W.STAND_LANE), x = view.toX(W.STAND_X), y = view.laneY(W.STAND_LANE);
    var fl = DATA.byId(DATA.flavors, (st && st.flavor) || 'classic') || DATA.flavors[0], light = SS.light(env.dayT);
    var squash = tapT > 0 ? Math.sin(tapT / 0.22 * Math.PI) * 0.06 : 0, hw = W.STAND_W / 2;
    shadow(ctx, x, y + 2 * s, 120, s);
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (1 + squash), s * (1 - squash));
    if (up.cooler) { box(ctx, 104, -40, 46, 40, 6, '#4cc3f0'); box(ctx, 101, -48, 52, 12, 5, '#ffffff'); }
    if (up.speaker) { box(ctx, -150, -46, 34, 46, 6, '#3d4a5c'); ctx.fillStyle = '#c9cde6'; ctx.beginPath(); ctx.arc(-133, -20, 10 + Math.sin(env.t * 12) * 1.2, 0, TAU); ctx.fill(); }
    if ((up.sign | 0) >= 2) { ctx.fillStyle = '#ffd83d'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(176, 0); ctx.lineTo(192, -62); ctx.lineTo(224, -62); ctx.lineTo(238, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); star(ctx, 208, -34, 11, '#ff6257'); }
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

  SS.Actors = {
    update: function (dt) { tapT = Math.max(0, tapT - dt); bellT = Math.max(0, bellT - dt); cheerT = Math.max(0, cheerT - dt); },
    draw: function (ctx, view, env) {
      var st = SS.state, today = st && st.today, list = today && today.customers ? today.customers.slice() : [];
      var fl = DATA.byId(DATA.flavors, (st && st.flavor) || 'classic') || DATA.flavors[0];
      list.sort(function (a, b) { return a.lane - b.lane; });
      var i = 0;
      for (; i < list.length && list[i].lane < W.STAND_LANE; i++) drawCustomer(ctx, view, env, list[i], fl.color);
      drawStand(ctx, view, env, st);
      for (; i < list.length; i++) drawCustomer(ctx, view, env, list[i], fl.color);
      if (today && today.tips && today.tips.length) drawTips(ctx, view, env, today.tips);
    },
    /** screen-space hit test: tips first (generous), then the stand */
    hit: function (sx, sy) {
      var st = SS.state, today = st && st.today, view = SS.view;
      if (!today || !view) return null;
      var tips = today.tips || [];
      for (var i = 0; i < tips.length; i++) {
        var t = tips[i], r = Math.max(28, 20 * view.laneScale(t.lane));
        var dx = sx - view.toX(t.x), dy = sy - (view.laneY(t.lane) - 12 * view.laneScale(t.lane));
        if (dx * dx + dy * dy <= r * r) return { type: 'tip', id: t.id };
      }
      var s = view.laneScale(W.STAND_LANE), x = view.toX(W.STAND_X), y = view.laneY(W.STAND_LANE);
      if (Math.abs(sx - x) <= 104 * s && sy <= y + 6 && sy >= y - 220 * s) return { type: 'stand' };
      return null;
    }
  };
})();
