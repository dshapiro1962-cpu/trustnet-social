// Copies THE THEME from web/index.html into every other page that carries it.
//
// The theme is the one block where every colour and font of the product is
// written (THEME:START ... THEME:END, at the top of index.html's <style>). The
// other pages are single files too and cannot share a stylesheet, so each holds
// a copy. Change the colours in index.html, then run:
//
//   node tools/sync-theme.js
//
// theme-sim.js fails if any copy differs from index.html's.

const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const PAGES = ['respond', 'connect', 'collection', 'confirm', 'privacy', 'terms', 'support'];
const START = '/* THEME:START';
const END = '/* THEME:END */';

const grab = (text) => {
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < a) return null;
  return { a, b: b + END.length };
};

const src = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const at = grab(src);
if (!at) { console.error('index.html has no THEME:START ... THEME:END block'); process.exit(1); }
const block = src.slice(at.a, at.b).replace(/\r\n/g, '\n');

// The phone's own bar above the page cannot read a var(), so its colour is
// written into each page's theme-color tags: the --band of day and of night.
const dark = block.indexOf('@media (prefers-color-scheme: dark)');
const band = (part) => (part.match(/--band:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
const bandDay = band(block.slice(0, dark)), bandNight = band(block.slice(dark));
if (!bandDay || !bandNight) { console.error('the theme has no --band for day and night'); process.exit(1); }
const metas = (text) => text
  .replace(/(<meta name="theme-color" media="\(prefers-color-scheme: light\)" content=")[^"]*(")/, '$1' + bandDay + '$2')
  .replace(/(<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content=")[^"]*(")/, '$1' + bandNight + '$2');

let changed = 0;
const own = metas(src);
if (own !== src) { fs.writeFileSync(path.join(WEB, 'index.html'), own); changed++; console.log('updated  index.html (its bar colour)'); }
for (const name of PAGES) {
  const file = path.join(WEB, name + '.html');
  const text = fs.readFileSync(file, 'utf8');
  const crlf = text.indexOf('\r\n') > -1;
  const t = grab(text);
  if (!t) { console.error(name + '.html has no theme block - not touched'); process.exitCode = 1; continue; }
  const next = metas(text.slice(0, t.a) + (crlf ? block.replace(/\n/g, '\r\n') : block) + text.slice(t.b));
  if (next !== text) { fs.writeFileSync(file, next); changed++; console.log('updated  ' + name + '.html'); }
  else console.log('same     ' + name + '.html');
}

// The home-screen app's own colours, which a manifest writes as plain values.
const ground = (block.slice(0, dark).match(/--ground:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
const mf = path.join(WEB, 'manifest.webmanifest');
const man = fs.readFileSync(mf, 'utf8');
const nextMan = man.replace(/("theme_color":\s*")[^"]*(")/, '$1' + bandDay + '$2').replace(/("background_color":\s*")[^"]*(")/, '$1' + ground + '$2');
if (nextMan !== man) { fs.writeFileSync(mf, nextMan); changed++; console.log('updated  manifest.webmanifest'); }
console.log('The app icons are pictures: if --band changed, run  node tools/make-icons.js');
console.log(changed + ' page(s) updated.');
