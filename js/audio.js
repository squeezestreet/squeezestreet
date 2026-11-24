/* Squeeze Street — audio.js
 * Every sound is synthesised live with the Web Audio API. No audio files.
 *
 * SS.Audio = {
 *   unlock()            call from a user gesture; creates / resumes the AudioContext (cheap to call again).
 *                       audio.js also calls it itself on pointerup / touchend / click / keydown.
 *   play(name, opts)    one-shot effect. opts: { pitch, gain, delay, duration, qty, kind }. Unknown names do nothing.
 *                       names: click tick open close error tally whoosh coin tip ting pour squeeze squish ding bell
 *                              pop hm grumble chirp low trombone fanfare win chaching jingle chime thunder spend blip
 *                              welcome streak crack shield farewell loyal powerup
 *                              dexroll brake latch plink neon tada rolloff (Dex setting up: 'dealer:setup')
 * }
 * Listens to the bus by itself (sales, bells, weather, phases, settings, pause) and runs the
 * generative music and the location / weather ambience on a lookahead scheduler.
 * Every graph builder takes a mix made by makeMix(ctx), so the same code renders through an
 * OfflineAudioContext for tests (SS.Audio._).
 *
 * Signal path:  voices -> sfx | music -> duck | ambience  ->  master -> compressor -> soft clip -> out
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var SS = (root.SS = root.SS || {});
  var AC = root.AudioContext || root.webkitAudioContext;
  var doc = root.document;
  var rnd = Math.random;

  var LV = { master: 1, music: 0.27, amb: 0.45 };
  var CAP = 32;                        // everyday effects are refused above this many live effect voices
  var HARD = 96;                       // nothing at all (music included) is scheduled above this
  var NONE = {};
  var KEY = 53;                        // MIDI F3: the whole game is in F major
  var PENTA = [0, 2, 4, 7, 9], MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
  var CLIMB = [0, 3, 5, 8, 10, 12, 15, 17];        // semitones from A: quick sales walk up the F pentatonic

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function setting(k) { var s = SS.state && SS.state.settings; return !s || s[k] !== false; }
  function speed() { var s = SS.state && SS.state.settings; return s && s.speed > 0 ? Math.min(3, s.speed) : 1; }

  /* ------------------------------------------------------------------ *
   * Node helpers
   * ------------------------------------------------------------------ */
  function gn(c, v) { var g = c.createGain(); g.gain.value = v; return g; }
  function bq(c, type, f, q) { var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function os(c, type, f) { var o = c.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function nz(m) { var s = m.ctx.createBufferSource(); s.buffer = m.noise; s.loop = true; return s; }
  function pan(c, v) { if (!c.createStereoPanner) return gn(c, 1); var p = c.createStereoPanner(); p.pan.value = v; return p; }
  function chain() { for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); }
  function echo(c, time, fb, wet, out) {
    var inp = gn(c, wet), d = c.createDelay(1), f = gn(c, fb), lp = bq(c, 'lowpass', 2600);
    d.delayTime.value = time;
    chain(inp, d, lp, out); chain(lp, f, d);
    inp.time = d.delayTime;
    return inp;
  }

  /** The whole mixer for one context (live or offline). */
  function makeMix(c) {
    var m = { ctx: c, live: 0, fx: 0, hard: HARD, grp: null }, len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), i, x;
    for (i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    m.noise = buf;
    var comp = c.createDynamicsCompressor(), clip = c.createWaveShaper(), curve = new Float32Array(1025);
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    for (i = 0; i < 1025; i++) {       // straight up to 0.7, then eases toward 0.93: the output can never clip
      x = Math.abs(i / 512 - 1);
      curve[i] = (i < 512 ? -1 : 1) * (x < 0.7 ? x : 0.7 + 0.3 * Math.tanh((x - 0.7) / 0.3));
    }
    clip.curve = curve;
    m.master = gn(c, LV.master);
    chain(m.master, comp, clip, c.destination);
    m.sfx = gn(c, 1); m.music = gn(c, LV.music); m.duck = gn(c, 1); m.amb = gn(c, LV.amb);
    m.sfx.connect(m.master); chain(m.music, m.duck, m.master); m.amb.connect(m.master);
    m.sfxEcho = echo(c, 0.23, 0.3, 0.22, m.sfx);
    m.musEcho = echo(c, 0.31, 0.32, 0.3, m.music);
    return m;
  }

  /* Voices: every one ramps in and out (no clicks) and unhooks itself when it ends. */
  function shape(p, t, a, g, dur, hold) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(g, t + a);
    if (hold) p.setValueAtTime(g, t + a + hold);
    p.exponentialRampToValueAtTime(g * 0.001 + 1e-6, t + dur);
    p.linearRampToValueAtTime(0, t + dur + 0.02);
  }
  function track(m, src, amp) {
    var grp = m.grp;
    m.live++;
    if (grp) { grp.n++; m.fx++; }
    src.onended = function () {
      amp.disconnect(); m.live--;
      if (grp) { m.fx--; if (--grp.n === 0) grp.out.disconnect(); }
    };
  }
  /** o: { to, glide, a, hold, flt: [type, f, q], vib: [hz, depth] } */
  function tone(m, d, type, f, t, dur, g, o) {
    if (m.live > m.hard || !(g > 0)) return;
    var c = m.ctx, osc = c.createOscillator(), amp = c.createGain(), end = t + dur + 0.03, node = osc, lfo, lg;
    o = o || NONE;
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
    if (o.vib) {
      lfo = os(c, 'sine', o.vib[0]); lg = gn(c, o.vib[1]);
      chain(lfo, lg, osc.frequency); lfo.start(t); lfo.stop(end);
    }
    if (o.flt) { node = bq(c, o.flt[0], o.flt[1], o.flt[2]); osc.connect(node); }
    shape(amp.gain, t, o.a || 0.006, g, dur, o.hold);
    chain(node, amp, d);
    osc.start(t); osc.stop(end);
    track(m, osc, amp);
  }
  /** filtered noise burst. o: { to, q, a, hold } */
  function hiss(m, d, ftype, f, t, dur, g, o) {
    if (m.live > m.hard || !(g > 0)) return;
    o = o || NONE;
    var src = nz(m), flt = bq(m.ctx, ftype, f, o.q || 0.7), amp = m.ctx.createGain();
    if (o.to) { flt.frequency.setValueAtTime(f, t); flt.frequency.exponentialRampToValueAtTime(o.to, t + dur); }
    shape(amp.gain, t, o.a || 0.004, g, dur, o.hold);
    chain(src, flt, amp, d);
    src.start(t, rnd() * 1.9); src.stop(t + dur + 0.03);
    track(m, src, amp);
  }
  var CHIME = [[1, 1, 1], [2, 0.4, 0.6], [3, 0.15, 0.35]];                        // [ratio, gain, decay]
  var METAL = [[1, 1, 1], [2.76, 0.45, 0.7], [5.4, 0.2, 0.45], [8.93, 0.08, 0.25]];   // struck-bell partials
  var TING = METAL.slice(0, 2);
  function bell(m, d, t, f, dur, g, parts) {
    parts = parts || CHIME;
    for (var i = 0; i < parts.length; i++) tone(m, d, 'sine', f * parts[i][0], t, dur * parts[i][2], g * parts[i][1], { a: 0.003 });
  }
  function pluck(m, d, f, t, dur, g) {
    tone(m, d, 'triangle', f, t, dur, g);
    tone(m, d, 'sine', f * 2, t, dur * 0.5, g * 0.3);
  }
  function brass(m, d, f, t, dur, g) {
    tone(m, d, 'sawtooth', f, t, dur, g * 0.6, { a: 0.02, hold: dur * 0.45, flt: ['lowpass', 2100, 0.8] });
    tone(m, d, 'triangle', f, t, dur, g, { a: 0.015, hold: dur * 0.45 });
  }
  function sparkle(m, d, t, n, span, g) {
    for (var i = 0; i < n; i++) tone(m, d, 'sine', mtof(KEY + 36 + PENTA[Math.floor(rnd() * 5)] + 12 * Math.floor(rnd() * 2)), t + (i + rnd() * 0.5) * span / n, 0.16, g || 0.05);
  }

  /* ------------------------------------------------------------------ *
   * Sound effects: fn(mix, dest, time, pitch, opts)
   * ------------------------------------------------------------------ */
  var SFX = {
    click: function (m, d, t, v) {
      tone(m, d, 'triangle', 620 * v, t, 0.07, 0.3, { to: 430 * v });
      hiss(m, d, 'highpass', 3000, t, 0.02, 0.05);
    },
    tick: function (m, d, t, v) { tone(m, d, 'sine', 1250 * v, t, 0.04, 0.2, { to: 1000 * v, a: 0.003 }); },
    open: function (m, d, t, v) {
      tone(m, d, 'triangle', 392 * v, t, 0.17, 0.26, { to: 587 * v, glide: 0.1 });
      hiss(m, d, 'bandpass', 900, t, 0.16, 0.1, { to: 2600, q: 1, a: 0.05 });
    },
    close: function (m, d, t, v) {
      tone(m, d, 'triangle', 560 * v, t, 0.15, 0.24, { to: 370 * v, glide: 0.1 });
      hiss(m, d, 'bandpass', 2400, t, 0.14, 0.08, { to: 800, q: 1, a: 0.03 });
    },
    error: function (m, d, t, v) {
      tone(m, d, 'triangle', 311 * v, t, 0.13, 0.4, { a: 0.01 });
      tone(m, d, 'triangle', 262 * v, t + 0.12, 0.22, 0.4, { a: 0.01 });
    },
    tally: function (m, d, t, v) {
      tone(m, d, 'sine', 1046 * v, t, 0.06, 0.18, { a: 0.003 });
      tone(m, d, 'triangle', 523 * v, t, 0.05, 0.14, { a: 0.003 });
    },
    whoosh: function (m, d, t, v) { hiss(m, d, 'bandpass', 380 * v, t, 0.36, 0.5, { to: 2800 * v, q: 0.9, a: 0.15 }); },
    coin: function (m, d, t, v, o) {
      var q = clamp(o.qty || 1, 1, 4), f = 880 * v, i;
      tone(m, d, 'triangle', f, t, 0.09, 0.26);
      tone(m, d, 'triangle', f * 1.335, t + 0.07, 0.42, 0.28);
      tone(m, d, 'sine', f * 2.67, t + 0.07, 0.25, 0.07);
      for (i = 1; i < q; i++) tone(m, d, 'triangle', f * [1.335, 1.682, 2, 2.67][i], t + 0.07 + i * 0.075, 0.36, 0.2);
    },
    tip: function (m, d, t, v) {
      var f = 1397 * v;
      tone(m, d, 'triangle', f, t, 0.08, 0.2);
      tone(m, d, 'triangle', f * 1.5, t + 0.06, 0.1, 0.2);
      tone(m, d, 'sine', f * 2, t + 0.12, 0.5, 0.24);
      tone(m, d, 'sine', f * 3, t + 0.12, 0.25, 0.05);
    },
    ting: function (m, d, t, v) { bell(m, d, t, 2350 * v, 0.34, 0.2, TING); },
    pour: function (m, d, t, v, o) {
      var D = clamp(o.duration || 0.8, 0.25, 3), n = Math.min(16, Math.floor(D / 0.1)), i, f;
      hiss(m, d, 'bandpass', 700 * v, t, D, 0.5, { to: 1500 * v, q: 2.2, a: 0.05, hold: D * 0.72 });
      hiss(m, d, 'highpass', 4500, t, D, 0.03, { a: 0.05, hold: D * 0.7 });
      for (i = 0; i < n; i++) {                       // glugs that climb as the cup fills
        f = (320 + 520 * i / n + 160 * rnd()) * v;
        tone(m, d, 'sine', f, t + (i + rnd() * 0.6) * D / (n + 1), 0.06, 0.12, { to: f * 1.5 });
      }
    },
    squeeze: function (m, d, t, v) {
      for (var i = 0; i < 2; i++) {
        hiss(m, d, 'bandpass', 420 * v, t + i * 0.2, 0.2, 0.9, { to: 1500 * v, q: 5, a: 0.03 });
        tone(m, d, 'sine', 190 * v, t + i * 0.2, 0.16, 0.18, { to: 110, a: 0.01 });
      }
      tone(m, d, 'sine', 900 * v, t + 0.42, 0.07, 0.14, { to: 1500 * v });
    },
    squish: function (m, d, t, v) {
      hiss(m, d, 'bandpass', 500 * v, t, 0.14, 0.9, { to: 1700 * v, q: 5, a: 0.02 });
      tone(m, d, 'sine', 200 * v, t, 0.1, 0.18, { to: 120, a: 0.01 });
      tone(m, d, 'sine', 1000 * v, t + 0.1, 0.06, 0.12, { to: 1600 * v });
    },
    ding: function (m, d, t, v) {
      bell(m, d, t, 1568 * v, 0.95, 0.3);
      hiss(m, d, 'highpass', 5200, t + 0.02, 0.7, 0.07, { a: 0.05 });
      for (var i = 0; i < 6; i++) tone(m, d, 'sine', 3000 + 3000 * rnd(), t + 0.06 + rnd() * 0.5, 0.04, 0.04);   // fizz
    },
    bell: function (m, d, t) {
      for (var i = 0; i < 2; i++) {
        hiss(m, d, 'highpass', 4000, t + i * 0.2, 0.03, 0.08);
        bell(m, d, t + i * 0.2, 1397, 1.15, i ? 0.3 : 0.24, METAL);
      }
    },
    pop: function (m, d, t, v) { tone(m, d, 'sine', 380 * v, t, 0.09, 0.3, { to: 820 * v, glide: 0.05 }); },
    hm: function (m, d, t, v) { tone(m, d, 'sawtooth', 165 * v, t, 0.17, 0.5, { to: 132 * v, a: 0.03, flt: ['bandpass', 330, 2.5] }); },
    grumble: function (m, d, t, v) {
      tone(m, d, 'sawtooth', 125 * v, t, 0.18, 0.6, { to: 100 * v, a: 0.03, flt: ['bandpass', 380, 2.5], vib: [26, 7] });
      tone(m, d, 'sawtooth', 105 * v, t + 0.17, 0.3, 0.6, { to: 78 * v, a: 0.03, flt: ['bandpass', 300, 2.5], vib: [26, 7] });
    },
    chirp: function (m, d, t, v) {
      tone(m, d, 'sine', 1500 * v, t, 0.08, 0.16, { to: 2300 * v });
      tone(m, d, 'sine', 1900 * v, t + 0.09, 0.11, 0.16, { to: 2900 * v });
    },
    low: function (m, d, t, v) { tone(m, d, 'triangle', 330 * v, t, 0.24, 0.34, { to: 220 * v, a: 0.02, flt: ['lowpass', 900, 0.7] }); },
    trombone: function (m, d, t) {
      [[233, 0, 0.28], [220, 0.3, 0.28], [208, 0.6, 0.28], [196, 0.9, 0.95]].forEach(function (n, i) {
        tone(m, d, 'sawtooth', n[0], t + n[1], n[2], 0.3, { to: n[0] * (i === 3 ? 0.82 : 0.97), a: 0.04, hold: n[2] * 0.5,
          flt: ['lowpass', 1000, 1.2], vib: i === 3 ? [5.5, 5] : null });
      });
    },
    fanfare: function (m, d, t) {
      [523, 698, 880].forEach(function (f, i) { brass(m, d, f, t + i * 0.11, 0.17, 0.2); });
      [698, 880, 1047, 1397].forEach(function (f) { brass(m, d, f, t + 0.34, 0.95, 0.13); });
      sparkle(m, d, t + 0.36, 6, 0.6);
    },
    win: function (m, d, t) {
      [523, 698, 880, 1047].forEach(function (f, i) { brass(m, d, f, t + i * 0.12, 0.18, 0.2); });
      brass(m, d, 1397, t + 0.48, 0.55, 0.22);
      [[1.1, 0.36, [466, 587, 698, 932], 117], [1.5, 0.36, [523, 659, 784, 1047], 131], [1.9, 1.7, [698, 880, 1047, 1397, 1760], 87]].forEach(function (c) {   // IV, V, I
        c[2].forEach(function (f) { brass(m, d, f, t + c[0], c[1], 0.11); });
        tone(m, d, 'triangle', c[3], t + c[0], c[1], 0.2, { a: 0.01, hold: c[1] * 0.4 });
        tone(m, d, 'sine', 150, t + c[0], 0.2, 0.25, { to: 52, glide: 0.1 });
      });
      hiss(m, d, 'highpass', 6000, t + 1.9, 1.3, 0.1, { a: 0.01 });
      sparkle(m, d, t + 1.95, 14, 1.4);
    },
    chaching: function (m, d, t) {
      hiss(m, d, 'highpass', 3500, t, 0.06, 0.16);
      tone(m, d, 'triangle', 190, t, 0.06, 0.3);
      hiss(m, d, 'bandpass', 2500, t + 0.07, 0.05, 0.3, { q: 3 });
      bell(m, d, t + 0.13, 2093, 0.7, 0.2);
      bell(m, d, t + 0.13, 2794, 0.8, 0.16);
      sparkle(m, d, t + 0.22, 6, 0.4);
    },
    jingle: function (m, d, t) {
      [523, 587, 698, 784, 880].forEach(function (f, i) { pluck(m, d, f, t + i * 0.09, 0.22, 0.22); });
      pluck(m, d, 1047, t + 0.45, 0.6, 0.26);
      sparkle(m, d, t + 0.5, 4, 0.4, 0.04);
    },
    chime: function (m, d, t) {
      bell(m, d, t, 1047, 1.4, 0.22);
      bell(m, d, t + 0.24, 880, 1.5, 0.22);
      bell(m, d, t + 0.48, 698, 1.9, 0.26);
      tone(m, d, 'sine', 174.6, t + 0.48, 1.6, 0.14, { a: 0.1 });
    },
    thunder: function (m, d, t) {
      hiss(m, d, 'bandpass', 1300, t, 0.2, 0.2, { q: 0.6 });
      hiss(m, d, 'bandpass', 420, t + 0.05, 1.9, 0.4, { to: 170, q: 0.6, a: 0.05 });              // the roll a small speaker can still play
      hiss(m, d, 'lowpass', 260, t + 0.03, 2.6, 2.2, { to: 70, a: 0.06 });
      hiss(m, d, 'lowpass', 180, t + 0.5, 2.3, 1.6, { to: 60, a: 0.2 });
      hiss(m, d, 'lowpass', 140, t + 1.1, 2.4, 1.2, { to: 50, a: 0.3 });
    },
    spend: function (m, d, t, v) {
      tone(m, d, 'sine', 784 * v, t, 0.08, 0.18);
      tone(m, d, 'sine', 587 * v, t + 0.07, 0.14, 0.18);
      hiss(m, d, 'highpass', 5000, t, 0.05, 0.04);
    },
    blip: function (m, d, t, v, o) {
      if (o.kind === 'bad') tone(m, d, 'sine', 520 * v, t, 0.14, 0.2, { to: 430 * v });
      else tone(m, d, 'sine', 698 * v, t, 0.1, 0.2, { to: 880 * v });
      if (o.kind === 'good') tone(m, d, 'sine', 1047 * v, t + 0.08, 0.14, 0.16);
    },
    welcome: function (m, d, t, v) {                    // a new regular: warm two-note chime, a fourth up
      bell(m, d, t, 784 * v, 0.9, 0.2);
      bell(m, d, t + 0.14, 1047 * v, 1.3, 0.24);
      tone(m, d, 'triangle', 392 * v, t, 0.5, 0.1, { a: 0.02 });
      tone(m, d, 'triangle', 523 * v, t + 0.14, 0.8, 0.1, { a: 0.02 });
    },
    streak: function (m, d, t, v, o) {                  // rising arpeggio; the top note climbs with the streak
      var n = clamp(Math.floor(o.streak) || 1, 1, 20), top = Math.min(11, 3 + n), i, j, f;
      for (i = 0; i < 4; i++) {
        j = top - 3 + i; f = mtof(KEY + 12 + 12 * Math.floor(j / 5) + PENTA[j % 5]) * v;
        pluck(m, d, f, t + i * 0.065, i === 3 ? 0.6 : 0.2, i === 3 ? 0.24 : 0.18);
      }
      bell(m, d, t + 0.195, f * 2, 0.5, 0.06);
      if (n === 5 || n === 10 || n === 20) sparkle(m, d, t + 0.25, n >= 10 ? 8 : 5, 0.5);
    },
    crack: function (m, d, t, v) {                      // a streak broke: short descending blip with a snap
      tone(m, d, 'triangle', 660 * v, t, 0.09, 0.26, { to: 560 * v });
      tone(m, d, 'triangle', 494 * v, t + 0.09, 0.22, 0.26, { to: 370 * v });
      hiss(m, d, 'bandpass', 2600, t + 0.085, 0.04, 0.16, { q: 2.5 });
    },
    shield: function (m, d, t, v) {                     // the Streak Shield saved it: bright ping
      bell(m, d, t, 1760 * v, 0.8, 0.2, METAL);
      tone(m, d, 'sine', 2637 * v, t + 0.04, 0.5, 0.07, { vib: [7, 14] });
      hiss(m, d, 'highpass', 6000, t, 0.25, 0.05, { a: 0.01 });
    },
    farewell: function (m, d, t, v) {                   // a regular stopped coming: soft low tone
      tone(m, d, 'sine', 247 * v, t, 0.9, 0.22, { to: 196 * v, a: 0.08 });
      tone(m, d, 'triangle', 123.5 * v, t, 0.9, 0.08, { a: 0.1 });
    },
    loyal: function (m, d, t, v) {                      // loyalty bonus: a brighter, sparklier coin than a sale
      var f = 1175 * v;
      tone(m, d, 'triangle', f, t, 0.07, 0.18);
      tone(m, d, 'triangle', f * 1.498, t + 0.06, 0.35, 0.2);
      tone(m, d, 'sine', f * 2.997, t + 0.06, 0.2, 0.05);
      sparkle(m, d, t + 0.1, 4, 0.25, 0.04);
    },
    powerup: function (m, d, t, v) {                    // a boost switched on: quick upward sweep
      tone(m, d, 'square', 220 * v, t, 0.28, 0.1, { to: 1320 * v, glide: 0.24, flt: ['lowpass', 2400, 1] });
      tone(m, d, 'sine', 440 * v, t, 0.3, 0.16, { to: 1760 * v, glide: 0.26 });
      hiss(m, d, 'bandpass', 600, t, 0.3, 0.1, { to: 5000, q: 1.5, a: 0.1 });
      tone(m, d, 'sine', 1760 * v, t + 0.27, 0.25, 0.12);
    },
    // Dex the Dealer setting up his stall
    dexroll: function (m, d, t, v) {                    // wheels rumbling over the slabs, slowing down, and a little whistled tune
      var i, at, f, W = [[0.3, 84, 0.11], [0.43, 81, 0.11], [0.56, 84, 0.11], [0.69, 89, 0.3]];
      hiss(m, d, 'lowpass', 230, t, 1.35, 0.55, { to: 110, a: 0.15, hold: 0.6 });
      hiss(m, d, 'bandpass', 650, t, 1.2, 0.05, { q: 1.4, a: 0.15, hold: 0.5 });
      for (i = 0, at = t + 0.08; i < 6; i++, at += 0.13 + i * 0.035) tone(m, d, 'triangle', (150 + rnd() * 30) * v, at, 0.06, 0.15 * (1 - i / 9), { to: 70, a: 0.003 });
      for (i = 0; i < W.length; i++) { f = mtof(W[i][1]) * v; tone(m, d, 'sine', f, t + W[i][0], W[i][2], 0.1, { a: 0.025, hold: W[i][2] * 0.4, vib: [6, f * 0.012] }); }
    },
    brake: function (m, d, t, v) {                      // a heel on the wheel brake: clunk and a metal click
      tone(m, d, 'sine', 150 * v, t, 0.16, 0.45, { to: 55, glide: 0.1, a: 0.003 });
      hiss(m, d, 'bandpass', 1800 * v, t, 0.05, 0.3, { q: 4 });
      tone(m, d, 'square', 2200 * v, t + 0.01, 0.02, 0.05, { a: 0.001 });
    },
    latch: function (m, d, t, v) {                      // the clasp clacks open, the lid creaks up
      hiss(m, d, 'bandpass', 2600 * v, t, 0.025, 0.45, { q: 5 });
      hiss(m, d, 'bandpass', 3400 * v, t + 0.06, 0.02, 0.35, { q: 5 });
      tone(m, d, 'sawtooth', 170 * v, t + 0.08, 0.34, 0.08, { to: 260 * v, a: 0.04, flt: ['bandpass', 700, 5], vib: [22, 14] });
    },
    plink: function (m, d, t, v, o) {                   // a bottle pops up; each one a step higher
      var f = mtof(KEY + 24 + [0, 2, 4, 7, 9, 12, 14][clamp(o.i | 0, 0, 6)]) * v;
      tone(m, d, 'sine', f * 0.5, t, 0.06, 0.16, { to: f, glide: 0.05 });
      pluck(m, d, f, t + 0.03, 0.22, 0.17);
      tone(m, d, 'sine', f * 3, t + 0.03, 0.1, 0.03);
    },
    neon: function (m, d, t, v) {                       // the pole goes up with a chain rattle, the sign thunks in, the neon buzzes on: ding
      for (var i = 0; i < 7; i++) tone(m, d, 'sine', 2600 + rnd() * 2600, t + i * 0.035 + rnd() * 0.01, 0.025, 0.045, { a: 0.002 });
      tone(m, d, 'sine', 130 * v, t + 0.3, 0.16, 0.38, { to: 70, glide: 0.1, a: 0.003 });
      hiss(m, d, 'lowpass', 700, t + 0.3, 0.07, 0.25);
      tone(m, d, 'sawtooth', 118, t + 0.6, 0.18, 0.06, { flt: ['bandpass', 1400, 3], a: 0.005, hold: 0.12 });
      bell(m, d, t + 0.82, 1568 * v, 0.5, 0.14);
    },
    tada: function (m, d, t, v) {                       // ta-da!
      pluck(m, d, 698 * v, t, 0.14, 0.2);
      pluck(m, d, 880 * v, t + 0.07, 0.14, 0.2);
      [1047, 1397, 1760].forEach(function (f) { pluck(m, d, f * v, t + 0.16, 0.55, 0.14); });
      brass(m, d, 698 * v, t + 0.16, 0.32, 0.08);
      sparkle(m, d, t + 0.22, 4, 0.3, 0.04);
    },
    rolloff: function (m, d, t, v) {                    // packs away (the lid shuts), then the wheels rumble off into the distance
      hiss(m, d, 'bandpass', 900, t + 0.05, 0.22, 0.1, { to: 2400, q: 1, a: 0.05 });
      hiss(m, d, 'bandpass', 2400 * v, t + 0.84, 0.03, 0.4, { q: 5 });
      tone(m, d, 'sine', 120, t + 0.84, 0.12, 0.3, { to: 60, glide: 0.08 });
      hiss(m, d, 'lowpass', 220, t + 1.02, 1.3, 0.5, { to: 90, a: 0.12 });
      for (var i = 0, at = t + 1.08; i < 6; i++, at += Math.max(0.06, 0.2 - i * 0.03)) tone(m, d, 'triangle', (150 + rnd() * 30) * v, at, 0.06, 0.14 * (1 - i / 7), { to: 70, a: 0.003 });
    }
  };
  var LEVEL = { latch: 2.2, tada: 0.8, neon: 0.85, welcome: 0.7, farewell: 0.6, pour: 0.7, error: 0.6, bell: 0.7, ding: 0.85, trombone: 0.62, fanfare: 0.7, win: 0.7, chaching: 0.9, chime: 0.75, thunder: 0.75, grumble: 0.8, low: 0.75, hm: 0.6 };                                                                  // per-effect trim, tuned from the offline loudness table
  var VAR = { plink: 0, tada: 0, neon: 0.02, streak: 0, welcome: 0.02, trombone: 0, fanfare: 0, win: 0, chaching: 0, jingle: 0, chime: 0, bell: 0, thunder: 0, coin: 0.02, tally: 0.02, pop: 0.14, hm: 0.16, grumble: 0.14 };   // random pitch spread (default 0.05)
  var GAP = { tick: 0.03, tally: 0.035, pop: 0.09, hm: 0.7, grumble: 0.35, chirp: 0.8, low: 0.8, coin: 0.06, tip: 0.07, ting: 0.1, squish: 0.07, blip: 0.2, whoosh: 0.15, pour: 0.12, spend: 0.15, thunder: 2, welcome: 0.3, streak: 0.15, crack: 0.25, shield: 0.3, farewell: 0.6, loyal: 0.08, powerup: 0.25 };   // min seconds between repeats (default 0.04)
  var ECHO = { tada: 1, neon: 1, welcome: 1, streak: 1, shield: 1, bell: 1, chime: 1, fanfare: 1, win: 1, ding: 1, chaching: 1, jingle: 1, tip: 1, ting: 1 };
  var DUCK = { tada: 0.6, fanfare: 1.3, win: 3.4, jingle: 0.9, chime: 1.1, trombone: 1.5, chaching: 0.5 };   // seconds the music steps back

  /** Build one effect at time t. Shared by play() and the offline tests. */
  function fire(m, name, t, o) {
    var out = gn(m.ctx, (LEVEL[name] || 1) * (o.gain || 1)), vr = VAR[name] == null ? 0.05 : VAR[name];
    out.connect(m.sfx);
    if (ECHO[name]) out.connect(m.sfxEcho);
    var grp = m.grp = { out: out, n: 0 };
    try { SFX[name](m, out, t, (o.pitch || 1) * (1 + (rnd() - 0.5) * vr), o); } finally { m.grp = null; }
    if (!grp.n) out.disconnect();                     // refused by the voice cap: nothing will ever unhook it
    if (DUCK[name]) {                                 // overlapping cues (cha-ching, then a milestone fanfare) keep the music down until the last one ends
      m.duckEnd = Math.max(m.duckEnd || 0, t + DUCK[name]);
      m.duck.gain.cancelScheduledValues(t);
      m.duck.gain.setTargetAtTime(0.42, t, 0.04);
      m.duck.gain.setTargetAtTime(1, m.duckEnd, 0.35);
    }
  }

  /* ------------------------------------------------------------------ *
   * Music: one sequencer in F major. Moods share the harmony and cross-fade
   * by part (pad, chords, bass, lead, drums); the tempo glides between them.
   * ------------------------------------------------------------------ */
  var MOODS = {
    title:   { bpm: 86,  swing: 0.16, dens: 0.42, busy: 0, strum: 0, pad: 1,   stab: 0,   bass: 0.7, lead: 0.75, drum: 0.4 },
    prep:    { bpm: 96,  swing: 0.14, dens: 0.5,  busy: 0, strum: 2, pad: 0.6, stab: 0.7, bass: 0.8, lead: 0.7,  drum: 0.55 },
    day:     { bpm: 112, swing: 0.1,  dens: 0.72, busy: 1, strum: 1, pad: 0.3, stab: 1,   bass: 1,   lead: 1,    drum: 1 },
    results: { bpm: 74,  swing: 0.18, dens: 0.34, busy: 0, strum: 2, pad: 1,   stab: 0.5, bass: 0.6, lead: 0.6,  drum: 0.2 }
  };
  var PARTS = ['pad', 'stab', 'bass', 'lead', 'drum'];
  var CH = { I: [0, 0], ii: [2, 1], iii: [4, 1], IV: [5, 0], V: [7, 0], vi: [9, 1] };   // [semitones above the tonic, minor]
  var PROGS = [['I', 'vi', 'IV', 'V'], ['I', 'iii', 'IV', 'V'], ['vi', 'IV', 'I', 'V'], ['ii', 'V', 'I', 'vi'], ['IV', 'V', 'iii', 'vi'], ['I', 'IV', 'ii', 'V']];
  var BASS_DAY = [1, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 1, 0, 3, 0], BASS_EASY = [1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0];
  var ARP = [0, 1, 2, 3, 2, 1, 2, 1];

  function musicCreate(m, mood, seed) {
    var c = m.ctx, mu = { m: m, mood: mood, bpm: 0, next: 0, step: 0, bar: 0, idx: 4, part: {}, lead: [], leadD: [],
      rnd: SS.mulberry32 ? SS.mulberry32(seed || 20240607) : rnd };
    PARTS.forEach(function (k) { mu.part[k] = gn(c, MOODS[mood][k]); });
    chain(mu.part.pad, bq(c, 'lowpass', 1500, 0.5), m.music);
    chain(mu.part.stab, pan(c, -0.3), m.music);
    chain(mu.part.lead, pan(c, 0.25), m.music);
    mu.part.lead.connect(m.musEcho);
    mu.part.bass.connect(m.music); mu.part.drum.connect(m.music);
    return mu;
  }
  function musicMood(mu, mood, t) {
    mu.mood = mood;
    PARTS.forEach(function (k) { mu.part[k].gain.setTargetAtTime(MOODS[mood][k], t, 0.5); });
  }
  /** A one-bar idea: w = how eagerly each 16th wants a note (lower plays first), d = melodic step taken there. */
  function motif(r) {
    var w = [], d = [], s;
    for (s = 0; s < 16; s++) {
      w[s] = r() / (s % 4 === 0 ? 1 : s % 2 === 0 ? 0.7 : 0.2);
      d[s] = Math.round((r() + r() - 1) * 3);
    }
    return { w: w, d: d };
  }
  function snap(idx, rootPc, third) {                 // nearest pentatonic note that belongs to the chord
    for (var k = 0, j, rel; k < 5; k++) {
      j = idx + (k & 1 ? (k + 1) >> 1 : -(k >> 1));
      if (j < 0 || j > 9) continue;
      rel = (PENTA[j % 5] - rootPc + 12) % 12;
      if (rel === 0 || rel === third || rel === 7) return j;
    }
    return idx;
  }
  function planBar(mu, M) {
    var r = mu.rnd, b = mu.bar & 3, sec = mu.bar >> 2, c, rootN, third, i, s, idx, mot, last = -1, hit;
    if (b === 0) {                                    // new four-bar phrase: home progression, then a detour, and so on
      mu.prog = PROGS[sec & 1 ? 1 + Math.floor(r() * (PROGS.length - 1)) : 0];
      if (!mu.motA || r() < 0.6) mu.motA = motif(r);
      mu.motB = motif(r);
      mu.rest = sec > 1 && !mu.rest && r() < 0.2;                 // now and then the lead sits a phrase out,
      mu.thin = sec > 2 && r() < 0.15;                //   the drums drop back,
      mu.whistle = r() < 0.3;                         //   or the lead is whistled instead of plucked
    }
    c = CH[mu.prog[b]]; rootN = KEY + c[0]; third = c[1] ? 3 : 4;
    mu.bassN = 41 + (rootN - 41) % 12;
    i = 48 + (rootN - 48) % 12;
    mu.padN = [i, i + 7, i + 12 + third, i + (c[1] ? 19 : 14)];
    mu.stabN = [0, third, 7].map(function (x) { return 60 + (rootN + x) % 12; }).sort(function (p, q) { return p - q; });
    mu.stabN.push(mu.stabN[0] + 12);
    mu.pickup = r() < 0.35; mu.kx = r() < 0.3; mu.fill = b === 3 && r() < 0.6;
    mot = b === 2 ? mu.motB : mu.motA; idx = mu.idx;
    for (s = 0; s < 16; s++) {
      mu.lead[s] = 0;
      hit = b === 3 && s >= 8 ? s === 8 : mot.w[s] < M.dens;      // the phrase ends on a held note, then breathes
      if (mu.rest || !hit) continue;
      i = mot.d[s];
      idx = clamp(idx + ((idx > 6 && i > 0) || (idx < 3 && i < 0) ? -i : i), 0, 9);      // turns back toward the middle of its range
      if (s % 8 === 0) idx = snap(idx, c[0], third);
      mu.lead[s] = KEY + 12 + 12 * Math.floor(idx / 5) + PENTA[idx % 5];
      if (last >= 0) mu.leadD[last] = Math.min(6, s - last);
      last = s;
    }
    if (last >= 0) mu.leadD[last] = b === 3 ? 8 : Math.min(6, 16 - last);
    mu.idx = idx;
  }
  function strum(mu, t, up, g) {
    for (var i = 0, n = up ? 3 : 4; i < n; i++) tone(mu.m, mu.part.stab, 'triangle', mtof(mu.stabN[up ? 3 - i : i]), t + i * 0.013, 0.24, g);
  }
  function kick(m, d, t, g) { tone(m, d, 'sine', 150, t, 0.2, g, { to: 52, glide: 0.1, a: 0.004 }); }
  function shaker(m, d, t, g) { hiss(m, d, 'highpass', 6000, t, 0.05, g); }
  function musicStep(mu, t) {
    var m = mu.m, M = MOODS[mu.mood], P = mu.part, s = mu.step, r = mu.rnd, i, n;
    var want = M.bpm * (mu.mood === 'day' ? 1 + 0.07 * (speed() - 1) : 1);
    mu.bpm = mu.bpm ? mu.bpm + (want - mu.bpm) * 0.12 : want;
    var sd = 15 / mu.bpm, at = t + (s & 1 ? sd * M.swing : 0), bar = sd * 16, vel = 0.85 + 0.3 * r();
    if (s === 0) {
      planBar(mu, M);
      m.musEcho.time.setTargetAtTime(sd * 3, t, 0.2);                                         // echo on the dotted eighth
      if (M.pad > 0.05) for (i = 0; i < 4; i++) tone(m, P.pad, 'triangle', mtof(mu.padN[i]), t, bar + 0.6, 0.09, { a: bar * 0.3, hold: bar * 0.45 });
    }
    n = (M.busy ? BASS_DAY : BASS_EASY)[s];
    if (s === 14 && !M.busy && mu.pickup) n = 2;
    if (n) {
      i = mtof(mu.bassN + (n === 2 ? 7 : n === 3 ? 12 : 0));
      tone(m, P.bass, 'triangle', i, at, sd * (M.busy ? 2.6 : 5), 0.26 * vel, { a: 0.012 });
      tone(m, P.bass, 'sine', i * 2, at, sd * (M.busy ? 2 : 3.5), 0.1 * vel, { a: 0.012 });   // an octave up, so small speakers still hear the bass line
    }
    if (M.strum === 1) {                              // sunny off-beat strums
      if (s === 4 || s === 12) strum(mu, at, 0, 0.13);
      else if ((s === 6 || s === 10 || s === 14) && r() < 0.55) strum(mu, at, 1, 0.08);
    } else if (M.strum === 2 && !(s & 1)) tone(m, P.stab, 'triangle', mtof(mu.stabN[ARP[s >> 1]]), at, sd * 3.5, 0.14 * vel);
    n = mu.lead[s];
    if (n) {
      i = Math.max(0.24, mu.leadD[s] * sd * 1.1);
      if (mu.whistle) tone(m, P.lead, 'sine', mtof(n), at, i, 0.22 * vel, { a: 0.03, hold: i * 0.45, vib: [5.5, mtof(n) * 0.006] });
      else pluck(m, P.lead, mtof(n), at, i, 0.27 * vel);
    }
    if (M.busy && !mu.thin) {
      if (s === 0 || s === 8 || (s === 10 && mu.kx)) kick(m, P.drum, at, 0.3);
      if (s === 4 || s === 12) { hiss(m, P.drum, 'bandpass', 1900, at, 0.1, 0.22, { q: 1.2 }); tone(m, P.drum, 'triangle', 330, at, 0.05, 0.1, { to: 200 }); }
      if (!(s & 1)) shaker(m, P.drum, at, s % 4 === 2 ? 0.1 : 0.055);
      else if ((mu.fill && s > 11) || r() < 0.2) shaker(m, P.drum, at, 0.035);
    } else {
      if (s === 0 || (s === 8 && mu.mood === 'prep')) kick(m, P.drum, at, 0.24);
      if (s % 4 === 2) shaker(m, P.drum, at, 0.07);
      if (s === 12 && mu.mood !== 'title') tone(m, P.drum, 'sine', 820, at, 0.06, 0.12);      // wood block
    }
    mu.step = (s + 1) & 15;
    if (!mu.step) mu.bar++;
    mu.next = t + sd;
  }
  function musicRun(mu, until) { while (mu.next < until) musicStep(mu, mu.next); }

  /* ------------------------------------------------------------------ *
   * Ambience: looping beds built only while they are audible, plus
   * scheduled birds, calliope phrases, passing cars and far thunder.
   * ------------------------------------------------------------------ */
  var LAYER = {
    surf: function (m, out) {
      var c = m.ctx, n = nz(m), lp = bq(c, 'lowpass', 520, 0.4), sw = gn(c, 0.5), lfo = os(c, 'sine', 0.11);
      chain(n, lp, sw, out); chain(lfo, gn(c, 0.42), sw.gain); chain(lfo, gn(c, 330), lp.frequency);
      return [n, lfo];
    },
    city: function (m, out) {
      var c = m.ctx, n = nz(m), o1 = os(c, 'sawtooth', 55), o2 = os(c, 'sawtooth', 82.7), lp = bq(c, 'lowpass', 190, 0.5), dg = gn(c, 0.1), lfo = os(c, 'sine', 0.07);
      chain(n, bq(c, 'lowpass', 170, 0.5), out);
      o1.connect(lp); o2.connect(lp); chain(lp, dg, out); chain(lfo, gn(c, 0.05), dg.gain);
      return [n, o1, o2, lfo];
    },
    fair: function (m, out) {                           // crowd murmur; the calliope plays into the same gain
      var c = m.ctx, n = nz(m), mg = gn(c, 0.5), l1 = os(c, 'sine', 0.37), l2 = os(c, 'sine', 0.91);
      chain(n, bq(c, 'bandpass', 850, 0.5), mg, out); chain(l1, gn(c, 0.2), mg.gain); chain(l2, gn(c, 0.12), mg.gain);
      return [n, l1, l2];
    },
    rain: function (m, out) {
      var c = m.ctx, n = nz(m), n2 = nz(m);
      chain(n, bq(c, 'highpass', 900, 0.5), bq(c, 'lowpass', 4800, 0.5), out);
      chain(n2, bq(c, 'bandpass', 420, 0.8), gn(c, 0.5), out);
      return [n, n2];
    },
    crickets: function (m, out) {
      var c = m.ctx, src = [];
      [[4300, 31, 1.7], [3750, 27, 1.15]].forEach(function (k) {
        var o = os(c, 'sine', k[0]), trill = gn(c, 0.5), pulse = gn(c, 0.5), l1 = os(c, 'sine', k[1]), l2 = os(c, 'sine', k[2]);
        chain(o, trill, pulse, out); chain(l1, gn(c, 0.5), trill.gain); chain(l2, gn(c, 0.5), pulse.gain);
        src.push(o, l1, l2);
      });
      return src;
    }
  };
  var AMBLV = { surf: 0.36, city: 0.25, fair: 0.1, rain: 0.11, crickets: 0.035 };

  function ambCreate(m) {
    var c = m.ctx, a = { m: m, lay: {}, tg: {}, bird: 0, call: 0, cal: null, car: 0, boom: 0, L: pan(c, -0.6), R: pan(c, 0.6), far: gn(c, 0.5) };
    a.L.connect(m.amb); a.R.connect(m.amb); a.far.connect(m.amb);
    return a;
  }
  /** T: { birds, surf, city, fair, rain, crickets, storm } each 0..1. snap = start at level (offline tests). */
  function ambSet(a, T, now, snapTo) {
    var k, l, v;
    a.tg = T;
    for (k in LAYER) {
      v = T[k] || 0; l = a.lay[k];
      if (v > 0.02 && !l) {
        l = a.lay[k] = { g: gn(a.m.ctx, snapTo ? v * AMBLV[k] : 0), off: 0 };
        l.g.connect(a.m.amb);
        l.src = LAYER[k](a.m, l.g);
        l.src.forEach(function (s) { s.start(now); });
      }
      if (!l) continue;
      l.g.gain.setTargetAtTime(v * AMBLV[k], now, 0.6);
      if (v > 0.02) l.off = 0;
      else if (!l.off) l.off = now;
      else if (now - l.off > 4) {                       // faded out a while ago: free the nodes
        l.src.forEach(function (s) { try { s.stop(); } catch (e) { /* already stopped */ } });
        l.g.disconnect();
        delete a.lay[k];
      }
    }
  }
  function bird(m, d, t, lv) {
    var kind = Math.floor(rnd() * 3), f = 2600 + rnd() * 1800, g = (0.05 + 0.06 * rnd()) * lv, i, n;
    if (kind === 0) for (i = 0, n = 2 + Math.floor(rnd() * 3); i < n; i++) tone(m, d, 'sine', f * 1.25, t + i * 0.13, 0.09, g, { to: f * 0.8, a: 0.01 });
    else if (kind === 1) for (i = 0, n = 5 + Math.floor(rnd() * 5); i < n; i++) tone(m, d, 'sine', f * (i & 1 ? 1.12 : 1), t + i * 0.055, 0.045, g * 0.8, { a: 0.008 });
    else {
      tone(m, d, 'sine', f, t, 0.14, g, { to: f * 1.3, a: 0.02 });
      tone(m, d, 'sine', f * 0.85, t + 0.2, 0.22, g, { to: f * 0.7, a: 0.02 });
    }
  }
  function organ(m, d, n, t, dur, g) {
    tone(m, d, 'square', mtof(n), t, dur, g, { a: 0.03, hold: dur * 0.6, flt: ['lowpass', 1500, 0.6], vib: [5.5, 3] });
  }
  var WALTZ = [[3], [1, 1, 1], [2, 1], [1, 2]];
  /** One bar of a faint carousel-organ waltz. q = { b, bars, idx } carries the phrase. Returns the bar length. */
  function calliopeBar(m, d, t, q) {
    var beat = 0.34, last = q.b === q.bars - 1, ch = q.b % 4 > 1 && !last ? 7 : 0, rh = last ? WALTZ[0] : WALTZ[Math.floor(rnd() * 4)], k, pos;
    organ(m, d, KEY - 12 + ch, t, beat * 0.9, 0.5);                                         // oom
    for (k = 1; k < 3; k++) { organ(m, d, KEY + ch + 4, t + k * beat, beat * 0.5, 0.2); organ(m, d, KEY + ch + 7, t + k * beat, beat * 0.5, 0.2); }   // pah pah
    for (k = 0, pos = 0; k < rh.length; pos += rh[k++]) {
      q.idx = last ? 7 : clamp(q.idx + Math.round((rnd() + rnd() - 1) * 2.4), 2, 10);       // I I V V, home on the last bar
      organ(m, d, KEY + 12 + 12 * Math.floor(q.idx / 7) + MAJOR[q.idx % 7], t + pos * beat, rh[k] * beat * 0.95, 0.45);
    }
    q.b++;
    return 3 * beat;
  }
  function ambRun(a, now, until) {
    var m = a.m, T = a.tg, v;
    if (a.bird < now) a.bird = now + rnd();
    while (a.bird < until) {
      v = T.birds || 0;
      if (v > 0.05) bird(m, rnd() < 0.5 ? a.L : a.R, a.bird, v);
      a.bird += 0.35 + rnd() * 2.6 / (0.3 + v);
    }
    if (a.call < now) { a.call = now + 1 + rnd() * 2; a.cal = null; }
    while (a.call < until) {
      if (!(a.lay.fair && T.fair > 0.05)) { a.call = until + 1; a.cal = null; break; }
      if (!a.cal) a.cal = { b: 0, bars: 4 + 2 * Math.floor(rnd() * 2), idx: 4 + Math.floor(rnd() * 3) };
      a.call += calliopeBar(m, a.lay.fair.g, a.call, a.cal);
      if (a.cal.b >= a.cal.bars) { a.cal = null; a.call += 2 + rnd() * 5; }      // a breath between phrases
    }
    if (a.car < now) a.car = now + 1 + rnd() * 4;
    if (a.car < until) {
      if (T.city > 0.05) hiss(m, rnd() < 0.5 ? a.L : a.R, 'bandpass', 220 + 200 * rnd(), a.car, 3.2, 0.5 * T.city, { to: 520, q: 0.8, a: 1.3 });
      a.car += 4 + rnd() * 8;
    }
    if (a.boom < now) a.boom = now + 4 + rnd() * 9;
    if (a.boom < until) {
      if (T.storm > 0.5) SFX.thunder(m, a.far, a.boom, 1, NONE);
      a.boom += 10 + rnd() * 16;
    }
  }
  function ambTargets() {
    var e = SS.env, st = SS.state, loc = (e && e.loc) || (st && st.location) || 'street';
    var wx = (e && e.weather) || NONE, wet = clamp(wx.wet || 0, 0, 1);
    var night = e && SS.light && typeof e.dayT === 'number' ? SS.light(e.dayT).night : 0;
    return {
      birds: ({ street: 0.8, park: 1, beach: 0.25 }[loc] || 0) * (1 - wet) * (1 - night),
      surf: loc === 'beach' ? 1 : 0,
      city: loc === 'downtown' ? 1 : 0,
      fair: loc === 'carnival' ? 1 : 0,
      rain: wet,
      crickets: night * (1 - 0.6 * wet) * ({ downtown: 0.3, carnival: 0.25 }[loc] || 1),
      storm: wx.storm || 0
    };
  }

  /* ------------------------------------------------------------------ *
   * Live engine
   * ------------------------------------------------------------------ */
  var ctx = null, mix = null, mus = null, amb = null;
  var mood = 'title', lastAt = {}, combo = 0, lastSale = -9, lastDeal = -9, ticks = 0, warned = false;

  function levels() {
    if (!mix) return;
    var t = ctx.currentTime, p = !!SS.paused, fx = setting('sfx');
    mix.music.gain.setTargetAtTime(setting('music') ? LV.music * (p ? 0.3 : 1) : 0, t, 0.15);   // paused: dim, do not cut
    mix.sfx.gain.setTargetAtTime(fx ? 1 : 0, t, 0.03);
    mix.amb.gain.setTargetAtTime(fx ? LV.amb * (p ? 0.4 : 1) : 0, t, 0.2);
  }
  function tick() {                                     // lookahead scheduler: the timer only wakes us, the audio clock places every note
    if (!mix || ctx.state !== 'running') return;
    try {
      var now = ctx.currentTime, on = setting('sfx');
      if (setting('music')) {
        if (mus.next < now) mus.next = now + 0.05;
        musicRun(mus, now + 0.25);
      }
      if (ticks++ % 6 === 0) ambSet(amb, on ? ambTargets() : NONE, now);
      if (on) ambRun(amb, now, now + 0.25);
    } catch (e) {
      if (!warned) { warned = true; if (root.console) console.error('[SS.Audio] scheduler', e); }
    }
  }
  function wake() { var p = ctx.resume && ctx.resume(); if (p && p.catch) p.catch(function () { /* needs a gesture; the next one retries */ }); }
  function unlock() {
    if (!AC) return;
    if (!ctx) {
      try {
        ctx = new AC(); mix = makeMix(ctx);
        if (SS.state && MOODS[SS.state.phase]) mood = SS.state.phase;
        mus = musicCreate(mix, mood, Date.now() & 0xffffff);
        amb = ambCreate(mix);
        mix.music.gain.value = setting('music') ? LV.music : 0;
        mix.sfx.gain.value = setting('sfx') ? 1 : 0;
        mix.amb.gain.value = setting('sfx') ? LV.amb : 0;
      } catch (e) {                                     // a broken Web Audio build: stay silent for good
        try { ctx.close(); } catch (e2) { /* never opened */ }
        ctx = mix = mus = amb = null; AC = null; return;
      }
      setInterval(tick, 80);
    }
    if (ctx.state !== 'running' && !(doc && doc.hidden)) wake();
  }
  function play(name, o) {
    if (!mix || ctx.state !== 'running' || !Object.prototype.hasOwnProperty.call(SFX, name) || !setting('sfx')) return;
    var now = ctx.currentTime;
    if (now - (lastAt[name] || -9) < (GAP[name] || 0.04) || (mix.fx > CAP && !DUCK[name])) return;   // the big, rare cues always get through
    lastAt[name] = now;
    o = o || NONE;
    fire(mix, name, now + 0.012 + (o.delay > 0 ? o.delay : 0), o);
  }

  if (doc && doc.addEventListener) {
    // main.js unlocks on pointerdown, which touch browsers do not count as a gesture: pointerup, touchend and click do.
    // Kept for good, because a phone call or the lock screen can interrupt the context later.
    ['pointerup', 'touchend', 'click', 'keydown'].forEach(function (e) { doc.addEventListener(e, unlock, { capture: true, passive: true }); });
    doc.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (doc.hidden) {                                 // fade, then stop the clock so nothing plays to an empty room
        mix.master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        setTimeout(function () { if (doc.hidden && ctx.state === 'running') ctx.suspend(); }, 120);
      } else {
        wake();
        mix.master.gain.setTargetAtTime(LV.master, ctx.currentTime, 0.1);
      }
    });
  }

  /* Bus -> sounds. Payloads can be empty (debug emits {}), so everything is read defensively. */
  function on(evt, fn) { if (SS.on) SS.on(evt, function (p) { fn(p || NONE); }); }
  function say(evt, name, o) { on(evt, function () { play(name, o); }); }
  on('sale', function (p) {
    if (!mix) return;
    var now = ctx.currentTime;
    combo = now - lastSale < 1.4 ? Math.min(combo + 1, 7) : 0;
    lastSale = now;
    play('coin', { pitch: Math.pow(2, CLIMB[combo] / 12), qty: p.qty });
  });
  on('tip:collect', function (p) { play('tip', { gain: p.auto ? 0.6 : 1 }); });
  say('tip:drop', 'ting');
  on('pour', function (p) { play('pour', { duration: (p.duration > 0 ? p.duration : 0.8) / speed() }); });
  say('brew:start', 'squeeze');
  say('brew:tap', 'squish');
  say('brew:done', 'ding');
  say('bell', 'bell');
  say('customer:join', 'pop');
  say('customer:balk', 'hm');
  say('customer:quit', 'grumble');
  on('review', function (p) {
    if (p.mood > 0.3) play('chirp', { gain: 0.6 + 0.4 * Math.min(1, p.mood) });
    else if (p.mood < -0.2) play('low');
  });
  say('soldout', 'trombone');
  on('milestone', function (p) {                        // the last milestone gets the big 'win' fanfare instead
    var d = SS.DATA && SS.DATA.byId && SS.DATA.byId(SS.DATA.milestones, p.id);
    if (!(d && d.final)) play('fanfare');
  });
  say('win', 'win');
  say('upgrade:buy', 'chaching');
  say('flavor:buy', 'chaching');
  say('location:unlock', 'chaching');
  say('day:start', 'jingle', { delay: 0.25 });          // lets the phase whoosh go first
  say('day:end', 'chime', { delay: 0.1 });
  on('weather:change', function (p) { if (p.type === 'storm') play('thunder'); });
  on('cash', function (p) { if (p.delta < 0 && !/^(upgrade|location|flavor|dealer|deal|boost|limited)$/.test(p.reason)) play('spend'); });   // those already cha-ching
  // regulars and Dex the Dealer
  say('regular:new', 'welcome');
  on('regular:streak', function (p) { play('streak', { streak: p.streak }); });
  on('regular:broken', function (p) { play(p.shielded ? 'shield' : 'crack'); });
  say('regular:lost', 'farewell', { delay: 0.3 });     // usually lands right after the streak broke
  say('loyalty', 'loyal', { delay: 0.1 });             // just after the sale's coin
  on('dealer:buy', function () { lastDeal = ctx ? ctx.currentTime : 0; play('chaching'); });
  on('boost:on', function () { play('powerup', { delay: ctx && ctx.currentTime - lastDeal < 0.2 ? 0.3 : 0 }); });   // after the ka-ching
  on('dealer:setup', function (p) {                     // Dex's show; snapped into place (quiet) has no sound
    if (p.quiet) return;
    var red = SS.reduced && SS.reduced();
    if (p.step === 'arrive') { if (!red) play('dexroll'); }
    else if (p.step === 'park') play('brake');
    else if (p.step === 'open') play('latch');
    else if (p.step === 'bottle') play('plink', { i: p.i });
    else if (p.step === 'sign') play('neon');
    else if (p.step === 'ready') play('tada');
    else if (p.step === 'leave' && !red) play('rolloff');
  });
  on('toast', function (p) { play('blip', { kind: p.kind }); });
  on('phase', function (p) {
    if (!MOODS[p.to] || p.to === mood) return;
    mood = p.to;
    play('whoosh');
    if (mus) musicMood(mus, mood, ctx.currentTime);
  });
  on('settings', levels);
  on('pause', levels);

  SS.Audio = {
    unlock: unlock,
    play: play,
    /* test hooks: render any of this through an OfflineAudioContext */
    _: { makeMix: makeMix, fire: fire, names: Object.keys(SFX), moods: Object.keys(MOODS), musicCreate: musicCreate, musicMood: musicMood,
      musicRun: musicRun, ambCreate: ambCreate, ambSet: ambSet, ambRun: ambRun, layers: Object.keys(LAYER), state: function () { return { ctx: ctx, mix: mix, mus: mus, amb: amb }; } }
  };
})();
