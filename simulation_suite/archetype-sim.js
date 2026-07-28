// archetype-sim.js — build-sheet v4 logic: sentence guard (10 checks)
const fs=require('fs');
const src=fs.readFileSync('/home/claude/functions/build-sheet/index.ts','utf8');
// extract the pure helpers and run them as JS
const m1=src.match(/function norm\(s: string\): string \{[\s\S]*?\n\}/)[0].replace(/: string/g,'').replace(/\): \w+ \{/,') {');
const m2=src.match(/function looksLikeSentence\(s: string\): boolean \{[\s\S]*?\n\}/)[0].replace(/: string/g,'').replace(/\): \w+ \{/,') {');
eval(m1+'\n'+m2);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };

// The Avoriaz answers — these must NEVER become entities
ck('"yes great facilities for children" = sentence', looksLikeSentence('yes great facilities for children'));
ck('"yes its great good runs and no cars" = sentence', looksLikeSentence('yes its great good runs and no cars'));
ck('Hebrew verdict caught', looksLikeSentence('כן מעולה מאוד מומלץ למשפחות עם ילדים'));
ck('leading yes/no caught even when short', looksLikeSentence('yes definitely'));
ck('trailing punctuation + 4 words caught', looksLikeSentence('it was really quite good.'));

// Real entities must survive untouched
ck('"Avoriaz 1800" = entity', !looksLikeSentence('Avoriaz 1800'));
ck('"Dr. Liran Horev" = entity', !looksLikeSentence('Dr. Liran Horev'));
ck('Hebrew business name = entity', !looksLikeSentence('שושן שמוליק'));
ck('"Opa Restaurant Tel Aviv" = entity', !looksLikeSentence('Opa Restaurant Tel Aviv'));
ck('empty treated as sentence (never a canonical)', looksLikeSentence(''));
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
