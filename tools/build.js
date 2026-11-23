#!/usr/bin/env node
/* Bundle the game into ONE self-contained file: dist/squeeze-street.html
 * (CSS and JS inlined, debug.js left out). It is written as a page fragment without
 * <html>/<head>/<body> wrappers so it can be published as a hosted page; browsers open it fine too.
 *   node tools/build.js
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) => `<style>\n${read(p)}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>\n?/g, (_, p) =>
  p === 'js/debug.js' ? '' : `<script>\n${read(p).replace(/<\/script/gi, '<\\/script')}\n</script>\n`);
html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?(html|head|body)\b[^>]*>\s*/gi, '')
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'squeeze-street.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
