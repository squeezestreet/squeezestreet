/* Squeeze Street — main.js: boot, game loop, canvas input, keyboard shortcuts. */
(function () {
  'use strict';
  var SS = window.SS;
  var STEP = 1 / 60, MAX_STEPS = 12;
  var last = 0, acc = 0;

  function tryInit(name, mod) {
    if (!mod || !mod.init) return;
    try { mod.init(); } catch (e) { console.error('[SS] ' + name + '.init failed', e); }
  }

  function frame(now) {
    var dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    var st = SS.state;
    if (st && st.phase === 'day' && !SS.paused && SS.Sim && !SS.debugNoSim) {
      acc += dt * (st.settings && st.settings.speed || 1);
      var n = 0;
      while (acc >= STEP && n < MAX_STEPS && SS.state.phase === 'day') {
        try { SS.Sim.update(STEP); } catch (e) { console.error('[SS] Sim.update failed', e); acc = 0; break; }
        acc -= STEP; n++;
      }
      if (n >= MAX_STEPS) acc = 0;                       // dropped frames: do not spiral
    } else acc = 0;
    SS.Render.frame(SS.paused ? 0 : dt);
    requestAnimationFrame(frame);
  }

  /* Taps on the scene: collect tips, squeeze faster. */
  function scenePoint(e) { var r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitAt(e) {
    if (!SS.Actors || !SS.Actors.hit) return null;
    var p = scenePoint(e);
    try { return SS.Actors.hit(p.x, p.y); } catch (err) { return null; }
  }
  function onScenePress(e) {
    var st = SS.state;
    if (!st || st.phase !== 'day' || SS.paused || !SS.Sim) return;
    var hit = hitAt(e);
    if (!hit) return;
    if (hit.type === 'tip') SS.Sim.collectTip(hit.id);
    else if (hit.type === 'stand') SS.Sim.tapStand();
  }
  function onSceneMove(e) {
    var st = SS.state, hit = st && st.phase === 'day' && !SS.paused ? hitAt(e) : null;
    e.currentTarget.style.cursor = hit ? 'pointer' : '';
  }

  /* Keyboard: Space/P pause, 1-3 speed, B bell, M mute. Ignored while typing or on a control. */
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return;
    if (document.querySelector('#modal-root > *')) return;
    var st = SS.state, k = e.key.toLowerCase();
    if (!st || !SS.Sim) return;
    if (k === 'm') {
      var on = !(st.settings.sfx || st.settings.music);
      SS.Sim.setSetting('sfx', on); SS.Sim.setSetting('music', on);
      return;
    }
    if (st.phase !== 'day') return;
    if (k === ' ' || k === 'p') { e.preventDefault(); SS.setPaused(!SS.paused); }
    else if (k === '1' || k === '2' || k === '3') SS.Sim.setSetting('speed', Number(k));
    else if (k === 'b' && !SS.paused) SS.Sim.ringBell();
  }

  function boot() {
    tryInit('Render', SS.Render);
    tryInit('Sim', SS.Sim);
    tryInit('UI', SS.UI);
    tryInit('Screens', SS.Screens);
    if (SS.Debug) { try { SS.Debug.run(); } catch (e) { console.error('[SS] debug failed', e); } }

    var scene = document.getElementById('scene');
    scene.addEventListener('pointerdown', onScenePress);
    scene.addEventListener('pointermove', onSceneMove);
    window.addEventListener('keydown', onKey);
    var unlock = function () { if (SS.Audio && SS.Audio.unlock) { try { SS.Audio.unlock(); } catch (e) { /* optional */ } } };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    // leaving the tab mid-day pauses so nothing is missed
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && SS.state && SS.state.phase === 'day') SS.setPaused(true);
    });
    SS.on('phase', function (p) { SS.setPaused(false); document.getElementById('game').dataset.phase = p.to; });

    // tell every module where we are, now that all of them are listening
    SS.emit('phase', { from: null, to: SS.state ? SS.state.phase : 'title' });
    last = performance.now();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
