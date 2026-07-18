// collection-page-sim.js — the public collection.html script under stubs (7 checks)
const vm = require('vm'); const fs = require('fs');
const html = fs.readFileSync('/home/claude/collections/web/collection.html', 'utf8');
const a = html.indexOf('<script>') + 8; const b = html.indexOf('</script>', a);
const src = html.slice(a, b);
let pass=0, fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
function run(opts) {
  const els = {}; const mk = (id) => els[id] = { textContent:'', innerHTML:'', style:{}, href:'', display:'' };
  ['c-title','c-desc','c-curator','c-count','c-items','c-cta','c-save'].forEach(mk);
  const sub = { textContent: '' };
  let fetched = null;
  const store = opts.session ? { 'sb-kgsdtfrcyjrxeyqqxoic-auth-token': '{"access_token":"x"}' } : {};
  const ctx = {
    console, document: {
      title: '', getElementById: (i) => els[i] || null,
      querySelector: (sel) => sel === '.cta-sub' ? sub : null,
    },
    location: { search: '?t=' + (opts.token || ''), origin: 'https://trustnetsocial.netlify.app' },
    localStorage: {
      get length() { return Object.keys(store).length; },
      key: (i) => Object.keys(store)[i], getItem: (k) => store[k] || null,
    },
    URLSearchParams, encodeURIComponent, window: {},
    fetch: (url, init) => { fetched = { url, body: JSON.parse(init.body) };
      return Promise.resolve({ json: () => Promise.resolve(opts.response) }); },
  };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { els, sub, fetched, ctx };
}
(async () => {
  const data = { title:'My Tel Aviv doctors', description:'15 years', curator:'dan', count:2,
    items:[{name:'Dr. Levi',location:'Tel Aviv',category:'healthcare',emoji:'🩺',image_url:null,note:'thorough',rating:5},
           {name:'Dr. Cohen',location:'',category:'healthcare',emoji:'🦷',image_url:'https://img/x.jpg',note:'',rating:null}]};
  // anonymous visitor
  let r = run({ token:'tok123', session:false, response:data });
  await new Promise((res)=>setImmediate(res)); await new Promise((res)=>setImmediate(res));
  ck('fetches get-collection with the token', r.fetched && r.fetched.url.includes('/get-collection') && r.fetched.body.token==='tok123');
  ck('renders title, curator, both items', r.els['c-title'].textContent==='My Tel Aviv doctors' && r.els['c-curator'].innerHTML.includes('dan') && r.els['c-items'].innerHTML.includes('Dr. Levi') && r.els['c-items'].innerHTML.includes('Dr. Cohen'));
  ck('notes carry curator attribution', r.els['c-items'].innerHTML.includes('dan:') && r.els['c-items'].innerHTML.includes('thorough'));
  ck('anonymous CTA: save verb + app link with token', r.els['c-save'].href==='/?collection=tok123' && r.els['c-save'].textContent==='');
  // signed-in visitor
  r = run({ token:'tok123', session:true, response:data });
  await new Promise((res)=>setImmediate(res)); await new Promise((res)=>setImmediate(res));
  ck('signed-in CTA: "Open in my Trustnet"', r.els['c-save'].textContent==='Open in my Trustnet');
  ck('signed-in sub-line names the curator', r.sub.textContent.includes('credited to dan'));
  // missing token
  r = run({ token:'', session:false, response:data });
  ck('missing token: clear error state, no fetch', r.els['c-title'].textContent==='List not found' && r.fetched===null);
  console.log('\nRESULT:', pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
