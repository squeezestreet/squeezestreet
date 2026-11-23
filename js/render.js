/* Squeeze Street — render.js
 * Owns both canvases, the camera (SS.view) and the environment (SS.env), and calls the
 * art modules in a fixed order. Every module call is isolated so one broken layer never
 * blanks the others.
 */
(function () {
  'use strict';
  var SS = window.SS, W = SS.W;
  var scene, fx, sctx, fctx;
  var view = (SS.view = {
    w: 0, h: 0, dpr: 1, scale: 1, camX: W.STAND_X, x0: 0, x1: 1000, groundY: 0, sidewalkH: 90,
    toX: function (wx) { return (wx - view.camX) * view.scale + view.cx; },
    toWorldX: function (sx) { return (sx - view.cx) / view.scale + view.camX; },
    laneY: function (lane) { return view.groundY + (8 + lane * (W.SIDEWALK_H - 8)) * view.scale; },
    laneScale: function (lane) { return view.scale * (0.9 + 0.2 * lane); },
    cx: 0
  });
  var env = (SS.env = {
    loc: 'street', phase: 'title', dayT: 0.78,
    weather: { type: 'sunny', temp: 26, wet: 0, heat: 0, cloud: 0, storm: 0 },
    wind: 0.15, t: 0, dt: 0, reduced: false
  });
  var NIGHT_SPAN = 1.6;                    // dayT wraps here
  var target = { scale: 1, camX: W.STAND_X, groundY: 0, cx: 0 }, snapped = false;
  var inset = { top: 0, right: 0, bottom: 0, left: 0 }, insetAt = -1;
  var warned = {};

  function safe(name, fn) {
    try { fn(); } catch (e) {
      if (!warned[name]) { warned[name] = true; console.error('[SS.Render] ' + name + ' failed', e); }
    }
  }

  function resize() {
    var rect = scene.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = Math.max(1, Math.round(rect.width)); view.h = Math.max(1, Math.round(rect.height)); view.dpr = dpr;
    [scene, fx].forEach(function (c) { c.width = Math.round(view.w * dpr); c.height = Math.round(view.h * dpr); });
    insetAt = -1;
    snapped = false;
  }

  /* How much of the canvas the UI covers, so the stand stays in the free area. */
  function measureInsets() {
    var top = 0, right = 0, bottom = 0;
    var hud = document.getElementById('hud');
    if (hud && !hud.hidden) top = hud.getBoundingClientRect().bottom + 6;
    var sheet = document.getElementById('sheet');
    if (sheet && !sheet.hidden && sheet.dataset.mode !== 'center') {
      var r = sheet.getBoundingClientRect();
      if (r.width && r.height) {
        if (r.width > view.w * 0.8) bottom = Math.max(0, view.h - r.top);   // bottom sheet
        else right = Math.max(0, view.w - r.left);                           // docked right
      }
    }
    var bar = document.getElementById('daybar');
    if (bar && !bar.hidden) bottom = Math.max(bottom, view.h - bar.getBoundingClientRect().top + 4);
    inset.top = top; inset.right = right; inset.bottom = Math.min(bottom, view.h * 0.7); inset.left = 0;
  }

  function computeTarget() {
    var fw = Math.max(200, view.w - inset.left - inset.right);
    var fh = Math.max(180, view.h - inset.bottom);          // the sky may run under the HUD
    // fit ~1000 world units across on wide screens, zoom in on tall ones, never tiny
    var s = Math.max(fh / 820, Math.min(fw / 420, fh / 540));
    s = Math.max(s, view.w / 1700);
    var viewW = fw / s;
    target.scale = s;
    target.camX = SS.lerp(W.STAND_X - 72, W.STAND_X, SS.clamp((viewW - 380) / 520, 0, 1));
    target.cx = inset.left + fw / 2;
    // feet of the front lane sit a little above the free area's bottom edge
    var below = (W.SIDEWALK_H + 46) * s;
    target.groundY = Math.round(Math.min(view.h - inset.bottom - below, view.h * 0.74));
  }

  function updateView(dt) {
    var now = performance.now();                          // real time: insets still track while paused
    if (now - insetAt > 200 || insetAt < 0) { measureInsets(); insetAt = now; }
    computeTarget();
    if (!snapped || env.reduced) {
      view.scale = target.scale; view.camX = target.camX; view.groundY = target.groundY; view.cx = target.cx; snapped = true;
    } else {
      view.scale = SS.damp(view.scale, target.scale, 6, dt);
      view.camX = SS.damp(view.camX, target.camX, 6, dt);
      view.groundY = SS.damp(view.groundY, target.groundY, 6, dt);
      view.cx = SS.damp(view.cx, target.cx, 6, dt);
    }
    view.sidewalkH = W.SIDEWALK_H * view.scale;
    view.x0 = view.toWorldX(0); view.x1 = view.toWorldX(view.w);
    if (SS.Sim && SS.Sim.setBounds) SS.Sim.setBounds(view.x0 - 70, view.x1 + 70);
  }

  /* Time of day follows the phase and only ever moves forward (through the night). */
  function dayTarget(st) {
    if (!st || st.phase === 'title') return 0.8;
    if (st.phase === 'prep') return 0.03;
    if (st.phase === 'day') return st.today ? SS.clamp(st.today.t, 0, 1) * 0.98 + 0.03 : 0.03;
    return 1.13;
  }
  function updateEnv(dt) {
    var st = SS.state, dbg = SS.debugEnv || null;
    env.phase = st ? st.phase : 'title';
    env.loc = (st && st.location) || 'street';
    env.reduced = SS.reduced();
    var tgt = dayTarget(st), gap = ((tgt - env.dayT) % NIGHT_SPAN + NIGHT_SPAN) % NIGHT_SPAN;
    if (gap > NIGHT_SPAN - 0.05) gap -= NIGHT_SPAN;      // tiny step backwards is fine
    if (env.reduced) env.dayT = tgt;
    else if (st && st.phase === 'day' && Math.abs(gap) < 0.06) env.dayT = tgt;
    else env.dayT += SS.clamp(gap, -0.02, 1) * Math.min(1, dt * 2.2);
    env.dayT = (env.dayT % NIGHT_SPAN + NIGHT_SPAN) % NIGHT_SPAN;

    var wx = st && (st.phase === 'day' && st.today ? st.today.weatherNow : st.phase === 'results' ? st.weather : st.phase === 'prep' ? st.forecast : null);
    var type = (wx && wx.type) || 'sunny', temp = (wx && wx.temp) || 26;
    var w = env.weather, k = env.reduced ? 1000 : 0.9;
    w.type = type; w.temp = temp;
    w.wet = SS.damp(w.wet, type === 'rainy' ? 0.7 : type === 'storm' ? 1 : 0, k, dt);
    w.storm = SS.damp(w.storm, type === 'storm' ? 1 : 0, k, dt);
    w.heat = SS.damp(w.heat, type === 'heatwave' ? 1 : SS.remap(temp, 28, 36, 0, 0.6), k, dt);
    w.cloud = SS.damp(w.cloud, type === 'cloudy' ? 0.75 : type === 'rainy' ? 0.9 : type === 'storm' ? 1 : type === 'heatwave' ? 0.05 : 0.22, k, dt);
    env.wind = SS.damp(env.wind, type === 'storm' ? 0.9 : type === 'rainy' ? 0.45 : 0.15 + 0.1 * Math.sin(env.t * 0.13), 0.8, dt);
    if (dbg) {                                           // debug.js overrides for screenshots
      if (dbg.dayT != null) env.dayT = dbg.dayT;
      if (dbg.loc) env.loc = dbg.loc;
      if (dbg.weather) Object.assign(env.weather, dbg.weather);
      if (dbg.wind != null) env.wind = dbg.wind;
    }
  }

  var Render = (SS.Render = {
    init: function () {
      scene = document.getElementById('scene'); fx = document.getElementById('fx');
      sctx = scene.getContext('2d'); fctx = fx.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      if (window.ResizeObserver) new ResizeObserver(resize).observe(scene);
      document.getElementById('game').classList.toggle('reduced', SS.reduced());
      SS.on('settings', function () { document.getElementById('game').classList.toggle('reduced', SS.reduced()); });
    },
    resize: resize,
    /** dt = real seconds since last frame (0 while paused) */
    frame: function (dt) {
      if (!sctx) return;
      if (SS.debugEnv && SS.debugEnv.t != null) { env.t = SS.debugEnv.t; dt = SS.debugEnv.dt || 0; }
      else env.t += dt;
      env.dt = dt;
      updateEnv(dt);
      updateView(dt);
      var mods = [SS.Sky, SS.Backdrops, SS.Actors, SS.FX], names = ['Sky', 'Backdrops', 'Actors', 'FX'];
      mods.forEach(function (m, i) { if (m && m.update) safe(names[i] + '.update', function () { m.update(dt, view, env); }); });

      var dpr = view.dpr, sh = (SS.FX && SS.FX.shakeOffset && !env.reduced) ? SS.FX.shakeOffset() : null;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, view.w, view.h);
      if (!SS.Sky) {                                      // plain fallback so the page is never black
        var g = sctx.createLinearGradient(0, 0, 0, view.h);
        g.addColorStop(0, '#58b9f5'); g.addColorStop(0.7, '#bfe9ff'); g.addColorStop(0.7, '#cfd6c4'); g.addColorStop(1, '#8f9a86');
        sctx.fillStyle = g; sctx.fillRect(0, 0, view.w, view.h);
      }
      if (sh) sctx.setTransform(dpr, 0, 0, dpr, sh.x * dpr, sh.y * dpr);
      var layers = [
        ['Sky.draw', SS.Sky, 'draw'], ['Backdrops.drawBack', SS.Backdrops, 'drawBack'], ['Actors.draw', SS.Actors, 'draw'],
        ['Backdrops.drawFront', SS.Backdrops, 'drawFront'], ['Sky.drawWeather', SS.Sky, 'drawWeather']
      ];
      layers.forEach(function (l) {
        if (!l[1] || !l[1][l[2]]) return;
        sctx.save();
        safe(l[0], function () { l[1][l[2]](sctx, view, env); });
        sctx.restore();
      });
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, view.w, view.h);
      if (SS.FX && SS.FX.draw) { fctx.save(); safe('FX.draw', function () { SS.FX.draw(fctx, view, env); }); fctx.restore(); }
    }
  });
})();
