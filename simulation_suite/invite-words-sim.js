// invite-words-sim.js — what an invitation actually says when it arrives.
//
// dan, 21 Sep, looking at one on his phone: "the invite works but as you can
// see the wording is not right and thus confusing ... also the 'trustnets'
// underneath the trustnet has no purpose."
//
// Three faults in one screenshot:
//
//   1. "Dany added you to their leros circle" — third person about the person
//      SENDING it. It arrives in your chat with Dany, from Dany.
//   2. "no app needed" — in a message inviting you to join. It answered a
//      question nobody had asked and contradicted the invitation beside it.
//   3. nothing about what Trustnet is, which is the one thing a stranger
//      needs. dan supplied the description; it is compressed to a sentence
//      and a half at his instruction, and must not mention Google.
//
// And the preview card: the page carried no Open Graph tags at all, so
// WhatsApp built the card from <title> and the URL — the truncated domain was
// everything it had.
//
// WHAT THIS RUNS: the REAL inviteMessageFor and inviteSubjectFor, lifted out
// of the page and executed, and the REAL <head> read for the tags a preview is
// built from. It also asserts that BOTH doors call the one function: the two
// strings that drifted apart are the reason this file exists.
//
//   node invite-words-sim.js         -> must PASS
//   node invite-words-sim.js --old   -> index.pre-v0.96.1.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const PAGE = useOld
  ? path.join(__dirname, 'index.pre-v0.96.1.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(PAGE)) { console.error('missing fixture: ' + PAGE); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 200) : '')); }
};

// core.autocrlf is true here: a checkout turns LF into CRLF and every slice
// below would quietly find nothing.
const html = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).reduce((a, b) => (b.length > a.length ? b : a), '');

console.log('\n   fixture: ' + path.basename(PAGE) + (useOld ? '   (must FAIL)' : '') + '\n');

// ── the real functions, executed ───────────────────────────────────────────
console.log('== what the invitation says ==\n');
const ctx = { AppState: { userProfile: { name: 'Dany Shapiro' } } };
vm.createContext(ctx);
const lift = (name) => {
  const at = script.indexOf('function ' + name + '(');
  if (at < 0) return false;
  const end = script.indexOf('\n}\n', at) + 2;
  // The description lives in a const above the function; take it with the
  // function that uses it, and ONLY with that one — a second `const` of the
  // same name in one context is a SyntaxError, which would look exactly like
  // a missing function.
  const body = script.slice(at, script.indexOf('\n}\n', at));
  const cAt = script.indexOf('const TN_WHAT_IT_IS');
  const pre = (cAt > -1 && cAt < at && body.indexOf('TN_WHAT_IT_IS') > -1)
    ? script.slice(cAt, script.indexOf(';', cAt) + 1) : '';
  try { vm.runInContext(pre + '\n' + script.slice(at, end) + '\nthis.' + name + ' = ' + name + ';', ctx); }
  catch (e) { return false; }
  return typeof ctx[name] === 'function';
};

const URL = 'https://trustnetsocial.netlify.app/?join=abc123';
ck('the invitation is built by one function', lift('inviteMessageFor'));
ck('and the email subject by another', lift('inviteSubjectFor'));

if (typeof ctx.inviteMessageFor === 'function') {
  const personal = ctx.inviteMessageFor('leros', URL, true);
  const shared = ctx.inviteMessageFor('leros', URL, false);
  console.log('\n  ── as Naama receives it ──\n');
  personal.split('\n').forEach((l) => console.log('     ' + l));
  console.log('');

  // 1 · the opener dan chose, verbatim
  ck('it opens in YOUR voice, to them',
     /^Hi — you are a member of my leros circle on Trustnet, as someone whose recommendation I trust\./.test(personal),
     personal.split('\n')[0]);
  ck('...and never talks about you in the third person',
     !/\bDany added you\b|\bthey keep\b|added you to their/.test(personal), personal);

  // 2 · what it is, in dan's words, compressed
  // THE TWO VERBS, which are also the app's own two words (Ask / Recommend on
  // Home). Three drafts were rejected before this: one described what the app
  // IS, one led with privacy, and one let the nouns attach to the wrong thing.
  ck('it names what you DO here: ask', /where you ask people you trust/.test(personal), personal);
  ck('...and recommend back', /and recommend back/.test(personal), personal);
  ck('...with what you would actually ask for', /a doctor, a restaurant, a plumber/.test(personal));
  ck('...as against public reviews and algorithmic feeds',
     /No public reviews, no algorithmic feeds/.test(personal), personal);

  // dan, on a draft that read "ask people you trust — a doctor, a restaurant,
  // a plumber": "could be misunderstood as if you trust the doctor". The list
  // has to hang off the ASKING. "ask ... for a doctor" can only mean the thing
  // you want; a list sitting beside "people you trust" cannot.
  ck('the doctor is what you ask FOR, never who you trust',
     /trust for a doctor/.test(personal), personal);
  ck('...so the nouns never sit beside "people you trust"',
     !/people you trust\s*[—-]\s*a doctor/.test(personal), personal);
  ck('...in a sentence and a half, not a paragraph',
     (personal.split('\n\n')[1] || '').split(/(?<=\.)\s/).length <= 2,
     (personal.split('\n\n')[1] || '').slice(0, 120));
  ck('...and Google is not mentioned (dan: no mention of Google)', !/Google/i.test(personal));

  // 3 · the contradiction is gone
  ck('it no longer says "no app needed" while inviting them to join',
     !/no app needed/i.test(personal), personal);

  // 4 · the link, and what pressing it costs
  ck('the link is the last thing, on its own line',
     personal.trim().endsWith(URL), personal.trim().slice(-60));
  ck('it says what happens when they tap', /one button, no password/.test(personal));

  // 5 · the shared link cannot claim they are already in the circle
  ck('the shareable link says something that is TRUE of a stranger',
     !/you are a member/.test(shared) && /would like you in my leros circle/.test(shared),
     shared.split('\n')[0]);
  ck('...and still says what you do here', /ask people you trust for a doctor/.test(shared), shared);

  // 6 · it survives the trip through WhatsApp
  ck('every line break survives encodeURIComponent for wa.me',
     decodeURIComponent(encodeURIComponent(personal)) === personal);
  ck('[guard] it is short enough to read on a phone', personal.length < 480, String(personal.length));
  const circles = ['NYc Restaurants', 'יוון', "Dad's mates"];
  circles.forEach((c) => ck('a circle called "' + c + '" reads correctly',
    ctx.inviteMessageFor(c, URL, true).indexOf('my ' + c + ' circle') > -1));
}

if (typeof ctx.inviteSubjectFor === 'function') {
  ck('the email subject is a sentence, not the first clause of the body',
     ctx.inviteSubjectFor('leros') === 'Dany would like you in their leros circle on Trustnet',
     ctx.inviteSubjectFor('leros'));
}

// ── one function, every door ───────────────────────────────────────────────
console.log('\n== both doors, one wording ==\n');
const callers = script.match(/inviteMessageFor\(/g) || [];
ck('the Invite button and the shareable link both call it', callers.length >= 4, String(callers.length));
ck('...so no door keeps a wording of its own',
   !/Join my ' \+ d\.circleName \+ ' circle on Trustnet/.test(script)
   && !/added you to their ' \+ circleName/.test(script));
ck('the personal invite says they are already in the circle',
   (script.match(/inviteMessageFor\(circleName, url, true\)/g) || []).length === 2);
ck('the shareable link says they are not', /inviteMessageFor\(d\.circleName, d\.url, false\)/.test(script));

// ── the preview card ───────────────────────────────────────────────────────
console.log('\n== the card WhatsApp draws ==\n');
const head = html.slice(0, html.indexOf('</head>'));
const meta = (prop) => {
  const m = head.match(new RegExp('<meta[^>]*(?:property|name)="' + prop + '"[^>]*content="([^"]*)"'));
  return m ? m[1] : '';
};
ck('the page says what it is, so the card is not just a URL',
   /people you trust/.test(meta('og:description')), meta('og:description'));
ck('...and the card says the same thing the message says',
   /No public reviews, no algorithmic feeds/.test(meta('og:description'))
   && !/people you trust\s*[—-]\s*a doctor/.test(meta('og:description')), meta('og:description'));
ck('...a title', meta('og:title') === 'Trustnet', meta('og:title'));
ck('...a picture', /icon-512\.png$/.test(meta('og:image')), meta('og:image'));
ck('...and an address', /^https:\/\/trustnetsocial/.test(meta('og:url')), meta('og:url'));
ck('search engines and other apps get the same sentence',
   meta('description') === meta('og:description'));
ck('[guard] the description fits a preview card', meta('og:description').length < 200,
   String(meta('og:description').length));

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
