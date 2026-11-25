#!/usr/bin/env node
/* Squeeze Street — the three CrazyGames covers (landscape 1920x1080, portrait 800x1200, square 800x800).
 *   node tools/covers/make.js [workdir] [outdir]      defaults: $TMPDIR/ss-covers, dist/crazygames
 * 1. scene:   tools/play.js renders the game's own street per cover at 2x (index.html#debug=scene + Dex): DOM UI, sky
 *             and price tag hidden, the camera set per format, a cast placed by hand, time frozen -> work/scene-<fmt>.png
 * 2. compose: tools/play.js renders tools/covers/cover.html#fmt=<fmt> at 2x: brand sky, sunburst, clouds, the scene,
 *             lemon slices, drops, sparkles and brand/logo.svg -> work/raw-<fmt>.png
 * 3. finish:  covers.py downsamples with PIL LANCZOS to the exact size, writes atomically to outdir (a .jpg too if a
 *             PNG is over 2 MB) and saves work/contact.png (full size + grid-thumbnail size); a format with a `video` size
 *             also gets work/frame0-<fmt>-<WxH>.png, the preview video's opening frame (tools/covers/video.js).
 * Stages can be run alone: SS_STAGE=scene|compose|finish node tools/covers/make.js ...
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const WORK = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'ss-covers'));
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'dist', 'crazygames'));
const STAGE = process.env.SS_STAGE || 'all';
fs.mkdirSync(WORK, { recursive: true });

/* Per cover: size, camera (px per world unit, screen x of the stand's centre, screen y of the queue's feet),
   where Dex parks (world x), Dex's idle-cycle time t, and the cast (world x, lane 0 back .. 1 front). */
const FORMATS = {
  landscape: { size: [1920, 1080], pxu: 2.55, standX: 1245, feetY: 987, dealerX: 645, t: 12.5, cast: [
    { kind: 'jogger', seed: 4242, x: 372, lane: 0.55, state: 'order' },
    { kind: 'kid', x: 603, lane: 0.8, dir: -1, state: 'leave', drink: true, bubble: 'love' }
  ] },
  portrait: { size: [800, 1200], video: [1080, 1620], pxu: 1.75, standX: 312, feetY: 1140, dealerX: 655, t: 12.5, cast: [
    { kind: 'jogger', seed: 4242, x: 372, lane: 0.55, state: 'order' },
    { kind: 'kid', x: 603, lane: 0.8, dir: -1, state: 'leave', drink: true, bubble: 'love' }
  ] },
  square: { size: [800, 800], pxu: 1.2, standX: 330, feetY: 838, dealerX: 680, t: 12.5, cast: [
    { kind: 'jogger', seed: 4242, x: 372, lane: 0.55, state: 'order' },
    { kind: 'kid', x: 330, lane: 0.55, state: 'queue' },
    { kind: 'kid', x: 612, lane: 0.62, dir: -1, state: 'leave', drink: true, bubble: 'love' }
  ] }
};
const ONLY = (process.env.SS_ONLY || 'landscape,portrait,square').split(',');

/* Runs before the game's scripts: hide every DOM layer (and tell the camera nothing covers the scene), clear the page
   background so the sky stays transparent, draw no canvas text at all (covers may carry no text but the title: this also
   blanks the LEMONADE and DEX'S DEALS signs and the hopscotch numbers baked into the backdrop at boot), and drop the
   stand's price tag (the one arc of radius 22 at (64,-38)).
   shortcut: the tag is matched by its exact arc in actors.js drawStand; re-check the covers if the stand art changes. */
const INIT = `try{localStorage.clear()}catch(e){}
(function(){var P=CanvasRenderingContext2D.prototype,arc=P.arc;P.arc=function(x,y,r){if(window.__noTag&&r===22&&x===64&&y===-38)return;return arc.apply(this,arguments);};
['fillText','strokeText'].forEach(function(k){P[k]=function(){};});})();
document.addEventListener('DOMContentLoaded',function(){var s=document.createElement('style');s.textContent='#ui{display:none!important}html,body,#game{background:transparent!important}';document.head.appendChild(s);
['hud','sheet','daybar'].forEach(function(id){var el=document.getElementById(id);if(el)Object.defineProperty(el,'hidden',{get:function(){return true},set:function(){}});});});`;

/* After Dex has rolled in: a deluxe cart, no tips, no LIMITED starburst (its offer marked sold), no sky, frozen time; __frame(cfg) places the cast and the camera
   (with dt frozen at 0 the camera never eases back to the game's own framing). */
const SETUP = `(function(){var st=SS.state;Object.assign(st.upgrades,{stand:3,awning:2,sign:1,helper:1,cooler:0,speaker:0,tipjar:1});
st.today.tips=[];st.dealer.offers.forEach(function(o){if(o.kind==='limited')o.sold=true;});window.__noTag=true;
SS.Sky.draw=function(){};SS.Sky.drawWeather=function(){};SS.debugEnv.dt=0;
window.__frame=function(f){var W=SS.W,v=SS.view,td=SS.state.today,id=100;SS.debugEnv.t=f.t;W.DEALER_X=f.dealerX;
td.customers=f.cast.map(function(o){var st=o.state||'walk',c={id:++id,kind:o.kind,seed:o.seed||id*7919,x:o.x,lane:o.lane,dir:o.dir||1,
speed:st==='queue'||st==='order'?0:(o.speed||55),state:st,stateT:3,hasDrink:!!o.drink,mood:0.9,patience:1,qty:1,regularId:null,streak:0,mult:1,
bubble:o.bubble?{type:o.bubble,ttl:2,max:2.5}:null};return c;});
td.queue=td.customers.filter(function(c){return c.state==='queue'||c.state==='order';}).sort(function(a,b){return b.x-a.x;}).map(function(c){return c.id;});
td.serving={id:td.queue[0],p:0.55};
v.scale=f.pxu;v.camX=W.STAND_X;v.cx=f.standX;v.groundY=f.feetY-(8+W.QUEUE_LANE*(W.SIDEWALK_H-8))*f.pxu;return 1;};return 1;})()`;

function play(steps, name) {
  const file = path.join(WORK, name + '.json');
  fs.writeFileSync(file, JSON.stringify(steps));
  const out = execFileSync('node', [path.join(ROOT, 'tools', 'play.js'), file, WORK], { encoding: 'utf8', timeout: 300000 });
  process.stdout.write(out);
  if (/EXCEPTION|ERROR|step failed|! no /.test(out)) throw new Error(name + ': the page reported errors');
}

if (STAGE === 'all' || STAGE === 'scene') {
  const steps = [{ view: [1920, 1080], dpr: 2 }, { init: INIT }, { transparent: true },
    { nav: 'index.html#debug=scene,dayT:0.42,weather:sunny' }, { wait: 4500 }, { eval: SETUP }];
  for (const k of ONLY) {
    const f = FORMATS[k];
    steps.push({ view: f.size }, { wait: 400 }, { eval: `__frame(${JSON.stringify(f)})` }, { wait: 500 },
      { log: `SS.Actors.dealerReady() ? [${JSON.stringify(k)}, SS.view.scale, SS.view.w, SS.view.dpr] : 'ERROR Dex is not set up'` }, { shot: 'scene-' + k });
  }
  play(steps, 'scene-steps');
}
if (STAGE === 'all' || STAGE === 'compose') {
  const steps = [{ dpr: 2 }, { transparent: false }];
  for (const k of ONLY) {
    const scene = 'file://' + path.join(WORK, 'scene-' + k + '.png');
    steps.push({ nav: 'about:blank' }, { view: FORMATS[k].size }, { nav: `tools/covers/cover.html#fmt=${k}&scene=${encodeURIComponent(scene)}` }, { wait: 800 },
      { log: 'window.coverReady === "ok" ? "ok" : "ERROR cover: " + window.coverReady' }, { shot: 'raw-' + k });
  }
  play(steps, 'compose-steps');
}
if (STAGE === 'all' || STAGE === 'finish') {
  const out = execFileSync('python3', [path.join(__dirname, 'covers.py'), WORK, OUT, ...ONLY.map((k) => k + '=' + FORMATS[k].size.join('x') + (FORMATS[k].video ? '+' + FORMATS[k].video.join('x') : ''))], { encoding: 'utf8' });
  process.stdout.write(out);
}
