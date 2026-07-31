// ============================================================================
// load-corpus.js — populate a Trustnet library with dan's real 20-question
// corpus, so the retrieval eval measures something meaningful.
//
// It creates, exactly as the app would:
//   circles -> members -> queries -> answered query_responses
//   -> library items via the LIBRARIAN (entity resolution + search document)
//
// USAGE (from the repo root):
//   node eval/load-corpus.js --token <your-access-token>
//   node eval/load-corpus.js --token <t> --dry     # show the plan, write nothing
//   node eval/load-corpus.js --token <t> --clean   # remove what a previous run made
//
// Get the token from the app: F12 > Console >
//   (function(){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
//   if(/^sb-.*-auth-token$/.test(k)){var v=JSON.parse(localStorage.getItem(k));
//   console.log(v.access_token||v.currentSession.access_token);return;}}})()
//
// Everything it creates is tagged [corpus] in the circle name so --clean can
// find it again. Safe to re-run: it skips queries whose text already exists.
// ============================================================================
const SUPABASE = 'https://kgsdtfrcyjrxeyqqxoic.supabase.co';
const ANON = 'sb_publishable_8MAMd56FzHTyNZtnO2XK4A_cp2lFGEm';

const argv = process.argv;
const TOKEN = (() => { const i = argv.indexOf('--token'); return i > 0 ? argv[i + 1] : (process.env.TN_EVAL_TOKEN || ''); })();
const DRY = argv.includes('--dry');
const CLEAN = argv.includes('--clean');
if (!TOKEN || TOKEN.length < 100) {
  console.error('Need an access token:  node eval/load-corpus.js --token <token>');
  process.exit(1);
}
const UID = (() => {
  try { return JSON.parse(Buffer.from(TOKEN.split('.')[1], 'base64').toString()).sub; }
  catch (e) { console.error('Token does not look like a JWT.'); process.exit(1); }
})();

const H = { Authorization: 'Bearer ' + TOKEN, apikey: ANON, 'Content-Type': 'application/json' };
const HP = Object.assign({ Prefer: 'return=representation' }, H);

async function rest(path, init) {
  const res = await fetch(SUPABASE + '/rest/v1/' + path, init);
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + ' ' + path + ' :: ' + text.slice(0, 240));
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
}
const get = (p) => rest(p, { headers: H });
const post = (p, body) => rest(p, { method: 'POST', headers: HP, body: JSON.stringify(body) });
const del = (p) => rest(p, { method: 'DELETE', headers: H });

async function fn(name, body) {
  const res = await fetch(SUPABASE + '/functions/v1/' + name, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await res.text();
  if (!res.ok) throw new Error(name + ' ' + res.status + ' :: ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}

// ── the corpus ───────────────────────────────────────────────────────────────
// entity:true  -> becomes a library item.  entity:false -> advice, stays a comment.
const CIRCLES = {
  ski:      { name: 'Ski [corpus]',       domain: 'hobbies',      members: ['Rina', 'Yossi', 'Avi'] },
  food:     { name: 'Food [corpus]',      domain: 'dining',       members: ['Maya', 'Tal', 'Noa'] },
  home:     { name: 'Home [corpus]',      domain: 'home',         members: ['Dror', 'Gali', 'Uri'] },
  travel:   { name: 'Travel [corpus]',    domain: 'travel',       members: ['Shira', 'Eitan'] },
  general:  { name: 'General [corpus]',   domain: 'other',        members: ['Lior', 'Dana', 'Amit'] },
};

const CORPUS = [
  { c: 'home',   q: 'which is better the Weber Spirit E-325 Gas Grill or the NAPOLEON Rogue 425', a: [
      { by: 'Dror', t: 'both are good but Napoleon a lot more expensive', entity: false },
      { by: 'Gali', t: 'I find the Weber more user friendly', entity: true, name: 'Weber Spirit E-325' },
      { by: 'Uri',  t: "Napoleon doesn't rust so much", entity: true, name: 'Napoleon Rogue 425' } ] },
  { c: 'ski',    q: 'I have wide feet, looking for a wide ski touring boot', a: [
      { by: 'Rina',  t: "I'd go for the Tecnica Mach1 Series (T-Drive 2.0)", entity: true, name: 'Tecnica Mach1 T-Drive 2.0' },
      { by: 'Yossi', t: 'look at the Tecnica ski boot range', entity: false },
      { by: 'Avi',   t: 'very difficult to find but K2 might have one', entity: false } ] },
  { c: 'general',q: 'loved Harry Potter, has the author written other books', a: [
      { by: 'Lior', t: 'yes, Christmas Pig', entity: true, name: 'The Christmas Pig' },
      { by: 'Dana', t: 'Lethal White', entity: true, name: 'Lethal White' } ] },
  { c: 'food',   q: 'planning a trip to Tel Aviv, any recommendations for restaurants', a: [
      { by: 'Maya', t: 'Habasta', entity: true, name: 'Habasta' },
      { by: 'Tal',  t: 'for real authentic hummus go to Abu Hasan', entity: true, name: 'Abu Hasan' },
      { by: 'Noa',  t: 'great place by the sea, House of Dallal', entity: true, name: 'House of Dallal' } ] },
  { c: 'food',   q: 'מקום טוב לאויסטרים בפריז', a: [
      { by: 'Maya', t: 'Huitrerie Régis', entity: true, name: 'Huitrerie Régis' },
      { by: 'Tal',  t: 'Clamato', entity: true, name: 'Clamato' },
      { by: 'Noa',  t: 'Le Mary Celeste but expensive', entity: true, name: 'Le Mary Celeste' } ] },
  { c: 'home',   q: 'להבה בכיריים נחלשה, למישהו יש רעיון מה לעשות', a: [
      { by: 'Dror', t: 'פתח את הסתימה עם סיכה', entity: false },
      { by: 'Gali', t: 'נאור פיקס טכנאי תנורים מומלץ', entity: true, name: 'נאור פיקס' },
      { by: 'Uri',  t: 'תבדוק אם לא נגמר הגז', entity: false } ] },
  { c: 'travel', q: 'איזו עונה טובה לביקור בישראל', a: [
      { by: 'Shira', t: 'סתיו או האביב', entity: false },
      { by: 'Eitan', t: 'אם רוצים ים אז עדיף באביב', entity: false } ] },
  { c: 'general',q: 'have an old Tesla, considering moving to a different make, any recommendations', a: [
      { by: 'Lior', t: 'stick with Tesla', entity: false },
      { by: 'Dana', t: 'go with Rivian', entity: true, name: 'Rivian' },
      { by: 'Amit', t: 'I would go with a hybrid Toyota', entity: true, name: 'Toyota hybrid' } ] },
  { c: 'ski',    q: 'is Les Arcs good for beginners', a: [
      { by: 'Rina',  t: 'yes lots of blue and green runs', entity: true, name: 'Les Arcs' },
      { by: 'Yossi', t: 'yes has a good ski school', entity: true, name: 'Les Arcs' } ] },
  { c: 'ski',    q: "I've been to La Grave a few times, is there something similar in the US", a: [
      { by: 'Rina',  t: 'Silverton Mountain (Colorado)', entity: true, name: 'Silverton Mountain' },
      { by: 'Yossi', t: 'Crested Butte Mountain Resort', entity: true, name: 'Crested Butte Mountain Resort' },
      { by: 'Avi',   t: 'Bridger Bowl', entity: true, name: 'Bridger Bowl' } ] },
  { c: 'general',q: 'מקום זול לבגדי עבודה', a: [
      { by: 'Lior', t: 'למכנסיים הגרעין', entity: true, name: 'הגרעין' },
      { by: 'Dana', t: 'לחולצות אתא', entity: true, name: 'אתא' } ] },
  { c: 'ski',    q: 'recommend a good freeride ski', a: [
      { by: 'Rina',  t: 'Rossignol Sender', entity: true, name: 'Rossignol Sender' },
      { by: 'Yossi', t: 'K2 Mindbender 89Ti', entity: true, name: 'K2 Mindbender 89Ti' } ] },
  { c: 'food',   q: 'מתכון לקארי צהוב, יש המלצות', a: [
      { by: 'Maya', t: 'חפש באתר של לימור לניאדו תירוש', entity: true, name: 'לימור לניאדו תירוש' } ] },
  { c: 'food',   q: 'איזה קצב מומלץ יותר, קצביה בשנקין או אומצה', a: [
      { by: 'Maya', t: 'אני מעדיף את אומצה', entity: true, name: 'אומצה' },
      { by: 'Tal',  t: 'קצביה בשנקין טובה אבל מאוד יקרה', entity: true, name: 'קצביה בשנקין' } ] },
  { c: 'general',q: 'good skin doctor', a: [
      { by: 'Lior', t: 'דר לביא במכבי', entity: true, name: 'דר לביא' } ] },
  { c: 'travel', q: 'how is Leros island', a: [
      { by: 'Shira', t: 'very nice but hard to get to', entity: true, name: 'Leros' },
      { by: 'Eitan', t: 'quiet compared to other islands, I love it', entity: true, name: 'Leros' } ] },
  { c: 'travel', q: 'recommend a museum in NYC', a: [
      { by: 'Shira', t: 'the MoMA', entity: true, name: 'MoMA' },
      { by: 'Eitan', t: 'the most impressive is the Metropolitan', entity: true, name: 'Metropolitan Museum of Art' } ] },
  { c: 'travel', q: 'very disappointed with Santorini, can someone recommend an alternative', a: [
      { by: 'Shira', t: 'Paphos', entity: true, name: 'Paphos' },
      { by: 'Eitan', t: 'Leros', entity: true, name: 'Leros' } ] },
  { c: 'food',   q: 'nice bar in Tel Aviv for a quiet drink', a: [
      { by: 'Maya', t: 'האחים', entity: true, name: 'האחים' } ] },
  { c: 'home',   q: 'ממסגר תמונות אמין', a: [
      { by: 'Dror', t: 'עמנואל אומנות ומסגור ברמת גן', entity: true, name: 'עמנואל אומנות ומסגור' } ] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('Trustnet corpus loader — user ' + UID.slice(0, 8) + '…' + (DRY ? '  [DRY RUN]' : ''));

  if (CLEAN) {
    console.log('\nCleaning previous corpus data…');
    const circles = await get('circles?select=id,name&owner_id=eq.' + UID + '&name=like.*%5Bcorpus%5D*');
    for (const c of circles) {
      const qs = await get('queries?select=id&circle_id=eq.' + c.id);
      for (const q of qs) {
        await del('query_responses?query_id=eq.' + q.id);
        await del('recommendations?query_id=eq.' + q.id + '&owner_id=eq.' + UID);
        await del('queries?id=eq.' + q.id);
      }
      await del('members?circle_id=eq.' + c.id);
      await del('circles?id=eq.' + c.id);
      console.log('  removed ' + c.name);
    }
    console.log('Done.');
    return;
  }

  // 1 ── circles + members
  const circleId = {}, memberId = {};
  for (const [key, def] of Object.entries(CIRCLES)) {
    const existing = await get('circles?select=id&owner_id=eq.' + UID + '&name=eq.' + encodeURIComponent(def.name));
    if (existing.length) { circleId[key] = existing[0].id; }
    else if (!DRY) {
      const [row] = await post('circles', { owner_id: UID, name: def.name, domain: def.domain, color: '#217A4B' });
      circleId[key] = row.id;
    }
    console.log('circle: ' + def.name + (existing.length ? '  (existing)' : '  (created)'));
    for (const m of def.members) {
      const key2 = key + '|' + m;
      const ex = circleId[key] ? await get('members?select=id&circle_id=eq.' + circleId[key] + '&name=eq.' + encodeURIComponent(m)) : [];
      if (ex.length) memberId[key2] = ex[0].id;
      else if (!DRY) {
        const [row] = await post('members', {
          circle_id: circleId[key], owner_id: UID, name: m,
          contact_method: 'app', contact_value: '', response_rate: 'high',
        });
        memberId[key2] = row.id;
      }
    }
  }

  // 2 ── queries + answered responses + library items
  let madeQ = 0, madeA = 0, madeItems = 0, skipped = 0, warnedRLS = false;
  for (const entry of CORPUS) {
    const cid = circleId[entry.c];
    const dup = await get('queries?select=id&sent_by=eq.' + UID + '&text=eq.' + encodeURIComponent(entry.q));
    if (dup.length) { skipped++; console.log('· already present: ' + entry.q.slice(0, 58)); continue; }
    console.log('\n+ ' + entry.q.slice(0, 70));
    if (DRY) { madeQ++; madeA += entry.a.length; madeItems += entry.a.filter((x) => x.entity).length; continue; }

    const [q] = await post('queries', {
      circle_id: cid, sent_by: UID, text: entry.q,
      degree: 1, status: 'sent', sent_at: new Date().toISOString(),
    });
    madeQ++;

    for (const ans of entry.a) {
      const mid = memberId[entry.c + '|' + ans.by];
      // Response rows belong to the ANSWERER; RLS may refuse them from here.
      // They're realism, not a requirement — the library items below carry the
      // question text themselves, which is what retrieval actually reads.
      try {
        await post('query_responses', {
          query_id: q.id, member_id: mid, response_token: crypto.randomUUID(),
          degree: 1, send_status: 'sent', rec_name: ans.entity ? ans.name : ans.t,
          rec_note: ans.t, responded_at: new Date().toISOString(),
          is_anonymous: false, saved_to_library: !!ans.entity,
        });
        madeA++;
      } catch (e) {
        if (!warnedRLS) {
          console.log('   (note: query_responses blocked by RLS — building library items only)');
          warnedRLS = true;
        }
      }

      if (!ans.entity) continue;
      // library item, through the Librarian (entity + tags + search document)
      let ent = null;
      try {
        const r = await fn('librarian', {
          mode: 'enrich', name: ans.name, note: ans.t, location: '',
          query_text: entry.q, circle_name: CIRCLES[entry.c].name.replace(' [corpus]', ''),
        });
        ent = r && r.entity ? r.entity : null;
      } catch (e) { console.log('   ! librarian: ' + e.message.slice(0, 90)); }

      const name = ent ? ent.name : ans.name;
      const already = await get('recommendations?select=id,note,canonical_id,canonicals(name)&owner_id=eq.' + UID);
      const hit = already.find((r) => r.canonicals && r.canonicals.name &&
        r.canonicals.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (hit) { // several people praising the same thing -> one item, many comments
        const line = ans.by + ': ' + ans.t;
        if ((hit.note || '').indexOf(ans.t) < 0) {
          await rest('recommendations?id=eq.' + hit.id, {
            method: 'PATCH', headers: H,
            body: JSON.stringify({ note: hit.note ? hit.note + '\n• ' + line : line }),
          });
        }
        console.log('   ~ merged comment into ' + name);
        continue;
      }

      const [can] = await post('canonicals', {
        type: 'place', name: name, category: ent ? (ent.kind || '') : '',
        location: ent ? ent.location : '', image_emoji: '📌', created_by: UID,
        primary_category: ent ? ent.category : 'other',
        ai_tags: ent ? ent.tags : [], class_source: 'ai', classified_at: new Date().toISOString(),
      });
      await post('recommendations', {
        owner_id: UID, canonical_id: can.id, circle_id: cid, query_id: q.id,
        recommended_by_member_id: mid, note: ans.by + ': ' + ans.t, rating: 5,
        status: 'saved', is_anonymous: false, shared_to_network: false, degree: 1,
        rec_date: new Date().toISOString().slice(0, 10),
      });
      // write the search document + embedding
      try {
        await fn('librarian', {
          mode: 'commit', canonical_id: can.id, name: name, note: ans.t, location: ent ? ent.location : '',
          query_text: entry.q, circle_name: CIRCLES[entry.c].name.replace(' [corpus]', ''),
        });
      } catch (e) { console.log('   ! commit: ' + e.message.slice(0, 90)); }
      madeItems++;
      console.log('   → ' + name + (ent && ent.tags && ent.tags.length ? '  [' + ent.tags.slice(0, 5).join(', ') + ']' : ''));
      await sleep(200); // be kind to the AI + Places quotas
    }
  }

  console.log('\n──────── LOADED ────────');
  console.log('  queries      : ' + madeQ + (skipped ? '  (' + skipped + ' already present)' : ''));
  console.log('  answers      : ' + madeA);
  console.log('  library items: ' + madeItems);
  console.log('\nNow measure it:  node eval/eval-retrieval.js --token <same token>');
})().catch((e) => { console.error('\nFAILED: ' + e.message); process.exit(1); });
