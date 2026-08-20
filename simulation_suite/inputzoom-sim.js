// ═══════════════════════════════════════════════════════════════════════════
// inputzoom-sim — no focusable text field may compute under 16px on touch.
//
// WHY THIS EXISTS (20 Aug 2026)
// iOS Safari zooms the page in when a focused input computes under 16px, and
// does NOT zoom back out on blur. The zoom makes the layout viewport wider
// than the visual one, so the page reads as panned — content clipped on one
// side — and every `position: fixed` element, including the bottom nav, is
// laid out against the layout viewport and sits outside what you can see.
//
// dan reported these as two separate faults: "the bottom nav disappears on
// mobile" and "respond.html's conversion panel renders off the right edge".
// They were one cause. Confirmed on device: pinch-zoom out brings the nav
// straight back, which no layout, z-index or overflow theory explains.
//
// .field-input was 13px (50 fields), .search-input 13px, respond.html's
// inputs 15px — one pixel under the line.
//
// WHAT THIS CHECKS
// For every <input> (excluding checkbox/radio/hidden), <textarea> and
// <select> in both files, it resolves the font-size a TOUCH device would
// compute — inline style, then class rule, then inherited body size, then
// any !important override inside a touch media query — and fails if the
// result is under 16px.
//
// LIMIT, STATED PLAINLY: this reads CSS statically. A font-size assigned from
// JavaScript at runtime would pass this check. Nothing does that today.
//
// Usage: node inputzoom-sim.js [indexPath] [respondPath]
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');

const INDEX   = process.argv[2] || '/home/claude/app/index.html';
const RESPOND = process.argv[3] || '/home/claude/respond/respond.html';
const MIN = 16;

let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  \u2713', n); }
                          else { fail++; console.log('  \u2717', n, x || ''); } };

// ── read every <style> block ────────────────────────────────────────────────
function styles(src) {
  let out = '', i = 0;
  for (;;) {
    const a = src.indexOf('<style', i); if (a < 0) break;
    const b = src.indexOf('>', a), c = src.indexOf('</style>', b);
    if (b < 0 || c < 0) break;
    out += src.slice(b + 1, c) + '\n'; i = c + 8;
  }
  // Comments must go before any brace counting: a /* ... */ sitting in front
  // of a rule becomes part of its selector and the rule stops matching. That
  // silently hid the very media query this check exists to verify.
  return out.replace(/\/\*[\s\S]*?\*\//g, '');
}

// ── split CSS into top-level rules and media blocks, by brace counting ──────
function splitCss(css) {
  const top = [], media = [];
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf('{', i);
    if (brace < 0) break;
    const head = css.slice(i, brace).trim();
    let depth = 1, j = brace + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(brace + 1, j - 1);
    if (head.startsWith('@media')) media.push({ query: head, body: body });
    else if (head.startsWith('@')) { /* @keyframes etc — ignore */ }
    else top.push({ sel: head, body: body });
    i = j;
  }
  return { top: top, media: media };
}

function rulesOf(body) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(body))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}

function fontSizeIn(decl) {
  const m = /font-size:\s*([0-9.]+)px\s*(!important)?/i.exec(decl || '');
  return m ? { size: parseFloat(m[1]), important: !!m[2] } : null;
}

// ── a selector matcher covering exactly the constructs these files use:
//    tag, .class, #id, and :not([attr="v"]) / :not(#id) / :not(.class)
function matches(selector, el) {
  return selector.split(',').some(function (one) {
    one = one.trim();
    if (!one || /[ >+~]/.test(one.replace(/\([^)]*\)/g, ''))) return false; // no descendants used
    const nots = [];
    one = one.replace(/:not\(([^)]*)\)/g, function (_, inner) { nots.push(inner.trim()); return ''; });
    if (/:/.test(one)) return false;                       // :focus etc — not a font-size carrier here
    const tag = (one.match(/^[a-zA-Z][a-zA-Z0-9]*/) || [''])[0].toLowerCase();
    const cls = (one.match(/\.[A-Za-z0-9_-]+/g) || []).map(function (c) { return c.slice(1); });
    const id  = (one.match(/#[A-Za-z0-9_-]+/g) || []).map(function (c) { return c.slice(1); });
    if (tag && tag !== el.tag) return false;
    if (!cls.every(function (c) { return el.classes.indexOf(c) >= 0; })) return false;
    if (!id.every(function (c) { return el.id === c; })) return false;
    for (const n of nots) {
      if (n.startsWith('#') && el.id === n.slice(1)) return false;
      if (n.startsWith('.') && el.classes.indexOf(n.slice(1)) >= 0) return false;
      const at = /^\[([a-zA-Z-]+)\s*=\s*["']?([^"'\]]+)["']?\]$/.exec(n);
      if (at && (el.attrs[at[1]] || '') === at[2]) return false;
    }
    return true;
  });
}

// ── pull every focusable text field out of the markup ───────────────────────
function fields(src) {
  const out = [];
  const re = /<(input|textarea|select)\b([^>]*)>/gi; let m;
  while ((m = re.exec(src))) {
    const tag = m[1].toLowerCase(), raw = m[2];
    const attrs = {}; const are = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g; let a;
    while ((a = are.exec(raw))) attrs[a[1].toLowerCase()] = a[2];
    const type = (attrs.type || '').toLowerCase();
    if (['checkbox', 'radio', 'hidden', 'file', 'submit', 'button'].indexOf(type) >= 0) continue;
    out.push({
      tag: tag, attrs: attrs, id: attrs.id || '',
      classes: (attrs.class || '').split(/\s+/).filter(Boolean),
      inline: fontSizeIn(attrs.style || ''),
      line: src.slice(0, m.index).split('\n').length
    });
  }
  return out;
}

// ── the computed size a TOUCH device would see ──────────────────────────────
function touchSize(el, css, bodySize) {
  let size = bodySize, why = 'inherited from body';

  for (const r of css.top) {                       // class / tag rules, later wins
    const f = fontSizeIn(r.body);
    if (f && matches(r.sel, el)) { size = f.size; why = r.sel; }
  }
  if (el.inline) { size = el.inline.size; why = 'inline style'; }   // inline beats stylesheets

  for (const mq of css.media) {                    // touch-applicable media blocks
    if (!/pointer:\s*coarse|hover:\s*none|max-width/.test(mq.query)) continue;
    const w = /max-width:\s*([0-9.]+)px/.exec(mq.query);
    if (w && parseFloat(w[1]) < 430) continue;     // narrower than a phone: not our case
    for (const r of rulesOf(mq.body)) {
      const f = fontSizeIn(r.body);
      if (!f || !matches(r.sel, el)) continue;
      if (f.important || !el.inline) { size = f.size; why = mq.query + ' ' + r.sel; }
    }
  }
  return { size: size, why: why };
}

function audit(path, label) {
  if (!fs.existsSync(path)) { ck(label + ' exists', false, path); return []; }
  const src = fs.readFileSync(path, 'utf8');
  const css = splitCss(styles(src));
  const bodyRule = css.top.filter(function (r) { return /(^|,)\s*body\s*$/.test(r.sel); });
  const bodySize = bodyRule.length && fontSizeIn(bodyRule[bodyRule.length - 1].body)
    ? fontSizeIn(bodyRule[bodyRule.length - 1].body).size : 16;

  const bad = [];
  for (const el of fields(src)) {
    const t = touchSize(el, css, bodySize);
    if (t.size < MIN) bad.push({
      file: label, line: el.line, tag: el.tag,
      id: el.id, cls: el.classes.join('.'), size: t.size, why: t.why
    });
  }
  return bad;
}

console.log('\n\u2500\u2500 input zoom \u2500\u2500 no focusable field under ' + MIN + 'px on touch \u2500\u2500\n');
const bad = audit(INDEX, 'index.html').concat(audit(RESPOND, 'respond.html'));

for (const b of bad) {
  console.log('    ' + b.file + ':' + b.line + '  <' + b.tag + '>' +
              (b.id ? ' #' + b.id : '') + (b.cls ? ' .' + b.cls : '') +
              '  \u2192 ' + b.size + 'px   (' + b.why + ')');
}
if (bad.length) console.log('');

ck('no focusable text field computes under ' + MIN + 'px on touch',
   bad.length === 0, bad.length + ' field(s) would trigger iOS zoom');

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
