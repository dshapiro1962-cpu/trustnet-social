// Redraws the app's icons in the colour on top of THE THEME.
//
// The home-screen icon, the browser-tab icon and the picture on the legal
// pages are image files, so they cannot read the theme the way the pages do.
// After changing the theme's --band, run:
//
//   node tools/sync-theme.js
//   node tools/make-icons.js
//
// It draws the same mark as before - a white T on a square of colour - with
// Chrome (e2e/node_modules/playwright), and writes web/icons/*.png and
// web/favicon.ico. A home-screen icon someone already added keeps its old
// colour until they add it again: the phone copied the picture.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const WEB = path.join(REPO, 'web');
const { chromium } = require(path.join(REPO, 'e2e', 'node_modules', 'playwright'));

const src = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const a = src.indexOf('/* THEME:START'), b = src.indexOf('/* THEME:END */');
if (a < 0 || b < a) { console.error('index.html has no THEME block'); process.exit(1); }
const day = src.slice(a, b).split('@media (prefers-color-scheme: dark)')[0];
const band = (day.match(/--band:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
const onBand = (day.match(/--on-band:\s*(#[0-9A-Fa-f]{6})/) || [])[1] || '#FFFFFF';
if (!band) { console.error('the theme has no --band'); process.exit(1); }

// The T, in proportions measured off the icon it replaces.
const page = (size) => '<html><body style="margin:0"><div style="position:relative;width:' + size + 'px;height:' + size + 'px;background:' + band + '">'
  + '<div style="position:absolute;left:30.5%;top:26%;width:39%;height:10.5%;background:' + onBand + '"></div>'
  + '<div style="position:absolute;left:44.5%;top:26%;width:11%;height:45%;background:' + onBand + '"></div>'
  + '</div></body></html>';

// An .ico may hold PNGs as they are: a header, a directory entry each, the files.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((p, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(p.size >= 256 ? 0 : p.size, e); head.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(p.data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += p.data.length;
  });
  return Buffer.concat([head].concat(pngs.map((p) => p.data)));
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const draw = async (size) => {
    const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.setContent(page(size));
    const png = await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
    await ctx.close();
    return png;
  };
  const out = { 'icons/icon-512.png': 512, 'icons/icon-192.png': 192, 'icons/apple-touch-icon.png': 180, 'icons/favicon-32.png': 32 };
  for (const [file, size] of Object.entries(out)) {
    fs.writeFileSync(path.join(WEB, file), await draw(size));
    console.log('drew     web/' + file + '  ' + size + 'px');
  }
  fs.writeFileSync(path.join(WEB, 'favicon.ico'), ico([{ size: 16, data: await draw(16) }, { size: 32, data: await draw(32) }]));
  console.log('drew     web/favicon.ico  16+32px');
  await browser.close();
  console.log('icons are ' + band + ' with a ' + onBand + ' T.');
})().catch((e) => { console.error(e); process.exit(1); });
