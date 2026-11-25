#!/usr/bin/env node
/* Record the game frame by frame at an exact 30 fps of GAME time, however slowly headless Chrome renders.
 *   node tools/record.js steps.json outdir
 * Before the page's scripts run, a fake clock replaces performance.now, Date.now, requestAnimationFrame, setTimeout,
 * setInterval and their clear* calls, and seeds Math.random. Nothing moves until a step advances it: each video frame
 * runs the timers due in the next 1/30 s, then the rAF callbacks, then pauses every CSS/Web animation and seeks it to the
 * virtual time it has been alive. Smooth el.scrollTo() calls glide on that clock too. So the game runs at 1x: exactly
 * 1/30 s of game time per frame.
 * steps: a JSON array of objects, run in order. Each may hold any of:
 *   {view:[w,h]} {dpr:3}   viewport and pixel density (default 1280x720 at 1x; under 768 wide emulates a phone)
 *   {hidpi:true}           lift render.js's 2x canvas cap to the full dpr, so a 3x capture is not an upscale (next nav on)
 *   {init:"js"}            script to run before every page load (after the clock)
 *   {nav:"url"}            "index.html#debug=new" style paths are resolved against the project folder; virtual time restarts
 *   {adv:ms}               advance game time without capturing
 *   {rec:ms, dir:"a"}      advance and capture a JPEG per frame to outdir/a/00000.jpg ... (numbering continues per dir)
 *   {until:"js", max:ms, dir?}  advance (capturing if dir) until the expression is truthy; prints the time it took
 *   {click:"text"} {clickSel:"css"} {tap:[x,y]} {tapAt:"js giving [x,y] in CSS px"}   a mouse click at the current game time
 *   {eval:"js"} {log:"js"} prints the JSON value   {shot:"name"} saves outdir/name.png
 * Prints every console error and warning at the end. Starts and kills its own Chrome.
 */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), out = process.argv[3] || '.';
fs.mkdirSync(out, { recursive: true });
const FPS = 30;

/* FRAME is 1e-9 longer than 1/FPS s. main.js steps the sim in fixed 1/60 s steps off rAF deltas; with exact 1/30 s frames,
   float rounding parks its accumulator on a step boundary, so frames ran 1, 2 or 3 steps and the crowd stuttered.
   The bias keeps every frame at exactly 2 steps (drift: 0.1 µs a minute). */
const CLOCK = `(() => {
  const FRAME = 1000 / ${FPS} * (1 + 1e-9), D0 = Date.UTC(2026, 6, 15, 10, 0, 0);
  let T = 0, n = 0, tid = 0, rid = 0, seq = 0, rs = 0x5eed5, rafs = new Map();
  const timers = new Map(), seen = new WeakMap();
  performance.now = () => T;
  Date.now = () => D0 + T;
  Math.random = () => {                                   // mulberry32: the same crowd every take
    rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const add = (fn, ms, args, every) => { const id = ++tid; timers.set(id, { id, fn, args, every, at: T + Math.max(0, +ms || 0), seq: ++seq }); return id; };
  window.setTimeout = (fn, ms, ...a) => add(fn, ms, a, 0);
  window.setInterval = (fn, ms, ...a) => add(fn, ms, a, Math.max(1, +ms || 0));
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = ++rid; rafs.set(id, fn); return id; };
  let running = null;
  window.cancelAnimationFrame = (id) => { rafs.delete(id); if (running) running.delete(id); };
  const call = (fn, args) => { try { typeof fn === 'function' ? fn(...args) : (0, eval)(String(fn)); } catch (e) { reportError(e); } };
  // el.scrollTo({behavior:'smooth'}) would glide on Chrome's real clock and show as a jump: tween it on game time instead
  const tweens = new Map(), scrollTo0 = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (a) {
    if (!a || typeof a !== 'object' || a.behavior !== 'smooth') { tweens.delete(this); return scrollTo0.apply(this, arguments); }
    const x0 = this.scrollLeft, y0 = this.scrollTop, x1 = a.left != null ? +a.left : x0, y1 = a.top != null ? +a.top : y0;
    tweens.set(this, { x0, y0, x1, y1, t0: T, dur: Math.min(500, Math.max(150, Math.sqrt(Math.hypot(x1 - x0, y1 - y0)) * 25)) });
  };
  function glide() {
    for (const [el, w] of tweens) {
      const k = Math.min(1, (T - w.t0) / w.dur), e = k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2;
      scrollTo0.call(el, { left: w.x0 + (w.x1 - w.x0) * e, top: w.y0 + (w.y1 - w.y0) * e, behavior: 'instant' });
      if (k >= 1) tweens.delete(el);
    }
  }
  function sync() {                                       // CSS/Web animations: paused, seeked to their age in game time
    for (const a of document.getAnimations()) {
      let s = seen.get(a);
      if (s === undefined) seen.set(a, (s = T));
      if (a.playState !== 'paused') a.pause();
      a.currentTime = T - s;
    }
  }
  function frame() {
    const target = ++n * FRAME;
    for (let guard = 0; guard < 5000; guard++) {
      let best = null;
      for (const tm of timers.values()) if (tm.at <= target && (!best || tm.at < best.at || (tm.at === best.at && tm.seq < best.seq))) best = tm;
      if (!best) break;
      T = Math.max(T, best.at);
      if (best.every) { best.at += best.every; best.seq = ++seq; } else timers.delete(best.id);
      call(best.fn, best.args);
    }
    T = target;
    glide();
    running = rafs; rafs = new Map();
    for (const [id, fn] of running) if (running.has(id)) call(fn, [T]);
    running = null;
    sync();
  }
  window.__vt = {
    frame, sync, get t() { return T; },
    run(k, cond) { const f = cond ? new Function('return (' + cond + ')') : null; let i = 0; while (i < k) { frame(); i++; if (f && f()) break; } return i; }
  };
})();`;

/* shortcut: render.js caps the canvas at 2x (Math.min(dpr, 2)); this scales the two game canvases' backing size and
   SS.view.dpr to the real dpr so a 3x capture is drawn at 3x. Re-check if render.js stops sizing canvases in resize(). */
const HIDPI = `document.addEventListener('DOMContentLoaded', () => {
  const real = window.devicePixelRatio, cap = Math.min(real, 2), k = real / cap, v = window.SS && SS.view;
  if (!v || k === 1) return;
  Object.defineProperty(v, 'dpr', { get: () => real, set: () => {}, configurable: true });
  const W = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width'), H = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
  ['scene', 'fx'].forEach((id) => { const c = document.getElementById(id); if (!c) return;
    Object.defineProperty(c, 'width', { get() { return W.get.call(this); }, set(x) { W.set.call(this, Math.round(x * k)); } });
    Object.defineProperty(c, 'height', { get() { return H.get.call(this); }, set(x) { H.set.call(this, Math.round(x * k)); } }); });
});`;

const PORT = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'ss-rec-')), '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
const kill = () => { try { chrome.kill('SIGKILL'); } catch (e) { /* gone */ } };
process.on('exit', kill);
process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0, view = [1280, 720], dpr = 1, loaded = null;
const pending = new Map(), errors = [], counters = {};
function send(method, params = {}) {
  return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
  return r.result.value;
}
async function tap(x, y) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  // park the pointer over open sky so no button keeps a hover state in later frames
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(view[0] / 2), y: Math.round(view[1] * 0.3) });
  await evalJS('__vt.sync()');                             // transitions the click started begin now
}
async function center(js) {
  return evalJS(`(() => { const el = ${js}; if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()`);
}
async function capture(dir) {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
  const d = path.join(out, dir), i = counters[dir] = (counters[dir] || 0);
  if (!i) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, String(i).padStart(5, '0') + '.jpg'), Buffer.from(r.data, 'base64'));
  counters[dir]++;
}
/** advance up to `frames` frames, one capture per frame when dir is set; stops early once cond is truthy */
async function advance(frames, dir, cond) {
  if (!dir) return evalJS(`__vt.run(${frames}, ${cond ? JSON.stringify(cond) : 'null'})`);
  for (let i = 0; i < frames; i++) {
    const hit = await evalJS(`(__vt.frame(), ${cond ? `!!(${cond})` : 'false'})`);
    await capture(dir);
    if (hit) return i + 1;
  }
  return frames;
}
const metrics = () => send('Emulation.setDeviceMetricsOverride', { width: view[0], height: view[1], deviceScaleFactor: dpr, mobile: view[0] < 768 });
(async () => {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch (e) { await sleep(200); }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    if (d.method === 'Page.loadEventFired' && loaded) loaded();
    if (d.method === 'Runtime.exceptionThrown') {
      const ex = d.params.exceptionDetails;
      errors.push('EXCEPTION ' + String((ex.exception && ex.exception.description) || ex.text).slice(0, 500));
    }
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning'))
      errors.push(d.params.type.toUpperCase() + ' ' + d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 500));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK });
  await metrics();
  const t0 = Date.now();
  for (const s of steps) {
    try {
      if (s.view || s.dpr) { if (s.view) view = s.view; if (s.dpr) dpr = s.dpr; await metrics(); }
      if (s.hidpi) await send('Page.addScriptToEvaluateOnNewDocument', { source: HIDPI });
      if (s.init) await send('Page.addScriptToEvaluateOnNewDocument', { source: s.init });
      if (s.nav) {
        const url = /^[a-z]+:/i.test(s.nav) ? s.nav : 'file://' + path.join(ROOT, s.nav.split('#')[0]) + (s.nav.includes('#') ? '#' + s.nav.split('#').slice(1).join('#') : '');
        const done = new Promise((r) => (loaded = r));
        await send('Page.navigate', { url });
        await Promise.race([done, sleep(15000)]); loaded = null;
        await evalJS('document.fonts.ready.then(() => 1)'); await sleep(300);
      }
      if (s.adv) await advance(Math.round(s.adv * FPS / 1000));
      if (s.rec) { await advance(Math.round(s.rec * FPS / 1000), s.dir || 'frames'); console.log(`  rec ${s.dir} -> ${counters[s.dir || 'frames']} frames`); }
      if (s.until) {
        const n = await advance(Math.round((s.max || 30000) * FPS / 1000), s.dir, s.until);
        console.log(`  until ${s.until.slice(0, 60)}: ${n} frames (${(n / FPS).toFixed(2)} s)`);
      }
      if (s.click) {
        const c = await center(`[...document.querySelectorAll('button, [role=button], a')].filter(b => b.getClientRects().length && !b.closest('[hidden]')).find(b => (b.textContent + ' ' + (b.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').includes(${JSON.stringify(s.click)}))`);
        if (!c) console.log('  ! no button with text', s.click); else await tap(c[0], c[1]);
      }
      if (s.clickSel) {
        const c = await center(`document.querySelector(${JSON.stringify(s.clickSel)})`);
        if (!c) console.log('  ! no element', s.clickSel); else await tap(c[0], c[1]);
      }
      if (s.tap) await tap(s.tap[0], s.tap[1]);
      if (s.tapAt) { const c = await evalJS(s.tapAt); if (!c) console.log('  ! nothing to tap', s.tapAt); else { console.log('  tap', c.map(Math.round)); await tap(c[0], c[1]); } }
      if (s.eval) await evalJS(s.eval);
      if (s.log) console.log('  ' + JSON.stringify(await evalJS(s.log)));
      if (s.shot) {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(out, s.shot + '.png'), Buffer.from(r.data, 'base64'));
        console.log('shot', path.join(out, s.shot + '.png'));
      }
    } catch (e) { console.log('  ! step failed', JSON.stringify(s).slice(0, 200), e.message); }
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s real time`);
  console.log(errors.length ? 'CONSOLE:\n' + [...new Set(errors)].join('\n') : 'no console errors or warnings');
  ws.close(); kill(); process.exit(0);
})().catch((e) => { console.error(e); kill(); process.exit(1); });
