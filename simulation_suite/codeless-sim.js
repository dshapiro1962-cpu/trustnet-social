// codeless-sim.js — JOIN WITH NO CODE (v0.62.0).
//
// yuval tapped a WhatsApp invite and got a login form asking for a code he was
// never sent. naama got the code — twice — and it worked, but dan's verdict was
// that it "complicates things too much, will scare users away, too many windows
// to shift through". Read a code in WhatsApp, remember it, switch back, type it.
//
// NOW: one button. WhatsApp opens with "Join Trustnet: <token>" already
// written; she presses send. The message arrives FROM HER PHONE NUMBER, which
// WhatsApp guarantees, so SENDING IS THE VERIFICATION. Nothing is typed and no
// digit appears. A forwarded invite fails safely — her husband's tap sends from
// HIS number, so he joins as himself, never as her.
const vm = require('vm'), fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
const mig = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0033_invite_claims.sql', 'utf8');
const fn  = fs.readFileSync('/home/claude/fx-out/supabase/functions/complete-join/index.ts', 'utf8');
const hook= fs.readFileSync('/home/claude/fx-out/supabase/functions/whatsapp-webhook/index.ts', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── the webhook records a claim and NOTHING ELSE ────────────────────────────
ck('the webhook recognises a join message', /Join\\\\s\+Trustnet:/.test(hook) || /Join\\s\+Trustnet/.test(hook));
// Strip comments first: the header comment ABOVE the join block quotes the
// reply text to explain why the block must precede it, which put the string
// EARLIER than the code and made this compare the wrong positions. Fourth time
// a check in this project has been fooled by its own prose.
const hookCode = hook.split('\n').map(function (l) { return l.replace(/\/\/.*$/, ''); }).join('\n');
ck('...BEFORE the "phone isn\'t linked" reply naama received',
   hookCode.indexOf('record_invite_claim') < hookCode.indexOf("isn't linked to an account"));
ck('it only RECORDS — it creates no account', !/createUser/.test(hook));
ck('...and no membership', !/from\("members"\)\s*\.insert/.test(hook));
ck('the reason is recorded where the next person will read it',
   /DOES NOT VERIFY META'S SIGNATURE/.test(hook));
ck('an invalid token is refused with a usable message',
   /That invitation link is no longer valid/.test(hook));
ck('the FALLBACK link is always sent, in case the tab died',
   /\?claimed=/.test(hook));

// ── the claim table ─────────────────────────────────────────────────────────
ck('claims expire', /expires_at[\s\S]{0,80}interval '10 minutes'/.test(mig));
ck('one LIVE claim per token (two taps must not race)',
   /invite_claims_one_live[\s\S]{0,90}where consumed_at is null/.test(mig));
ck('the table has NO policies — reachable only through the functions',
   /No policies: the table is reachable ONLY through the functions/.test(mig));
ck('claim_status is anon-callable (she has not signed in yet)',
   /grant execute on function public\.claim_status\(text\) to anon, authenticated/.test(mig));
ck('record_invite_claim is NOT callable by a browser',
   !/grant execute on function public\.record_invite_claim/.test(mig));

// ── completion: the privileged half ─────────────────────────────────────────
ck('the phone must MATCH the recorded claim', /phone_mismatch/.test(fn));
ck('an expired claim cannot be completed', /gt\("expires_at"/.test(fn));
ck('a consumed claim cannot be reused', /is\("consumed_at", null\)/.test(fn));
ck('a revoked invite is refused', /invite_no_longer_valid/.test(fn));
ck('joining twice does not create two memberships', /if \(!existingMember\)/.test(fn));
ck('the new member gets a CONTACT (unreachable members cost a full day)',
   /contact_method: "whatsapp", contact_value: "\+" \+ e164/.test(fn));
ck('the claim is consumed, so a forward cannot reuse it',
   /consumed_at: new Date\(\)\.toISOString\(\)/.test(fn));
ck('a session is minted the same way wa-signin does',
   /generateLink/.test(fn) && /verifyOtp/.test(fn));
ck('the uses counter increments correctly (precedence bug fixed)',
   /\(linkRow\?\.uses \?\? 0\) \+ 1/.test(fn));

// ── the client ──────────────────────────────────────────────────────────────
ck('ONE button, no code field', /Continue with WhatsApp/.test(web));
ck('...and it says so plainly', /No code to type/.test(web));
ck('the whole sign-in apparatus is hidden for an invitee',
   /const formEl = document\.getElementById\('login-methods'\);[\s\S]{0,80}display = 'none'/.test(web));
ck('the message is PREFILLED — she types nothing',
   /encodeURIComponent\('Join Trustnet: ' \+ token\)/.test(web));
ck('the tab polls while she is in WhatsApp', /function pollForClaim/.test(web));
ck('...and gives up after a sensible wait', /attempt > 90/.test(web));
ck('...telling her what to do instead', /tap the link WhatsApp sent/.test(web));
ck('a transient poll failure does NOT end the wait',
   /claim_status failed:[\s\S]{0,140}setTimeout/.test(web));
ck('the fallback landing is handled before the login screen',
   web.indexOf("get('claimed')") < web.indexOf('if (!sess) { showLoginScreen(); return; }'));

// ── behaviour: run the real poll loop ───────────────────────────────────────
let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__c={pollForClaim,finishCodelessJoin};';
const el = () => ({ value:'', style:{}, dataset:{}, textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false;}}, addEventListener(){},
  appendChild(){}, remove(){}, focus(){}, click(){}, querySelector:()=>null, querySelectorAll:()=>[] });
let claimed = false, completed = null, polls = 0;
const ctx = { console:{log(){},error(){},warn(){}},
 setTimeout:(f,ms)=>{ if(typeof f==='function' && polls < 200) setImmediate(f); return 0; },
 clearTimeout(){}, setInterval:()=>1, clearInterval(){}, setImmediate,
 document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>null,querySelectorAll:()=>[],
   addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
 window:{addEventListener(){},open(){},innerWidth:390,innerHeight:664,
   visualViewport:{height:664,offsetTop:0,addEventListener(){}},
   location:{href:'x',search:'',hash:'',origin:'x',pathname:'/',replace(){}},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x',pathname:'/',replace(){}},
 navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt(){},
 history:{replaceState(){},pushState(){}} };
ctx.supabase={createClient:()=>({from:()=>({}),
  auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}}),
        setSession:async()=>({error:null})},
  rpc:async(n)=>{ if(n==='claim_status'){ polls++; return {data:{claimed, phone:'+972545543467'}}; } return {data:null}; },
  channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(app, ctx, { filename:'app.js' });
vm.runInContext("fnPost = async function(name, body){ globalThis.__done = {name, body}; " +
  "return { access_token:'at', refresh_token:'rt', is_new:true, circle:'ski' }; };", ctx);
const C = ctx.__c;

(async () => {
  polls = 0; claimed = false;
  C.pollForClaim('tok-abc', 0);
  await new Promise(r => setTimeout(r, 60));
  ck('BEHAVIOUR: it keeps polling while she has not sent yet', polls > 1, polls + ' polls');
  ck('BEHAVIOUR: nothing is completed before she sends', !ctx.__done);

  claimed = true;
  // Restart the loop: the first run has already exhausted its scheduled
  // iterations under setImmediate, which fires far faster than the real 2s.
  polls = 0;
  C.pollForClaim('tok-abc', 0);
  await new Promise(r => setTimeout(r, 80));
  ck('BEHAVIOUR: once she sends, the join completes',
     !!ctx.__done && ctx.__done.name === 'complete-join', JSON.stringify(ctx.__done));
  ck('BEHAVIOUR: ...with the token and the phone the webhook recorded',
     !!ctx.__done && ctx.__done.body.token === 'tok-abc'
       && ctx.__done.body.phone === '+972545543467');

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
})();
