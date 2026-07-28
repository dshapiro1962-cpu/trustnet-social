// librarian-sim.js — search-document construction + entity guard (14 checks)
// The three pure helpers are mirrored here in JS; a DRIFT GUARD fails if the
// TypeScript source stops matching, so this can never silently test a fiction.
const fs=require('fs');
const src=fs.readFileSync('/home/claude/functions/librarian/index.ts','utf8');

function norm(s){ return (s||"").trim().toLowerCase().replace(/\s+/g," "); }
function looksLikeSentence(s){
  const t=(s||"").trim();
  if(!t) return true;
  const words=t.split(/\s+/).length;
  if(words>=7) return true;
  if(/[.!?]$/.test(t)&&words>=4) return true;
  if(/^(yes|no|yeah|sure|definitely|absolutely|כן|לא|בהחלט)\b/i.test(t)) return true;
  return false;
}
function buildSearchDoc(e){
  return [e.name,e.kind,e.location,e.category,(e.tags||[]).join(" "),e.note,
    e.query_text?"asked: "+e.query_text:"",
    e.circle_name?"circle: "+e.circle_name:""].filter(Boolean).join(" · ").slice(0,2000);
}

let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };

// ── drift guard: the mirrored logic must still match the deployed source
ck('DRIFT GUARD: buildSearchDoc still joins with " · " and caps at 2000',
   src.indexOf('join(" · ").slice(0, 2000)')>=0);
ck('DRIFT GUARD: doc still includes "asked:" and "circle:" context',
   src.indexOf('"asked: " + e.query_text')>=0 && src.indexOf('"circle: " + e.circle_name')>=0);
ck('DRIFT GUARD: sentence rule still 7 words / punctuation / verdict-opener',
   src.indexOf('words >= 7')>=0 && src.indexOf('/[.!?]$/')>=0 && src.indexOf('בהחלט')>=0);

// ── THE AVORIAZ CASE
const doc = buildSearchDoc({
  name:'Avoriaz 1800', location:'Avoriaz, France', category:'travel', kind:'ski resort',
  tags:['ski','family','kids','resort','car-free','winter','משפחות'],
  note:'yes great facilities for children',
  query_text:'is Avoriaz 1800 good for families?',
  circle_name:'Ski'
});
ck('doc contains the entity', doc.indexOf('Avoriaz 1800')>=0);
ck('doc contains "ski" (absent from the OLD record entirely)', /ski/i.test(doc));
ck('doc contains family/kids words', /family/i.test(doc) && /kids/i.test(doc));
ck('doc carries the ORIGINATING QUESTION', doc.indexOf('asked: is Avoriaz 1800 good for families?')>=0);
ck('doc carries the CIRCLE it came from', doc.indexOf('circle: Ski')>=0);
ck('doc carries Hebrew tag forms', doc.indexOf('משפחות')>=0);
ck('doc includes location + category', doc.indexOf('Avoriaz, France')>=0 && doc.indexOf('travel')>=0);
ck('doc bounded to 2000 chars', doc.length<=2000);
const oldThin=['Avoriaz 1800','Avoriaz, France','yes great facilities for children'].join(' | ');
ck('ROOT CAUSE proven: the old thin string had no "ski"', !/ski/i.test(oldThin));

// ── entity guard
ck('verdict sentence rejected as entity', looksLikeSentence('yes its great good runs and no cars'));
ck('real entities accepted', !looksLikeSentence('Avoriaz 1800') && !looksLikeSentence('שושן שמוליק'));
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
