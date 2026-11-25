#!/usr/bin/env node
/* Squeeze Street — the two CrazyGames preview videos: landscape 1920x1080 and portrait 1080x1620, 30 fps, silent H.264.
 *   node tools/covers/video.js [workdir] [outdir]      defaults: $TMPDIR/ss-covers (make.js's workdir), dist/crazygames
 * Run tools/covers/make.js first: its cover is frame 0 and the end card (portrait: work/frame0-portrait-1080x1620.png).
 * 1. record: tools/record.js plays Day 5 of a set-up save at 1x game time (no speed-up). Take A: the midday rush, with a
 *            tip tapped; take B: the late-afternoon rush, before closing -> work/rec-<fmt>/A, B
 * 2. cut:    cover 0.4 s | last 9.5 s of A | first 5.5 s of B | cover 1.6 s, hard cuts only (17 s; the video loops on the
 *            cover) -> work/cut-<fmt>/, frames linked, not re-encoded
 * 3. encode: tools/encode.swift, built into work/encode on first use -> outdir/video-<fmt>-<WxH>.mp4
 * Stages can be run alone: SS_STAGE=record|cut|encode, SS_ONLY=landscape|portrait.
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const WORK = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'ss-covers'));
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'dist', 'crazygames'));
const STAGE = process.env.SS_STAGE || 'all';
const ONLY = (process.env.SS_ONLY || 'landscape,portrait').split(',');
const FPS = 30, HEAD = 12, A = 285, B = 165, TAIL = 48;  // frames

/* Portrait is recorded 390 CSS px wide: at 360 the HUD's cash and stats overflow their panels. */
const FORMATS = {
  landscape: { size: [1920, 1080], view: { view: [1280, 720], dpr: 1.5 }, cover: () => path.join(OUT, 'cover-landscape-1920x1080.png') },
  portrait: { size: [1080, 1620], view: { view: [390, 585], dpr: 1080 / 390, hidpi: true }, cover: () => path.join(WORK, 'frame0-portrait-1080x1620.png') }
};

/* A save on its fifth day: tutorial done, sound off, milestones already met (no pop-ups), upgrades bought, Dex in town. */
const INIT = `try{localStorage.clear()}catch(e){}
document.addEventListener('DOMContentLoaded',function(){var r=SS.Debug.run;SS.Debug.run=function(){r.apply(this,arguments);var s=SS.state;s.tutorial={done:true,dex:true};s.settings.sfx=false;s.settings.music=false;
s.milestonesDone=['first','cups25','profit20','rep3','tinker','regulars5','streak10'];s.lifetimeEarnings=690;s.lifetimeCups=560;s.stats={days:8,bestProfit:58,bestCups:52,tips:14,served:560};};});`;
const NAV = 'index.html#debug=new,day:5,cash:186.4,rep:3.6,regs:5,dealer,up:stand=3,up:awning=2,up:sign=1,up:helper=1,up:pitcher=1,up:juicer=1,up:cooler=1,stock';
const TIP = "(function(){var t=SS.state.today.tips[0],v=SS.view,r=document.getElementById('scene').getBoundingClientRect();if(!t)return null;return [r.left+v.toX(t.x),r.top+v.laneY(t.lane)-12*v.laneScale(t.lane)];})()";
const ms = (frames) => frames * 1000 / FPS;

function frames(dir) { return fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f)).sort().map((f) => path.join(dir, f)); }

for (const k of ONLY) {
  const f = FORMATS[k], rec = path.join(WORK, 'rec-' + k), cut = path.join(WORK, 'cut-' + k);
  if (STAGE === 'all' || STAGE === 'record') {
    fs.rmSync(rec, { recursive: true, force: true });
    const steps = [f.view, { init: INIT }, { nav: NAV }, { adv: 3000 }, { click: 'Open for business' }, { adv: 24000 },
      { rec: 5000, dir: 'A' }, { until: 'SS.state.today.tips.length>0', max: 6000, dir: 'A' }, { rec: 1200, dir: 'A' }, { tapAt: TIP }, { rec: 3500, dir: 'A' },
      { until: 'SS.state.today.t>=0.9', max: 90000 }, { rec: ms(B), dir: 'B' },
      { log: "SS.state.phase==='day' ? ['ok', SS.state.today.t, SS.state.today.sold] : 'ERROR the day closed during take B'" }];
    const file = path.join(WORK, 'rec-' + k + '.json');
    fs.writeFileSync(file, JSON.stringify(steps));
    const out = execFileSync('node', [path.join(ROOT, 'tools', 'record.js'), file, rec], { encoding: 'utf8', timeout: 900000 });
    process.stdout.write(out);
    if (/EXCEPTION|ERROR|step failed|! no |nothing to tap/.test(out)) throw new Error(k + ': the recording reported errors');
  }
  if (STAGE === 'all' || STAGE === 'cut') {
    const cover = f.cover(), a = frames(path.join(rec, 'A')), b = frames(path.join(rec, 'B'));
    if (!fs.existsSync(cover)) throw new Error('no ' + cover + ': run tools/covers/make.js ' + WORK + ' first');
    if (a.length < A || b.length < B) throw new Error(k + ': takes are too short: ' + a.length + ' / ' + b.length);
    const list = [...Array(HEAD).fill(cover), ...a.slice(-A), ...b.slice(0, B), ...Array(TAIL).fill(cover)];
    fs.rmSync(cut, { recursive: true, force: true }); fs.mkdirSync(cut);
    list.forEach((src, i) => fs.symlinkSync(src, path.join(cut, String(i).padStart(5, '0') + path.extname(src))));
    console.log(k, 'cut:', list.length, 'frames =', (list.length / FPS).toFixed(2), 's');
  }
  if (STAGE === 'all' || STAGE === 'encode') {
    const bin = path.join(WORK, 'encode'), src = path.join(ROOT, 'tools', 'encode.swift');
    if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs) {
      // the Command Line Tools ship a broken Swift module map: an overlay swaps it for an empty file
      const empty = path.join(WORK, 'empty.modulemap'), overlay = path.join(WORK, 'overlay.yaml');
      fs.writeFileSync(empty, '');
      fs.writeFileSync(overlay, JSON.stringify({ version: 0, 'case-sensitive': 'false', roots: [{ name: '/Library/Developer/CommandLineTools/usr/include/swift', type: 'directory',
        contents: [{ name: 'module.modulemap', type: 'file', 'external-contents': empty }] }] }));
      execFileSync('swiftc', ['-O', '-vfsoverlay', overlay, '-Xcc', '-ivfsoverlay', '-Xcc', overlay, src, '-o', bin], { stdio: 'inherit' });
    }
    const mp4 = path.join(OUT, 'video-' + k + '-' + f.size.join('x') + '.mp4'), tmp = path.join(OUT, '.video-' + k + '.tmp.mp4');
    process.stdout.write(execFileSync(bin, [cut, tmp, String(FPS)], { encoding: 'utf8' }));
    fs.renameSync(tmp, mp4);
    console.log('->', mp4);
  }
}
