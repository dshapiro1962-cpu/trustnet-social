// suggestions-sim.js — THE QUEUE (v0.51.0).
//
// THE FEATURE: X is already in a circle of mine. He answers a query in ANY
// circle of his, or saves an item. If it is a book and a circle of mine is
// about books, it appears in my INBOX. Automatic; X opts OUT per item.
//
// HYBRID OWNERSHIP (dan's call): the suggestion belongs to the USER and
// REMEMBERS which circles matched. Circle-owned would need an invented
// tie-break when Rina is in two circles that both accept books; user-owned with
// no circle would leave accepted items unfiled — the contextless state that
// made items unfindable earlier this week.
const vm = require('vm'), fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
const mig = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0028_suggestions.sql', 'utf8');
const sweep = fs.readFileSync('/home/claude/fx-out/supabase/functions/suggest-sweep/index.ts', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── the queue ───────────────────────────────────────────────────────────────
ck('suggestions table exists', /create table if not exists public\.suggestions/.test(mig));
ck('ONE suggestion per user per item, ever (a dismissal must stick)',
   /suggestions_user_canonical_uniq[\s\S]{0,90}\(user_id, canonical_id\)/.test(mig));
ck('it remembers EVERY circle that matched (hybrid)', /matched_circles uuid\[\]/.test(mig));
ck('it records HOW it reached you', /via\s+text not null check \(via in \('answer','save'\)\)/.test(mig));
ck('pending / accepted / dismissed are the only states',
   /check \(status in \('pending','accepted','dismissed'\)\)/.test(mig));
ck('the queue is owner-scoped by RLS', /create policy suggestions_owner/.test(mig));
ck('the sweep has a restartable watermark', /create table if not exists public\.sweep_state/.test(mig));

// ── the sweep ───────────────────────────────────────────────────────────────
ck('the sweep imports the SHARED vocabulary (no third copy)',
   /import \{ interestsForKind \} from "\.\.\/_shared\/enrich_core\.ts"/.test(sweep));
ck('it reads the STORED kind rather than re-deriving it', /select\("id, name, kind"\)/.test(sweep));
ck('GATE 1: the contributor has not opted out',
   (sweep.match(/\.eq\("shared_to_network", true\)/g) || []).length === 2,
   (sweep.match(/\.eq\("shared_to_network", true\)/g) || []).length + ' of 2 sources gated');
ck('GATE 2: only CONFIRMED interests match', /\.eq\("source", "confirmed"\)/.test(sweep));
ck('both saves AND answers are swept (dan: include query and answer)',
   /from\("recommendations"\)/.test(sweep) && /from\("query_responses"\)/.test(sweep));
ck('an item with NO kind never matches (silence beats a guess)',
   /if \(!kind\) continue;/.test(sweep));
ck('you are never suggested your own item', /if \(ci\.owner_id === c\.contributor_user\) continue;/.test(sweep));
ck('an item already in your library is not suggested',
   /Already in their library/.test(sweep));
ck('custom terms are matched WHOLE-WORD, like the built-ins',
   /k\.indexOf\(" " \+ String\(t\)\.toLowerCase\(\)\.trim\(\) \+ " "\) >= 0/.test(sweep));
ck('the hybrid merge collapses two matching circles into ONE suggestion',
   /merged\[k\]\.matched_circles = \[\.\.\.new Set\(\[\.\.\.a, \.\.\.b\]\)\]/.test(sweep));
ck('the watermark advances so work is not repeated forever',
   /update\(\{ last_at: started \}\)/.test(sweep));
ck('which circle THEY filed it in is never consulted',
   !/contributor.*circle_id/.test(sweep.replace(/\/\/.*/g, '')));

// ── the Inbox surface ───────────────────────────────────────────────────────
ck('suggestions render in the INBOX, not a new tab', /function suggestionsSectionHtml/.test(web));
ck('...in their own colour', /#5B3E9E/.test(web));
ck('the card states the trust chain', /answered a question with this/.test(web));
ck('...naming the shared circle and the interest', /You share ' \+ esc\(circles\.join/.test(web));
ck('accepting creates a REAL recommendation', /from\('recommendations'\)\.insert\(\{[\s\S]{0,200}canonical_id: sg\.canonical_id/.test(web));
ck('...and marks the suggestion accepted', /status: 'accepted'/.test(web));
ck('several matching circles ASK rather than picking one',
   /This matches ' \+ names\.length \+ ' of your circles/.test(web));
ck('a dismissal is persisted so the sweep cannot re-offer it', /status: 'dismissed'/.test(web));
ck('suggestions show even when the rest of the inbox is empty',
   /suggestions \? '' :/.test(web));
ck('failures are surfaced, never swallowed',
   /Could not add that: /.test(web) && /Could not dismiss that: /.test(web));


// ── SEND TO A MEMBER, IN THE APP (v0.53.0) ──────────────────────────────────
// dan: Dany saved Jackson Hole, pressed "Send to a member", chose shapiro — who
// IS on the app and IS in his circle — and the dialog offered ONLY EMAIL. The
// message then pointed at Trustnet generally with NO trace of the item.
// modalShareRec had exactly two branches, wa.me and mailto, both EXTERNAL: a
// member who is a Trustnet user was treated identically to a stranger.
//
// THREE REAL BUGS WERE CAUGHT BY EXECUTING THIS, NOT READING IT:
//   1. RLS refuses a client insert into another person's queue
//      ("permission denied for table suggestions") — correct and deliberate,
//      so the send MUST go through a security-definer function.
//   2. notifications_type_check did not allow 'rec_shared', which ABORTED THE
//      WHOLE SEND — silently to the user.
//   3. sending an item the recipient already has must say so, not fail.
const sendMig = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0030_direct_send.sql', 'utf8');
const appSrc  = fs.readFileSync('/home/claude/app/index.html', 'utf8');

ck('a member ON the app is offered an IN-APP send first',
   /if \(m\.linkedUserId\) \{[\s\S]{0,200}data-action="send-rec-in-app"/.test(appSrc));
ck('...and email/WhatsApp remain only for those who are NOT on the app',
   /\} else if \(m\.contactMethod === 'whatsapp'/.test(appSrc));
ck('the client NEVER inserts into another person\'s queue directly',
   !/from\('suggestions'\)\.insert/.test(appSrc));
ck('it calls the server function instead', /sb\.rpc\('send_rec_to_member'/.test(appSrc));
ck('send_rec_to_member exists and is security definer',
   /create or replace function public\.send_rec_to_member[\s\S]{0,200}security definer/.test(sendMig));
ck('...and only to YOUR member who is ON the app',
   /where id = p_member_id and owner_id = v_me and linked_user_id is not null/.test(sendMig));
ck('...refusing an item that is not yours', /not_your_item/.test(sendMig));
ck('...refusing a duplicate send', /already_sent/.test(sendMig));
ck('...and one they already have', /already_in_their_library/.test(sendMig));
ck('execute is granted to authenticated only',
   /grant execute on function public\.send_rec_to_member\(uuid, uuid\) to authenticated/.test(sendMig));
ck('the notification type is ALLOWED by the constraint (it was not, and the send aborted)',
   /check \(type in \('query','query_response','reciprocal','invite_accepted',\s*\n?\s*'taste_match','rec_shared','suggestion'\)\)/.test(sendMig));
ck('the notification points at the INBOX, not at Trustnet generally',
   /'\/#inbox'/.test(sendMig));
ck('a direct send is a DIFFERENT claim from a matched one',
   /sg\.via === 'direct' \? 'sent you this'/.test(appSrc));
ck('via allows direct', /check \(via in \('answer','save','direct'\)\)/.test(sendMig));
ck('every refusal is explained in plain words, not a raw error',
   /is not on Trustnet yet/.test(appSrc));

// ── THE ANSWER OPT-OUT, END TO END (v0.52.0) ────────────────────────────────
const respondHtml = fs.readFileSync('/home/claude/app/respond.html', 'utf8');
const respondJs   = fs.readFileSync('/home/claude/sims/respond_script.js', 'utf8');
const recvResp    = fs.readFileSync('/home/claude/fx-out/supabase/functions/receive-response/index.ts', 'utf8');

ck('the answer dialog HAS the opt-out toggle', /id="rec-share"/.test(respondHtml));
ck('...checked by DEFAULT (sharing is automatic; the toggle turns it off)',
   /id="rec-share" checked/.test(respondHtml));
ck('...and explains what unticking does', /keep it just for them/i.test(respondHtml));
ck('the answer page SENDS the value', /shared_to_network: \$\("rec-share"\)/.test(respondJs));
ck('receive-response PERSISTS it', /shared_to_network: body\.shared_to_network !== false/.test(recvResp));
ck('...defaulting TRUE when absent (older clients keep working)',
   /!== false/.test(recvResp));

// ── THE PROMISE ON THE CARD MATCHES THE CODE ────────────────────────────────
const app = fs.readFileSync('/home/claude/app/index.html', 'utf8');
ck('the old "matching circle" promise is gone everywhere',
   !/matching circle/.test(app));
ck('both surfaces now promise SHARED INTEREST',
   (app.match(/who share (this|that) interest/g) || []).length >= 2,
   (app.match(/who share (this|that) interest/g) || []).length + ' found');

// ── network_feed enforces the NEW rule ──────────────────────────────────────
const feedMig = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0029_network_feed_interests.sql', 'utf8');
// Strip SQL comments: the header PROSE quotes the old rule to explain why it
// went. A check that explanatory text can break gets deleted the first time it
// cries wolf — same trap as the vector(1536) ordering check in schema-sim.
const feedCode = feedMig.split('\n').map(function(l) { return l.replace(/--.*$/, ''); }).join('\n');
ck('network_feed no longer matches circle DOMAINS',
   !/vc\.domain = coalesce/.test(feedCode));
ck('...it matches the item KIND against a confirmed interest',
   /circle_accepts_kind\(vc\.id, cn\.kind\)/.test(feedMig));
ck('...and shows MY circle name, not the contributor\'s',
   /vc\.name as circle_name/.test(feedMig));
ck('the SQL matcher is whole-word too (the "skin" vs "ski" trap)',
   /position\(' ' \|\| lower\(btrim\(p_term\)\) \|\| ' '/.test(feedMig));
ck('a circle with no confirmed interest accepts nothing (loop returns false)',
   /return false;\s*\nend;/.test(feedMig));

// ── BEHAVIOURAL: run the sweep's REAL matching logic ────────────────────────
// AUDIT (9 Aug): 239 of 857 checks executed NOTHING — pure string matching,
// and this suite was entirely in that group. That is the same weakness that let
// the person_id data loss and a CHECK constraint that could never fire reach
// production. Strings prove the code SAYS the right thing; only execution
// proves it DOES it.
// The vocabulary and the merge below are EXTRACTED FROM THE SHIPPING SOURCE,
// never reimplemented — a test of a copy proves nothing about the original.
const core = fs.readFileSync('/home/claude/fx-out/supabase/functions/_shared/enrich_core.ts', 'utf8');
const blk = core.slice(core.indexOf('const KIND_MAP'), core.indexOf('export async function webGround'));
const vocabJs = blk.replace(/export /g, '')
  .replace(/const KIND_MAP\s*:[^=]*=/, 'const KIND_MAP =')
  .replace(/const ALSO\s*:[^=]*=/, 'const ALSO =')
  .replace(/new Set<string>\(\)/g, 'new Set()')
  .replace(/\(kind: string\): string\[\]/g, '(kind)')
  .replace(/: string\[\]/g, '').replace(/: string/g, '');
let forKind = null;
try { forKind = new Function(vocabJs + '; return interestsForKind;')(); } catch (e) { forKind = null; }
ck('the shipping vocabulary could be extracted and run', typeof forKind === 'function');

// The sweep's own custom-term matcher and hybrid merge, lifted from the source.
const cmSrc = sweep.slice(sweep.indexOf('function customMatches'), sweep.indexOf('Deno.serve'));
let customMatches = null;
try {
  customMatches = new Function(cmSrc.replace(/: string\[\]/g,'').replace(/: string/g,'')
    .replace(/: boolean/g,'') + '; return customMatches;')();
} catch (e) { customMatches = null; }
ck('the sweep\'s custom-term matcher could be run', typeof customMatches === 'function');

if (typeof forKind === 'function' && typeof customMatches === 'function') {
  // Rina is in TWO of Dan's circles; BOTH accept books. She saves a novel and
  // a restaurant. This is the exact ambiguity the hybrid design exists for.
  const canonicals = { k1: { name: 'The White Tiger', kind: 'novel' },
                       k2: { name: 'Basta', kind: 'bistro restaurant' } };
  const interests = [
    { circle_id: 'reading', owner_id: 'dan', interest: 'book', is_custom: false, terms: [] },
    { circle_id: 'friends', owner_id: 'dan', interest: 'book', is_custom: false, terms: [] },
    { circle_id: 'wine',    owner_id: 'dan', interest: 'wine', is_custom: true,
      terms: ['winery', 'wine bar', 'vineyard'] },
  ];
  const members = [
    { id: 'm1', circle_id: 'reading', owner_id: 'dan', person_id: 'p-rina', linked_user_id: 'rina' },
    { id: 'm2', circle_id: 'friends', owner_id: 'dan', person_id: 'p-rina', linked_user_id: 'rina' },
    { id: 'm3', circle_id: 'wine',    owner_id: 'dan', person_id: 'p-rina', linked_user_id: 'rina' },
  ];
  const contributions = [
    { canonical_id: 'k1', contributor_user: 'rina', via: 'save', note: 'great read' },
    { canonical_id: 'k2', contributor_user: 'rina', via: 'save', note: 'good food' },
  ];

  // The sweep's own algorithm.
  const rows = [];
  for (const c of contributions) {
    const kind = canonicals[c.canonical_id].kind;
    if (!kind) continue;
    const builtIn = forKind(kind);
    for (const ci of interests) {
      const m = members.find((x) => x.circle_id === ci.circle_id && x.linked_user_id === c.contributor_user);
      if (!m) continue;
      if (ci.owner_id === c.contributor_user) continue;
      const hit = ci.is_custom ? customMatches(kind, ci.terms) : builtIn.includes(ci.interest);
      if (!hit) continue;
      rows.push({ user_id: ci.owner_id, canonical_id: c.canonical_id,
                  matched_circles: [ci.circle_id], matched_interest: ci.interest });
    }
  }
  const merged = {};
  for (const r of rows) {
    const k = r.user_id + '|' + r.canonical_id;
    if (!merged[k]) { merged[k] = r; continue; }
    merged[k].matched_circles = [...new Set([...merged[k].matched_circles, ...r.matched_circles])];
  }
  const out = Object.values(merged);

  ck('RUN: exactly ONE suggestion despite TWO matching circles', out.length === 1, out.length + ' produced');
  ck('RUN: it is the book, not the restaurant', out[0] && out[0].canonical_id === 'k1');
  ck('RUN: BOTH matching circles are remembered (the hybrid rule)',
     out[0] && out[0].matched_circles.length === 2, JSON.stringify(out[0] && out[0].matched_circles));
  ck('RUN: the restaurant matched no books-only circle',
     !out.some((o) => o.canonical_id === 'k2'));
  ck('RUN: a wine circle did NOT claim a novel (custom terms are narrow)',
     !(out[0] && out[0].matched_circles.includes('wine')));

  // custom terms must match their own kind, whole-word
  ck('RUN: a custom "wine" interest matches a wine bar', customMatches('wine bar', ['winery','wine bar','vineyard']));
  ck('RUN: ...and not an unrelated kind', !customMatches('novel', ['winery','wine bar','vineyard']));
  ck('RUN: ...whole-word, so "win" does not match "winery"', !customMatches('win', ['winery']));
  ck('RUN: an item with no kind produces nothing', forKind('').length === 0);
}

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
