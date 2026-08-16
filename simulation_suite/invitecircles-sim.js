// invitecircles-sim.js — NAME ON INVITE, AND FILE INTO SEVERAL CIRCLES (v0.63.0)
//
// naama appeared in dany's leros circle as "+972545543467". The invite dialog
// collected ONLY a phone number, so no member row existed until she joined, and
// complete-join had nothing but the number to name her from.
//
// dan also asked: "what is the point of inviting someone who is already on the
// app to join the app" — the dialog said so and offered no way to act on it.
// And: adding someone should let you pick which circles, more than one.
//
// THE MULTI-CIRCLE PART IS SMALL, and my first plan had it wrong. I proposed
// multi-circle invite tokens, atomic multi-insert and partial-failure design —
// half a day. THE PERSON MODEL ALREADY SOLVED IT (v0.43.0): a person exists
// independently of circles and `members` is just a join, so adding to three
// circles is THREE TRIVIAL OPERATIONS, not one complex one. No schema change.
const vm = require('vm'), fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── the name field ──────────────────────────────────────────────────────────
ck('the invite dialog asks for a name', /id="inv-name"/.test(web));
ck('...and refuses without one', /Add their name, so they do not appear as a phone number/.test(web));
ck('...explaining why in the source', /complete-join\s*\n?.*then adopts that placeholder/.test(web)
   || /naama appeared in dany's circle/.test(web));
ck('the invite CREATES the member row now (it used to record nothing)',
   /CREATE THE MEMBER ROWS NOW/.test(web));
ck('...through buildMember, so it cannot be unreachable',
   /trustBasis: 'Invited to Trustnet'/.test(web));

// ── already on Trustnet becomes actionable ──────────────────────────────────
ck('"already on Trustnet" offers a BUTTON, not just a sentence',
   /data-action="add-known-person"/.test(web));
ck('...and no longer tells them to go and do it elsewhere',
   !/Add them as a member instead \\u2014 they will get your questions in the app/.test(web));
ck('the handler exists', /async function handleAddKnownPerson/.test(web));
ck('inviteSay can render that markup safely',
   /if \(isHtml\) el2\.innerHTML = text; else el2\.textContent = text;/.test(web));
ck('...and defaults to inert text', /textContent by DEFAULT/.test(web));

// ── the circle picker ───────────────────────────────────────────────────────
ck('there is ONE picker component', /function circleTicksHtml/.test(web));
ck('...named to avoid an EXISTING local variable of the same name',
   /Named circleTicksHtml, NOT circlePickerHtml/.test(web));
ck('the invite dialog uses it', /circleTicksHtml\(circleId, 'inv'\)/.test(web));
ck('the add-member dialog uses it', /circleTicksHtml\(circleId, 'nm'\)/.test(web));
ck('...but NOT when editing an existing member',
   /editId \? '' : circleTicksHtml\(circleId, 'nm'\)/.test(web));
ck('the current circle is ticked by default', /const on = c\.id === currentCircleId;/.test(web));
// Test the SOURCE of the extra circles, not merely that a loop exists: my first
// version matched /extraCircles\.forEach/ and still passed after I replaced the
// array with [], because the loop was untouched. A check on shape rather than
// behaviour passes a broken feature.
ck('adding creates one member per ticked circle',
   /const extraCircles = pickedCircleIds\('nm'\)\.filter/.test(web));
ck('...skipping any circle they are already in', /const dup2 = /.test(web));
ck('...and naming every circle in the confirmation', /extraAdded\.length/.test(web));

// ── behaviour ───────────────────────────────────────────────────────────────
let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__p={circleTicksHtml,pickedCircleIds,buildMember,AppState};';
const ticks = [];
const el = (tag) => ({ value:'', style:{}, dataset:{}, textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false;}}, addEventListener(){},
  appendChild(){}, remove(){}, focus(){}, click(){}, querySelector:()=>null, querySelectorAll:()=>[] });
const ctx = { console:{log(){},error(){},warn(){}}, setTimeout:(f)=>{if(typeof f==='function')f();return 0;},
 clearTimeout(){}, setInterval:()=>1, clearInterval(){},
 document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>null,
   querySelectorAll:(sel)=>String(sel).indexOf('toggle-circle-pick')>=0 ? ticks : [],
   addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
 window:{addEventListener(){},open(){},innerWidth:390,innerHeight:664,
   visualViewport:{height:664,offsetTop:0,addEventListener(){}},
   location:{href:'x',search:'',hash:'',origin:'x',pathname:'/'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x',pathname:'/'}, navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u'+Math.random(),subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt(){},
 history:{replaceState(){},pushState(){}} };
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
  rpc:async()=>({data:null}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(app, ctx, { filename:'app.js' });
vm.runInContext('CURRENT_UID="me";', ctx);
const P = ctx.__p;
P.AppState.userCircles = [
  { id:'c-ski', name:'ski' }, { id:'c-dine', name:'dining' }, { id:'c-read', name:'reading' }];

const html = P.circleTicksHtml('c-ski', 'nm');
ck('RUN: the picker lists every circle',
   html.indexOf('ski') >= 0 && html.indexOf('dining') >= 0 && html.indexOf('reading') >= 0);
ck('RUN: the current circle starts ticked',
   /data-circle-id="c-ski" data-on="1"/.test(html), html.slice(0, 200));
ck('RUN: the others start unticked', /data-circle-id="c-dine" data-on="0"/.test(html));

ticks.length = 0;
ticks.push({ dataset:{ picker:'nm', circleId:'c-ski', on:'1' } },
           { dataset:{ picker:'nm', circleId:'c-dine', on:'1' } },
           { dataset:{ picker:'nm', circleId:'c-read', on:'0' } });
const picked = P.pickedCircleIds('nm');
ck('RUN: only ticked circles are returned',
   picked.length === 2 && picked.indexOf('c-ski') >= 0 && picked.indexOf('c-dine') >= 0,
   JSON.stringify(picked));

// a member built per circle is valid and reachable in each
const m1 = P.buildMember({ name:'Naama', circleId:'c-ski', contactMethod:'whatsapp', contactValue:'0545543467' });
const m2 = P.buildMember({ name:'Naama', circleId:'c-dine', contactMethod:'whatsapp', contactValue:'0545543467' });
ck('RUN: each circle gets its own valid member', m1.ok && m2.ok);
ck('RUN: ...with different ids', m1.ok && m2.ok && m1.member.id !== m2.member.id);
ck('RUN: ...the same normalised contact', m1.member.contactValue === m2.member.contactValue);
ck('RUN: ...and each is reachable', !!m1.member.contactMethod && !!m1.member.contactValue);
ck('RUN: a nameless invite is still refused',
   !P.buildMember({ name:'', circleId:'c-ski', contactMethod:'whatsapp', contactValue:'0545543467' }).ok);
ck('RUN: a phone number as the NAME is still refused',
   !P.buildMember({ name:'+972545543467', circleId:'c-ski', contactMethod:'whatsapp', contactValue:'0545543467' }).ok);

// ── A SCOPE ERROR THAT WOULD HAVE SHIPPED ───────────────────────────────────
// I used `norm` in handleInviteNew and handleAddKnownPerson. It exists ONLY as
// a LOCAL inside handleSaveMember, so both new paths threw "norm is not
// defined" for EVERY user who sent an invite. matrix-sim caught it by EXECUTING
// the function — no string check would have, and `node --check` passes happily
// because an undefined identifier is only an error at runtime.
ck('contact comparison is a SHARED helper, not a local borrowed from elsewhere',
   /function normContact\(v\)/.test(web));
ck('...and the invite paths use it', (web.match(/normContact\(/g) || []).length >= 4,
   (web.match(/normContact\(/g) || []).length + ' uses');
ck('...with no bare `norm(` left in the invite paths',
   !/norm\(m\.contactValue\)/.test(
     web.slice(web.indexOf('async function handleInviteNew'),
               web.indexOf('async function handleSaveMember'))));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
