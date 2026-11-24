#!/usr/bin/env node
/* Play the game in real-time headless Chrome over the DevTools protocol, screenshot as you go,
 * and report every console error. Unlike tools/shot.sh, animations run at real speed.
 *   node tools/play.js steps.json outdir
 * steps: a JSON array of objects, run in order. Each may hold any of:
 *   {view:[w,h]}       viewport (default 1280x720, 1x)   {dpr:2}  pixel density
 *   {init:"js"}        script to run before every page load (e.g. block localStorage)
 *   {nav:"url"}        "index.html#debug=new" style paths are resolved against the project folder
 *   {wait:ms}          {click:"text"}  first visible button / link whose text or aria-label contains it
 *   {clickSel:"css"}   {tap:[x,y]}  {after:ms} pause after a click (default 350)
 *   {eval:"js"}        {log:"js"} prints the JSON value     {shot:"name"} saves outdir/name.png
 */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), out = process.argv[3] || '.';
fs.mkdirSync(out, { recursive: true });
const PORT = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'ss-')), '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0, view = [1280, 720], dpr = 1;
const pending = new Map(), errors = [];
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
}
async function center(js) {
  return evalJS(`(() => { const el = ${js}; if (!el) return null; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()`);
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
    if (d.method === 'Runtime.exceptionThrown') {
      const ex = d.params.exceptionDetails;
      errors.push('EXCEPTION ' + String((ex.exception && ex.exception.description) || ex.text).slice(0, 500));
    }
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning'))
      errors.push(d.params.type.toUpperCase() + ' ' + d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 500));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await metrics();
  for (const s of steps) {
    try {
      if (s.view || s.dpr) { if (s.view) view = s.view; if (s.dpr) dpr = s.dpr; await metrics(); }
      if (s.init) await send('Page.addScriptToEvaluateOnNewDocument', { source: s.init });
      if (s.nav) {
        const url = /^[a-z]+:/i.test(s.nav) ? s.nav : 'file://' + path.join(ROOT, s.nav.split('#')[0]) + (s.nav.includes('#') ? '#' + s.nav.split('#').slice(1).join('#') : '');
        await send('Page.navigate', { url }); await sleep(1500);
      }
      if (s.wait) await sleep(s.wait);
      if (s.click) {
        const c = await center(`[...document.querySelectorAll('button, [role=button], a')].filter(b => b.getClientRects().length && !b.closest('[hidden]')).find(b => (b.textContent + ' ' + (b.getAttribute('aria-label')||'')).replace(/\\s+/g,' ').includes(${JSON.stringify(s.click)}))`);
        if (!c) console.log('  ! no button with text', s.click); else { await tap(c[0], c[1]); await sleep(s.after || 350); }
      }
      if (s.clickSel) {
        const c = await center(`document.querySelector(${JSON.stringify(s.clickSel)})`);
        if (!c) console.log('  ! no element', s.clickSel); else { await tap(c[0], c[1]); await sleep(s.after || 350); }
      }
      if (s.tap) { await tap(s.tap[0], s.tap[1]); await sleep(s.after || 150); }
      if (s.eval) await evalJS(s.eval);
      if (s.log) console.log('  ' + JSON.stringify(await evalJS(s.log)));
      if (s.shot) {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(out, s.shot + '.png'), Buffer.from(r.data, 'base64'));
        console.log('shot', path.join(out, s.shot + '.png'));
      }
    } catch (e) { console.log('  ! step failed', JSON.stringify(s), e.message); }
  }
  console.log(errors.length ? 'CONSOLE:\n' + [...new Set(errors)].join('\n') : 'no console errors or warnings');
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
