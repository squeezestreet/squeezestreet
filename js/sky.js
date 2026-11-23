/* Squeeze Street — sky.js
 * SS.Sky is the atmosphere of the whole game.
 *   draw(ctx, view, env)         bottom layer: dithered sky gradient, stars, moon, sun, clouds,
 *                                rainbow, lightning bolt, horizon haze
 *   drawWeather(ctx, view, env)  top layer: blown leaves, heat shimmer, light grade, bloom,
 *                                rain, gusts, lightning flash, vignette
 *   update(dt, view, env)        wind travel and the after-rain rainbow timer
 * Everything is procedural canvas 2D. Sprites are built once into offscreen canvases; a frame is
 * blits, a few strokes and one small gradient strip that is rebuilt only when the palette moves.
 * Particles are functions of env.t and SS.hash, so a paused or frozen frame is still complete.
 */
(function () {
  'use strict';
  var SS = window.SS;
  var clamp = SS.clamp, lerp = SS.lerp, smooth = SS.smooth, hash = SS.hash;
  var PI = Math.PI, TAU = PI * 2;
  var PAD = 24;                              // full-screen fills overshoot so screen shake never shows an edge

  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function css(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }
  function ramp01(v, a, b) { return clamp((v - a) / (b - a), 0, 1); }

  /* ------------------------------------------------------------------ *
   * Palette keyframes around the 0..1.6 day cycle.
   * [dayT, zenith, upper, middle, low, horizon, cloud top, cloud underside]
   * Night rows are a little brighter than they end up: drawWeather multiplies the frame blue.
   * ------------------------------------------------------------------ */
  var KEYS = [
    [0.00, 0x4a5a9e, 0x8f86c4, 0xf2a7a8, 0xffc89c, 0xffe6ae, 0xffdccb, 0xd58fa6],   // sunrise: peach and rose
    [0.09, 0x4a8fe0, 0x7db6ee, 0xb8d9f4, 0xf0e3d6, 0xffe9c4, 0xfff4e6, 0xcbbfd8],
    [0.25, 0x2f88e8, 0x58a8f2, 0x8ecaf8, 0xc0e3fb, 0xe4f3fd, 0xffffff, 0xa9c1e6],   // clean morning blue
    [0.50, 0x1560d4, 0x2e85ea, 0x5cabf5, 0x98cffa, 0xd0e9fc, 0xffffff, 0x9db6e0],   // deep azure noon
    [0.72, 0x2670d8, 0x4a96ea, 0x86bff2, 0xc4def2, 0xf6e9cc, 0xfffaf0, 0xb0b8d8],
    [0.87, 0x3466c8, 0x7f9bd8, 0xf5b683, 0xffbe5c, 0xffd97c, 0xfff1cf, 0xf2a57e],   // golden hour
    [1.00, 0x1f2c8a, 0x6a3b9e, 0xd84a82, 0xf85a48, 0xff8a3a, 0xffd4c8, 0xf8684e],   // sunset: magenta and orange
    [1.06, 0x1d205e, 0x4a307f, 0xa04682, 0xe96a52, 0xf89e58, 0x8f74ac, 0xea6c6c],   // afterglow
    [1.13, 0x161c50, 0x283074, 0x443f8e, 0x735195, 0xab6888, 0x66649f, 0x403a78],   // indigo dusk
    [1.30, 0x111844, 0x18265c, 0x223672, 0x2d4788, 0x3b5998, 0x46558a, 0x232d5a],   // navy night
    [1.50, 0x121946, 0x1a285e, 0x253a76, 0x334c8a, 0x44609c, 0x48588c, 0x242f5c],
    [1.56, 0x1d2458, 0x383e82, 0x6e5894, 0xca788e, 0xf4a87e, 0x9584b2, 0xc46f8a],   // pre-dawn glow
    [1.60, 0x4a5a9e, 0x8f86c4, 0xf2a7a8, 0xffc89c, 0xffe6ae, 0xffdccb, 0xd58fa6]    // = 0.00
  ];
  var KT = [], KC = [];
  KEYS.forEach(function (row) {
    var a = new Float32Array(21), i;
    for (i = 0; i < 7; i++) { a[i * 3] = row[i + 1] >> 16 & 255; a[i * 3 + 1] = row[i + 1] >> 8 & 255; a[i * 3 + 2] = row[i + 1] & 255; }
    KT.push(row[0]); KC.push(a);
  });

  /* This frame's look. Filled by look(); both layers read it. */
  var L = {
    c: new Float32Array(21),                 // 5 sky stops, cloud top, cloud underside (r, g, b each)
    night: 0, warm: 0, cloud: 0, storm: 0, heat: 0, wet: 0,
    hot: 0,                                  // heat effects (shimmer, motes, beams): only when it is properly hot
    ov: 0,                                   // overcast 0..1 (greys the sky and the grade)
    veil: 0,                                 // how much the cloud deck hides sun, moon and stars
    unit: 1, horizonY: 0,
    sunX: 0, sunY: 0, sunR: 0, sunAlt: 0, sunVis: 0, sr: 255, sg: 255, sb: 255, gr: 255, gg: 255, gb: 255,
    moonX: 0, moonY: 0, moonR: 0, moonA: 0,
    flash: 0, bolt: 0
  };
  var NOWX = { cloud: 0, storm: 0, heat: 0, wet: 0 };
  var BOLT_SEED = 546, STAR_SHIFT = 0.4;     // phases chosen so a strike lands at t = 12 and the first meteor right after t = 0

  function look(view, env) {
    var wx = env.weather || NOWX, c = L.c, i, j;
    var d = ((+env.dayT % 1.6) + 1.6) % 1.6;
    if (!(d >= 0)) d = 0.5;
    for (i = 0; i < KT.length - 2 && d >= KT[i + 1]; i++) { /* find the segment */ }
    var k = (d - KT[i]) / (KT[i + 1] - KT[i]), a = KC[i], b = KC[i + 1];
    for (j = 0; j < 21; j++) c[j] = a[j] + (b[j] - a[j]) * k;

    var li = SS.light(d);
    var cloud = clamp(+wx.cloud || 0, 0, 1), storm = clamp(+wx.storm || 0, 0, 1);
    var heat = clamp(+wx.heat || 0, 0, 1), wet = clamp(+wx.wet || 0, 0, 1);
    var ov = smooth((cloud - 0.3) / 0.6), day = 1 - li.night;
    L.night = li.night; L.warm = li.warm; L.cloud = cloud; L.storm = storm; L.heat = heat; L.wet = wet; L.ov = ov;
    L.veil = smooth((cloud - 0.45) / 0.45);
    L.hot = smooth((heat - 0.15) / 0.6) * day;

    // weather on the palette: overcast flattens and greys, storm sinks to slate, heat bleaches
    var mr = 0, mg = 0, mb = 0;
    for (j = 0; j < 15; j += 3) { mr += c[j]; mg += c[j + 1]; mb += c[j + 2]; }
    mr /= 5; mg /= 5; mb /= 5;
    for (j = 0; j < 21; j += 3) {
      var r = c[j], g = c[j + 1], bl = c[j + 2], sky = j < 15;
      if (sky) { r = lerp(r, mr, ov * 0.55); g = lerp(g, mg, ov * 0.55); bl = lerp(bl, mb, ov * 0.55); }
      var lum = 0.3 * r + 0.59 * g + 0.11 * bl, gk = ov * 0.82;
      r = lerp(r, lum * 0.95, gk); g = lerp(g, lum * 0.98, gk); bl = lerp(bl, lum * 1.04, gk);
      r *= lerp(1, 0.5, storm); g *= lerp(1, 0.54, storm); bl *= lerp(1, 0.62, storm);
      if (sky) { var hk = heat * day * (0.26 + 0.07 * j / 3); r = lerp(r, 255, hk); g = lerp(g, 242, hk); bl = lerp(bl, 206, hk); }
      c[j] = r; c[j + 1] = g; c[j + 2] = bl;
    }

    var s = view.scale, w = view.w;
    // the far hills and rooftops stand about 200 world units tall, so that is where the sky "ends":
    // the whole gradient, the sun's arc and every cloud band live above that line, where they can be seen
    var hy = L.horizonY = Math.max(60, view.groundY - 200 * s);
    L.unit = Math.min(w * 1.25, hy * 2.9) / 1000;

    // sun: one continuous loop, above the horizon for dayT 0..1 and under it for the night
    var ang = d <= 1 ? PI * d : PI * (1 + (d - 1) / 0.6), alt = Math.sin(ang), up = clamp(alt, 0, 1);
    L.sunAlt = alt;
    L.sunX = lerp(0.1, 0.9, 0.5 - 0.5 * Math.cos(ang)) * w;
    L.sunY = hy - alt * (hy - Math.min(hy * 0.5, Math.max(hy * 0.2, 84)));
    L.sunR = 25 * s * (1 + 0.6 * Math.pow(1 - up, 3)) * (1 + 0.12 * heat);
    L.sunVis = smooth((alt + 0.12) / 0.17) * (1 - L.veil * 0.9) * (1 - storm);
    var k1 = clamp(up / 0.28, 0, 1), k2 = clamp((up - 0.28) / 0.4, 0, 1);
    L.sr = 255; L.sg = lerp(lerp(226, 232, k1), 244, k2); L.sb = lerp(lerp(140, 150, k1), 178, k2);   // disc: red, gold, white-hot
    L.gr = 255; L.gg = lerp(lerp(104, 164, k1), 238, k2); L.gb = lerp(lerp(44, 64, k1), 176, k2);     // glow: a step more saturated

    // moon rises at sunset, peaks in deep night, sets at sunrise
    var mAng = d >= 1 ? PI * (d - 1) / 0.6 : 0, mAlt = Math.sin(mAng);
    L.moonX = lerp(0.14, 0.86, 0.5 - 0.5 * Math.cos(mAng)) * w;
    L.moonY = hy - mAlt * (hy - Math.min(hy * 0.55, Math.max(hy * 0.26, 100)));
    L.moonR = 21 * s;
    L.moonA = smooth((li.night - 0.08) / 0.42) * smooth(mAlt / 0.12) * (1 - L.veil * 0.88);

    // lightning: a schedule that is a pure function of env.t
    L.flash = 0;
    if (storm > 0.35 && !env.reduced) {
      var n = Math.floor(env.t / 5);
      if (hash(n * 97 + BOLT_SEED) < 0.8) {
        var u = env.t - (n * 5 + 0.3 + hash(n * 97 + BOLT_SEED + 1) * 3.6);
        if (u >= 0 && u < 0.6) {
          L.flash = storm * Math.max(Math.exp(-u * 9), u > 0.16 ? 0.8 * Math.exp(-(u - 0.16) * 13) : 0);
          L.bolt = n;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Sprites (built once, on first draw)
   * ------------------------------------------------------------------ */
  var spr = null, CW = 512, CH = 256, NV = 5;

  function buildGlow() {                      // white radial falloff; tinted copies make every glow
    var c = mk(256, 256), x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    [[0, 1], [0.08, 0.82], [0.18, 0.52], [0.32, 0.27], [0.5, 0.12], [0.7, 0.04], [0.88, 0.01], [1, 0]].forEach(function (st) {
      g.addColorStop(st[0], 'rgba(255,255,255,' + st[1] + ')');
    });
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return c;
  }

  function buildSoft() {                      // round blob with no hot centre: mist, haze bands
    var c = mk(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    [[0, 1], [0.25, 0.88], [0.5, 0.56], [0.75, 0.19], [1, 0]].forEach(function (st) { g.addColorStop(st[0], 'rgba(255,255,255,' + st[1] + ')'); });
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return c;
  }

  function buildRamp(down) {                  // vertical alpha ramp, opaque at the bottom (or the top)
    var c = mk(4, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, down ? 256 : 0, 0, down ? 0 : 256);
    [[0, 0], [0.25, 0.06], [0.5, 0.26], [0.72, 0.6], [0.9, 0.9], [1, 1]].forEach(function (st) {
      g.addColorStop(st[0], 'rgba(255,255,255,' + st[1] + ')');
    });
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    return c;
  }

  function buildRays() {                      // sunburst: nested wedges fake a soft edge without blur
    var S = 512, c = mk(S, S), x = c.getContext('2d'), rnd = SS.mulberry32(77), i, k;
    x.translate(S / 2, S / 2);
    for (i = 0; i < 20; i++) {
      var a = (i + rnd() * 0.8) / 20 * TAU, wd = 0.03 + rnd() * 0.08, len = S * 0.5 * (0.5 + 0.5 * rnd());
      var g = x.createRadialGradient(0, 0, S * 0.02, 0, 0, len);
      g.addColorStop(0, 'rgba(255,255,255,0.30)'); g.addColorStop(0.3, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      for (k = 1; k <= 4; k++) {
        x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, len, a - wd * k / 4, a + wd * k / 4); x.closePath(); x.fill();
      }
    }
    return c;
  }

  function buildMoon() {
    var S = 192, R = 80, c = mk(S, S), x = c.getContext('2d'), rnd = SS.mulberry32(9), i;
    x.translate(S / 2, S / 2);
    x.beginPath(); x.arc(0, 0, R, 0, TAU); x.clip();
    var g = x.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.05);
    g.addColorStop(0, '#fffef6'); g.addColorStop(0.6, '#eceef8'); g.addColorStop(1, '#c4cbe6');
    x.fillStyle = g; x.fillRect(-R, -R, R * 2, R * 2);
    x.fillStyle = 'rgba(128,140,190,0.2)';      // maria: big soft seas
    [[-22, -18, 30], [24, 8, 24], [-8, 34, 20], [34, -34, 14]].forEach(function (m) {
      x.beginPath(); x.ellipse(m[0], m[1], m[2], m[2] * 0.8, 0.5, 0, TAU); x.fill();
    });
    for (i = 0; i < 9; i++) {                   // craters: shaded bowl with a lit lower rim
      var a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.78, cx = Math.cos(a) * d, cy = Math.sin(a) * d, r = 4 + rnd() * 9;
      x.fillStyle = 'rgba(120,132,184,0.34)'; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1.6;
      x.beginPath(); x.arc(cx, cy, r, 0.15 * PI, 0.85 * PI); x.stroke();
    }
    g = x.createRadialGradient(-R * 0.15, -R * 0.15, R * 0.55, 0, 0, R);   // limb darkening
    g.addColorStop(0, 'rgba(90,104,170,0)'); g.addColorStop(1, 'rgba(90,104,170,0.45)');
    x.fillStyle = g; x.fillRect(-R, -R, R * 2, R * 2);
    return c;
  }

  function buildStar() {                      // bright star: soft core plus a four-point sparkle
    var c = mk(48, 48), x = c.getContext('2d'), g = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(235,242,255,0.8)');
    g.addColorStop(0.4, 'rgba(190,210,255,0.16)'); g.addColorStop(1, 'rgba(190,210,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 48, 48);
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.beginPath(); x.moveTo(24, 3); x.lineTo(25.3, 24); x.lineTo(24, 45); x.lineTo(22.7, 24); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(3, 24); x.lineTo(24, 22.7); x.lineTo(45, 24); x.lineTo(24, 25.3); x.closePath(); x.fill();
    return c;
  }

  function buildMilky() {                     // a faint band of light and star dust across the night
    var c = mk(512, 256), x = c.getContext('2d'), rnd = SS.mulberry32(404), i;
    for (i = 0; i < 30; i++) {
      var px = rnd() * 512, py = 128 + (rnd() + rnd() - 1) * 34 + Math.sin(px * 0.012) * 18, r = 30 + rnd() * 52;
      var g = x.createRadialGradient(px, py, 0, px, py, r), tint = rnd() < 0.55 ? '170,188,255' : '214,182,255';
      g.addColorStop(0, 'rgba(' + tint + ',0.11)'); g.addColorStop(1, 'rgba(' + tint + ',0)');
      x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    x.fillStyle = '#fff';
    for (i = 0; i < 560; i++) {
      var qx = rnd() * 512, qy = 128 + (rnd() + rnd() + rnd() - 1.5) * 46 + Math.sin(qx * 0.012) * 18;
      x.globalAlpha = 0.12 + rnd() * 0.5; x.fillRect(qx, qy, 1, 1);
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in';      // feather both ends
    var e = x.createLinearGradient(0, 0, 512, 0);
    e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(0.18, '#000'); e.addColorStop(0.82, '#000'); e.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = e; x.fillRect(0, 0, 512, 256);
    return c;
  }

  function buildRainbow() {                   // upper half of a ring, centre on the bottom edge
    var c = mk(512, 256), x = c.getContext('2d'), g = x.createRadialGradient(256, 256, 0, 256, 256, 252);
    [[0.80, '150,110,255,0'], [0.83, '150,110,255,0.55'], [0.86, '90,150,255,0.7'], [0.89, '90,225,150,0.75'],
      [0.92, '255,240,110,0.8'], [0.95, '255,170,80,0.8'], [0.975, '255,96,96,0.7'], [1, '255,96,96,0']].forEach(function (st) {
      g.addColorStop(st[0], 'rgba(' + st[1] + ')');
    });
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.globalCompositeOperation = 'destination-in';                          // the feet melt away before the ground
    var e = x.createLinearGradient(0, 0, 0, 256);
    e.addColorStop(0, '#000'); e.addColorStop(0.55, '#000'); e.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = e; x.fillRect(0, 0, 512, 256);
    return c;
  }

  function buildVignette() {
    var c = mk(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 34, 64, 64, 92);
    g.addColorStop(0, 'rgba(46,40,84,0)'); g.addColorStop(0.5, 'rgba(46,40,84,0.25)'); g.addColorStop(1, 'rgba(46,40,84,1)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return c;
  }

  function buildBeam() {                      // one shaft of light: bright spine, soft sides, fading with length
    var c = mk(64, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    x.globalCompositeOperation = 'destination-in';
    g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.12, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    return c;
  }

  function buildLeaves() {                    // three leaves and a blossom petal (Meadow Park)
    return ['#7cc24e', '#c3d24a', '#f0a23c', '#ffb7d0'].map(function (col, i) {
      var c = mk(32, 20), x = c.getContext('2d');
      x.translate(16, 10); x.fillStyle = col; x.beginPath();
      if (i < 3) { x.moveTo(-14, 0); x.quadraticCurveTo(-2, -12, 14, 0); x.quadraticCurveTo(-2, 12, -14, 0); }
      else { x.moveTo(-12, 0); x.bezierCurveTo(-8, -11, 8, -10, 12, -3); x.lineTo(7, 0); x.lineTo(12, 3); x.bezierCurveTo(8, 10, -8, 11, -12, 0); }
      x.fill();
      x.strokeStyle = i < 3 ? 'rgba(20,40,10,0.28)' : 'rgba(190,70,120,0.3)'; x.lineWidth = 1.3;
      x.beginPath(); x.moveTo(-11, 0); x.lineTo(9, 0); x.stroke();
      return c;
    });
  }

  /* A cumulus: a row of fat puffs on a flat base with a crown piled on top.
   * lit   = the white silhouette
   * shade = where the shadow falls (each puff is a shaded ball, plus a heavy underside)
   * Tinting the two separately lets the same cloud be noon white, sunset pink-and-gold or night blue. */
  function buildCloud(seed) {
    var rnd = SS.mulberry32(seed), lit = mk(CW, CH), shade = mk(CW, CH);
    var lc = lit.getContext('2d'), sc = shade.getContext('2d');
    var base = CH * 0.8, puffs = [], n = 5 + (rnd() * 3 | 0), i, p, g, r, f;
    for (i = 0; i < 5; i++) {
      f = 0.26 + 0.48 * ((i + rnd()) / 5); r = CH * (0.17 + 0.11 * rnd());
      puffs.push({ x: CW * f, y: Math.max(r + 5, base - CH * (0.2 + 0.24 * Math.sin(PI * (f - 0.2) / 0.6) * (0.6 + 0.4 * rnd())) - r * 0.25), r: r });
    }
    for (i = 0; i < 5; i++) {                   // small lumps riding the crown keep the outline lively
      p = puffs[i]; f = -PI * (0.2 + 0.6 * rnd());
      puffs.push({ x: p.x + Math.cos(f) * p.r * 0.85, y: Math.max(p.r * 0.5 + 4, p.y + Math.sin(f) * p.r * 0.85), r: p.r * (0.38 + 0.2 * rnd()) });
    }
    puffs.sort(function (a, b) { return a.y - b.y; });
    var row = [];
    for (i = 0; i < n; i++) {
      f = (i + 0.5) / n; r = CH * (0.13 + 0.17 * Math.pow(Math.sin(PI * f), 0.7)) * (0.85 + 0.3 * rnd());
      row.push({ x: CW * (0.15 + 0.7 * f) + (rnd() - 0.5) * 14, y: base - r * 0.6, r: r, f: Math.abs(f - 0.5) });
    }
    row.sort(function (a, b) { return b.f - a.f; });                         // ends first, so the fat middle sits in front
    puffs = puffs.concat(row);
    for (i = 0; i < puffs.length; i++) {
      p = puffs[i];
      g = lc.createRadialGradient(p.x, p.y, p.r * 0.95, p.x, p.y, p.r);
      g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      lc.fillStyle = g; lc.beginPath(); lc.arc(p.x, p.y, p.r, 0, TAU); lc.fill();
      lc.fillStyle = '#fff'; lc.beginPath(); lc.arc(p.x, p.y, p.r * 0.95, 0, TAU); lc.fill();

      g = sc.createRadialGradient(p.x, p.y + p.r * 0.08, p.r * 0.86, p.x, p.y + p.r * 0.08, p.r * 1.34);   // contact shadow on the puffs behind
      g.addColorStop(0, 'rgba(255,255,255,0.34)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      sc.fillStyle = g; sc.beginPath(); sc.arc(p.x, p.y + p.r * 0.08, p.r * 1.34, 0, TAU); sc.fill();
      sc.globalCompositeOperation = 'destination-out';                      // a puff hides what is behind it
      sc.fillStyle = '#000'; sc.beginPath(); sc.arc(p.x, p.y, p.r * 0.98, 0, TAU); sc.fill();
      sc.globalCompositeOperation = 'source-over';
      g = sc.createRadialGradient(p.x - p.r * 0.12, p.y - p.r * 0.8, p.r * 0.55, p.x - p.r * 0.12, p.y - p.r * 0.8, p.r * 1.85);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,0.05)'); g.addColorStop(0.62, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0.72)');   // lit crown, shaded belly
      sc.fillStyle = g; sc.beginPath(); sc.arc(p.x, p.y, p.r, 0, TAU); sc.fill();
    }
    g = sc.createLinearGradient(0, base - CH * 0.5, 0, base);                // heavy underside
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0.55)');
    sc.fillStyle = g; sc.fillRect(0, 0, CW, CH);
    lc.globalCompositeOperation = 'destination-out';                        // flat, slightly soft base
    g = lc.createLinearGradient(0, base - 7, 0, base + 3);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
    lc.fillStyle = g; lc.fillRect(0, base - 7, CW, CH);
    sc.globalCompositeOperation = 'destination-in'; sc.drawImage(lit, 0, 0);
    return { lit: lit, shade: shade };
  }

  function build() {
    var i, clouds = [];
    for (i = 0; i < NV; i++) clouds.push(buildCloud(1301 + i * 97));
    spr = {
      glow: buildGlow(), soft: buildSoft(), up: buildRamp(false), down: buildRamp(true), rays: buildRays(), moon: buildMoon(),
      star: buildStar(), milky: buildMilky(), rainbow: buildRainbow(), vignette: buildVignette(),
      beam: buildBeam(), leaves: buildLeaves(), clouds: clouds, scratch: mk(CW, CH)
    };
  }

  /* Tinted copies, cached and re-made only when the colour moves a visible step. */
  var slots = {};
  function tinted(name, src, r, g, b) {
    var s = slots[name] || (slots[name] = { c: mk(src.width, src.height), key: -1 });
    var key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    if (s.key !== key) {
      var x = s.c.getContext('2d');
      x.globalCompositeOperation = 'copy'; x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = css(r, g, b); x.fillRect(0, 0, s.c.width, s.c.height);
      s.key = key;
    }
    return s.c;
  }

  var cloudSlots = [], retints = 0;           // retints: per-frame budget so a fast sunset never spikes
  function cloudSprite(li, vi, tr, tg, tb, ur, ug, ub) {
    var id = li * NV + vi, s = cloudSlots[id];
    var k1 = ((tr >> 2) << 12) | ((tg >> 2) << 6) | (tb >> 2), k2 = ((ur >> 2) << 12) | ((ug >> 2) << 6) | (ub >> 2);
    if (!s) s = cloudSlots[id] = { c: mk(CW, CH), k1: -1, k2: -1, fresh: true };
    if ((s.k1 !== k1 || s.k2 !== k2) && (s.fresh || retints > 0)) {
      if (!s.fresh) retints--;
      var base = spr.clouds[vi], x = s.c.getContext('2d'), sx = spr.scratch.getContext('2d');
      sx.globalCompositeOperation = 'copy'; sx.drawImage(base.shade, 0, 0);
      sx.globalCompositeOperation = 'source-in'; sx.fillStyle = css(ur, ug, ub); sx.fillRect(0, 0, CW, CH);
      x.globalCompositeOperation = 'copy'; x.drawImage(base.lit, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = css(tr, tg, tb); x.fillRect(0, 0, CW, CH);
      x.globalCompositeOperation = 'source-over'; x.drawImage(spr.scratch, 0, 0);
      s.k1 = k1; s.k2 = k2; s.fresh = false;
    }
    return s.c;
  }

  /* ------------------------------------------------------------------ *
   * Sky gradient: a 64px-wide tile, splined between the five stops and dithered per pixel so
   * that night and dusk never band. Rebuilt only when the palette or the layout moves, then
   * laid across the canvas as a repeating pattern.
   * ------------------------------------------------------------------ */
  var strip = null, stripCtx = null, stripImg = null, stripPat = null, stripKey = 0, SW = 64;
  function skyStrip(view) {
    var H = clamp(Math.ceil(view.h), 32, 2048), c = L.c, i, key = H * 4099 + Math.round(L.horizonY) | 0;
    for (i = 0; i < 15; i++) key = Math.imul(key ^ Math.round(c[i] * 2), 16777619);       // half-level steps
    if (key === stripKey && stripPat) return stripPat;
    stripKey = key;
    if (!strip || strip.height !== H) { strip = mk(SW, H); stripCtx = strip.getContext('2d'); stripImg = stripCtx.createImageData(SW, H); }
    var data = stripImg.data, hy = Math.max(1, L.horizonY), seed = 1234567, o = 0, x, y;
    for (y = 0; y < H; y++) {
      var s = y / hy; if (s > 1) s = 1;
      var p = 4 * s * Math.sqrt(s), seg = p | 0; if (seg > 3) seg = 3;        // stops sit at 0, .40, .63, .83, 1
      var f = p - seg, f2 = f * f, f3 = f2 * f;
      var i0 = (seg > 0 ? seg - 1 : 0) * 3, i1 = seg * 3, i2 = i1 + 3, i3 = (seg < 3 ? seg + 2 : 4) * 3;
      var w0 = -0.5 * f3 + f2 - 0.5 * f, w1 = 1.5 * f3 - 2.5 * f2 + 1, w2 = -1.5 * f3 + 2 * f2 + 0.5 * f, w3 = 0.5 * f3 - 0.5 * f2;
      var r = c[i0] * w0 + c[i1] * w1 + c[i2] * w2 + c[i3] * w3;
      var g = c[i0 + 1] * w0 + c[i1 + 1] * w1 + c[i2 + 1] * w2 + c[i3 + 1] * w3;
      var b = c[i0 + 2] * w0 + c[i1 + 2] * w1 + c[i2 + 2] * w2 + c[i3 + 2] * w3;
      for (x = 0; x < SW; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        var dz = ((seed >>> 8 & 255) + (seed >>> 16 & 255)) / 255 - 1;      // triangular noise, +-1 level
        data[o++] = r + dz; data[o++] = g + dz; data[o++] = b + dz; data[o++] = 255;
      }
    }
    stripCtx.putImageData(stripImg, 0, 0);
    stripPat = stripCtx.createPattern(strip, 'repeat-x');
    return stripPat;
  }

  /* ------------------------------------------------------------------ *
   * Bottom layer pieces
   * ------------------------------------------------------------------ */
  function drawStars(ctx, view, env) {
    var A = smooth((L.night - 0.2) / 0.65) * (1 - L.veil), w = view.w, hy = L.horizonY, t = env.t, i;
    if (A <= 0.01) return;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = A * A * 0.8;
    var mw = Math.sqrt(w * w + hy * hy) * 1.2;
    ctx.save(); ctx.translate(w * 0.52, hy * 0.4); ctx.rotate(-0.4);
    ctx.drawImage(spr.milky, -mw / 2, -mw * 0.25, mw, mw * 0.5);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#eef3ff';
    var n = clamp(Math.round(w * hy / 3600), 60, 320), px = 0.75 + 0.25 * view.scale;
    for (i = 0; i < n; i++) {
      var h1 = hash(i * 3 + 101), h2 = hash(i * 3 + 102), h3 = hash(i * 3 + 103);
      var a = clamp((L.night - (0.2 + 0.45 * h3)) / 0.2, 0, 1) * (1 - L.veil);     // the brightest come out first
      if (a <= 0) continue;
      var yf = h2 * 1.12, sz = (0.9 + 2.3 * Math.pow(1 - h3, 5)) * px;
      a *= (1 - 0.6 * h2 * h2 * h2) * (0.5 + 0.5 * (1 - h3));
      if (!env.reduced) a *= 0.7 + 0.3 * Math.sin(t * (1.1 + 3.6 * h1) + h2 * 40);
      ctx.globalAlpha = a;
      if (sz > 1.9 * px) ctx.drawImage(spr.star, h1 * w - sz * 3.2, yf * hy - sz * 3.2, sz * 6.4, sz * 6.4);
      else ctx.fillRect(h1 * w - sz / 2, yf * hy - sz / 2, sz, sz);
    }

    // an occasional shooting star (a pure function of t; skipped for reduced motion)
    var P = 8, tt = t + STAR_SHIFT, cyc = Math.floor(tt / P), u = (tt - cyc * P) / 0.9;
    if (!env.reduced && u < 1 && A > 0.6 && hash(cyc * 13 + 5) < 0.7) {
      var dir = hash(cyc * 13 + 8) < 0.5 ? -1 : 1, len = 300 * L.unit, e = 1 - (1 - u) * (1 - u);
      var hx = (0.5 - dir * 0.2 + (hash(cyc * 13 + 6) - 0.5) * 0.4) * w + dir * len * e;
      var hyy = (0.12 + 0.25 * hash(cyc * 13 + 7)) * hy + len * 0.4 * e;
      var al = Math.sin(PI * u) * A, seg = len * 0.045 * (0.4 + e), k;
      ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
      for (k = 0; k < 9; k++) {
        ctx.globalAlpha = al * (1 - k / 9) * (1 - k / 9);
        ctx.lineWidth = (2.4 * (1 - k / 9) + 0.4) * px;
        ctx.beginPath(); ctx.moveTo(hx - dir * seg * k, hyy - seg * 0.4 * k); ctx.lineTo(hx - dir * seg * (k + 1), hyy - seg * 0.4 * (k + 1)); ctx.stroke();
      }
      ctx.globalAlpha = al; ctx.drawImage(spr.star, hx - 9 * px, hyy - 9 * px, 18 * px, 18 * px);
    }
  }

  function drawMoon(ctx) {
    var a = L.moonA, x = L.moonX, y = L.moonY, R = L.moonR;
    if (a <= 0.004) return;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = a * 0.55; ctx.drawImage(tinted('moonWide', spr.glow, 130, 160, 255), x - R * 9, y - R * 9, R * 18, R * 18);
    ctx.globalAlpha = a * 0.9; ctx.drawImage(tinted('moonNear', spr.glow, 196, 214, 255), x - R * 3.2, y - R * 3.2, R * 6.4, R * 6.4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a; ctx.drawImage(spr.moon, x - R * 1.2, y - R * 1.2, R * 2.4, R * 2.4);
  }

  function drawSun(ctx, view, env) {
    var v = L.sunVis, x = L.sunX, y = L.sunY, R = L.sunR, hy = L.horizonY, up = clamp(L.sunAlt, 0, 1);
    ctx.globalCompositeOperation = 'screen';
    // dawn and dusk: a wide band of fire lying along the horizon under the sun
    var hg = L.warm * (1 - L.veil) * (1 - L.storm);
    if (hg > 0.01) {
      var gw = view.w * 1.7, gh = hy * 1.05;
      ctx.globalAlpha = hg * 0.8;
      ctx.drawImage(tinted('horizon', spr.glow, L.gr, L.gg, L.gb), x - gw / 2, hy - gh / 2, gw, gh);
    }
    if (v <= 0.004) return;
    var big = hy * (1.7 + 0.5 * L.heat);
    ctx.globalAlpha = v * 0.55;
    ctx.drawImage(tinted('bloom', spr.glow, L.gr, L.gg, L.gb), x - big / 2, y - big / 2, big, big);

    var rays = tinted('rays', spr.rays, 255, lerp(L.gg, 255, 0.4), lerp(L.gb, 255, 0.3)), rs = R * 15;
    var rot = env.reduced ? 0.4 : env.t * 0.021;
    ctx.save(); ctx.translate(x, y);
    ctx.rotate(rot); ctx.globalAlpha = v * (0.5 + 0.3 * (1 - up)); ctx.drawImage(rays, -rs / 2, -rs / 2, rs, rs);
    ctx.rotate(1.1 - rot * 1.7); ctx.globalAlpha = v * 0.34; ctx.drawImage(rays, -rs * 0.72, -rs * 0.72, rs * 1.44, rs * 1.44);
    ctx.restore();

    ctx.globalAlpha = v;
    ctx.drawImage(tinted('sunGlow', spr.glow, L.gr, L.gg, L.gb), x - R * 4.2, y - R * 4.2, R * 8.4, R * 8.4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, v * 1.4);
    ctx.fillStyle = css(L.sr, L.sg, L.sb);
    ctx.beginPath(); ctx.ellipse(x, y, R, R * lerp(0.9, 1, clamp(up * 4, 0, 1)), 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';                                // white-hot heart
    ctx.globalAlpha = v * 0.8;
    ctx.drawImage(spr.glow, x - R * 1.1, y - R * 1.1, R * 2.2, R * 2.2);
  }

  /* Cloud layers sit on an endless lattice of cells that slides with the wind, so they wrap
   * at any aspect ratio and never pop. The last three rows are the overcast / storm deck. */
  var CLOUDS = [
    { y0: 0.76, y1: 0.93, size: 0.32, speed: 0.3, haze: 0.5, seed: 11 },       // y0..y1: where the flat bases sit, 0 top .. 1 horizon
    { y0: 0.52, y1: 0.72, size: 0.56, speed: 0.55, haze: 0.22, seed: 23 },
    { y0: 0.3, y1: 0.5, size: 0.86, speed: 1.0, haze: 0, seed: 37 },
    { y0: 0.36, y1: 0.46, size: 1.25, speed: 0.8, haze: 0.12, seed: 53, deck: 1 },
    { y0: 0.16, y1: 0.24, size: 1.6, speed: 1.15, haze: 0, seed: 71, deck: 1 },
    { y0: 0.6, y1: 0.7, size: 1.1, speed: 0.95, haze: 0.06, seed: 89, deck: 2 }
  ];
  var windDist = 0, seeded = false;

  function drawClouds(ctx, view, li) {
    var ly = CLOUDS[li], c = L.c, hy = L.horizonY, w = view.w;
    var amount = ly.deck === 2 ? Math.max(L.storm, smooth((L.wet - 0.3) / 0.6) * 0.7) : ly.deck ? smooth((L.cloud - 0.5) / 0.42) : 1;
    if (amount <= 0.01) return;
    var dark = ly.deck ? lerp(1, ly.deck === 2 ? 0.74 : 0.88, L.ov) : 1, hz = ly.haze;
    var tr = lerp(c[15], c[9], hz) * lerp(1, dark, 0.5), tg = lerp(c[16], c[10], hz) * lerp(1, dark, 0.5), tb = lerp(c[17], c[11], hz) * lerp(1, dark, 0.5);
    var ur = lerp(c[18], c[9], hz) * dark, ug = lerp(c[19], c[10], hz) * dark, ub = lerp(c[20], c[11], hz) * dark;
    var cw = L.unit * 430 * ly.size, cell = cw * (ly.deck ? 0.52 : 0.8);
    var wide = ly.deck ? 1.45 : lerp(1, 1.3, L.cloud), tall = (ly.deck ? 0.62 : lerp(1, 0.74, L.cloud)) * 0.5;
    var drift = windDist * ly.speed * 0.2 - (view.camX - SS.W.STAND_X) * view.scale * 0.06 * ly.speed / cell;
    var first = Math.floor(-cw * wide / cell - drift), last = Math.ceil((w + cw * wide) / cell - drift), i;
    ctx.globalCompositeOperation = 'source-over';
    for (i = first; i <= last; i++) {
      var id = ((i % 64) + 64) % 64, hs = ly.seed * 1000 + id * 3, a = amount;
      if (!ly.deck) {                                                       // more cells fill in as cloud cover rises
        var thr = (id * 0.618034 + ly.seed * 0.37) % 1;
        a = clamp((Math.min(1.12, 0.26 + L.cloud * 0.95 - L.heat * 0.2) - thr) / 0.12, 0, 1);
        if (a <= 0.01) continue;
      }
      var sz = (0.72 + 0.56 * hash(hs + 1)) * (0.55 + 0.45 * a), dw = cw * sz * wide, dh = cw * sz * tall;   // new clouds grow in
      var x = (i + 0.5 + 0.6 * (hash(hs) - 0.5) + drift) * cell, y = lerp(ly.y0, ly.y1, hash(hs + 2)) * hy;
      ctx.globalAlpha = Math.min(1, a * 3) * (1 - hz * 0.25);
      ctx.drawImage(cloudSprite(li, id % NV, tr, tg, tb, ur, ug, ub), x - dw / 2, y - dh * 0.8, dw, dh);
    }
  }

  var rainArmed = false, rainbowT = 0, RAINBOW_SECS = 28;
  function drawRainbow(ctx, view) {
    if (rainbowT <= 0) return;
    var u = 1 - rainbowT / RAINBOW_SECS, a = smooth(u / 0.12) * (1 - smooth((u - 0.6) / 0.4));
    a *= smooth(L.sunAlt / 0.25) * (1 - L.ov * 0.7) * (1 - L.night);
    if (a <= 0.01) return;
    var R = Math.min(L.horizonY * 0.78, view.w * 0.62), cx = L.sunX < view.w / 2 ? view.w * 0.66 : view.w * 0.34;
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a * 0.5;       // opposite the sun, as it should be
    ctx.drawImage(spr.rainbow, cx - R * 1.016, L.horizonY + R * 0.1 - R * 1.016, R * 2.032, R * 1.016);
  }

  function drawBolt(ctx, view) {
    var f = L.flash, s = view.scale, hy = L.horizonY, sd = L.bolt * 1000 + 7, i, b, k;
    ctx.globalCompositeOperation = 'lighter';                                // the whole sky lights up behind the skyline
    ctx.globalAlpha = f * 0.34; ctx.fillStyle = '#93a2dc';
    ctx.fillRect(-PAD, -PAD, view.w + PAD * 2, view.h + PAD * 2);
    if (f < 0.12) return;
    var x = (0.18 + 0.64 * hash(sd)) * view.w, y = hy * 0.1, n = 15, dy = hy * (0.78 + 0.2 * hash(sd + 1)) / n;
    ctx.globalAlpha = f * 0.5;
    ctx.drawImage(tinted('boltGlow', spr.glow, 170, 185, 255), x - hy * 0.7, y - hy * 0.3, hy * 1.4, hy * 1.4);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (i = 1; i <= n; i++) {
      var px = x, py = y;
      x += (hash(sd + i * 5) - 0.5) * 46 * s + (hash(sd + 2) - 0.5) * 16 * s; y += dy * (0.7 + 0.6 * hash(sd + i * 5 + 1));
      ctx.lineTo(x, y);
      if (i > 2 && i < n - 2 && hash(sd + i * 5 + 2) < 0.3) {               // a fork peels off and dies out
        var bx = x, by = y, side = hash(sd + i * 5 + 3) < 0.5 ? -1 : 1;
        for (b = 1; b <= 5; b++) {
          bx += side * (10 + 26 * hash(sd + i * 31 + b)) * s; by += dy * (0.35 + 0.5 * hash(sd + i * 37 + b));
          ctx.lineTo(bx, by);
        }
        ctx.moveTo(x, y);
      }
      if (px === x && py === y) break;
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var widths = [11, 5, 1.8], alphas = [0.14, 0.34, 1], cols = ['#8f9cff', '#c4ccff', '#ffffff'];
    for (k = 0; k < 3; k++) { ctx.globalAlpha = Math.min(1, f * 1.5) * alphas[k]; ctx.strokeStyle = cols[k]; ctx.lineWidth = widths[k] * s; ctx.stroke(); }
  }

  function ok(ctx, view, env) {
    if (!ctx || !view || !env || !(view.w > 0) || !(view.h > 0)) return false;
    if (!spr) build();
    return true;
  }

  function draw(ctx, view, env) {
    if (!ok(ctx, view, env)) return;
    look(view, env);
    retints = 3;
    var w = view.w, h = view.h, c = L.c, hy = L.horizonY;
    ctx.fillStyle = css(c[12], c[13], c[14]); ctx.fillRect(-PAD, 0, w + PAD * 2, h + PAD);     // under-fill: no gap can ever show
    ctx.fillStyle = css(c[0], c[1], c[2]); ctx.fillRect(-PAD, -PAD, w + PAD * 2, PAD);
    ctx.fillStyle = skyStrip(view); ctx.fillRect(-PAD, 0, w + PAD * 2, Math.min(h, strip.height));

    drawStars(ctx, view, env);
    drawMoon(ctx);
    drawClouds(ctx, view, 0);

    // horizon haze: the far clouds and the skyline sink into bright air (the sun burns through it)
    var hz = 0.5 + 0.25 * L.heat + 0.2 * L.wet, top = hy * 0.42;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = hz;
    var wh = 0.22 * (1 - 0.7 * L.warm), hr = lerp(c[12], 255, wh), hg = lerp(c[13], 255, wh), hb = lerp(c[14], 255, wh);
    ctx.drawImage(tinted('haze', spr.up, hr, hg, hb), -PAD, top, w + PAD * 2, hy - top);
    ctx.fillStyle = css(hr, hg, hb); ctx.fillRect(-PAD, hy, w + PAD * 2, h - hy + PAD);

    drawSun(ctx, view, env);
    drawClouds(ctx, view, 1);
    drawRainbow(ctx, view);
    drawClouds(ctx, view, 2);
    var veil = Math.max(L.storm * 0.7, smooth((L.cloud - 0.5) / 0.42) * 0.3);   // the deck thickens toward the zenith
    if (veil > 0.01) {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = veil;
      ctx.drawImage(tinted('veil', spr.down, c[18] * 0.8, c[19] * 0.8, c[20] * 0.84), -PAD, -PAD, w + PAD * 2, hy * 0.85 + PAD);
    }
    drawClouds(ctx, view, 3);
    drawClouds(ctx, view, 5);
    drawClouds(ctx, view, 4);
    if (L.flash > 0.01) drawBolt(ctx, view);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------------------ *
   * Top layer pieces
   * ------------------------------------------------------------------ */
  var shim = null;
  /* Real refraction: copy the band of the finished frame just above the pavement and put it
   * back in thin rows, each nudged sideways by a travelling wave. */
  function shimmer(ctx, view, env) {
    var m = ctx.getTransform(), dpr = m.a, band = Math.round(66 * view.scale * dpr), bw = ctx.canvas.width;
    var y0 = Math.round((view.groundY + 3 * view.scale) * dpr + m.f) - band, row = Math.max(1, Math.round(dpr)), y;
    if (band < 8 || y0 < 0) return;
    if (!shim || shim.width !== bw || shim.height !== band) shim = mk(bw, band);
    var sx = shim.getContext('2d'), amp = L.hot * 1.5 * view.scale * dpr, t = env.t, q = 1 / (dpr * view.scale);
    sx.globalCompositeOperation = 'copy';
    sx.drawImage(ctx.canvas, 0, y0, bw, band, 0, 0, bw, band);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    for (y = 0; y < band; y += row) {
      var f = y / band, wob = 0.62 * Math.sin(y * q * 0.3 - t * 5.2) + 0.38 * Math.sin(y * q * 0.83 + t * 7.9 + 1.3);
      ctx.drawImage(shim, 0, y, bw, row, wob * amp * Math.sin(PI * f) * (0.4 + 0.6 * f), y0 + y, bw, row);
    }
    ctx.restore();
  }

  function drawLeaves(ctx, view, env) {
    var nf = clamp((Math.abs(+env.wind || 0) - 0.04) * 26, 0, 24), s = view.scale, t = env.t, i;
    if (env.reduced) nf = Math.min(nf, 3);
    var n = Math.ceil(nf), track = view.w + 120 * s, petal = env.loc === 'park';
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < n; i++) {
      var h1 = hash(i * 7 + 1), h2 = hash(i * 7 + 2), h3 = hash(i * 7 + 3);
      var x = ((h1 * track + windDist * (150 + 170 * h2) * s) % track + track) % track - 60 * s;
      var y = view.groundY + (h3 - 0.62) * 300 * s + Math.sin(t * (0.7 + h2) + h1 * 9) * 16 * s + Math.sin(x * 0.012 / s + h3 * 7) * 26 * s;
      var sz = (11 + 8 * h2) * s;
      ctx.save(); ctx.translate(x, y);
      ctx.rotate(env.reduced ? h1 * 6 : t * (1.4 + 2.4 * h3) * (h1 > 0.5 ? 1 : -1) + h1 * 6);
      ctx.scale(1, env.reduced ? 0.8 : Math.cos(t * (2 + 3 * h2) + h3 * 6));     // tumbling end over end
      ctx.globalAlpha = clamp(nf - i, 0, 1);
      ctx.drawImage(spr.leaves[petal ? 3 : i % 3], -sz / 2, -sz * 0.3125, sz, sz * 0.625);
      ctx.restore();
    }
  }

  function grade(ctx, view) {
    var x = -PAD, y = -PAD, w = view.w + PAD * 2, h = view.h + PAD * 2, n = L.night, st = L.storm, ov = L.ov;
    var mr = lerp(1, 0.62, n) * lerp(1, 0.72, st) * lerp(1, 0.9, ov);
    var mg = lerp(1, 0.67, n) * lerp(1, 0.76, st) * lerp(1, 0.92, ov);
    var mb = lerp(1, 0.9, n) * lerp(1, 0.84, st) * lerp(1, 0.95, ov);
    ctx.globalAlpha = 1;
    if (mr < 0.985) {                                                       // cool night, heavy storm
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = css(mr * 255, mg * 255, mb * 255); ctx.fillRect(x, y, w, h);
    }
    var flat = ov * 0.13 + L.wet * 0.06;
    if (flat > 0.01) {                                                      // overcast: colour drains toward grey
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = flat; ctx.fillStyle = '#9ba7b6'; ctx.fillRect(x, y, w, h);
    }
    var warm = L.warm * (1 - ov * 0.8) * (1 - n * 0.5);
    if (warm > 0.01) {                                                      // golden hour
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = warm * 0.42; ctx.fillStyle = '#ff9838'; ctx.fillRect(x, y, w, h);
    }
    if (L.heat > 0.03 && n < 0.9) {                                         // heat: pale, bleached bloom
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = L.heat * (1 - n) * 0.13; ctx.fillStyle = '#ffeab8'; ctx.fillRect(x, y, w, h);
    }
    // light spills over the skyline: the sun (or the moon) blooms across whatever is in front of it
    ctx.globalCompositeOperation = 'screen';
    var hy = L.horizonY, big;
    if (L.sunVis > 0.01) {
      big = hy * (1.5 + 0.7 * L.heat);
      ctx.globalAlpha = L.sunVis * (0.2 + 0.14 * L.heat + 0.12 * L.warm);
      ctx.drawImage(tinted('spill', spr.glow, L.gr, L.gg, L.gb), L.sunX - big / 2, L.sunY - big / 2, big, big);
    }
    if (L.moonA > 0.01) {
      big = hy * 1.1;
      ctx.globalAlpha = L.moonA * 0.18;
      ctx.drawImage(tinted('moonWide', spr.glow, 130, 160, 255), L.moonX - big / 2, L.moonY - big / 2, big, big);
    }
  }

  function drawHeat(ctx, view, env) {
    var s = view.scale, w = view.w, t = env.t, heat = L.hot, i;
    if (heat <= 0.02) return;
    var pale = tinted('pale', spr.glow, 255, 240, 206), band = tinted('band', spr.soft, 255, 240, 206);
    ctx.globalCompositeOperation = 'screen';
    for (i = 0; i < 5; i++) {                                               // haze bands lifting off the pavement
      var f = (t * 0.07 + hash(i + 300)) % 1, bw = w * (0.8 + 0.6 * hash(i + 310)), bh = (40 + 36 * f) * s;
      var bx = hash(i + 320) * w + Math.sin(t * 0.3 + i * 2.1) * 30 * s, by = view.groundY + view.sidewalkH * 0.3 - f * 120 * s;
      ctx.globalAlpha = heat * 0.14 * Math.sin(PI * f);
      ctx.drawImage(band, bx - bw / 2, by - bh / 2, bw, bh);
    }
    if (L.sunVis > 0.1) {                                                   // sunbeams fanning down from the sun
      var beam = tinted('beam', spr.beam, 255, 238, 196), len = (view.groundY + view.sidewalkH - L.sunY) * 1.25;
      for (i = 0; i < 4; i++) {
        var ang = (i - 1.5) * 0.3 + (L.sunX > w / 2 ? 0.28 : -0.28) + (env.reduced ? 0 : Math.sin(t * 0.11 + i * 1.9) * 0.035);
        ctx.save(); ctx.translate(L.sunX, L.sunY); ctx.rotate(ang);
        ctx.globalAlpha = heat * L.sunVis * (0.16 + 0.08 * hash(i + 330));
        ctx.drawImage(beam, -len * 0.11, 0, len * 0.22, len);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'lighter';                               // dust motes catching the light
    var n = env.reduced ? 14 : 46, top = view.groundY * 0.28, span = view.groundY + view.sidewalkH - top;
    for (i = 0; i < n; i++) {
      var h1 = hash(i * 5 + 400), h2 = hash(i * 5 + 401), h3 = hash(i * 5 + 402);
      var x = ((h1 * w + Math.sin(t * 0.21 + h2 * 20) * 26 * s + windDist * 34 * s) % w + w) % w;
      var y = top + ((h2 * span - t * (3 + 6 * h3) * s) % span + span) % span;
      var tw = 0.5 + 0.5 * Math.sin(t * (0.7 + 1.6 * h3) + h1 * 30), sz = (2 + 3.5 * h3) * s;
      ctx.globalAlpha = heat * 0.6 * tw * tw;
      ctx.drawImage(pale, x - sz, y - sz, sz * 2, sz * 2);
    }
  }

  var RAIN = [                                // far, middle, near: count per 1280x720, length, speed, width, alpha, reach
    { n: 270, len: 13, v: 600, lw: 1, a: 0.24, reach: 0.2 },
    { n: 150, len: 22, v: 860, lw: 1.3, a: 0.32, reach: 1.0 },
    { n: 60, len: 38, v: 1200, lw: 1.8, a: 0.4, reach: 99 }
  ];
  function drawRain(ctx, view, env) {
    var s = view.scale, w = view.w, h = view.h, t = env.t, wet = L.wet, wind = +env.wind || 0, i, li;
    var dens = wet * Math.max(0.42, w * h / 921600) * (env.reduced ? 0.4 : 1), gy = view.groundY;

    ctx.globalCompositeOperation = 'screen';                                // mist hanging over the pavement
    var mist = tinted('mist', spr.soft, 206, 222, 240), track = w + 600 * L.unit;
    for (i = 0; i < 6; i++) {
      var mw = (520 + 380 * hash(i + 500)) * L.unit, mh = mw * 0.24;
      var mx = ((hash(i + 510) * track + windDist * 40 * s + t * 5 * s * (0.5 + hash(i + 520))) % track + track) % track - 300 * L.unit;
      ctx.globalAlpha = wet * 0.15;
      ctx.drawImage(mist, mx - mw / 2, gy + view.sidewalkH * (hash(i + 530) * 0.9 - 0.25) - mh / 2, mw, mh);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#cfe0f7'; ctx.lineCap = 'butt';
    for (li = 0; li < 3; li++) {                                            // streaks in three depths, one path each
      var R = RAIN[li], n = Math.min(700, Math.ceil(R.n * dens)), len = R.len * s, slant = (wind < 0 ? -0.1 : 0.1) * wet + wind * (0.4 + 0.12 * li);
      var span = Math.min(h, gy + view.sidewalkH * R.reach) + len, lane = w + Math.abs(slant) * span + 20, x0 = slant > 0 ? -slant * span : 0;
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        var id = li * 4096 + i, tt = t * R.v * s * (0.85 + 0.3 * hash(id)) / span + hash(id + 9001), cyc = Math.floor(tt);
        var y = (tt - cyc) * span, x = x0 + hash(id * 31 + cyc * 17) * lane + slant * y, dl = len * (0.65 + 0.7 * hash(id + 77));
        ctx.moveTo(x - slant * dl, y - dl); ctx.lineTo(x, y);
      }
      ctx.globalAlpha = R.a * (0.6 + 0.4 * wet); ctx.lineWidth = R.lw * Math.max(1, s * 0.8); ctx.stroke();
    }

    // splashes: a ring spreading on the ground and a couple of droplets kicked up
    var ns = Math.min(90, Math.ceil(54 * dens)), floor = Math.min(h, gy + view.sidewalkH * 2.4);
    ctx.lineWidth = Math.max(1, 1.1 * s); ctx.fillStyle = '#e6f0ff';
    for (i = 0; i < ns; i++) {
      var P = 0.5 + 0.45 * hash(i + 700), st = t / P + hash(i + 701), sc = Math.floor(st), f = st - sc;
      var yv = hash(i * 29 + sc * 57 + 703), sx = hash(i * 17 + sc * 131 + 702) * w, sy = gy + 5 * s + yv * (floor - gy - 5 * s);
      var ds = (0.55 + 0.75 * yv) * s, rx = (3 + 15 * f) * ds;
      ctx.globalAlpha = (1 - f) * (1 - f) * 0.6;
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, rx * 0.3, 0, 0, TAU); ctx.stroke();
      if (f < 0.4) {
        var up = Math.sin(PI * f / 0.4) * 8 * ds, dx = (3 + 9 * f) * ds, d = 1.3 * ds;
        ctx.globalAlpha = 0.75 * (1 - f / 0.4);
        ctx.fillRect(sx - dx - d / 2, sy - up - d, d, d); ctx.fillRect(sx + dx - d / 2, sy - up * 0.7 - d, d, d);
        ctx.fillRect(sx - d / 2, sy - up * 1.3 - d, d, d);
      }
    }
  }

  function drawGusts(ctx, view, env) {         // faint speed lines when it is really blowing
    var wind = +env.wind || 0, g = smooth((Math.abs(wind) - 0.45) / 0.4), s = view.scale, t = env.t, dir = wind < 0 ? -1 : 1, i;
    if (g <= 0.01) return;
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineWidth = 1.5 * s;
    for (i = 0; i < 12; i++) {
      var st = t / 1.2 + hash(i + 800), cyc = Math.floor(st), f = st - cyc;
      var len = (70 + 90 * hash(i * 11 + cyc + 801)) * s, y = (0.12 + 0.8 * hash(i * 13 + cyc * 7 + 802)) * (view.groundY + view.sidewalkH);
      var x = hash(i * 19 + cyc * 3 + 803) * (view.w + len * 2) - len + dir * f * 280 * s, bend = (hash(i + 804) - 0.5) * 16 * s;
      ctx.globalAlpha = Math.sin(PI * f) * 0.2 * g;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + dir * len * 0.5, y + bend, x + dir * len, y + bend * 0.3); ctx.stroke();
    }
  }

  function drawWeather(ctx, view, env) {
    if (!ok(ctx, view, env)) return;
    look(view, env);
    if (L.hot > 0.05 && !env.reduced && ctx.getTransform) shimmer(ctx, view, env);
    drawLeaves(ctx, view, env);                                             // solid things first, so the grade tints them too
    grade(ctx, view);
    drawHeat(ctx, view, env);
    if (L.wet > 0.02) drawRain(ctx, view, env);
    if (!env.reduced) drawGusts(ctx, view, env);
    if (L.flash > 0.01) {                                                   // the strike lights the street for an instant
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = L.flash * 0.14; ctx.fillStyle = '#b9c4ff';
      ctx.fillRect(-PAD, -PAD, view.w + PAD * 2, view.h + PAD * 2);
    }
    ctx.globalCompositeOperation = 'multiply';                              // multiply keeps the hue: gold stays gold
    ctx.globalAlpha = Math.min(0.8, 0.34 + 0.16 * L.night + 0.2 * L.storm + 0.06 * L.ov);
    ctx.drawImage(spr.vignette, -PAD, -PAD, view.w + PAD * 2, view.h + PAD * 2);
    ctx.globalAlpha = 1;
  }

  function update(dt, view, env) {
    if (!env) return;
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    var wind = +env.wind || 0, wet = env.weather ? +env.weather.wet || 0 : 0;
    if (!seeded) { seeded = true; windDist = wind * (+env.t || 0); }        // frozen debug frames differ by t
    windDist += wind * dt * (env.reduced ? 0.4 : 1);
    if (wet > 0.35) { rainArmed = true; rainbowT = 0; }
    else if (rainArmed && wet < 0.12) { rainArmed = false; rainbowT = RAINBOW_SECS; }
    if (rainbowT > 0) rainbowT -= dt;
  }

  SS.Sky = { draw: draw, drawWeather: drawWeather, update: update };
})();
