#!/usr/bin/env node
/* Build the CrazyGames upload: dist/crazygames/squeeze-street.zip with index.html at the zip root, plus css/, js/
 * (without debug.js), fonts/ (woff2 + OFL licenses) and the favicons. Nothing else goes in.
 *   node tools/package-crazygames.js
 * Self-checks: the zipped index.html loads no debug.js and no absolute or http(s) URL, and every file it or the CSS
 * points at is in the zip.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist', 'crazygames'), zipPath = path.join(outDir, 'squeeze-street.zip');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-cg-'));
const fail = (msg) => { console.error('package-crazygames: ' + msg); process.exit(1); };

const files = [
  ...['css', 'js'].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => /\.(css|js)$/.test(f)).map((f) => d + '/' + f)),
  ...fs.readdirSync(path.join(root, 'fonts')).filter((f) => /\.woff2$|^OFL-.*\.txt$/.test(f)).map((f) => 'fonts/' + f),
  'favicon.svg', 'favicon-32.png'
].filter((f) => f !== 'js/debug.js');
for (const f of files) {
  fs.mkdirSync(path.join(stage, path.dirname(f)), { recursive: true });
  fs.copyFileSync(path.join(root, f), path.join(stage, f));
}
fs.writeFileSync(path.join(stage, 'index.html'),
  fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src="js\/debug\.js"><\/script>\n?/, ''));

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(zipPath, { force: true });                          // zip would otherwise add to an old archive
execFileSync('/usr/bin/zip', ['-X', '-r', '-q', zipPath, '.'], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });

// check what actually went into the zip
const list = execFileSync('/usr/bin/unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter((f) => f && !f.endsWith('/'));
const unz = (f) => execFileSync('/usr/bin/unzip', ['-p', zipPath, f], { encoding: 'utf8', maxBuffer: 1 << 26 });
const html = unz('index.html');
if (/debug\.js/.test(html)) fail('index.html still references debug.js');
if (/(src|href)="(\/|[a-z]+:)|https?:\/\//i.test(html)) fail('index.html has an absolute or http(s) URL');
if (list.some((f) => /debug\.js|\.DS_Store|^(tools|test|brand|dist|\.git)\//.test(f))) fail('unwanted file in zip');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
for (const css of list.filter((f) => f.endsWith('.css')))
  for (const m of unz(css).matchAll(/url\((?!#|data:)['"]?([^)'"]+)/g)) refs.push(path.posix.join(path.posix.dirname(css), m[1]));
const missing = refs.filter((r) => !list.includes(r));
if (missing.length) fail('referenced but not in zip: ' + missing.join(', '));

const sizes = execFileSync('/usr/bin/unzip', ['-l', zipPath], { encoding: 'utf8' });
console.log(sizes.trimEnd());
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`\n${list.length} files, ${kb(fs.statSync(zipPath).size)} zipped -> ${zipPath}\nself-check ok: index.html at the root, no debug.js, relative paths only, every reference present`);
