// seam-sim.js — ONE CONSTRUCTOR PER ENTITY (v0.60.0).
//
// THE SEAM AUDIT: every failure this week was one shape — a producer leaves a
// field null, a consumer somewhere else degrades silently. FIVE producers of
// member rows each set a different subset. The worst, handleAddExistingPerson,
// set ONLY name and circle: no contact at all, so every send feature failed on
// those members with "unsupported_channel" — dan's screenshots, three accounts.
// Also found in production: a member whose NAME was an email address.
//
// These tests EXECUTE buildMember. A constructor that merely populates is not
// the fix; it must REFUSE, or a sixth producer will omit something new.
const vm = require('vm'), fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__x={buildMember,suggestionCardHtml,AppState};';
const el = () => ({ value:'', style:{}, dataset:{}, textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false;}}, addEventListener(){},
  appendChild(){}, remove(){}, focus(){}, querySelector:()=>null, querySelectorAll:()=>[] });
const ctx = { console:{log(){},error(){},warn(){}}, setTimeout:(f)=>{if(typeof f==='function')f();return 0;},
 clearTimeout(){}, setInterval:()=>1, clearInterval(){},
 document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>null,querySelectorAll:()=>[],
   addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
 window:{addEventListener(){},innerWidth:390,innerHeight:664,
   visualViewport:{height:664,offsetTop:0,addEventListener(){}},
   location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'}, navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u'+Math.random(),subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt(){},
 history:{replaceState(){},pushState(){}} };
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
  rpc:async()=>({data:null}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(app, ctx, { filename:'app.js' });
vm.runInContext('CURRENT_UID="me";', ctx);
const B = ctx.__x.buildMember;

// ── THE BUG dan HIT ─────────────────────────────────────────────────────────
const noContact = B({ name: 'shapiro', circleId: 'c1' });
ck('THE BUG: a member with NO contact is REFUSED', !noContact.ok, JSON.stringify(noContact));
// Assert the OUTCOME, not the error string: a first version of this negative
// test passed because a DIFFERENT branch still returned an error. What matters
// is that no unreachable member can be produced by ANY combination.
[{}, { contactMethod: 'app' }, { contactMethod: 'email' }, { contactMethod: 'whatsapp' },
 { contactMethod: null, contactValue: 'x@y.com' }].forEach(function(extra, i) {
  const r = B(Object.assign({ name: 'shapiro', circleId: 'c1' }, extra));
  const unreachable = r.ok && !r.member.isExternalSource
    && (!r.member.contactMethod || r.member.contactMethod === 'app' || !r.member.contactValue);
  ck('no unreachable member from input shape ' + i, !unreachable,
     r.ok ? JSON.stringify(r.member) : '(refused, correct)');
});
ck('...and says what to do about it', /Choose how to reach/.test(noContact.detail || ''));
const noValue = B({ name: 'shapiro', circleId: 'c1', contactMethod: 'email' });
ck('a method with no value is refused', !noValue.ok && noValue.error === 'no_contact_value');
ck("...naming the person and the field", /shapiro's email/.test(noValue.detail || ''), noValue.detail);

// the contactless 'app' method that produced unreachable members
ck("contactMethod 'app' is refused (it stored no contact)",
   !B({ name: 'x', circleId: 'c1', contactMethod: 'app' }).ok);

// ── a member whose NAME is a contact — found in production ──────────────────
const emailName = B({ name: 'dshapiro3012@gmail.com', circleId: 'c1',
                      contactMethod: 'email', contactValue: 'a@b.com' });
ck('a NAME that is an email is refused', !emailName.ok && emailName.error === 'name_is_contact');
ck('a NAME that is a phone number is refused',
   !B({ name: '+972505551234', circleId: 'c1', contactMethod: 'email', contactValue: 'a@b.com' }).ok);

// ── valid members ───────────────────────────────────────────────────────────
const ok1 = B({ name: 'Rina', circleId: 'c1', contactMethod: 'email', contactValue: ' Rina@Example.com ' });
ck('a valid email member is built', ok1.ok);
ck('...with every field the send path needs',
   ok1.ok && ok1.member.contactMethod === 'email' && !!ok1.member.contactValue && !!ok1.member.circleId);
const ok2 = B({ name: 'Yossi', circleId: 'c1', contactMethod: 'whatsapp', contactValue: '050-123-4567' });
ck('a phone is NORMALISED, not stored as typed', ok2.ok && ok2.member.contactValue.indexOf('+972') === 0,
   ok2.ok ? ok2.member.contactValue : ok2.error);
ck('a bad phone is refused',
   !B({ name: 'x', circleId: 'c1', contactMethod: 'whatsapp', contactValue: 'not a phone' }).ok);
ck('a bad email is refused',
   !B({ name: 'x', circleId: 'c1', contactMethod: 'email', contactValue: 'nope' }).ok);

// ── external sources legitimately have no contact ───────────────────────────
const src = B({ name: 'The Guardian', circleId: 'c1', isExternalSource: true, sourceType: 'publication' });
ck('an EXTERNAL SOURCE needs no contact (you do not message a newspaper)', src.ok);
ck('...and is marked as one', src.ok && src.member.isExternalSource === true);

// ── the person model is no longer optional ──────────────────────────────────
const linked = B({ name: 'Dan', circleId: 'c1', contactMethod: 'email', contactValue: 'd@e.com',
                   personId: 'p1', linkedUserId: 'u1' });
ck('personId is carried', linked.ok && linked.member.personId === 'p1');
ck('linkedUserId is carried (suggest-sweep matches on it)', linked.ok && linked.member.linkedUserId === 'u1');
ck('...and both default to null rather than being dropped',
   ok1.ok && ok1.member.personId === null && ok1.member.linkedUserId === null);

// ── every producer goes through it ──────────────────────────────────────────
ck('all five member producers call buildMember',
   (web.match(/buildMember\(\{/g) || []).length === 5,
   (web.match(/buildMember\(\{/g) || []).length + ' call sites');
ck('no producer hand-builds a member row any more',
   !/newMember = \{\s*\n\s*id: uid\(\), name:/.test(web));

// ── the card no longer degrades silently ────────────────────────────────────
ck('the card does NOT invent an anonymous sender',
   !/who = person \? person\.name : 'Someone in your circles'/.test(web));
ck('...it says so visibly instead', /arrived without a sender/.test(web));
ck('no dangling "It matches ." when there is no interest',
   /label \? 'It matches ' \+ esc\(label\) \+ '\.' : ''/.test(web));
ck('the item LINK travels with the suggestion',
   /canonicals\(name, kind, location, image_emoji, primary_category, website_url/.test(web));
ck('...and is rendered', /can\.website_url \|\| can\.google_url/.test(web));

// ── accepting propagates ────────────────────────────────────────────────────
ck('accepting applies the user\'s sharing preference', /shared_to_network: shareDefault\(\)/.test(web));
ck('accepting enriches an unenriched item', /librarianCommit\(sg\.canonical_id/.test(web));
ck('accepting records WHO suggested it', /source_label: sgSender \? \('suggested by ' \+ sgSender\.name\)/.test(web));


// ── THE SENDER'S NAME ALWAYS TRAVELS (v0.60.1) ──────────────────────────────
// Found in dan's live data: he sent La Plagne to Dany, who had never added dan
// back. No person record existed, so the card correctly refused to invent a
// sender — but the outcome was wrong. HE CHOSE TO SEND IT; his name should go
// with it. A recommendation whose sender cannot be named is worth little.
const mig31 = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0031_complete_suggestions.sql', 'utf8');
ck('suggestions carry the sender\'s own name as a fallback',
   /add column if not exists from_name text/.test(mig31));
ck('...written from the sender\'s profile on every direct send',
   /\(select name from public\.users where id = v_me\)/.test(mig31));
ck('the client loads it', /from_person_id, from_user_id, from_name, via/.test(web));
ck('the card prefers YOUR person record, then the sender\'s own name',
   /person \? person\.name : \(sg\.from_name \|\| null\)/.test(web));

const S = ctx.__x;
S.AppState.people = [];                       // recipient has NO record of the sender
S.AppState.userCircles = [];
S.AppState.suggestions = [];
const cardNoPerson = S.suggestionCardHtml({
  id: 's9', canonical_id: 'cX', from_person_id: null, from_name: 'Dan',
  from_user_id: 'u-dan', via: 'direct', source_note: 'great snow',
  matched_circles: [], matched_interest: 'sent to you directly', status: 'pending',
  canonicals: { name: 'La Plagne', kind: 'ski resort' } });
ck('RENDER: the card names the sender even with no person record',
   cardNoPerson.indexOf('Dan') >= 0, cardNoPerson.slice(0, 120));
ck('RENDER: ...and does NOT show the "arrived without a sender" warning',
   cardNoPerson.indexOf('arrived without a sender') < 0);
ck('RENDER: ...and has no dangling "It matches ."',
   cardNoPerson.indexOf('It matches .') < 0);
const cardTrulyAnon = S.suggestionCardHtml({
  id: 's10', canonical_id: 'cX', from_person_id: null, from_name: null,
  via: 'save', matched_circles: [], matched_interest: '', status: 'pending',
  canonicals: { name: 'Mystery', kind: 'thing' } });
ck('RENDER: a genuinely unattributable item still SAYS SO',
   cardTrulyAnon.indexOf('arrived without a sender') >= 0);

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
