#!/usr/bin/env node
/* Bundle the game into ONE self-contained file (CSS, JS and fonts inlined, debug.js left out).
 *   node tools/build.js                 -> dist/squeeze-street.html, a page fragment without <html>/<head>/<body>
 *                                          wrappers so it can be published as a hosted page (browsers open it fine too)
 *   node tools/build.js --doc out.html  -> a complete standalone document (doctype and all) at out.html
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const docOut = process.argv[2] === '--doc' ? process.argv[3] : null;
if (process.argv[2] === '--doc' && !docOut) throw new Error('usage: node tools/build.js --doc out.html');

// fonts referenced from css/ as url(../fonts/x.woff2) become data: URLs
const css = (p) => read(p).replace(/url\(\.\.\/fonts\/([^)]+\.woff2)\)/g, (_, f) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(root, 'fonts', f)).toString('base64')})`);

let html = read('index.html');
html = html.replace(/<link rel="preload" href="fonts\/[^"]+"[^>]*>\n?/g, '');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) => `<style>\n${css(p)}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>\n?/g, (_, p) =>
  p === 'js/debug.js' ? '' : `<script>\n${read(p).replace(/<\/script/gi, '<\\/script')}\n</script>\n`);
if (/(src|href)="(js|css|fonts)\//.test(html)) throw new Error('a local file was left un-inlined');

if (!docOut) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?(html|head|body)\b[^>]*>\s*/gi, '')
    .replace(/<meta charset[^>]*>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
}
const out = docOut ? path.resolve(docOut) : path.join(root, 'dist', 'squeeze-street.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
