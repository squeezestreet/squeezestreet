/* Squeeze Street — vehicles.js: the food truck (in the street scene and on campaign postcards) and Mom's car.
 *   SS.Vehicles.drawTruck(ctx, look, opts)   side view, origin on the ground under the middle, facing +x, ~360 units long.
 *       look = state.custom.truck (missing fields fall back to DATA.customDefaults().truck)
 *       opts { open 0..1 (awning, default 1), driving 0..1, wheel radians, night 0..1, t seconds, price, vendor bool, driver bool, reduced }
 *   SS.Vehicles.drawCar(ctx, opts)           Mom's family car, same conventions, ~190 long; opts { wheel, door 0..1, driver bool, night }
 *   SS.Vehicles.drawPostcard(ctx, w, h, cityId, t, look, opts)   a live scene of the truck in a city (campaign screen)
 *       opts { status 'trading'|'travelling'|'parked' (default: read from the state), weather {type}, reduced }
 *   SS.Vehicles.update / draw (called by render.js between the actors and the front props): the truck parked by the
 *       stand at home, its departure and return, and Mom's grocery run.
 */
(function () {
  'use strict';
  var SS = window.SS, W = SS.W, DATA = SS.DATA, INK = '#1b1f3b', TAU = Math.PI * 2;
  var FONT = '"Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif', BODY_FONT = 'Figtree, system-ui, sans-serif';

  /* ------------------------------------------------------------------ drawing kit (world units) */
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function ink(ctx, fill, lw) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } ctx.strokeStyle = INK; ctx.lineWidth = lw || 3; ctx.stroke(); }
  function box(ctx, x, y, w, h, r, fill, lw) { rr(ctx, x, y, w, h, r); ink(ctx, fill, lw); }
  function circ(ctx, x, y, r, fill, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); if (lw === 0) { ctx.fillStyle = fill; ctx.fill(); } else ink(ctx, fill, lw); }
  function limb(ctx, x1, y1, x2, y2, w, col) {
    ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = INK; ctx.lineWidth = w + 5; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  var mixMemo = {};
  /** hex colour a..b at t (memoised: the same few mixes are asked for every frame) */
  function mix(a, b, t) {
    var k = a + b + t, v = mixMemo[k];
    if (v) return v;
    var A = parseInt(a.slice(1, 7), 16), B = parseInt(b.slice(1, 7), 16), out = 0, i, ca, cb;
    for (i = 16; i >= 0; i -= 8) { ca = A >> i & 255; cb = B >> i & 255; out |= Math.round(ca + (cb - ca) * t) << i; }
    return (mixMemo[k] = '#' + (0x1000000 + out).toString(16).slice(1));
  }
  function lum(hex) { var n = parseInt(hex.slice(1, 7), 16); return (0.3 * (n >> 16 & 255) + 0.59 * (n >> 8 & 255) + 0.11 * (n & 255)) / 255; }
  var sprites = {};
  /** soft round glow, painted once per colour (never shadowBlur: too slow per frame) */
  function glowSpr(col) {
    var c = sprites['g' + col], g, gr;
    if (c) return c;
    var n = parseInt(col.slice(1, 7), 16), rgb = (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255);
    c = document.createElement('canvas'); c.width = c.height = 64; g = c.getContext('2d');
    gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + rgb + ',.95)'); gr.addColorStop(0.25, 'rgba(' + rgb + ',.45)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (sprites['g' + col] = c);
  }
  function glow(ctx, col, x, y, r, a) {
    if (a <= 0.01) return;
    var op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * Math.min(1, a);
    ctx.drawImage(glowSpr(col), x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
  function heart(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
    ctx.closePath(); ink(ctx, fill, 2.5);
  }
  function lemonSlice(ctx, x, y, r, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    circ(ctx, 0, 0, r, '#fff4b8', 2.2); circ(ctx, 0, 0, r * 0.78, '#ffd83d', 0);
    ctx.strokeStyle = '#fff4b8'; ctx.lineWidth = Math.max(1, r * 0.12); ctx.beginPath();
    for (var i = 0; i < 6; i++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * TAU / 6) * r * 0.74, Math.sin(i * TAU / 6) * r * 0.74); }
    ctx.stroke(); ctx.restore();
  }
  function opt(list, id, fallback) {
    for (var i = 0; list && i < list.length; i++) if (list[i].id === id) return list[i];
    return fallback ? opt(list, fallback) : null;
  }
  /** a look's ids resolved to colours, read defensively (old saves, half-made looks, unknown ids) */
  function resolve(look) {
    var C = (DATA.custom && DATA.custom.truck) || {}, d = DATA.customDefaults ? DATA.customDefaults().truck : {}, l = look || {};
    var paint = opt(C.paint, l.paint, d.paint), acc = opt(C.accent, l.accent, d.accent), aw = opt(C.awning, l.awning, d.awning);
    var name = typeof l.name === 'string' ? l.name : (d.name || 'SQUEEZE STREET');
    return { paint: (paint && paint.color) || '#ffd83d', accent: (acc && acc.color) || '#ffffff', awning: (aw && aw.colors) || ['#ff6257', '#ffffff'],
      wrap: (opt(C.wrap, l.wrap, 'none') || {}).id || 'none', topper: (opt(C.topper, l.topper, 'none') || {}).id || 'none',
      lights: (opt(C.lights, l.lights, 'none') || {}).id || 'none', name: name.trim().toUpperCase() };
  }

  /* ------------------------------------------------------------------ people (fallback rig) */
  /** one person, origin at the feet, facing +x, in the actors' style.
      f { skin, hair, shirt, pants, s, hat: 'sun'|null, hatCol, cap (colour), skirt, cardigan, inner }
      o { phase (walk radians, null = standing), breath, wave 0..1, carry bool, drink colour, armUp 0..1, hideLegs } */
  function figure(ctx, f, o) {
    var H = W.CHAR_H * (f.s || 1), walking = o.phase != null, sw = walking ? Math.sin(o.phase) : 0;
    var bob = walking ? Math.abs(Math.cos(o.phase)) * 3 : Math.sin(o.breath || 0) * 1.2;
    var hip = -0.42 * H - bob, sh = -0.74 * H - bob, hy = -0.9 * H - bob, hr = 0.15 * H, reach = 0.2 * H;
    if (!o.hideLegs) {
      limb(ctx, -3, hip, -3 - sw * reach, -2 - Math.max(0, -sw) * 6, 9, f.pants);
      limb(ctx, 3, hip, 3 + sw * reach, -2 - Math.max(0, sw) * 6, 9, f.pants);
    }
    var swing = o.carry || o.wave ? 0 : sw * 13;
    limb(ctx, -2, sh + 5, -4 + swing, sh + 0.3 * H, 7, f.cardigan || f.shirt);                 // back arm
    if (f.skirt) { ctx.beginPath(); ctx.moveTo(-0.15 * H, hip - 4); ctx.lineTo(0.15 * H, hip - 4); ctx.lineTo(0.2 * H, hip + 0.2 * H); ctx.lineTo(-0.2 * H, hip + 0.2 * H); ctx.closePath(); ink(ctx, f.skirt); }
    box(ctx, -0.14 * H, sh, 0.28 * H, hip - sh + 6, 0.07 * H, f.shirt);                          // torso
    if (f.cardigan) {                                                                          // open cardigan over the top
      ctx.save(); rr(ctx, -0.14 * H, sh, 0.28 * H, hip - sh + 6, 0.07 * H); ctx.clip();
      ctx.fillStyle = f.cardigan; ctx.fillRect(-0.14 * H, sh, 0.15 * H, hip - sh + 6);
      ctx.beginPath(); ctx.moveTo(0.06 * H, sh); ctx.lineTo(0.14 * H, sh); ctx.lineTo(0.14 * H, hip + 6); ctx.lineTo(0.1 * H, hip + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; for (var b = 0; b < 3; b++) { ctx.beginPath(); ctx.arc(0.02 * H, sh + 0.08 * H + b * 0.09 * H, 1.6, 0, TAU); ctx.fill(); }
      ctx.restore(); rr(ctx, -0.14 * H, sh, 0.28 * H, hip - sh + 6, 0.07 * H); ink(ctx, null);
    }
    if (o.carry) groceryBags(ctx, 0.05 * H, hip + 0.04 * H, H);
    var ax = 6 - sw * 13, ay = sh + 0.3 * H;
    if (o.carry) { ax = 0.24 * H; ay = sh + 0.22 * H; }
    else if (o.wave) { ax = 0.14 * H + Math.sin(o.wave * 14) * 6; ay = sh - 0.26 * H; }
    else if (o.armUp) { ax = 6 + 20 * o.armUp; ay = sh + 0.3 * H - 0.24 * H * o.armUp; }
    if (o.drink) { ax = 17; ay = sh + 0.16 * H; }
    limb(ctx, 2, sh + 5, ax, ay, 7, f.cardigan || f.shirt);                                     // front arm
    if (o.drink) { box(ctx, ax - 2, ay - 15, 11, 15, 2.5, '#ffffff'); ctx.fillStyle = o.drink; ctx.fillRect(ax, ay - 10, 7, 8); }
    // head
    circ(ctx, 0, hy, hr, f.skin);
    ctx.beginPath(); ctx.arc(0, hy, hr, Math.PI * 1.02, Math.PI * 1.98); ctx.arc(-hr * 0.2, hy - hr * 0.1, hr * 0.95, Math.PI * 1.9, Math.PI * 1.05, true);
    ctx.closePath(); ink(ctx, f.hair);
    if (f.hat === 'sun') {                                                                       // hair down to the shoulders, then the hat
      ctx.beginPath(); ctx.ellipse(-hr * 0.55, hy + hr * 0.35, hr * 0.5, hr * 0.85, 0.2, 0, TAU); ink(ctx, f.hair);
    }
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hr * 0.2, hy + hr * 0.05, 2.2, 0, TAU); ctx.arc(hr * 0.68, hy + hr * 0.05, 2.2, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(hr * 0.45, hy + hr * 0.32, hr * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    if (f.blush) { ctx.fillStyle = 'rgba(255,93,143,.45)'; ctx.beginPath(); ctx.ellipse(hr * 0.72, hy + hr * 0.42, 3.6, 2.2, 0, 0, TAU); ctx.fill(); }
    if (f.hat === 'sun') {
      ctx.beginPath(); ctx.ellipse(hr * 0.1, hy - hr * 0.55, hr * 1.85, hr * 0.36, -0.08, 0, TAU); ink(ctx, f.hatCol || '#f4d58d');
      ctx.beginPath(); ctx.ellipse(0, hy - hr * 0.85, hr * 0.95, hr * 0.62, 0, Math.PI, TAU); ctx.closePath(); ink(ctx, f.hatCol || '#f4d58d');
      ctx.fillStyle = '#ff6257'; ctx.fillRect(-hr * 0.93, hy - hr * 0.92, hr * 1.86, hr * 0.3);
      ctx.beginPath(); ctx.ellipse(0, hy - hr * 0.85, hr * 0.95, hr * 0.62, 0, Math.PI, TAU); ctx.closePath(); ink(ctx, null, 3);
      circ(ctx, -hr * 0.7, hy - hr * 0.82, hr * 0.2, '#ffffff', 2);
    } else if (f.cap) {
      box(ctx, -hr, hy - hr * 1.05, hr * 2, hr * 0.7, hr * 0.5, f.cap);
      box(ctx, hr * 0.3, hy - hr * 0.55, hr * 1.1, 5, 2.5, f.cap);
    }
    return { hy: hy, hr: hr, H: H };
  }
  /** two paper bags overflowing with lemons, sugar, ice and cups; bottom-left at (x, y) */
  function groceryBags(ctx, x, y, H) {
    var k = H / 110;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    // what pokes out of the bags, back to front
    box(ctx, 4, -64, 13, 30, 3, '#ffffff', 2.2); ctx.fillStyle = '#ff6257'; ctx.fillRect(5.5, -52, 10, 4);   // sugar sack
    for (var i = 0; i < 4; i++) box(ctx, 26 - i * 0.5, -60 + i * 5, 12, 9, 2, '#ffffff', 2);                   // a stack of cups
    circ(ctx, 12, -48, 6.5, '#ffd83d', 2.2); circ(ctx, 21, -51, 6, '#ffd83d', 2.2); circ(ctx, 4, -44, 6, '#f2ae00', 2.2);  // lemons
    ctx.beginPath(); ctx.moveTo(14, -54); ctx.quadraticCurveTo(18, -64, 25, -63); ctx.quadraticCurveTo(20, -55, 14, -54); ink(ctx, '#35c977', 2);
    box(ctx, 30, -46, 15, 16, 5, 'rgba(205,238,255,.95)', 2.2); ctx.fillStyle = '#ffffff'; ctx.fillRect(33, -42, 4, 4); ctx.fillRect(39, -39, 4, 4);   // ice
    // the bags
    ctx.beginPath(); ctx.moveTo(-4, -42); ctx.lineTo(26, -42); ctx.lineTo(28, 0); ctx.lineTo(-6, 0); ctx.closePath(); ink(ctx, '#d9a86c', 2.6);
    ctx.beginPath(); ctx.moveTo(20, -36); ctx.lineTo(46, -36); ctx.lineTo(47, 2); ctx.lineTo(19, 2); ctx.closePath(); ink(ctx, '#c9925a', 2.6);
    ctx.strokeStyle = 'rgba(27,31,59,.35)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3, -36); ctx.lineTo(25, -36); ctx.moveTo(21, -30); ctx.lineTo(45, -30); ctx.stroke();
    ctx.restore();
  }
  var drawPersonOK = true;
  /** the vendor and the postcard customers use the actors' rig when it is exported; Mom always uses her own (sunhat, cardigan, bags) */
  function person(ctx, f, o) {
    var A = SS.Actors;
    // drawPerson is actors.js person(); the little rig below stays as the fallback if it ever throws
    if (drawPersonOK && A && typeof A.drawPerson === 'function' && !f.hat) {
      try { A.drawPerson(ctx, f, { kind: f.kind || 'vendor', phase: o.phase, breath: o.breath, mood: 1, armUp: o.armUp, drink: o.drink, hideLegs: o.hideLegs }); return; }
      catch (e) { drawPersonOK = false; }
    }
    figure(ctx, f, o);
  }

  /* ------------------------------------------------------------------ the food truck */
  var WHEEL_R = 27, WHEELS = [-112, 116];
  // the window, its awning and the name panel, in truck units
  var WIN = { x0: -98, x1: 58, y0: -162, y1: -104 };
  function bodyPath(ctx) {
    var i, a = Math.asin(9 / 34);
    ctx.beginPath(); ctx.moveTo(-168, -36);
    for (i = 0; i < 2; i++) { ctx.lineTo(WHEELS[i] - 34 * Math.cos(a), -36); ctx.arc(WHEELS[i], -WHEEL_R, 34, Math.PI + a, -a, false); }
    ctx.lineTo(172, -36); ctx.quadraticCurveTo(182, -36, 182, -48); ctx.lineTo(182, -98);
    ctx.quadraticCurveTo(182, -116, 164, -120); ctx.lineTo(150, -124);
    ctx.lineTo(122, -198); ctx.quadraticCurveTo(116, -212, 100, -212);
    ctx.lineTo(-166, -212); ctx.quadraticCurveTo(-180, -212, -180, -198); ctx.lineTo(-180, -48); ctx.quadraticCurveTo(-180, -36, -168, -36);
    ctx.closePath();
  }
  function wrapArt(ctx, L, t) {
    var x, y, i, k;
    if (L.wrap === 'stripes') {
      ctx.fillStyle = L.accent; ctx.fillRect(-190, -60, 380, 9); ctx.fillRect(-190, -47, 380, 4);
      ctx.fillStyle = mix(L.accent, INK, 0.25); ctx.fillRect(-190, -51, 380, 1.5);
      ctx.save(); ctx.translate(-150, -60); ctx.transform(1, 0, -0.6, 1, 0, 0);       // a swoosh up the back
      ctx.fillStyle = L.accent; ctx.fillRect(0, -130, 12, 130); ctx.fillRect(18, -110, 5, 110); ctx.restore();
    } else if (L.wrap === 'dots') {
      ctx.fillStyle = lum(L.paint) > 0.6 ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.3)';
      for (y = -204, k = 0; y < -30; y += 22, k++) for (x = -176 + (k % 2) * 15; x < 186; x += 30) { ctx.beginPath(); ctx.arc(x, y, 6.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = L.accent; ctx.globalAlpha = 0.55;
      for (y = -193, k = 0; y < -30; y += 44, k++) for (x = -161 + (k % 2) * 30; x < 186; x += 60) { ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (L.wrap === 'slices') {
      for (i = 0; i < 26; i++) lemonSlice(ctx, -176 + SS.hash(i * 7 + 1) * 356, -200 + SS.hash(i * 7 + 2) * 160, 8 + SS.hash(i * 7 + 3) * 8, SS.hash(i * 7 + 4) * 3);
    } else if (L.wrap === 'checker') {
      for (i = 0; i < 2; i++) for (x = -184, k = 0; x < 186; x += 12, k++) {
        ctx.fillStyle = (k + i) % 2 ? INK : '#ffffff'; ctx.fillRect(x, -60 + i * 12, 12, 12);
        ctx.fillStyle = (k + i) % 2 ? '#ffffff' : INK; if (i === 0) ctx.fillRect(x, -212, 12, 9);
      }
    }
  }
  function awningArt(ctx, L, p) {
    var x0 = WIN.x0 - 6, x1 = WIN.x1 + 6, top = WIN.y0 - 10 - 20 * p, bot = SS.lerp(WIN.y1, WIN.y0 + 2, p), fl = 13 * p;
    var n = 8, cols = L.awning, i, ax, bx, sw = (x1 - x0 + 2 * fl) / n, r = sw / 2;
    if (p > 0.05) {                                                       // the struts that hold it open
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(x0 + 6, WIN.y0 + 30); ctx.lineTo(x0 - fl + 4, bot); ctx.moveTo(x1 - 6, WIN.y0 + 30); ctx.lineTo(x1 + fl - 4, bot); ctx.stroke();
    }
    for (i = 0; i < n; i++) {
      ax = x0 + (x1 - x0) * i / n; bx = x0 - fl + sw * i;
      ctx.beginPath(); ctx.moveTo(ax, top); ctx.lineTo(ax + (x1 - x0) / n, top); ctx.lineTo(bx + sw, bot); ctx.arc(bx + r, bot, r, 0, Math.PI); ctx.closePath();
      ink(ctx, cols[i % cols.length], 2.5);
    }
    box(ctx, x0 - 3, top - 5, x1 - x0 + 6, 8, 4, mix(cols[0], INK, 0.2), 2.5);
  }
  function menuBoard(ctx, x, y, w, h, price) {
    box(ctx, x - 4, y - 4, w + 8, h + 8, 5, '#c98b55');
    box(ctx, x, y, w, h, 3, '#2c3e3a', 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    ctx.font = '13px ' + FONT; ctx.fillText('MENU', x + w / 2, y + 11);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (var i = 0; i < 2; i++) { circ(ctx, x + 10, y + 25 + i * 11, 3.2, i ? '#ff8fb3' : '#ffd83d', 0); ctx.moveTo(x + 17, y + 25 + i * 11); ctx.lineTo(x + w - 8, y + 25 + i * 11); }
    ctx.stroke();
    ctx.font = '900 15px ' + BODY_FONT; ctx.fillStyle = '#ffd83d';
    ctx.fillText(SS.fmtMoney(price), x + w / 2, y + h - 11, w - 6);
  }
  function lightsArt(ctx, L, night, t, reduced) {
    var i, x, y, lit = night > 0.05, k;
    if (L.lights === 'bulbs') {
      var cols = ['#ffe27a', '#ff8fb3', '#9df0c8', '#8fd3ff'];
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath();
      for (x = -174; x <= 104; x += 4) { k = ((x + 174) % 70) / 70; ctx.lineTo(x, -206 + Math.sin(k * Math.PI) * 9); }
      ctx.stroke();
      for (i = 0, x = -167; x < 104; x += 17.5, i++) {
        k = ((x + 174) % 70) / 70; y = -203 + Math.sin(k * Math.PI) * 9;
        var on = lit && (reduced || Math.sin(t * 3 + i * 1.7) > -0.85);
        circ(ctx, x, y, 3.6, on ? mix(cols[i % 4], '#ffffff', 0.45) : mix(cols[i % 4], '#ffffff', 0.2), 1.6);
        if (on) glow(ctx, cols[i % 4], x, y, 16, night * 0.9);
      }
    } else if (L.lights === 'neon') {
      var c = '#ff5d8f', c2 = '#4cf0ff', a = 0.35 + 0.65 * night;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      rr(ctx, WIN.x0 - 13, WIN.y0 - 20, WIN.x1 - WIN.x0 + 26, WIN.y1 - WIN.y0 + 30, 12);
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = mix(c, '#ffffff', 0.3); ctx.lineWidth = 3.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-172, -42); ctx.lineTo(176, -42);
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = mix(c2, '#ffffff', 0.3); ctx.lineWidth = 3.4; ctx.stroke();
      if (night > 0.05) {
        var op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.35; ctx.lineWidth = 14; ctx.strokeStyle = c; rr(ctx, WIN.x0 - 13, WIN.y0 - 20, WIN.x1 - WIN.x0 + 26, WIN.y1 - WIN.y0 + 30, 12); ctx.stroke();
        ctx.strokeStyle = c2; ctx.beginPath(); ctx.moveTo(-172, -42); ctx.lineTo(176, -42); ctx.stroke();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = op;
        for (x = -150; x < 170; x += 60) glow(ctx, c2, x, -40, 34, night * 0.5);
        glow(ctx, c, WIN.x0, WIN.y0, 40, night * 0.5); glow(ctx, c, WIN.x1, WIN.y1, 40, night * 0.5);
      }
    }
  }
  function topperArt(ctx, L, t, reduced, open) {
    var bob = reduced ? 0 : Math.sin(t * 2.2) * 2, x = -42;
    if (L.topper === 'none') return;
    box(ctx, x - 26, -220, 52, 10, 4, '#c9cde6', 2.5);                                          // roof mount
    if (L.topper === 'lemon') {
      ctx.save(); ctx.translate(x, -252 + bob); ctx.rotate(-0.12);
      circ(ctx, -56, 0, 7, '#ffd83d', 3); circ(ctx, 56, 0, 7, '#ffd83d', 3);                     // the nubs make it a lemon
      ctx.beginPath(); ctx.moveTo(-56, 0); ctx.bezierCurveTo(-50, -38, 50, -38, 56, 0); ctx.bezierCurveTo(50, 38, -50, 38, -56, 0); ctx.closePath(); ink(ctx, '#ffd83d', 3);
      ctx.save(); ctx.clip(); ctx.fillStyle = '#f2ae00'; ctx.beginPath(); ctx.ellipse(6, 24, 58, 16, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(-56, 0); ctx.bezierCurveTo(-50, -38, 50, -38, 56, 0); ctx.bezierCurveTo(50, 38, -50, 38, -56, 0); ctx.closePath(); ink(ctx, null, 3);
      ctx.fillStyle = 'rgba(242,174,0,.6)'; for (var d = 0; d < 7; d++) { ctx.beginPath(); ctx.arc(-30 + d * 10, (d % 2 ? 6 : 12) + 2, 1.8, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = '#fff4b8'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-34, -14); ctx.quadraticCurveTo(-16, -24, 4, -24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, -22); ctx.quadraticCurveTo(52, -46, 66, -34); ctx.quadraticCurveTo(50, -18, 30, -22); ink(ctx, '#35c977', 2.5);
      ctx.restore();
    } else if (L.topper === 'cup') {
      ctx.save(); ctx.translate(x, -216 + bob * 0.5);
      ctx.beginPath(); ctx.moveTo(18, -74); ctx.lineTo(34, -112); ctx.lineTo(42, -110); ctx.lineTo(27, -72); ctx.closePath(); ink(ctx, '#ffffff', 2.5);
      ctx.fillStyle = '#ff6257'; ctx.fillRect(29, -100, 7, 5);
      ctx.beginPath(); ctx.moveTo(-30, -72); ctx.lineTo(30, -72); ctx.lineTo(22, 0); ctx.lineTo(-22, 0); ctx.closePath(); ink(ctx, '#ffffff', 3);
      ctx.save(); ctx.clip(); ctx.fillStyle = '#ffe14d'; ctx.fillRect(-32, -60, 64, 60); ctx.fillStyle = '#ff6257'; ctx.fillRect(-32, -40, 64, 12); ctx.restore();
      ctx.beginPath(); ctx.moveTo(-30, -72); ctx.lineTo(30, -72); ctx.lineTo(22, 0); ctx.lineTo(-22, 0); ctx.closePath(); ink(ctx, null, 3);
      box(ctx, -34, -80, 68, 10, 5, '#ffffff', 3);
      lemonSlice(ctx, -28, -78, 13, 0.4);
      ctx.restore();
    } else if (L.topper === 'squeezy') {
      box(ctx, x - 5, -238, 10, 22, 3, '#c9cde6', 2.5);
      if (SS.Mascot && SS.Mascot.draw) SS.Mascot.draw(ctx, x, -272 + bob, 104, { rot: reduced ? 0 : Math.sin(t * 1.6) * 0.06 });
      else circ(ctx, x, -270, 40, '#ffd83d');
    } else if (L.topper === 'horn') {
      box(ctx, x - 4, -250, 8, 34, 3, '#8c93b0', 2.5);
      ctx.save(); ctx.translate(x, -256);
      ctx.beginPath(); ctx.moveTo(-14, -9); ctx.lineTo(26, -26); ctx.quadraticCurveTo(32, 0, 26, 26); ctx.lineTo(-14, 9); ctx.closePath(); ink(ctx, '#ffffff', 3);
      ctx.fillStyle = L.accent === '#ffffff' ? '#ff6257' : L.accent; ctx.fillRect(4, -17, 6, 34);
      ctx.beginPath(); ctx.ellipse(26, 0, 6, 26, 0, 0, TAU); ink(ctx, '#c9cde6', 3);
      box(ctx, -24, -10, 12, 20, 4, '#3d4a5c', 2.5);
      if (open > 0.5 && !reduced) {                                                              // it calls out while trading
        ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        for (var i = 0; i < 3; i++) { var u = (t * 1.2 + i / 3) % 1; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.arc(30, 0, 12 + u * 30, -0.6, 0.6); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }
  function wheel(ctx, x, rot, hub) {
    var y = -WHEEL_R, i;
    circ(ctx, x, y, WHEEL_R, '#2b2f45', 3);
    circ(ctx, x, y, 14, hub, 2.5);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath();
    for (i = 0; i < 5; i++) { var a = rot + i * TAU / 5; ctx.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); }
    ctx.stroke(); circ(ctx, x, y, 3.5, INK, 0);
  }
  function puffs(ctx, x, y, t, amt, dir) {
    if (amt <= 0.02) return;
    for (var i = 0; i < 5; i++) {
      var u = (t * 1.7 + i / 5) % 1;
      ctx.globalAlpha = amt * (1 - u) * 0.85;
      circ(ctx, x - dir * (6 + u * 64), y - u * 30 - Math.sin(u * 6 + i) * 3, 5 + u * 13, '#eef0f8', 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawTruck(ctx, look, opts) {
    opts = opts || {};
    var L = resolve(look), t = opts.t || 0, night = SS.clamp(opts.night || 0, 0, 1), red = !!opts.reduced;
    var open = opts.open == null ? 1 : SS.clamp(opts.open, 0, 1), drive = SS.clamp(+opts.driving || 0, 0, 1), rot = opts.wheel || 0;
    var price = opts.price != null ? opts.price : (SS.state && SS.state.truck && SS.state.truck.price) || (DATA.truck && DATA.truck.priceStart) || 2;
    var pEase = SS.ease.inOutCubic(open), squeezyWrap = L.wrap === 'squeezy';
    var bounce = drive > 0 && !red ? Math.sin(t * 19) * 0.9 * drive : 0;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(19,26,58,.22)'; ctx.beginPath(); ctx.ellipse(0, 1, 196, 9, 0, 0, TAU); ctx.fill();
    if (squeezyWrap && open > 0.4) {                                                              // the menu goes out on the pavement
      ctx.save(); ctx.translate(-212, 0); ctx.rotate(-0.04);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-18, -70); ctx.moveTo(24, 0); ctx.lineTo(18, -70); ctx.stroke();
      menuBoard(ctx, -25, -80, 50, 58, price); ctx.restore();
    }
    // wheel wells, then the body over them
    for (var i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(WHEELS[i], -WHEEL_R, 34, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#20243a'; ctx.fill(); }
    ctx.translate(0, bounce);
    bodyPath(ctx); ctx.fillStyle = L.paint; ctx.fill();
    ctx.save(); bodyPath(ctx); ctx.clip();
    wrapArt(ctx, L, t);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-176, -208, 290, 6);                   // light from the top left
    ctx.fillStyle = 'rgba(27,31,59,.16)'; ctx.fillRect(-190, -64, 380, 40);                      // the skirt sits in shade
    ctx.fillStyle = L.accent; ctx.fillRect(-190, -66, 380, 4);
    if (squeezyWrap && SS.Mascot && SS.Mascot.draw) SS.Mascot.draw(ctx, -136, -136, 108, { rot: -0.08 });
    ctx.restore();
    bodyPath(ctx); ink(ctx, null, 3.5);
    // cab: side window with the driver, door with the Squeezy badge, lights and bumpers
    ctx.beginPath(); ctx.moveTo(92, -196); ctx.lineTo(112, -196); ctx.quadraticCurveTo(116, -196, 118, -191); ctx.lineTo(138, -140); ctx.lineTo(92, -140); ctx.closePath();
    ink(ctx, night > 0.4 ? '#4a5a8a' : '#bfe6ff', 3);
    if (opts.driver) { ctx.save(); ctx.clip(); circ(ctx, 108, -158, 13, '#f2c29b', 2.5); box(ctx, 94, -176, 28, 11, 5, L.accent === '#ffffff' ? '#ff6257' : L.accent, 2.5); ctx.restore(); }
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(98, -150); ctx.lineTo(108, -188); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(88, -200); ctx.lineTo(88, -42); ctx.moveTo(146, -126); ctx.lineTo(146, -42); ctx.stroke();
    box(ctx, 94, -124, 14, 5, 2.5, L.accent, 2);
    circ(ctx, 118, -94, 18, '#ffffff', 2.5);
    if (SS.Mascot && SS.Mascot.draw) SS.Mascot.draw(ctx, 118, -95, 32);
    circ(ctx, 176, -102, 8.5, '#fff4b8', 2.5);
    box(ctx, -186, -100, 9, 20, 3, '#ff6257', 2.5);
    box(ctx, 170, -60, 20, 15, 5, '#c9cde6', 2.5); box(ctx, -190, -58, 16, 14, 4, '#c9cde6', 2.5);
    box(ctx, -184, -44, 12, 6, 2, '#8c93b0', 2);                                                   // tailpipe
    // the serving window: interior, vendor, counter, cups
    var lit = night > 0.05, inside = lit ? mix('#ffe7a3', '#ffb85c', 0.3) : '#3b4170';
    rr(ctx, WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, 6); ctx.fillStyle = inside; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = lit ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.08)'; ctx.fillRect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, 14);
    ctx.fillStyle = lit ? 'rgba(160,90,30,.25)' : 'rgba(0,0,0,.2)'; ctx.fillRect(WIN.x0, WIN.y0 + 30, WIN.x1 - WIN.x0, 4);
    if (opts.vendor !== false && open > 0.55) {
      ctx.save(); ctx.translate(-26, -54); ctx.scale(-1, 1);
      person(ctx, { skin: '#f2c29b', hair: '#a8672e', shirt: '#ffd83d', pants: '#2f3a6b', s: 0.82, cap: L.accent === '#ffffff' ? '#ff6257' : L.accent, apron: '#ffffff', blush: true },   // the Squeezy uniform, like the stand crew
        { breath: t * 2, armUp: red ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.4), hideLegs: true });
      ctx.restore();
    }
    ctx.restore();
    rr(ctx, WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, 6); ctx.strokeStyle = L.accent; ctx.lineWidth = 9; ctx.stroke(); ink(ctx, null, 3);
    rr(ctx, WIN.x0 - 4.5, WIN.y0 - 4.5, WIN.x1 - WIN.x0 + 9, WIN.y1 - WIN.y0 + 9, 9); ink(ctx, null, 2.5);
    if (lit) glow(ctx, '#ffd98f', (WIN.x0 + WIN.x1) / 2, WIN.y1 + 10, 120, night * 0.45 * (0.4 + 0.6 * open));
    box(ctx, WIN.x0 - 10, WIN.y1 + 2, WIN.x1 - WIN.x0 + 20, 9, 3, '#c9cde6', 2.5);                    // counter shelf
    if (open > 0.55) {
      var fl = SS.state && DATA.byId(DATA.flavors, SS.state.flavor || 'classic'), drink = (fl && fl.color) || '#ffe14d';
      for (i = 0; i < 3; i++) { box(ctx, -78 + i * 15, WIN.y1 - 14, 11, 16, 2, '#ffffff', 2); ctx.fillStyle = drink; ctx.fillRect(-76.5 + i * 15, WIN.y1 - 9, 8, 7); }
      box(ctx, 30, WIN.y1 - 18, 16, 20, 5, 'rgba(205,238,255,.9)', 2); ctx.fillStyle = '#f2ae00'; ctx.fillRect(33, WIN.y1 - 7, 10, 6);   // tip jar
    }
    awningArt(ctx, L, pEase);
    if (!squeezyWrap) menuBoard(ctx, -170, -166, 58, 62, price);
    // the name, painted big below the window and fitted to the panel
    var name = L.name || '', fs = 30, maxW = 246;
    if (name) {
      ctx.font = fs + 'px ' + FONT;
      var tw = ctx.measureText(name).width;
      if (tw > maxW) { fs = Math.max(12, Math.floor(fs * maxW / tw)); ctx.font = fs + 'px ' + FONT; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      var dark = L.accent === INK || lum(L.accent) < 0.25;
      ctx.strokeStyle = dark ? '#ffffff' : INK; ctx.lineWidth = Math.max(4, fs * 0.22); ctx.strokeText(name, -46, -78);
      ctx.fillStyle = L.accent; ctx.fillText(name, -46, -78);
    }
    lightsArt(ctx, L, night, t, red);
    topperArt(ctx, L, t, red, open);
    if (night > 0.05) { glow(ctx, '#fff1bf', 190, -100, 36, night); if (drive > 0) glow(ctx, '#fff1bf', 250, -80, 70, night * 0.5); glow(ctx, '#ff5a4a', -186, -90, 18, night * 0.8); }
    ctx.translate(0, -bounce);
    for (i = 0; i < 2; i++) wheel(ctx, WHEELS[i], rot, L.accent === INK ? '#c9cde6' : mix(L.accent, '#e6e9f5', 0.4));
    puffs(ctx, -188, -42, t, drive, 1);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ Mom's car */
  var CAR_R = 19, CAR_WHEELS = [-60, 62], CAR_COL = '#7fd3c8';
  var MOM = { skin: '#e3ab7f', hair: '#6b3b22', shirt: '#ffffff', cardigan: '#ff9ec4', skirt: '#7a5cff', pants: '#e3ab7f', s: 1, hat: 'sun', hatCol: '#f4d58d', blush: true };
  function carBody(ctx) {
    var a = Math.asin(6 / 25), i;
    ctx.beginPath(); ctx.moveTo(-86, -25);
    for (i = 0; i < 2; i++) { ctx.lineTo(CAR_WHEELS[i] - 25 * Math.cos(a), -25); ctx.arc(CAR_WHEELS[i], -CAR_R, 25, Math.PI + a, -a, false); }
    ctx.lineTo(90, -25); ctx.quadraticCurveTo(100, -25, 100, -36); ctx.lineTo(100, -50); ctx.quadraticCurveTo(100, -62, 86, -64);
    ctx.lineTo(60, -66); ctx.quadraticCurveTo(46, -96, 26, -98); ctx.lineTo(-74, -98); ctx.quadraticCurveTo(-88, -98, -90, -84);
    ctx.lineTo(-96, -40); ctx.quadraticCurveTo(-98, -25, -86, -25); ctx.closePath();
  }
  function drawCar(ctx, opts) {
    opts = opts || {};
    var rot = opts.wheel || 0, door = SS.clamp(opts.door || 0, 0, 1), night = SS.clamp(opts.night || 0, 0, 1), i;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(19,26,58,.22)'; ctx.beginPath(); ctx.ellipse(0, 1, 104, 7, 0, 0, TAU); ctx.fill();
    for (i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(CAR_WHEELS[i], -CAR_R, 25, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#20243a'; ctx.fill(); }
    carBody(ctx); ctx.fillStyle = CAR_COL; ctx.fill();
    ctx.save(); carBody(ctx); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-90, -96, 120, 5);
    ctx.fillStyle = '#c98b55'; ctx.fillRect(-100, -54, 160, 14);                                // wood-panel stripe: a proper family wagon
    ctx.strokeStyle = 'rgba(110,60,20,.45)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (i = -92; i < 60; i += 9) { ctx.moveTo(i, -52 + (i % 3)); ctx.quadraticCurveTo(i + 6, -47, i + 2, -42); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(27,31,59,.14)'; ctx.fillRect(-100, -36, 200, 14);
    ctx.restore();
    carBody(ctx); ink(ctx, null, 3);
    box(ctx, -70, -106, 86, 6, 3, '#c9cde6', 2.5); ctx.strokeStyle = INK; ctx.lineWidth = 2.5;           // roof rack
    ctx.beginPath(); ctx.moveTo(-60, -100); ctx.lineTo(-60, -97); ctx.moveTo(6, -100); ctx.lineTo(6, -97); ctx.stroke();
    var glass = night > 0.4 ? '#4a5a8a' : '#bfe6ff';
    ctx.beginPath(); ctx.moveTo(-82, -66); ctx.lineTo(-78, -90); ctx.lineTo(-48, -90); ctx.lineTo(-48, -66); ctx.closePath(); ink(ctx, glass, 2.5);
    box(ctx, -42, -90, 36, 24, 3, glass, 2.5);
    // the driver's door, hinged at its front edge: it swings toward us
    var dx0 = 0, dx1 = 50, k = Math.cos(door * 1.25);
    if (door > 0.02) { ctx.fillStyle = '#2a2f4a'; ctx.fillRect(dx0, -92, dx1 - dx0, 66); }
    ctx.save(); ctx.translate(dx1, 0); ctx.scale(k, 1); ctx.translate(-dx1, 0);
    ctx.beginPath(); ctx.moveTo(dx0, -92); ctx.lineTo(28, -92); ctx.quadraticCurveTo(40, -90, 48, -68); ctx.lineTo(dx1, -28); ctx.lineTo(dx0, -28); ctx.closePath();
    ink(ctx, door > 0.02 ? mix(CAR_COL, '#ffffff', 0.15) : null, 2.5);
    ctx.beginPath(); ctx.moveTo(4, -88); ctx.lineTo(26, -88); ctx.quadraticCurveTo(36, -86, 42, -68); ctx.lineTo(4, -68); ctx.closePath(); ink(ctx, glass, 2.5);
    if (opts.driver && door <= 0.02) {                                                        // Mom at the wheel, sunhat and all
      ctx.save(); ctx.clip(); circ(ctx, 20, -72, 10, MOM.skin, 2.5);
      ctx.beginPath(); ctx.ellipse(20, -80, 18, 4, -0.08, 0, TAU); ink(ctx, MOM.hatCol, 2.5);
      ctx.beginPath(); ctx.ellipse(19, -84, 10, 7, 0, Math.PI, TAU); ctx.closePath(); ink(ctx, MOM.hatCol, 2.5); ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(10, -72); ctx.lineTo(16, -86); ctx.stroke();
    box(ctx, 8, -60, 12, 4, 2, '#c9cde6', 2);
    ctx.restore();
    circ(ctx, 94, -54, 6, '#fff4b8', 2.5); box(ctx, -99, -60, 7, 13, 3, '#ff6257', 2.5);
    box(ctx, 88, -38, 16, 11, 4, '#c9cde6', 2.5); box(ctx, -104, -38, 14, 11, 4, '#c9cde6', 2.5);
    if (night > 0.05) { glow(ctx, '#fff1bf', 104, -54, 26, night); glow(ctx, '#ff5a4a', -100, -54, 14, night * 0.8); }
    for (i = 0; i < 2; i++) {
      var x = CAR_WHEELS[i], y = -CAR_R;
      circ(ctx, x, y, CAR_R, '#2b2f45', 3); circ(ctx, x, y, 9, '#e6e9f5', 2.5);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
      for (var j = 0; j < 4; j++) { var a = rot + j * TAU / 4; ctx.moveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ the street scene */
  // ground depth (world units from the back edge of the pavement, like laneY) of the truck's and the car's wheels:
  // just off the curb, so they stand in front of everyone on the pavement
  var TRUCK_Y = 126, CAR_Y = 138, TRUCK_K = 0.95;
  var NONE = 0, PARKED = 1, LEAVE = 2, ARRIVE = 3;
  var tk = { mode: NONE, x: null, x0: 0, t: 0, wheel: 0, horn: false }, dex = { at: -1e9, on: false };
  /** is the truck standing at home right now? (a trip planned this morning has not left yet) */
  function truckHome(st) {
    var T = st && st.truck, R = T && T.route;
    if (!T || st.phase === 'title') return false;
    if (!R) return T.at === 'home';
    return R.from === 'home' && R.left === R.total && st.phase === 'prep';
  }
  function dexToday(st) {
    var now = performance.now(), info = null;
    if (now - dex.at < 300) return dex.on;
    dex.at = now; dex.on = false;
    if (!st || (st.phase !== 'prep' && st.phase !== 'day')) return false;
    try { info = SS.Sim && SS.Sim.dealerInfo ? SS.Sim.dealerInfo() : null; } catch (e) { info = null; }
    dex.on = info ? !!info.present : !!(st.dealer && st.dealer.day === st.day);
    return dex.on;
  }
  /** where the parked truck's middle goes: clear of the stand's widest props, and of Dex's trunk and sign on days he visits.
   *  On a narrow view (a portrait phone) that spot is off the edge, so it pulls up to the curb just right of the counter
   *  instead, its back end in view, the way Dex's cart peeks in (on his days it waits beyond him). */
  function parkX(st, view) {
    var dexIn = dexToday(st), x = (dexIn ? W.DEALER_X + 128 : W.STAND_X + 228) + 190 * TRUCK_K;
    if (!dexIn && view && isFinite(view.x1)) x = Math.max(W.STAND_X + W.STAND_W / 2 + 4 + 190 * TRUCK_K, Math.min(x, view.x1 + 190 * TRUCK_K - 80));
    return x;
  }
  function rollTo(nx) { tk.wheel += (nx - tk.x) / (WHEEL_R * TRUCK_K); tk.x = nx; }
  function updateTruck(dt, view, env) {
    var st = SS.state, home = truckHome(st), tgt = parkX(st, view), u;
    if (tk.mode === LEAVE) {
      tk.t += dt;
      if (!tk.horn && tk.t > 0.35) { tk.horn = true; if (SS.Audio && SS.Audio.play) { try { SS.Audio.play('horn'); } catch (e) { /* audio is optional */ } } }
      if (env.reduced || tk.t > 3.6 || tk.x - 200 > view.x1 + 40) tk.mode = NONE;
      else if (tk.t <= 0.8) tk.x = tk.x0 = tgt;              // honking: keep to the spot while the camera settles from the morning view
      else { u = (tk.t - 0.8) / 2.6; rollTo(tk.x0 + 1200 * u * u); }
    } else if (tk.mode === ARRIVE) {
      tk.t += dt; u = Math.min(1, tk.t / 2.8);
      rollTo(SS.lerp(tk.x0, tgt, SS.ease.outCubic(u)));
      if (u >= 1 || env.reduced) { tk.mode = home ? PARKED : NONE; tk.x = tgt; }
    } else if (home) {
      if (tk.mode !== PARKED || tk.x == null || env.reduced) tk.x = tgt;
      else if (Math.abs(tgt - tk.x) > 0.5) rollTo(SS.damp(tk.x, tgt, 1.6, dt));         // shuffle along to make room for Dex
      tk.mode = PARKED;
    } else tk.mode = NONE;
  }
  function drawSceneTruck(ctx, view, env, night) {
    if (tk.mode === NONE || tk.x == null) return;
    var s = view.scale * TRUCK_K, x = view.toX(tk.x), y = view.groundY + TRUCK_Y * view.scale;
    if (x + 200 * s < 0 || x - 250 * s > view.w) return;
    var going = tk.mode === LEAVE ? (tk.t < 0.8 ? 0.6 : 1) : tk.mode === ARRIVE ? 1 - SS.smooth((tk.t - 2) / 0.8) : 0;
    var st = SS.state, look = st && st.custom && st.custom.truck;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    drawTruck(ctx, look, { open: 0, driving: going, wheel: tk.wheel, night: night, t: env.t, reduced: env.reduced, driver: tk.mode !== PARKED, vendor: false });
    ctx.restore();
  }
  SS.on('truck:depart', function (p) {
    if (p && p.from === 'home' && tk.mode === PARKED) { tk.mode = LEAVE; tk.t = 0; tk.x0 = tk.x; tk.horn = false; }
  });
  function driveIn() { var v = SS.view; tk.mode = ARRIVE; tk.t = 0; tk.x0 = Math.min(v && v.x0 != null ? v.x0 : 0, W.STAND_X - 600) - 260; tk.x = tk.x0; }
  SS.on('truck:arrive', function (p) { if (p && p.city === 'home') driveIn(); });
  SS.on('truck:buy', driveIn);

  /* Mom's grocery run. Driven by the game clock (state.today.clock), so it keeps pace at every speed and freezes when paused.
     Arrival takes the warning's eta (fractions of it below); the bags land exactly when 'groceries' fires; then she waves and leaves. */
  // the car pulls up just past the stand's right end (in front of it, it hid the counter and the queue's feet); she walks
  // back along the car to the stand. On a portrait phone that spot is off the edge: you see her drive past, then walk in.
  var mom = null, STOP_X = W.STAND_X + 250, SPOT = { x: W.STAND_X + 118, y: 8 + 0.5 * (W.SIDEWALK_H - 8) };
  var PATH = [[STOP_X + 22, CAR_Y + 4], [STOP_X - 104, CAR_Y + 4], [SPOT.x, SPOT.y]], CAR_K = 1;   // roof rack level with the stand's base
  var BACKWARD = PATH[1][0] < PATH[0][0];
  var pose = { car: 0, wheel: 0, door: 0, driver: true, out: false, x: 0, y: 0, dir: 1, walk: 0, carry: true, wave: 0, heart: -1, bags: -1 };
  SS.on('groceries:incoming', function (p) {
    var st = SS.state, td = st && st.today, g = td && td.groceries, eta = Math.max(0, Number(p && p.eta) || 0);
    if (!td) return;
    var at = g && !g.done && isFinite(g.at) ? g.at : td.clock + eta;
    mom = { A: at - eta, at: at, E: Math.max(0.001, eta), landed: false, exit: -1, x0: 0, seen: false };
  });
  SS.on('groceries', function () { if (mom) mom.landed = true; });
  SS.on('phase', function (p) {
    if (!mom || (p && p.to === 'day')) return;
    if (mom.seen && mom.exit < 0) { mom.exit = 0; mom.x0 = pose.car; } else if (mom.exit < 0) mom = null;   // the day ended first: she hops in and drives off
  });
  var LEN1 = Math.abs(PATH[1][0] - PATH[0][0]), LEN2 = Math.hypot(PATH[2][0] - PATH[1][0], PATH[2][1] - PATH[1][1]);
  /** a point k (0..1) along the walk from the car door to the stand */
  function walkAt(k, o, back) {
    var d = k * (LEN1 + LEN2), q;
    if (d <= LEN1) { o.x = PATH[0][0] + (BACKWARD ? -d : d); o.y = PATH[0][1]; o.dir = (back ? -1 : 1) * (BACKWARD ? -1 : 1); }
    else { q = (d - LEN1) / LEN2; o.x = SS.lerp(PATH[1][0], PATH[2][0], q); o.y = SS.lerp(PATH[1][1], PATH[2][1], q); o.dir = (PATH[2][0] < PATH[1][0]) === !back ? -1 : 1; }
    o.walk = d / 7;
  }
  /** where everything is at game clock `c`; false once the run is over */
  function momPose(c, view, red) {
    var M = mom, E = M.E, u = (c - M.A) / E, v = c - M.at, P = pose, gone = M.landed || v > 0.5;
    var x0 = Math.min(view.x0, STOP_X - 500) - 140, x1 = Math.max(view.x1, STOP_X + 500) + 140;
    P.out = false; P.door = 0; P.driver = true; P.carry = !M.landed; P.wave = 0; P.heart = -1; P.bags = -1; P.walk = 0; P.dir = 1;
    if (u < 0) return false;
    if (red) {                                                     // reduced motion: no driving or walking, just the moments
      if (v > 2) return false;
      P.car = STOP_X; P.driver = false; P.out = true; P.x = SPOT.x; P.y = SPOT.y; P.dir = -1;
      return true;
    }
    if (v < 0 || !gone) {                                          // on the way in
      P.car = u < 0.32 ? SS.lerp(x0, STOP_X, SS.ease.outCubic(u / 0.32)) : STOP_X;
      P.door = SS.smooth((u - 0.32) / 0.08) * (1 - SS.smooth((u - 0.46) / 0.08));
      if (u >= 0.38) { P.out = true; P.driver = false; walkAt(SS.clamp((u - 0.42) / 0.58, 0, 1), P); }
      return true;
    }
    P.car = STOP_X; P.driver = false;
    if (v < 1.2) {                                                 // bags down, a wave and a heart
      P.out = true; walkAt(1, P); P.walk = 0;
      if (M.landed) { P.wave = v; P.heart = v / 1.2; P.bags = v; }
    } else if (v < 3.4) {                                          // back to the car
      P.out = true; walkAt(1 - (v - 1.2) / 2.2, P, true);
      if (M.landed) P.bags = v;
    } else if (v < 3.9) { P.door = 1 - SS.smooth((v - 3.5) / 0.4); P.driver = v > 3.6; if (v < 3.55) { P.out = true; walkAt(0, P, true); P.walk = 0; } }
    else if (v < 5.8) { P.driver = true; P.car = SS.lerp(STOP_X, x1, Math.pow((v - 3.9) / 1.9, 2)); }
    else return false;
    if (P.bags > 1.2) P.bags = -1;
    return true;
  }
  function drawMom(ctx, view, env, P) {
    // nearer than the front lane she would tower over the car: cap the perspective there
    var lane = Math.min(1, (P.y - 8) / (W.SIDEWALK_H - 8)), s = view.laneScale(lane), x = view.toX(P.x), y = view.groundY + P.y * view.scale;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(19,26,58,.22)'; ctx.beginPath(); ctx.ellipse(0, 1, 22, 5, 0, 0, TAU); ctx.fill();
    ctx.scale(P.dir, 1);
    var f = figure(ctx, MOM, { phase: P.walk ? P.walk : null, breath: env.t * 2, carry: P.carry, wave: P.wave && !env.reduced ? P.wave : 0 });
    if (P.bags >= 0) {                                             // set down in front of her, then off they fly (fx.js)
      var k = 1 - SS.smooth((P.bags - 0.85) / 0.35);
      ctx.save(); ctx.translate(24, 0); ctx.scale(k, k); groceryBags(ctx, -20, 0, 110); ctx.restore();
    }
    ctx.scale(P.dir, 1);
    if (P.heart >= 0 && P.heart < 1) {
      var hy = f.hy - f.hr - 26 - (env.reduced ? 0 : P.heart * 30);
      ctx.globalAlpha = 1 - SS.smooth((P.heart - 0.6) / 0.4);
      heart(ctx, 6, hy, 9 * (0.6 + 0.4 * SS.ease.outBack(Math.min(1, P.heart * 4))), '#ff5d8f');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function drawMomRun(ctx, view, env, night) {
    var st = SS.state, td = st && st.today, P = pose, cy, cs, cx;
    if (!mom) return;
    if (mom.exit >= 0) {                                           // real time: the day is over, she just drives away
      mom.exit += env.dt;
      P.car = mom.x0 + 900 * Math.pow(mom.exit / 1.6, 2); P.out = false; P.door = 0; P.driver = true;
      if (mom.exit > 1.6 || env.reduced) { mom = null; return; }
    } else if (!td || !momPose(td.clock, view, env.reduced)) { if (td && td.clock > mom.at) mom = null; return; }
    mom.seen = true;
    P.wheel = P.car / (CAR_R * CAR_K);
    cs = view.scale * CAR_K; cx = view.toX(P.car); cy = view.groundY + CAR_Y * view.scale;
    var momFront = P.out && P.y > CAR_Y;
    if (P.out && !momFront) drawMom(ctx, view, env, P);
    if (cx + 120 * cs > 0 && cx - 120 * cs < view.w) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(cs, cs);
      drawCar(ctx, { wheel: P.wheel, door: P.door, driver: P.driver, night: night });
      ctx.restore();
    }
    if (momFront) drawMom(ctx, view, env, P);
  }

  function update(dt, view, env) { if (view && view.toX) updateTruck(dt, view, env); }
  function draw(ctx, view, env) {
    var night = SS.light(env.dayT || 0).night;
    drawSceneTruck(ctx, view, env, night);
    drawMomRun(ctx, view, env, night);
  }

  /* ------------------------------------------------------------------ campaign postcards
     Each city is three pictures painted once per size: the backdrop (sky to road), a roadside strip and a pavement strip.
     The two strips tile sideways, so while the truck travels they scroll past it at two speeds. */
  var HZ = 0.6, R0 = 0.66, R1 = 0.84, TRUCK_AT = 0.81, FEET = 0.94;
  var pc = {}, pcKeys = [];
  function sheet(key, w, h, dpr, paint) {
    var c = pc[key], g;
    if (c) return c;
    c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    g = c.getContext('2d'); g.scale(dpr, dpr); g.lineJoin = 'round'; g.lineCap = 'round';
    try { paint(g, w, h); } catch (e) { if (window.console) console.error('[SS.Vehicles] postcard paint failed', key, e); }
    pc[key] = c; pcKeys.push(key);
    if (pcKeys.length > 12) delete pc[pcKeys.shift()];                 // four cities' worth: ~1.4 MB a sheet at 2x
    return c;
  }
  function fill(g, col, x, y, w, h) { g.fillStyle = col; g.fillRect(x, y, w, h); }
  function sky(g, w, h, a, b, c) {
    var gr = g.createLinearGradient(0, 0, 0, h * HZ);
    gr.addColorStop(0, a); gr.addColorStop(c ? 0.6 : 1, b); if (c) gr.addColorStop(1, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h * HZ + 2);
  }
  function hills(g, w, base, amp, wl, seed, col, bot) {
    g.beginPath(); g.moveTo(0, bot);
    for (var x = 0; x <= w + 6; x += 6) g.lineTo(x, base - amp * (0.5 + 0.35 * Math.sin(x / wl * TAU + seed) + 0.15 * Math.sin(x / wl * 7.3 + seed * 3)));
    g.lineTo(w, bot); g.closePath(); g.fillStyle = col; g.fill();
  }
  function blob(g, x, y, r, col, hi) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.arc(x - r * 0.7, y + r * 0.3, r * 0.7, 0, TAU); g.arc(x + r * 0.7, y + r * 0.25, r * 0.75, 0, TAU); g.fill(); if (hi) { g.fillStyle = hi; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, TAU); g.fill(); } }
  function pine(g, x, y, s, col, hi) {
    fill(g, '#6b4a3a', x - s * 0.08, y - s * 0.3, s * 0.16, s * 0.3);
    for (var i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x, y - s * (1.25 - i * 0.28)); g.lineTo(x + s * (0.32 + i * 0.1), y - s * (0.55 - i * 0.2)); g.lineTo(x - s * (0.32 + i * 0.1), y - s * (0.55 - i * 0.2)); g.closePath(); g.fillStyle = i === 0 && hi ? hi : col; g.fill(); }
  }
  function lamp(g, x, y, s, col, head) { fill(g, col, x - s * 0.03, y - s, s * 0.06, s); g.beginPath(); g.arc(x + s * 0.06, y - s, s * 0.09, Math.PI, TAU); g.fillStyle = col; g.fill(); g.fillStyle = head || '#fff4c4'; g.fillRect(x, y - s, s * 0.12, s * 0.05); }
  function windows(g, x, y, w, h, cols, rows, col, seed) {
    var cw = w / (cols * 2 + 1), rh = h / (rows * 2 + 1);
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) { g.fillStyle = typeof col === 'function' ? col(SS.hash(seed + i * 31 + j * 7)) : col; g.fillRect(x + cw * (1 + i * 2), y + rh * (1 + j * 2), cw, rh); }
  }
  /** paint fn(dx) at 0, -w and +w so anything crossing an edge wraps around */
  function tiled(w, fn) { fn(0); fn(-w); fn(w); }
  function road(g, w, h, top, col, line) {
    fill(g, col, 0, h * R0, w, h * (R1 - R0));
    fill(g, 'rgba(0,0,0,.15)', 0, h * R0, w, h * 0.012);
    if (line) for (var x = 0; x < w; x += w / 8) fill(g, line, x + w * 0.02, h * (R0 + R1) / 2 - 1.5, w * 0.06, 3);
    fill(g, top, 0, h * R1, w, h * 0.022);
  }
  function walk(g, w, h, col, joint) {
    fill(g, col, 0, h * (R1 + 0.022), w, h);
    g.fillStyle = joint; for (var x = 0; x < w; x += w / 10) g.fillRect(x, h * (R1 + 0.022), 1.5, h);
  }
  // per city: night (0..1, lights the truck), back(g,w,h), side(g,w,h,dx) roadside strip, front(g,w,h) pavement, live(ctx,w,h,t) moving bits
  var CITY = {
    home: { back: function (g, w, h) {
      sky(g, w, h, '#62b8f2', '#cdeeff'); hills(g, w, h * 0.5, h * 0.12, w * 0.7, 1, '#a9d6a0', h); hills(g, w, h * 0.55, h * 0.06, w * 0.4, 2, '#93c98a', h);
      var cols = ['#f7e7b4', '#c9dff0', '#f5cdb4', '#cfe6d2'], roofs = ['#b7694f', '#6f7f93', '#8b6c58', '#55838a'];
      for (var i = 0; i < 4; i++) {
        var x = w * (0.04 + i * 0.26), hw = w * 0.2, hy = h * 0.34;
        fill(g, cols[i], x, hy, hw, h * HZ - hy); g.fillStyle = roofs[i]; g.beginPath(); g.moveTo(x - 6, hy); g.lineTo(x + hw / 2, hy - h * 0.12); g.lineTo(x + hw + 6, hy); g.fill();
        windows(g, x, hy + 4, hw, h * 0.2, 3, 2, '#9fc3d8', i); fill(g, roofs[(i + 2) % 4], x + hw * 0.42, h * 0.48, hw * 0.16, h * 0.12);
      }
      fill(g, '#8fcf6e', 0, h * HZ, w, h * (R0 - HZ));
      g.fillStyle = '#ffffff'; for (var p = 0; p < w; p += 7) g.fillRect(p, h * 0.56, 3, h * 0.05); g.fillRect(0, h * 0.575, w, 2.5);
      road(g, w, h, '#efe9dd', '#626a77', '#f2d36b');
    }, side: function (g, w, h, dx) {
      blob(g, dx + w * 0.3, h * 0.6, h * 0.05, '#4f9a55', '#6fb86a'); lamp(g, dx + w * 0.62, h * R0, h * 0.3, '#2f4a3c'); blob(g, dx + w * 0.9, h * 0.61, h * 0.04, '#4f9a55', '#6fb86a');
    }, front: function (g, w, h) { walk(g, w, h, '#ddd6ca', 'rgba(110,102,90,.35)'); } },

    maple: { back: function (g, w, h) {
      sky(g, w, h, '#73bff0', '#e4f4ff'); hills(g, w, h * 0.42, h * 0.16, w * 0.9, 4, '#9bc28c', h);
      g.fillStyle = '#a9b4a4'; g.beginPath(); g.moveTo(w * 0.72, h * 0.6); g.lineTo(w * 0.76, h * 0.26); g.lineTo(w * 0.86, h * 0.24); g.lineTo(w * 0.9, h * 0.6); g.fill();
      fill(g, '#8fd3ff', w * 0.8, h * 0.25, w * 0.035, h * 0.35); g.fillStyle = 'rgba(255,255,255,.8)'; for (var k = 0; k < 4; k++) g.fillRect(w * 0.805 + k * w * 0.007, h * 0.27, 1.5, h * 0.32);   // the falls
      blob(g, w * 0.815, h * 0.6, h * 0.035, '#ffffff');
      fill(g, '#f3ecdc', w * 0.5, h * 0.22, w * 0.05, h * 0.38); g.fillStyle = '#7d6180'; g.beginPath(); g.moveTo(w * 0.495, h * 0.22); g.lineTo(w * 0.525, h * 0.1); g.lineTo(w * 0.555, h * 0.22); g.fill();   // the church
      var cols = ['#c9634f', '#f3e2c0', '#b65a8a', '#e9b93a', '#5f9e55'];
      for (var i = 0; i < 5; i++) {
        var x = w * (0.02 + i * 0.2) - (i > 2 ? w * 0.06 : 0), bw = w * 0.17, by = h * (0.36 + 0.04 * (i % 2));
        if (i === 3) continue;
        fill(g, cols[i], x, by, bw, h * HZ - by); fill(g, 'rgba(0,0,0,.12)', x, by, bw, 3);
        windows(g, x, by + 3, bw, h * 0.1, 3, 1, '#fff4d6', i);
        for (var s = 0; s < 6; s++) fill(g, s % 2 ? '#ffffff' : cols[(i + 2) % 5], x + s * bw / 6, h * 0.5, bw / 6, h * 0.035);
      }
      fill(g, '#8fcf6e', 0, h * HZ, w, h * (R0 - HZ)); road(g, w, h, '#efe2cc', '#5f6672', '#f2d36b');
    }, side: function (g, w, h, dx) {
      fill(g, '#6b4a3a', dx + w * 0.2, h * 0.52, 4, h * 0.14); blob(g, dx + w * 0.205, h * 0.5, h * 0.06, '#e2574c', '#f08a3c');
      lamp(g, dx + w * 0.55, h * R0, h * 0.28, '#2f3a6b');
      fill(g, '#6b4a3a', dx + w * 0.84, h * 0.53, 4, h * 0.13); blob(g, dx + w * 0.845, h * 0.51, h * 0.055, '#f08a3c', '#ffc24d');
    }, front: function (g, w, h) { walk(g, w, h, '#e3d5c2', 'rgba(140,100,70,.3)'); } },

    pines: { back: function (g, w, h) {
      sky(g, w, h, '#86c4ee', '#eaf7ff');
      g.fillStyle = '#b6c6e0'; g.beginPath(); g.moveTo(-10, h * 0.5); g.lineTo(w * 0.22, h * 0.14); g.lineTo(w * 0.42, h * 0.42); g.lineTo(w * 0.62, h * 0.08); g.lineTo(w * 0.9, h * 0.4); g.lineTo(w + 10, h * 0.3); g.lineTo(w + 10, h * 0.6); g.lineTo(-10, h * 0.6); g.fill();
      g.fillStyle = '#ffffff'; [[0.22, 0.14], [0.62, 0.08]].forEach(function (p) { g.beginPath(); g.moveTo(w * p[0], h * p[1]); g.lineTo(w * p[0] + w * 0.07, h * (p[1] + 0.1)); g.lineTo(w * p[0] + w * 0.02, h * (p[1] + 0.08)); g.lineTo(w * p[0] - w * 0.03, h * (p[1] + 0.11)); g.lineTo(w * p[0] - w * 0.07, h * (p[1] + 0.1)); g.fill(); });
      hills(g, w, h * 0.5, h * 0.1, w * 0.5, 3, '#8ea6c8', h);
      for (var i = 0; i < 24; i++) pine(g, (i + 0.5) * w / 24, h * (0.6 + SS.hash(i) * 0.02), h * (0.12 + SS.hash(i + 9) * 0.06), i % 3 ? '#2f6a4f' : '#3f7d5c');
      fill(g, '#7fb069', 0, h * HZ, w, h * (R0 - HZ)); road(g, w, h, '#c9c0a8', '#59606b', '#ffffff');
    }, side: function (g, w, h, dx) {
      pine(g, dx + w * 0.12, h * R0, h * 0.3, '#2c6a48', '#3f8a55'); pine(g, dx + w * 0.2, h * R0, h * 0.22, '#3f8a55', '#58a04a');
      pine(g, dx + w * 0.58, h * R0, h * 0.34, '#2c6a48', '#3f8a55'); pine(g, dx + w * 0.86, h * R0, h * 0.24, '#3f8a55', '#58a04a');
    }, front: function (g, w, h) { walk(g, w, h, '#b9a47e', 'rgba(90,70,40,.25)'); } },

    dust: { back: function (g, w, h) {
      sky(g, w, h, '#ff9d5c', '#ffe3a8'); circ(g, w * 0.78, h * 0.24, h * 0.1, '#fff1c4', 0);
      g.fillStyle = '#e8a06a'; g.beginPath(); g.moveTo(0, h * 0.6); g.lineTo(w * 0.04, h * 0.34); g.lineTo(w * 0.24, h * 0.34); g.lineTo(w * 0.28, h * 0.6); g.fill();
      g.beginPath(); g.moveTo(w * 0.55, h * 0.6); g.lineTo(w * 0.58, h * 0.42); g.lineTo(w * 0.7, h * 0.42); g.lineTo(w * 0.73, h * 0.6); g.fill();
      g.fillStyle = '#c8643c'; g.beginPath(); g.moveTo(w * 0.3, h * 0.6); g.lineTo(w * 0.34, h * 0.26); g.lineTo(w * 0.46, h * 0.26); g.lineTo(w * 0.5, h * 0.6); g.fill();
      g.beginPath(); g.moveTo(w * 0.84, h * 0.6); g.lineTo(w * 0.87, h * 0.38); g.lineTo(w * 0.97, h * 0.38); g.lineTo(w + 4, h * 0.6); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(w * 0.34, h * 0.26, w * 0.12, 3); g.fillRect(w * 0.04, h * 0.34, w * 0.2, 3);
      fill(g, '#f0c987', 0, h * HZ, w, h * (R0 - HZ)); road(g, w, h, '#e8cfa0', '#a89478', '#f6e7c4');
    }, side: function (g, w, h, dx) {
      var cactus = function (x, s) {
        g.fillStyle = '#4e9a5a'; rr(g, x - s * 0.08, h * R0 - s, s * 0.16, s, s * 0.08); g.fill();
        rr(g, x - s * 0.3, h * R0 - s * 0.7, s * 0.12, s * 0.36, s * 0.06); g.fill(); fill(g, '#4e9a5a', x - s * 0.3, h * R0 - s * 0.42, s * 0.3, s * 0.1);
        rr(g, x + s * 0.18, h * R0 - s * 0.82, s * 0.12, s * 0.4, s * 0.06); g.fill(); fill(g, '#4e9a5a', x, h * R0 - s * 0.5, s * 0.3, s * 0.1);
        fill(g, 'rgba(255,255,255,.25)', x - s * 0.05, h * R0 - s * 0.95, s * 0.04, s * 0.9);
      };
      cactus(dx + w * 0.16, h * 0.24); cactus(dx + w * 0.7, h * 0.3);
      for (var i = 0; i < 3; i++) fill(g, '#8a6a4c', dx + w * (0.36 + i * 0.07), h * (R0 - 0.07), 3, h * 0.07);
      fill(g, '#8a6a4c', dx + w * 0.36, h * (R0 - 0.06), w * 0.14 + 3, 2);
    }, front: function (g, w, h) { walk(g, w, h, '#f2d49b', 'rgba(160,110,50,.2)'); } },

    sunport: { back: function (g, w, h) {
      sky(g, w, h, '#4fc0f5', '#d6f3ff'); fill(g, '#2fa8d8', 0, h * 0.44, w, h * 0.12); fill(g, '#5cc3e8', 0, h * 0.44, w, h * 0.02);
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath();
      for (var i = 0; i < 9; i++) { var x = SS.hash(i + 40) * w, y = h * (0.47 + SS.hash(i + 50) * 0.07); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y - 3, x + 12, y); } g.stroke();
      fill(g, '#ffffff', w * 0.7, h * 0.4, w * 0.08, h * 0.04); fill(g, '#ff6257', w * 0.72, h * 0.37, w * 0.03, h * 0.03);   // a little boat
      fill(g, '#f6dc9c', 0, h * 0.56, w, h * (R0 - 0.56));
      for (var u = 0; u < 4; u++) { var ux = w * (0.08 + u * 0.27); fill(g, '#ffffff', ux, h * 0.5, 2, h * 0.08); g.beginPath(); g.arc(ux + 1, h * 0.5, w * 0.04, Math.PI, TAU); g.fillStyle = u % 2 ? '#ff5d8f' : '#ffd83d'; g.fill(); }
      road(g, w, h, '#e9d7b0', '#6f7682', '#ffffff');
    }, side: function (g, w, h, dx) {
      var palm = function (x, s) {
        g.strokeStyle = '#a5743f'; g.lineWidth = s * 0.07; g.beginPath(); g.moveTo(x, h * R0); g.quadraticCurveTo(x + s * 0.2, h * R0 - s * 0.5, x + s * 0.1, h * R0 - s); g.stroke();
        g.fillStyle = '#35a65a'; for (var k = 0; k < 5; k++) { var a = -Math.PI * (0.1 + k * 0.2); g.beginPath(); g.ellipse(x + s * 0.1 + Math.cos(a) * s * 0.22, h * R0 - s + Math.sin(a) * s * 0.12 + s * 0.05, s * 0.26, s * 0.06, a + Math.PI / 2 + 1.4, 0, TAU); g.fill(); }
        circ(g, x + s * 0.08, h * R0 - s * 0.97, s * 0.04, '#6b4a3a', 0);
      };
      palm(dx + w * 0.2, h * 0.34); palm(dx + w * 0.74, h * 0.3);
      fill(g, '#ffffff', dx + w * 0.46, h * (R0 - 0.12), w * 0.06, h * 0.09); fill(g, '#ff6257', dx + w * 0.455, h * (R0 - 0.135), w * 0.07, h * 0.025);   // lifeguard hut
    }, front: function (g, w, h) { walk(g, w, h, '#d9a86c', 'rgba(110,70,30,.35)'); fill(g, 'rgba(255,255,255,.25)', 0, h * (R1 + 0.022), w, 2); } },

    harbor: { back: function (g, w, h) {
      sky(g, w, h, '#7cc6f2', '#e3f3ff');
      for (var i = 0; i < 7; i++) { var x = w * (0.02 + i * 0.14), th = h * (0.16 + SS.hash(i + 3) * 0.2); fill(g, i % 2 ? '#9fb3cc' : '#b3c4da', x, h * 0.44 - th, w * 0.1, th); windows(g, x, h * 0.44 - th + 3, w * 0.1, th - 3, 3, Math.max(2, Math.round(th / 14)), '#dfeaf7', i); }
      fill(g, '#3a8fc0', 0, h * 0.44, w, h * 0.16); fill(g, 'rgba(255,255,255,.2)', 0, h * 0.44, w, 2);
      fill(g, '#d8453c', w * 0.05, h * 0.47, w * 0.46, h * 0.07); fill(g, '#ffffff', w * 0.38, h * 0.4, w * 0.1, h * 0.07);   // the ship
      var box6 = ['#ff9f43', '#4cc3f0', '#35c977', '#ffd83d', '#7a5cff', '#ff5d8f'];
      for (var c = 0; c < 12; c++) fill(g, box6[c % 6], w * (0.07 + (c % 6) * 0.05), h * (0.43 - Math.floor(c / 6) * 0.04), w * 0.048, h * 0.038);
      var crane = function (x) { g.strokeStyle = '#ff9f43'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, h * 0.6); g.lineTo(x + w * 0.02, h * 0.16); g.lineTo(x + w * 0.04, h * 0.6); g.moveTo(x - w * 0.06, h * 0.18); g.lineTo(x + w * 0.16, h * 0.18); g.stroke(); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + w * 0.12, h * 0.18); g.lineTo(x + w * 0.12, h * 0.34); g.stroke(); };
      crane(w * 0.6); crane(w * 0.8);
      fill(g, '#b8bcc6', 0, h * HZ, w, h * (R0 - HZ)); road(g, w, h, '#ffd83d', '#575d68', '#ffffff');
    }, side: function (g, w, h, dx) {
      for (var i = 0; i < 3; i++) { fill(g, '#3d4a5c', dx + w * (0.1 + i * 0.33), h * (R0 - 0.04), w * 0.025, h * 0.04); fill(g, '#ffd83d', dx + w * (0.1 + i * 0.33), h * (R0 - 0.04), w * 0.025, 2); }
      lamp(g, dx + w * 0.3, h * R0, h * 0.28, '#3d4a5c'); lamp(g, dx + w * 0.8, h * R0, h * 0.28, '#3d4a5c');
    }, front: function (g, w, h) { walk(g, w, h, '#c3c7cf', 'rgba(60,66,80,.25)'); for (var x = 0; x < w; x += 16) fill(g, x % 32 ? INK : '#ffd83d', x, h * (R1 + 0.022), 16, 3); } },

    capitol: { back: function (g, w, h) {
      sky(g, w, h, '#78c4f2', '#eaf6ff');
      blob(g, w * 0.12, h * 0.48, h * 0.1, '#4f9a5a', '#6fb86a'); blob(g, w * 0.94, h * 0.47, h * 0.11, '#4f9a5a', '#6fb86a');
      var cx = w * 0.56, bw = w * 0.56;
      fill(g, '#f4f1ea', cx - bw / 2, h * 0.36, bw, h * 0.24); fill(g, '#e2ddd2', cx - bw / 2, h * 0.34, bw, h * 0.03);
      for (var i = 0; i < 11; i++) fill(g, '#ffffff', cx - bw / 2 + bw * (0.04 + i * 0.09), h * 0.38, bw * 0.035, h * 0.2);
      fill(g, '#ece6da', cx - w * 0.12, h * 0.26, w * 0.24, h * 0.09);
      g.fillStyle = '#dfe6ef'; g.beginPath(); g.ellipse(cx, h * 0.26, w * 0.1, h * 0.13, 0, Math.PI, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(cx - w * 0.04, h * 0.21, w * 0.025, h * 0.05, -0.3, 0, TAU); g.fill();
      fill(g, '#c9cde6', cx - 1.5, h * 0.06, 3, h * 0.08); fill(g, '#ff6257', cx + 1.5, h * 0.06, w * 0.035, h * 0.03); fill(g, '#ffffff', cx + 1.5, h * 0.072, w * 0.035, h * 0.008);
      for (var s = 0; s < 3; s++) fill(g, s % 2 ? '#e2ddd2' : '#f4f1ea', cx - w * 0.12 - s * 6, h * (0.58 + s * 0.01), w * 0.24 + s * 12, h * 0.012);
      fill(g, '#8fcf6e', 0, h * HZ, w, h * (R0 - HZ)); road(g, w, h, '#efe9dd', '#5d6470', '#ffffff');
    }, side: function (g, w, h, dx) {
      for (var i = 0; i < 3; i++) { var x = dx + w * (0.15 + i * 0.33); g.fillStyle = '#3f7d4a'; g.beginPath(); g.moveTo(x, h * (R0 - 0.13)); g.lineTo(x + w * 0.025, h * R0); g.lineTo(x - w * 0.025, h * R0); g.fill(); }
      lamp(g, dx + w * 0.32, h * R0, h * 0.28, '#2e3440', '#fff4c4'); lamp(g, dx + w * 0.65, h * R0, h * 0.28, '#2e3440', '#fff4c4');
    }, front: function (g, w, h) { walk(g, w, h, '#e6e0d4', 'rgba(110,102,90,.3)'); } },

    bloom: { back: function (g, w, h) {
      sky(g, w, h, '#6fc6fb', '#effaff'); hills(g, w, h * 0.55, h * 0.06, w * 0.6, 5, '#a9d6a0', h);
      var tent = function (x, s, a, b) {
        for (var i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x, h * 0.6 - s); g.lineTo(x - s * 0.7 + i * s * 0.233, h * 0.6); g.lineTo(x - s * 0.7 + (i + 1) * s * 0.233, h * 0.6); g.closePath(); g.fillStyle = i % 2 ? b : a; g.fill(); }
        fill(g, '#ffd83d', x - 1, h * 0.6 - s - 8, 2, 8); fill(g, '#ff5d8f', x + 1, h * 0.6 - s - 8, 8, 5);
      };
      tent(w * 0.14, h * 0.2, '#ff6257', '#ffffff'); tent(w * 0.4, h * 0.26, '#4cc3f0', '#ffd83d'); tent(w * 0.6, h * 0.16, '#7a5cff', '#ffffff');
      g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(0, h * 0.3); g.quadraticCurveTo(w * 0.25, h * 0.4, w * 0.5, h * 0.3); g.stroke();
      for (var f = 0; f < 9; f++) { var fx = w * (0.03 + f * 0.052), fy = h * 0.3 + Math.sin(f / 9 * Math.PI) * h * 0.05; g.fillStyle = ['#ff6257', '#ffd83d', '#35c977', '#4cc3f0'][f % 4]; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + 8, fy); g.lineTo(fx + 4, fy + 9); g.fill(); }
      fill(g, '#8fd16a', 0, h * HZ, w, h * (R0 - HZ)); road(g, w, h, '#e9dfc8', '#b49a7a', null);
    }, side: function (g, w, h, dx) {
      for (var i = 0; i < 3; i++) { var x = dx + w * (0.12 + i * 0.33); fill(g, '#ffffff', x, h * (R0 - 0.2), 2, h * 0.2); g.fillStyle = ['#ff5d8f', '#ffd83d', '#4cc3f0'][i]; g.beginPath(); g.moveTo(x + 2, h * (R0 - 0.2)); g.lineTo(x + 16, h * (R0 - 0.18)); g.lineTo(x + 2, h * (R0 - 0.16)); g.fill(); }
      for (var b = 0; b < 3; b++) { var bx = dx + w * (0.5 + b * 0.03); g.strokeStyle = 'rgba(27,31,59,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, h * (R0 - 0.02)); g.lineTo(bx + 2, h * (R0 - 0.16)); g.stroke(); circ(g, bx + 2, h * (R0 - 0.19), h * 0.03, ['#ff6257', '#7a5cff', '#35c977'][b], 0); }
    }, front: function (g, w, h) { walk(g, w, h, '#93cf6a', 'rgba(40,90,40,.2)'); },
    live: function (ctx, w, h, t) {                                                                // the Ferris wheel turns
      var cx = w * 0.82, cy = h * 0.3, r = h * 0.22, i, a;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - r * 0.5, h * 0.6); ctx.lineTo(cx, cy); ctx.lineTo(cx + r * 0.5, h * 0.6); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); for (i = 0; i < 8; i++) { a = t * 0.4 + i * TAU / 8; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.stroke();
      for (i = 0; i < 8; i++) { a = t * 0.4 + i * TAU / 8; ctx.fillStyle = ['#ff6257', '#ffd83d', '#35c977', '#4cc3f0'][i % 4]; ctx.fillRect(cx + Math.cos(a) * r - 5, cy + Math.sin(a) * r, 10, 8); }
      circ(ctx, cx, cy, 4, '#ff5d8f', 0);
    } },

    neon: { night: 0.85, back: function (g, w, h) {
      sky(g, w, h, '#241a55', '#8a3f8f', '#ff9a6b');
      g.fillStyle = '#ffffff'; for (var s = 0; s < 26; s++) g.fillRect(SS.hash(s + 90) * w, SS.hash(s + 91) * h * 0.3, 1.5, 1.5);
      for (var i = 0; i < 12; i++) {
        var x = w * (i / 12) - 4, bw = w * 0.085, th = h * (0.16 + SS.hash(i + 7) * 0.26);
        fill(g, i % 2 ? '#1e1f45' : '#2a2b5c', x, h * HZ - th, bw, th);
        windows(g, x, h * HZ - th + 4, bw, th - 8, 3, Math.max(2, Math.round(th / 12)), function (r) { return r < 0.5 ? 'rgba(0,0,0,0)' : r < 0.8 ? '#ffd98f' : r < 0.92 ? '#7df3ff' : '#ff8fd0'; }, i * 13);
      }
      fill(g, '#2b2d4a', 0, h * HZ, w, h * (R0 - HZ)); road(g, w, h, '#4a4d72', '#24253f', '#7df3ff');
      g.globalAlpha = 0.35; for (var k = 0; k < 8; k++) fill(g, ['#ff5d8f', '#7df3ff', '#ffd83d'][k % 3], SS.hash(k + 70) * w, h * (R0 + 0.03), w * 0.03, h * 0.12); g.globalAlpha = 1;   // wet reflections
    }, side: function (g, w, h, dx) {
      lamp(g, dx + w * 0.2, h * R0, h * 0.3, '#14152e', '#ff8fd0'); lamp(g, dx + w * 0.7, h * R0, h * 0.3, '#14152e', '#7df3ff');
    }, front: function (g, w, h) { walk(g, w, h, '#33355a', 'rgba(125,243,255,.25)'); },
    live: function (ctx, w, h, t) {                                                                // neon signs buzz
      var on = Math.sin(t * 9) > -0.7 || Math.sin(t * 1.3) > 0;
      ctx.lineWidth = 3; ctx.strokeStyle = on ? '#ff5d8f' : '#7a3a5a';
      ctx.strokeRect(w * 0.1, h * 0.26, w * 0.08, h * 0.07);
      ctx.strokeStyle = '#7df3ff'; ctx.beginPath(); ctx.arc(w * 0.46, h * 0.22, h * 0.04, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffd83d'; ctx.beginPath(); ctx.moveTo(w * 0.8, h * 0.3); ctx.lineTo(w * 0.88, h * 0.3); ctx.lineTo(w * 0.85, h * 0.25); ctx.stroke();
      if (on) { glow(ctx, '#ff5d8f', w * 0.14, h * 0.295, h * 0.12, 0.7); }
      glow(ctx, '#7df3ff', w * 0.46, h * 0.22, h * 0.1, 0.6); glow(ctx, '#ffd83d', w * 0.84, h * 0.28, h * 0.1, 0.5);
    } }
  };
  var SHIRTS = ['#ff6257', '#4cc3f0', '#35c977', '#7a5cff', '#ff9f43', '#ff5d8f', '#2fb7a8'], SKINS = ['#ffe0c2', '#f2c29b', '#d29a6a', '#b07a4f', '#8f5d3b'];
  var HAIRS = ['#2b2118', '#5a3a22', '#a8572e', '#e8c15a', '#1b1f3b'], PANTS = ['#2f3a6b', '#3d4a5c', '#6b4a3a', '#5b7fd1'];
  var cust = {};
  function custLook(n) {
    var k = n % 16, f = cust[k], h = function (i) { return SS.hash(k * 53 + i); };
    if (f) return f;
    return (cust[k] = { skin: SKINS[Math.floor(h(1) * 5)], hair: HAIRS[Math.floor(h(2) * 5)], shirt: SHIRTS[Math.floor(h(3) * 7)], pants: PANTS[Math.floor(h(4) * 4)],
      s: h(5) < 0.25 ? 0.68 : 0.88 + h(6) * 0.14, kind: h(5) < 0.25 ? 'kid' : 'parent', blush: h(7) < 0.5 });
  }
  /** what the truck is doing in that city, from the state when the caller does not say */
  function autoStatus(id) {
    var st = SS.state, T = st && st.truck, R = T && T.route, c = DATA.byId(DATA.cities || [], id), busy = !!(c && c.traffic > 0);
    if (R && R.to === id) return 'travelling';
    if (T && T.at === id && !R) return T.open && busy ? 'trading' : 'parked';
    return busy ? 'trading' : 'parked';
  }
  function weatherArt(ctx, w, h, type, t, red) {
    var i, x, y, u;
    if (type === 'rainy' || type === 'storm') {
      fill(ctx, type === 'storm' ? 'rgba(40,50,90,.38)' : 'rgba(70,90,130,.24)', 0, 0, w, h);
      ctx.strokeStyle = 'rgba(220,235,255,.7)'; ctx.lineWidth = 1.4; ctx.beginPath();
      for (i = 0; i < 46; i++) { u = red ? SS.hash(i + 3) : (SS.hash(i + 3) + t * (1.4 + SS.hash(i) * 0.6)) % 1; x = SS.hash(i + 1) * (w + 40) - u * 30; y = u * (h + 20) - 20; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 12); }
      ctx.stroke();
      if (type === 'storm' && !red && t % 5 < 0.12) fill(ctx, 'rgba(255,255,255,.45)', 0, 0, w, h);
    } else if (type === 'heatwave') {
      fill(ctx, 'rgba(255,160,60,.14)', 0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.beginPath();
      for (i = 0; i < 5; i++) { y = h * (0.5 + ((i * 0.07 + (red ? 0 : t * 0.05)) % 0.3)); for (x = 0; x <= w; x += 8) ctx[x ? 'lineTo' : 'moveTo'](x, y + Math.sin(x * 0.08 + t * 3 + i) * 2); }
      ctx.stroke();
    } else if (type === 'cloudy') {
      fill(ctx, 'rgba(120,130,150,.2)', 0, 0, w, h);
      for (i = 0; i < 3; i++) { x = ((SS.hash(i + 20) * w + (red ? 0 : t * 8 * (i + 1))) % (w + 120)) - 60; blob(ctx, x, h * (0.1 + i * 0.07), h * 0.06, 'rgba(236,240,246,.95)', 'rgba(255,255,255,.9)'); }
    }
  }
  function drawPostcard(ctx, w, h, cityId, t, look, opts) {
    opts = opts || {};
    if (!(w > 0 && h > 0)) return;
    var id = CITY[cityId] ? cityId : 'home', C = CITY[id], red = opts.reduced != null ? !!opts.reduced : SS.reduced();
    var tt = red ? 0 : (t || 0), status = opts.status || autoStatus(cityId), travel = status === 'travelling', trade = status === 'trading';
    var m = ctx.getTransform ? ctx.getTransform() : null, dpr = m ? Math.max(1, Math.min(3, Math.hypot(m.a, m.b))) : 1, key = id + '|' + Math.round(w) + 'x' + Math.round(h) + '@' + dpr.toFixed(2);
    var back = sheet(key + 'b', w, h, dpr, C.back), side = sheet(key + 's', w, h, dpr, function (g) { tiled(w, function (dx) { C.side(g, w, h, dx); }); });
    var front = sheet(key + 'f', w, h, dpr, C.front);
    var k = Math.min(w * 0.5 / 380, h * 0.6 / 290), speed = w * 0.55, i;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.drawImage(back, 0, 0, w, h);
    if (C.live) C.live(ctx, w, h, tt);
    var so = travel ? (tt * speed * 0.6) % w : 0, fo = travel ? (tt * speed) % w : 0;
    ctx.drawImage(side, -so, 0, w, h); if (so) ctx.drawImage(side, w - so, 0, w, h);
    if (travel) {                                                                                  // road markings rush past
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (i = -1; i < 7; i++) ctx.fillRect(((i * w / 6 - fo) % (w + w / 6) + w + w / 6) % (w + w / 6) - w / 6, h * (R1 - 0.03), w / 14, 2.5);
    }
    // the truck
    var tx = travel ? w * 0.5 : w * 0.56, ty = h * TRUCK_AT + (travel && !red ? Math.sin(tt * 16) * 0.6 : 0);
    ctx.save(); ctx.translate(tx, ty); ctx.scale(k, k);
    drawTruck(ctx, look, { open: trade ? 1 : 0, driving: travel ? 1 : 0, wheel: travel ? tt * speed / (WHEEL_R * k) : 0, night: C.night || 0, t: tt, reduced: red, driver: travel, vendor: trade });
    ctx.restore();
    ctx.drawImage(front, -fo, h * 0.004, w, h); if (fo) ctx.drawImage(front, w - fo, h * 0.004, w, h);
    if (trade) {                                                                                   // a little line at the window; every 4 s someone leaves with a cup
      var P = 4, n = Math.floor(tt / P), f = (tt % P) / P, step = f > 0.7 ? SS.smooth((f - 0.7) / 0.3) : 0, ck = k * 1.2, wx = tx - 30 * k;
      for (i = 3; i >= 0; i--) {
        var slot = i - step, x = wx - slot * 46 * ck, leaving = i === 0 && step > 0, walking = step > 0 && !red;
        if (leaving) x = wx + step * 120 * ck;
        if (i === 3) x = wx - (3 - step) * 46 * ck - (1 - step) * 60 * ck;
        ctx.save(); ctx.translate(x, h * FEET); ctx.scale(ck, ck);
        ctx.fillStyle = 'rgba(19,26,58,.2)'; ctx.beginPath(); ctx.ellipse(0, 1, 18, 4, 0, 0, TAU); ctx.fill();
        var cl = custLook(n + i);
        person(ctx, cl, { phase: walking ? tt * 9 + i : null, breath: tt * 2 + i, armUp: i === 0 && !leaving && f > 0.3 ? 0.8 : 0, drink: leaving ? '#ffe14d' : null });
        ctx.restore();
      }
    }
    var wx2 = opts.weather && opts.weather.type;
    if (wx2) weatherArt(ctx, w, h, wx2, tt, red);
    ctx.restore();
  }

  SS.Vehicles = { drawTruck: drawTruck, drawCar: drawCar, drawPostcard: drawPostcard, update: update, draw: draw };
})();
