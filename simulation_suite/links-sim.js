// links-sim.js — external-link router: category routing + search-query quality (8 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={domFindLinks};';
const ctx={console:{log(){},error(){},warn(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},document:{getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>({style:{},classList:{add(){},remove(){}}}),addEventListener(){},body:{style:{}},documentElement:{style:{}},head:{},hidden:false},window:{addEventListener(){},location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},location:{href:'x',search:'',hash:'',origin:'x'},navigator:{userAgent:'s',language:'en'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},fetch:async()=>({ok:true,json:async()=>({})}),crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt:()=>null,history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>({}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx;
vm.createContext(ctx); vm.runInContext(src,ctx);
const f=ctx.__x.domFindLinks;
let p=0,fl=0; const ck=(n,c,x)=>{ if(c){p++;console.log('  ✓',n);}else{fl++;console.log('  ✗',n,x||'');} };
// THE k2 case: hobbies + tags → search "k2 ski", never "k2 hobbies"
const k2=f('k2','','travel','hobbies',['ski','boots','equipment']);
ck('k2: search uses first AI tag ("k2 ski")', k2.includes('k2%20ski'));
ck('k2: internal label "hobbies" never leaks into query', !k2.includes('hobbies'));
ck('k2: no Booking despite travel circle', !k2.includes('booking.com'));
// no tags, unsearchable category → bare name (better than a junk word)
const bare=f('Widget','','','other',[]);
ck('no tags + other: bare name query', bare.includes('q=Widget') && !bare.includes('Widget%20other'));
// location always outranks tags
const loc=f('Hummus HaCarmel','Tel Aviv','dining','dining',['hummus']);
ck('location outranks tags in query', loc.includes('Hummus%20HaCarmel%20Tel%20Aviv'));
// searchable categories still used when no tags/location
const doc=f('Dr. Levi','','healthcare','healthcare',[]);
ck('healthcare (searchable): category word used', doc.includes('Dr.%20Levi%20healthcare'));
const trv=f('Hotel Carmel','Carmel','travel','travel',[]);
ck('travel: Booking + Maps + Google intact', trv.includes('booking.com') && trv.includes('maps') && trv.includes('google.com/search'));
const cul=f('A Pattern Language','','','culture',['architecture']);
ck('culture: Amazon + Google, tag in query', cul.includes('amazon.com') && cul.includes('architecture'));
console.log('\nRESULT:', p+' passed, '+fl+' failed'); process.exit(fl?1:0);
