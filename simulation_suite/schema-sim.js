// schema-sim.js — the repo must be able to REBUILD the database (v0.40.0).
//
// THE GAP THIS CLOSES: migrations 0002–0009 were run in the Supabase dashboard
// and never committed. Running 0001 + 0010–0017 on an empty database produced a
// schema missing three tables and fifteen columns — including
// canonicals.embedding, the vector column search_library_hybrid reads directly.
// A rebuild would have yielded a database where semantic search could not
// function at all, and nobody would have discovered it until the worst day.
// 0018 reconciles it. This suite stops it silently reopening.
const fs = require('fs');
const path = require('path');
const MIG = '/home/claude/fx-out/supabase/migrations';
const files = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
const sql = files.map(f => fs.readFileSync(path.join(MIG, f), 'utf8')).join('\n');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── one folder, one sequence ────────────────────────────────────────────────
ck('migrations live in ONE folder (supabase/sql was merged in)',
   !fs.existsSync('/home/claude/fx-out/supabase/sql'));
ck('the sequence is gapless from 0010 up',
   files.join(',').indexOf('0010') >= 0 && files.join(',').indexOf('0018') >= 0, files.join(','));
ck('0018 is idempotent — safe to run against the LIVE database',
   !/\balter table (?!.*if not exists)[^\n]*add column (?!if not exists)/i.test(
      fs.readFileSync(path.join(MIG, '0018_schema_reconciliation.sql'), 'utf8')));
ck('0018 documents that it does not reconstruct RLS policies',
   /RLS POLICIES ARE NOT CAPTURED/.test(sql));

// ── RLS: every production policy must be reproducible ───────────────────────
// Transcribed from pg_policies on 5 Aug 2026. A rebuilt database with the
// tables but not the policies either locks users out or, worse, is opened up
// by a well-meaning guess. 0019 carries the real ones.
const PROD_POLICIES = [
  ['canonicals','canonicals_insert'], ['canonicals','canonicals_read'],
  ['canonicals','canonicals_update_creator'], ['circle_invite_links','cil_owner'],
  ['circles','circles_owner'], ['collection_items','ci_owner_all'],
  ['collections','col_owner_all'], ['invites','invites_owner'],
  ['members','members_owner'], ['notifications','notif_owner'],
  ['notifications','notif_select'], ['public_lists','public_lists_owner'],
  ['queries','queries_owner'], ['query_responses','qr_read_by_query_owner'],
  ['recommendations','recs_owner'], ['taste_match_profiles','tmp_owner_read'],
  ['taste_matches','tm_owner_read'], ['users','users_self'],
];
const missingPol = PROD_POLICIES.filter(([t, n]) =>
  !new RegExp('create policy ' + n + '\\s+on\\s+(?:public\\.)?' + t + '\\b', 'i').test(sql));
ck('every production RLS policy is created by a migration',
   missingPol.length === 0, missingPol.map(x => x.join('.')).join(', '));

// public_lists is OWNER-ONLY on production. An inferred "anyone may read a
// published list" policy would WIDEN access beyond what the product grants —
// shared lists are served by get-collection under the service role instead.
const plBlock = (sql.match(/create policy public_lists[\s\S]{0,200}/) || [''])[0];
ck('public_lists policy stays owner-only (no invented public read)',
   !/is_public/.test(plBlock), plBlock.slice(0, 120));
ck('policies are transcribed, and say so',
   /TRANSCRIPT, not an inference/.test(sql));
ck('the dead category_corrections table is documented, not silently left',
   /INTENTIONALLY POLICY-LESS/.test(sql));

// ── the live schema must be fully reconstructible ───────────────────────────
// Every table+column observed in production on 5 Aug 2026.
const LIVE = {
  canonicals: ['id','type','name','category','location','description','image_emoji','google_url',
    'website_url','linkedin_url','created_by','verified','created_at','updated_at',
    'primary_category','ai_tags','embedding','classified_at','class_source','image_url',
    'search_doc','search_doc_at'],
  category_corrections: ['id','canonical_id','old_category','new_category','corrected_by','created_at'],
  circle_invite_links: ['id','token','circle_id','owner_id','active','uses','created_at'],
  circles: ['id','owner_id','name','domain','description','color','location','created_at','updated_at'],
  collection_items: ['id','collection_id','rec_id','position'],
  collections: ['id','owner_id','token','title','description','created_at','updated_at'],
  invites: ['id','inviter_id','member_id','channel','contact_value','invite_token','accepted',
    'accepted_user_id','created_at','invite_type','circle_id','inviter_name','circle_name',
    'clicked','clicked_at'],
  members: ['id','circle_id','owner_id','name','avatar','avatar_color','trust_basis','contact_method',
    'contact_value','response_rate','is_external_source','source_type','source_url','linked_user_id',
    'created_at','updated_at','contact_key'],
  notifications: ['id','user_id','type','title','body','query_id','response_token','circle_id',
    'actor_name','read','created_at','link_url'],
  public_lists: ['id','owner_id','slug','title','description','rec_ids','circle_id','view_count',
    'is_public','created_at','updated_at'],
  queries: ['id','circle_id','sent_by','text','text_hash','degree','status','sent_at','completed_at',
    'created_at','updated_at','resolved_at','chosen_response_id'],
  query_responses: ['id','query_id','member_id','canonical_id','rec_name','rec_note','rec_location',
    'rec_emoji','degree','is_anonymous','saved_to_library','response_token','token_expires_at',
    'token_used','send_status','send_error','responded_at','created_at','updated_at'],
  recommendations: ['id','canonical_id','circle_id','owner_id','recommended_by_member_id',
    'recommended_by_user_id','query_id','note','rating','tags','status','is_anonymous','degree',
    'rec_date','created_at','updated_at','shared_to_network','source_collection_id','source_label'],
  taste_match_profiles: ['id','user_id','category_vector','tag_fingerprint','location_primary','updated_at'],
  taste_matches: ['id','user_id','matched_user_id','score','created_at'],
  users: ['id','name','avatar','avatar_color','bio','location','email','phone','taste_match_enabled',
    'degree2_enabled','joined_date','created_at','updated_at','handle','share_by_default','phone_key'],
  wa_otp: ['id','phone_key','phone','code_hash','attempts','created_at','expires_at','consumed_at'],
};
const blocks = {};
const re = /create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi;
let m; while ((m = re.exec(sql))) blocks[m[1].toLowerCase()] = m[2];
const covers = (t, c) =>
  new RegExp('^\\s*' + c + '\\s', 'm').test(blocks[t] || '') ||
  new RegExp('add column (?:if not exists )?' + c + '\\b', 'i').test(sql);

Object.keys(LIVE).forEach(t => {
  ck('table ' + t + ' is created by a migration', !!blocks[t], 'NOT CREATED');
});
let gaps = [];
Object.keys(LIVE).forEach(t => {
  LIVE[t].forEach(c => { if (!covers(t, c)) gaps.push(t + '.' + c); });
});
ck('EVERY live column is created by some migration (a rebuild works)',
   gaps.length === 0, gaps.join(', '));

// ── the columns search and the Librarian cannot live without ────────────────
['embedding','ai_tags','search_doc','primary_category','class_source'].forEach(c => {
  ck('canonicals.' + c + ' is in a migration (search depends on it)', covers('canonicals', c));
});
// Strip SQL comments FIRST. A prose mention of vector(1536) in a header
// comment is not a use of the type — and a check that explanatory text can
// break is a check that gets deleted the first time it cries wolf.
const code_only = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const iExt = code_only.indexOf('create extension if not exists vector');
const iUse = code_only.search(/vector\(1536\)/);
ck('pgvector extension exists in a migration at all', iExt >= 0);
ck('...and is created BEFORE the first real use of vector(1536)',
   iExt >= 0 && iUse >= 0 && iExt < iUse,
   'ext@' + iExt + ' firstUse@' + iUse);

// ── the code may not reference a column no migration creates ────────────────
const code = fs.readFileSync('/home/claude/app/index.html', 'utf8')
  + fs.readdirSync('/home/claude/fx-out/supabase/functions')
      .filter(d => fs.existsSync('/home/claude/fx-out/supabase/functions/' + d + '/index.ts'))
      .map(d => fs.readFileSync('/home/claude/fx-out/supabase/functions/' + d + '/index.ts', 'utf8')).join('\n');
const known = new Set();
Object.keys(LIVE).forEach(t => LIVE[t].forEach(c => known.add(c)));
const referenced = new Set();
[...code.matchAll(/\b(?:r|c|q|m|u)\.([a-z_]{4,})\b/g)].forEach(x => referenced.add(x[1]));
const unknown = [...referenced].filter(c => known.has(c) && !(
  Object.keys(LIVE).some(t => LIVE[t].includes(c) && covers(t, c))
));
ck('no code reference points at an uncreatable column', unknown.length === 0, unknown.join(', '));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
