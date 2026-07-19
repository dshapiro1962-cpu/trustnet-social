
/* ═══ SUPABASE CONFIG (production) ═══ */
const SUPABASE_URL = 'https://kgsdtfrcyjrxeyqqxoic.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8MAMd56FzHTyNZtnO2XK4A_cp2lFGEm';
const FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let CURRENT_UID = null;
'use strict';

/* ═══════════════════════════════════════════════
   SYNTHETIC DATA — SOCIAL VERSION
   ═══════════════════════════════════════════════ */

const SYNTHETIC_USERS = [
  { id: 'u-demo1', name: 'Noa Levi', location: 'Tel Aviv, IL', avatar: 'NL', avatarColor: '#1A6FA8', bio: 'Architect, food obsessive, amateur sommelier.' },
  { id: 'u-demo2', name: 'James Park', location: 'London, UK', avatar: 'JP', avatarColor: '#8B2FC9', bio: 'Strategist. Travels 120 days a year. Always eating.' }
];

const SYNTHETIC_CIRCLES = [
  { id: 'sc1', ownerId: 'u-demo1', name: 'Dining', domain: 'dining', location: 'Tel Aviv', description: 'Restaurants, chefs, wine bars — anyone I trust about food.', color: '#E8A020', memberIds: ['sm1','sm2','sm3'] },
  { id: 'sc2', ownerId: 'u-demo1', name: 'Travel', domain: 'travel', location: '', description: 'Hotels, cities, hidden places — curated by people who actually know.', color: '#1A6FA8', memberIds: ['sm4','sm5'] },
  { id: 'sc3', ownerId: 'u-demo1', name: 'Healthcare', domain: 'healthcare', location: 'Tel Aviv', description: 'Doctors, specialists, and therapists I trust with my family.', color: '#2D6A4F', memberIds: ['sm1','sm6'] },
  { id: 'sc4', ownerId: 'u-demo2', name: 'London Food', domain: 'dining', location: 'London', description: 'The best of London dining from people in the know.', color: '#C0392B', memberIds: ['sm7','sm8'] },
  { id: 'sc5', ownerId: 'u-demo2', name: 'Design & Culture', domain: 'culture', location: 'London', description: 'Museums, galleries, films, books — culture I can trust.', color: '#8B2FC9', memberIds: ['sm7','sm9'] }
];

const SYNTHETIC_MEMBERS = [
  { id: 'sm1', name: 'Ran Katz', avatar: 'RK', avatarColor: '#1E6B42', trustBasis: 'Friend since university. Same taste in wine.', contactMethod: 'app', responseRate: 'high' },
  { id: 'sm2', name: 'Yael Ben-David', avatar: 'YB', avatarColor: '#C0392B', trustBasis: 'Food journalist. Knows Tel Aviv inside-out.', contactMethod: 'whatsapp', responseRate: 'high' },
  { id: 'sm3', name: 'Amir Cohen', avatar: 'AC', avatarColor: '#1A6FA8', trustBasis: 'Chef. Absolute authority on anything fermented.', contactMethod: 'email', responseRate: 'medium' },
  { id: 'sm4', name: 'Sophie Muller', avatar: 'SM', avatarColor: '#8B2FC9', trustBasis: 'Travel writer. Lived in 14 countries.', contactMethod: 'app', responseRate: 'high' },
  { id: 'sm5', name: 'Tom Avraham', avatar: 'TA', avatarColor: '#2D6A4F', trustBasis: 'Hotels consultant. Knows what luxury actually means.', contactMethod: 'whatsapp', responseRate: 'medium' },
  { id: 'sm6', name: 'Dr. Michal Stern', avatar: 'MS', avatarColor: '#3D4F46', trustBasis: 'Internist. Trusted family friend.', contactMethod: 'app', responseRate: 'high' },
  { id: 'sm7', name: 'Alice Mwangi', avatar: 'AM', avatarColor: '#8B2FC9', trustBasis: 'Food critic for a London magazine.', contactMethod: 'app', responseRate: 'high' },
  { id: 'sm8', name: 'Ravi Patel', avatar: 'RP', avatarColor: '#E8A020', trustBasis: 'Sommelier. Worked at The Fat Duck.', contactMethod: 'whatsapp', responseRate: 'high' },
  { id: 'sm9', name: 'Clara Santos', avatar: 'CS', avatarColor: '#1A6FA8', trustBasis: 'Curator at the Design Museum.', contactMethod: 'app', responseRate: 'medium' }
];

const SYNTHETIC_CANONICALS = [
  { id: 'can1', type: 'place', name: 'Opa Restaurant', category: 'Restaurant', location: 'Tel Aviv, IL', imageEmoji: '🍽️', externalLinks: { google: 'https://maps.google.com/?q=Opa+Tel+Aviv' } },
  { id: 'can2', type: 'place', name: 'Abraxas North', category: 'Wine Bar', location: 'Tel Aviv, IL', imageEmoji: '🍷', externalLinks: { google: null } },
  { id: 'can3', type: 'place', name: 'Hotel Carmel', category: 'Hotel', location: 'Carmel, CA', imageEmoji: '🏨', externalLinks: { website: 'https://www.hotelcarmel.com' } },
  { id: 'can4', type: 'place', name: 'Sabbath Elevator', category: 'Restaurant', location: 'Tel Aviv, IL', imageEmoji: '🍽️', externalLinks: { google: null } },
  { id: 'can5', type: 'person', name: 'Dr. Liora Feldman', category: 'Dermatologist', location: 'Tel Aviv, IL', imageEmoji: '👩‍⚕️', externalLinks: { } },
  { id: 'can6', type: 'place', name: 'Bavel', category: 'Restaurant', location: 'Los Angeles, CA', imageEmoji: '🍽️', externalLinks: { website: 'https://www.bavelrestaurant.com' } },
  { id: 'can7', type: 'place', name: 'Lyle\'s', category: 'Restaurant', location: 'London, UK', imageEmoji: '🍽️', externalLinks: { website: 'https://www.lyleslondon.com' } },
  { id: 'can8', type: 'content', name: 'The Menu (2022)', category: 'Film', location: null, imageEmoji: '🎬', externalLinks: { } },
  { id: 'can9', type: 'place', name: 'Frantzén', category: 'Restaurant', location: 'Stockholm, SE', imageEmoji: '🍽️', externalLinks: { } },
  { id: 'can10', type: 'product', name: 'A Pattern Language', category: 'Book', location: null, imageEmoji: '📖', externalLinks: { } }
];

const SYNTHETIC_RECS = [
  { id: 'r1', canonicalId: 'can1', circleId: 'sc1', recommendedBy: 'sm2', note: 'The best shakshouka in TA. Ask for the extra tahini on the side. Tuesday lunch is quieter.', rating: 5, tags: ['brunch','local','eggs'], date: '2025-11-12', status: 'available', degree: 1, isAnonymous: false },
  { id: 'r2', canonicalId: 'can2', circleId: 'sc1', recommendedBy: 'sm1', note: 'Tiny wine bar, owner picks everything. Don\'t bother with the menu, just say your budget.', rating: 5, tags: ['wine','intimate','natural-wine'], date: '2025-12-01', status: 'available', degree: 1, isAnonymous: false },
  { id: 'r3', canonicalId: 'can3', circleId: 'sc2', recommendedBy: 'sm4', note: 'Rooms 8-12 have the ocean view. Book directly, not through OTA — they upgrade you.', rating: 4, tags: ['hotel','coast','romantic'], date: '2025-10-30', status: 'available', degree: 1, isAnonymous: false },
  { id: 'r4', canonicalId: 'can4', circleId: 'sc1', recommendedBy: 'sm3', note: 'Technically brilliant. Not for casual nights — this is a serious meal. 3 hour minimum.', rating: 5, tags: ['fine-dining','tasting-menu','special-occasion'], date: '2025-12-15', status: 'available', degree: 1, isAnonymous: false },
  { id: 'r5', canonicalId: 'can5', circleId: 'sc3', recommendedBy: 'sm6', note: 'Excellent diagnostician. Very thorough. Waiting list is 6 weeks but worth it.', rating: 5, tags: ['dermatology','specialist'], date: '2025-09-20', status: 'available', degree: 1, isAnonymous: false },
  { id: 'r6', canonicalId: 'can7', circleId: 'sc4', recommendedBy: 'sm7', note: 'Best seasonal cooking in London right now. Counter seats give you the theatre. Book 3 months out.', rating: 5, tags: ['london','seasonal','counter'], date: '2025-12-08', status: 'available', degree: 1, isAnonymous: false },
  { id: 'r7', canonicalId: 'can8', circleId: 'sc5', recommendedBy: 'sm9', note: 'Dark comedy about fine dining culture. If you\'re in hospitality, it\'s uncomfortably funny.', rating: 4, tags: ['film','food','satire'], date: '2025-11-25', status: 'available', degree: 1, isAnonymous: false },
  { id: 'r8', canonicalId: 'can10', circleId: 'sc5', recommendedBy: 'sm7', note: 'Changed how I think about designed space. Dense but endlessly rewarding. Read slowly.', rating: 5, tags: ['architecture','design','book'], date: '2025-10-10', status: 'available', degree: 1, isAnonymous: false }
];

const TASTE_MATCH_RECS = [
  { id: 'tm1', canonicalId: 'can6', note: 'The mezze spread here is unlike anything in LA. Flavour precision of a Michelin kitchen with a neighbourhood soul.', rating: 5, tags: ['LA','middle-eastern','buzzy'], matchScore: 94 },
  { id: 'tm2', canonicalId: 'can9', note: 'Yes, it\'s expensive. Yes, it\'s worth it. The most technically perfect meal I\'ve eaten in 10 years of restaurant-going.', rating: 5, tags: ['stockholm','tasting-menu','once-in-a-lifetime'], matchScore: 89 }
];

/* ═══════════════════════════════════════════════
   APP STATE
   ═══════════════════════════════════════════════ */

const AppState = {
  currentView: 'home',
  viewParams: {},
  activeFilter: 'all',
  searchQuery: '',
  modal: null,
  queryState: null,

  // Simulated invite-surface state (demo only)
  dismissedReciprocals: [],
  addedReciprocals: [],

  // Active user (real or demo switch)
  activeUser: null,
  isDemoMode: false,
  demoUserId: null,

  // User data (real user, from storage)
  userProfile: null,
  userCircles: [],
  userMembers: [],
  userRecs: [],
  userCanonicals: [],
  userQueries: [],

  // Synthetic data (always in memory)
  synUsers: SYNTHETIC_USERS,
  _synCircles: SYNTHETIC_CIRCLES,
  _synMembers: SYNTHETIC_MEMBERS,
  _synCanonicals: SYNTHETIC_CANONICALS,
  _synRecs: SYNTHETIC_RECS,
  _tmData: [],
  _answered: [],
  _answeredFetched: false,
  _feed: [],
  _feedFetched: false,
  _sheet: null,
  _notifications: [],
  _notifFetched: false,
  _inboxPrevSeen: null,
  get synCircles() { return this.isDemoMode ? this._synCircles : []; },
  get synMembers() { return this.isDemoMode ? this._synMembers : []; },
  get synCanonicals() { return this.isDemoMode ? this._synCanonicals : []; },
  get synRecs() { return this.isDemoMode ? this._synRecs : []; },
  get tasteMatchRecs() { return this.isDemoMode ? TASTE_MATCH_RECS : this._tmData; },

  // Combined access helpers
  allCircles() {
    if (this.isDemoMode) {
      const demoUser = this.synUsers.find(function(u) { return u.id === AppState.demoUserId; });
      return demoUser ? this.synCircles.filter(function(c) { return c.ownerId === demoUser.id; }) : [];
    }
    return this.userCircles.concat(
      this.synCircles.filter(function(c) { return true; }) // synthetic always visible
    );
  },
  circleById(id) {
    const all = this.synCircles.concat(this.userCircles);
    return all.find(function(c) { return c.id === id; }) || null;
  },
  memberById(id) {
    const all = this.synMembers.concat(this.userMembers);
    return all.find(function(m) { return m.id === id; }) || null;
  },
  canonicalById(id) {
    const all = this.synCanonicals.concat(this.userCanonicals);
    return all.find(function(c) { return c.id === id; }) || null;
  },
  allRecs() {
    return this.synRecs.concat(this.userRecs);
  },
  membersOfCircle(circleId) {
    const circle = this.circleById(circleId);
    if (!circle) return [];
    const allMem = this.synMembers.concat(this.userMembers);
    if (circle.memberIds) {
      return circle.memberIds.map(function(mid) {
        return allMem.find(function(m) { return m.id === mid; });
      }).filter(Boolean);
    }
    return allMem.filter(function(m) { return m.circleId === circleId; });
  }
};

/* ═══════════════════════════════════════════════
   STORAGE HELPERS
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   SUPABASE DATA ADAPTER (replaces localStorage layer)
   ═══════════════════════════════════════════════ */

async function fnPost(name, body) {
  const s = (await sb.auth.getSession()).data.session;
  const res = await fetch(FUNCTIONS_URL + '/' + name, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + (s ? s.access_token : ''), 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await res.json();
}
async function fnGet(name, qs) {
  const s = (await sb.auth.getSession()).data.session;
  const res = await fetch(FUNCTIONS_URL + '/' + name + (qs ? '?' + qs : ''), {
    headers: { 'Authorization': 'Bearer ' + (s ? s.access_token : ''), 'apikey': SUPABASE_KEY }
  });
  return await res.json();
}

function mapResponse(r) {
  return { id: r.id, contactId: r.member_id, isAnonymous: !!r.is_anonymous, degree: r.degree || 1,
    recName: r.rec_name, recNote: r.rec_note, recLoc: r.rec_location, recEmoji: r.rec_emoji || '📌',
    savedToLibrary: !!r.saved_to_library, respondedAt: r.responded_at };
}

async function loadUserData() {
  // profile
  const prof = await sb.from('users').select('*').eq('id', CURRENT_UID).maybeSingle();
  AppState.userProfile = prof.data ? { id: prof.data.id, name: prof.data.name, avatar: prof.data.avatar,
    avatarColor: prof.data.avatar_color, bio: prof.data.bio || '', location: prof.data.location || '',
    shareByDefault: prof.data.share_by_default !== false,
    email: prof.data.email || '', joinedDate: prof.data.joined_date } : null;
  if (!AppState.userProfile) { AppState.userCircles=[];AppState.userMembers=[];AppState.userRecs=[];AppState.userCanonicals=[];AppState.userQueries=[]; return; }

  // own collections
  const cols = await sb.from('collections').select('*, collection_items(rec_id)').eq('owner_id', CURRENT_UID).order('created_at');
  AppState.userCollections = (cols.data || []).map(function(c) {
    return { id: c.id, token: c.token, title: c.title, description: c.description || '',
             recIds: (c.collection_items || []).map(function(x) { return x.rec_id; }) };
  });

  // circles + members
  const cs = await sb.from('circles').select('*').eq('owner_id', CURRENT_UID).order('created_at');
  const ms = await sb.from('members').select('*').eq('owner_id', CURRENT_UID);
  AppState.userMembers = (ms.data || []).map(function(m){ return { id:m.id, circleId:m.circle_id, name:m.name,
    avatar:m.avatar, avatarColor:m.avatar_color, trustBasis:m.trust_basis||'', contactMethod:m.contact_method||'app',
    contactValue:m.contact_value||'', responseRate:m.response_rate||'unknown', isExternalSource:!!m.is_external_source,
    sourceType:m.source_type, sourceUrl:m.source_url, linkedUserId:m.linked_user_id, addedAt:m.created_at }; });
  AppState.userCircles = (cs.data || []).map(function(c){ return { id:c.id, ownerId:'me', name:c.name, domain:c.domain,
    description:c.description||'', color:c.color||'#217A4B', location:c.location||'', isOwn:true, createdAt:c.created_at,
    memberIds: AppState.userMembers.filter(function(m){return m.circleId===c.id;}).map(function(m){return m.id;}) }; });

  // recs
  const rs = await sb.from('recommendations').select('*').eq('owner_id', CURRENT_UID).order('created_at');
  AppState.userRecs = (rs.data || []).map(function(r){ return { id:r.id, canonicalId:r.canonical_id, circleId:r.circle_id||'',
    recommendedBy: r.recommended_by_member_id || r.recommended_by_user_id || CURRENT_UID, queryId:r.query_id,
    sourceLabel: r.source_label || '',
    note:r.note||'', rating:r.rating||0, tags:r.tags||[], status:r.status||'saved', isAnonymous:!!r.is_anonymous, sharedToNetwork:!!r.shared_to_network,
    degree:r.degree||1, date:r.rec_date }; });

  // canonicals: mine + any referenced by my recs
  const ids = AppState.userRecs.map(function(r){return r.canonicalId;}).filter(Boolean);
  let canRows = [];
  const mine = await sb.from('canonicals').select('*').eq('created_by', CURRENT_UID);
  canRows = mine.data || [];
  const missing = ids.filter(function(id){ return !canRows.some(function(c){return c.id===id;}); });
  if (missing.length) {
    const extra = await sb.from('canonicals').select('*').in('id', missing);
    canRows = canRows.concat(extra.data || []);
  }
  AppState.userCanonicals = canRows.map(function(c){ return { id:c.id, type:c.type, name:c.name, category:c.category||'',
    location:c.location||'', description:c.description||'', imageEmoji:c.image_emoji||'📌', googleUrl:c.google_url,
    websiteUrl:c.website_url, linkedinUrl:c.linkedin_url,
    primaryCategory:c.primary_category||'', aiTags:c.ai_tags||[], imageUrl:c.image_url||'' }; });

  // queries + responses
  const qs = await sb.from('queries').select('*, query_responses!query_id(*)').eq('sent_by', CURRENT_UID).order('sent_at');
  AppState.userQueries = (qs.data || []).map(function(q){ return { id:q.id, circleId:q.circle_id, text:q.text,
    degree:q.degree||1, status:q.status||'sent', sentAt:q.sent_at,
    resolvedAt:q.resolved_at||null, chosenResponseId:q.chosen_response_id||null,
    responses:(q.query_responses||[]).filter(function(r){return r.responded_at;}).map(mapResponse) }; });
}

async function saveProfile() {
  const p = AppState.userProfile; if (!p || !CURRENT_UID) return;
  const r = await sb.from('users').upsert({ id: CURRENT_UID, name: p.name, avatar: p.avatar,
    avatar_color: p.avatarColor, bio: p.bio || null, location: p.location || null, email: p.email || null,
    share_by_default: p.shareByDefault !== false });
  if (r.error) { console.error('saveProfile', r.error); toast('Could not save profile.', 'warn'); }
}
async function saveCircles() {
  if (!CURRENT_UID) return;
  const arr = AppState.userCircles;
  if (arr.length) {
    const rows = arr.map(function(c){ return { id:c.id, owner_id:CURRENT_UID, name:c.name, domain:c.domain,
      description:c.description||null, color:c.color||null, location:c.location||null }; });
    const r = await sb.from('circles').upsert(rows);
    if (r.error) { console.error('saveCircles', r.error); toast('Could not save circles.', 'warn'); return; }
    await sb.from('circles').delete().eq('owner_id', CURRENT_UID)
      .not('id', 'in', '(' + arr.map(function(c){return c.id;}).join(',') + ')');
  } else {
    await sb.from('circles').delete().eq('owner_id', CURRENT_UID);
  }
}
async function saveMembers() {
  if (!CURRENT_UID) return;
  const arr = AppState.userMembers;
  if (arr.length) {
    const rows = arr.map(function(m){ return { id:m.id, owner_id:CURRENT_UID, circle_id:m.circleId, name:m.name,
      avatar:m.avatar||null, avatar_color:m.avatarColor||null, trust_basis:m.trustBasis||null,
      contact_method:m.contactMethod||'app', contact_value:m.contactValue||null, response_rate:m.responseRate||'unknown',
      is_external_source:!!m.isExternalSource, source_type:m.sourceType||null, source_url:m.sourceUrl||null,
      linked_user_id:m.linkedUserId||null }; });
    const r = await sb.from('members').upsert(rows);
    if (r.error) { console.error('saveMembers', r.error); toast('Could not save members.', 'warn'); return; }
    await sb.from('members').delete().eq('owner_id', CURRENT_UID)
      .not('id', 'in', '(' + arr.map(function(m){return m.id;}).join(',') + ')');
  } else {
    await sb.from('members').delete().eq('owner_id', CURRENT_UID);
  }
}
async function saveCanonicals() {
  if (!CURRENT_UID) return;
  const rows = AppState.userCanonicals.filter(function(c){ return !c._noSync; }).map(function(c){ return { id:c.id, type:c.type||'place', name:c.name,
    category:c.category||null, location:c.location||null, description:c.description||null,
    website_url:c.websiteUrl||null,
    image_emoji:c.imageEmoji||'📌', image_url:c.imageUrl||null, created_by:CURRENT_UID }; });
  if (rows.length) {
    const r = await sb.from('canonicals').upsert(rows, { ignoreDuplicates: false });
    if (r.error) { console.error('saveCanonicals', r.error); }
  }
}
async function saveRecs() {
  if (!CURRENT_UID) return;
  const arr = AppState.userRecs;
  if (arr.length) {
    const rows = arr.map(function(r){ return { id:r.id, owner_id:CURRENT_UID, canonical_id:r.canonicalId,
      circle_id:r.circleId||null, query_id:r.queryId||null,
      recommended_by_member_id:(r.recommendedBy && r.recommendedBy!==CURRENT_UID) ? r.recommendedBy : null,
      recommended_by_user_id:(r.recommendedBy===CURRENT_UID) ? CURRENT_UID : null,
      note:r.note||null, rating:r.rating||null, tags:r.tags||[], status:r.status||'saved',
      is_anonymous:!!r.isAnonymous, shared_to_network:!!r.sharedToNetwork, degree:r.degree||1, rec_date:r.date||null }; });
    const res = await sb.from('recommendations').upsert(rows);
    if (res.error) { console.error('saveRecs', res.error); toast('Could not save to library.', 'warn'); return; }
    await sb.from('recommendations').delete().eq('owner_id', CURRENT_UID)
      .not('id', 'in', '(' + arr.map(function(r){return r.id;}).join(',') + ')');
  } else {
    await sb.from('recommendations').delete().eq('owner_id', CURRENT_UID);
  }
}
async function saveQueries() {
  if (!CURRENT_UID) return;
  const arr = AppState.userQueries;
  for (const q of arr) {
    for (const resp of (q.responses || [])) {
      if (resp.savedToLibrary && resp.id) {
        await sb.from('query_responses').update({ saved_to_library: true }).eq('id', resp.id);
      }
    }
  }
}

/* ═══════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════ */

function toast(msg, type) {
  const tc = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast-' + type : '');
  const icons = { error: '✕', warn: '⚠️', '': '✓' };
  const ico = icons[type || ''] || '✓';
  t.innerHTML = '<span style="font-size:16px;">' + ico + '</span><span>' + esc(msg) + '</span>';
  tc.appendChild(t);
  setTimeout(function() {
    t.classList.add('toast-out');
    setTimeout(function() { t.remove(); }, 220);
  }, 3000);
}

/* ═══════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════ */

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}
function uid() {
  return crypto.randomUUID();
}
function stars(n) {
  let s = '';
  for (let i = 1; i <= 5; i++) {
    s += '<span class="star' + (i > n ? ' star-empty' : '') + '">★</span>';
  }
  return '<div class="stars">' + s + '</div>';
}
function relDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return diff + 'd ago';
  if (diff < 30) return Math.floor(diff/7) + 'w ago';
  if (diff < 365) return Math.floor(diff/30) + 'mo ago';
  return Math.floor(diff/365) + 'y ago';
}
function domainLabel(d) {
  const m = { dining:'Dining', travel:'Travel', healthcare:'Healthcare', home:'Home Services', culture:'Culture', hobbies:'Hobbies', professional:'Professional', other:'Other' };
  return m[d] || d;
}
function channelLabel(c) {
  const m = { app:'In-app', whatsapp:'WhatsApp', email:'Email', linkedin:'LinkedIn' };
  return m[c] || c;
}
function channelIcon(c) {
  if (c === 'whatsapp') return '📱';
  if (c === 'email') return '✉️';
  if (c === 'linkedin') return '🔗';
  return '💬';
}
function avatarEl(member, size) {
  const cls = 'avatar' + (size ? ' avatar-' + size : '');
  const bg = member.avatarColor || '#217A4B';
  return '<div class="' + cls + '" style="background:' + bg + ';">' + esc(member.avatar || '?') + '</div>';
}
function statusDot(status) {
  const map = { available:'dot-green', visited:'dot-amber', saved:'dot-blue', dismissed:'dot-slate' };
  return '<span class="dot ' + (map[status] || 'dot-slate') + '"></span>';
}

/* ═══════════════════════════════════════════════
   VIEW ROUTER
   ═══════════════════════════════════════════════ */

const APP_VERSION = 'v0.20.0 · live';
(function(){ var e = document.getElementById('app-version-footer'); if (e) e.textContent = APP_VERSION; })();

function showView(name, params) {
  if (name !== 'inbox') AppState._inboxPrevSeen = null;
  AppState.currentView = name;
  AppState.viewParams = params || {};
  AppState.activeFilter = 'all';
  AppState.searchQuery = '';
  renderApp();
}

const VIEW_TITLES = {
  home: 'Home',
  circles: 'My Circles',
  'circle-detail': 'Circle',
  query: 'Ask My Circles',
  history: 'Query History',
  answered: 'Queries I Answered',
  'history-detail': 'Query',
  sheet: 'Answer Sheet',
  inbox: 'Inbox',
  library: 'My Library',
  'rec-detail': 'Recommendation',
  'taste-match': 'Taste Match',
  profile: 'Profile',
  settings: 'Settings'
};

function renderApp() {
  // Update nav active state
  document.querySelectorAll('.nav-item[data-view]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.view === AppState.currentView);
  });
  document.querySelectorAll('.mobile-nav-item[data-view]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.view === AppState.currentView);
  });

  // Update topbar
  const ttEl = document.getElementById('topbar-title');
  const taEl = document.getElementById('topbar-actions');
  const name = VIEW_TITLES[AppState.currentView] || AppState.currentView;
  ttEl.textContent = name;

  // Topbar action buttons
  taEl.innerHTML = '';
  if (AppState.currentView === 'circles') {
    taEl.innerHTML = '<button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add-circle"><svg style="width:14px;height:14px;" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg> New Circle</button>';
  } else if (AppState.currentView === 'library') {
    taEl.innerHTML = '<button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add-rec">+ Add</button>';
  } else if (AppState.currentView === 'circle-detail') {
    const cid = AppState.viewParams.circleId;
    taEl.innerHTML = '<button class="btn btn-secondary btn-sm" data-action="nav" data-view="query" data-circle-id="' + esc(cid) + '">Ask this circle</button>&nbsp;<button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add-member" data-circle-id="' + esc(cid) + '">+ Member</button>';
  }

  // Sidebar badges
  const uc = AppState.userCircles.length + (AppState.isDemoMode ? 0 : AppState.synCircles.length);
  const ucEl = document.getElementById('sb-circle-count');
  if (ucEl) ucEl.textContent = uc;
  const ulEl = document.getElementById('sb-lib-count');
  if (ulEl) ulEl.textContent = AppState.userRecs.length + AppState.synRecs.length;
  const uqEl = document.getElementById('sb-query-count');
  if (uqEl) uqEl.textContent = AppState.userQueries.length || '';

  // Sidebar user
  updateSidebarUser();

  // Render view body
  const body = document.getElementById('view-body');
  let html = '';
  if (AppState.currentView === 'home') html = renderHome();
  else if (AppState.currentView === 'circles') html = renderCircles();
  else if (AppState.currentView === 'circle-detail') html = renderCircleDetail();
  else if (AppState.currentView === 'query') html = renderQuery();
  else if (AppState.currentView === 'history') html = renderHistory();
  else if (AppState.currentView === 'history-detail') html = renderHistoryDetail();
  else if (AppState.currentView === 'answered') html = renderAnswered();
  else if (AppState.currentView === 'sheet') html = renderSheet();
  else if (AppState.currentView === 'inbox') html = renderInbox();
  else if (AppState.currentView === 'library') html = renderLibrary();
  else if (AppState.currentView === 'rec-detail') html = renderRecDetail();
  else if (AppState.currentView === 'taste-match') html = renderTasteMatch();
  else if (AppState.currentView === 'profile') html = renderProfile();
  else if (AppState.currentView === 'settings') html = renderSettings();
  body.innerHTML = html;
  body.scrollTop = 0;

  // Post-render hooks
  if (AppState.currentView === 'query') initQueryView();
}

function updateSidebarUser() {
  const user = AppState.isDemoMode
    ? AppState.synUsers.find(function(u) { return u.id === AppState.demoUserId; })
    : AppState.userProfile;
  if (!user) return;
  const avEl = document.getElementById('sb-avatar');
  const nmEl = document.getElementById('sb-name');
  const lcEl = document.getElementById('sb-loc');
  if (avEl) { avEl.textContent = user.avatar || '?'; avEl.style.background = user.avatarColor || '#217A4B'; }
  if (nmEl) nmEl.textContent = user.name || '—';
  if (lcEl) {
    // Show the signed-in email in real mode — prevents account mix-ups
    lcEl.textContent = (!AppState.isDemoMode && AppState._authEmail)
      ? AppState._authEmail
      : (user.location || '—');
  }
  ensureNotificationsFetched();
  updateInboxBadge();
  updateMobileTabs();

  // Demo user switcher
  const demoEl = document.getElementById('sb-demo-users');
  if (demoEl) {
    demoEl.innerHTML = AppState.synUsers.map(function(u) {
      const active = AppState.isDemoMode && AppState.demoUserId === u.id;
      return '<div class="nav-item' + (active ? ' active' : '') + '" data-action="switch-demo" data-user-id="' + esc(u.id) + '" style="font-size:12px;">'
        + '<div class="avatar avatar-sm" style="background:' + esc(u.avatarColor) + ';">' + esc(u.avatar) + '</div>'
        + esc(u.name)
        + '</div>';
    }).join('');
  }
}

/* ═══════════════════════════════════════════════
   SIMULATED: RECIPROCAL NUDGE
   Shows when a "known user" already has you in their circle.
   All simulated — demonstrates the growth mechanic.
   ═══════════════════════════════════════════════ */

// Simulated pending reciprocal relationships (people who "already have you")
const SIMULATED_RECIPROCALS = [
  { id: 'recip1', name: 'Ran Katz', avatar: 'RK', avatarColor: '#1E6B42', circleName: 'Wine', domain: 'dining', trustBasis: 'Friend since university. Same taste in wine.' },
  { id: 'recip2', name: 'Sophie Muller', avatar: 'SM', avatarColor: '#8B2FC9', circleName: 'Travel', domain: 'travel', trustBasis: 'Travel writer. Lived in 14 countries.' }
];

function reciprocalNudgeHtml() {
  return ''; // simulated nudge disabled in production
  if (AppState.isDemoMode) return '';
  // Find the first non-dismissed, non-added reciprocal
  const pending = SIMULATED_RECIPROCALS.find(function(r) {
    return !AppState.dismissedReciprocals.includes(r.id) && !AppState.addedReciprocals.includes(r.id);
  });
  if (!pending) return '';

  return '<div style="background:linear-gradient(135deg,#EBF7F1,#fff);border:1px solid #C6EDD9;border-radius:14px;padding:18px 20px;margin-bottom:20px;position:relative;">'
    + '<button data-action="dismiss-reciprocal" data-recip-id="' + esc(pending.id) + '" style="position:absolute;top:12px;right:12px;background:none;border:none;color:#A8BDAF;font-size:16px;cursor:pointer;padding:4px;">✕</button>'
    + '<div style="display:flex;align-items:flex-start;gap:14px;">'
    + '<div class="avatar" style="background:' + esc(pending.avatarColor) + ';flex-shrink:0;">' + esc(pending.avatar) + '</div>'
    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-size:11px;font-weight:700;color:#1A5235;background:#C6EDD9;display:inline-block;padding:2px 8px;border-radius:10px;margin-bottom:8px;">👋 ALREADY TRUSTS YOU</div>'
    + '<div style="font-size:15px;font-weight:700;color:#0D2B1F;margin-bottom:4px;">' + esc(pending.name) + ' has you in their ' + esc(pending.circleName) + ' circle</div>'
    + '<div style="font-size:12px;color:#56695F;line-height:1.6;margin-bottom:14px;">People who trust each other\'s recommendations get the most out of Trustnet. Add ' + esc(pending.name.split(' ')[0]) + ' to your circles?</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    + '<button class="btn btn-primary btn-sm" data-action="add-reciprocal" data-recip-id="' + esc(pending.id) + '">Add ' + esc(pending.name.split(' ')[0]) + '</button>'
    + '<button class="btn btn-ghost btn-sm" data-action="dismiss-reciprocal" data-recip-id="' + esc(pending.id) + '">Maybe later</button>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: HOME
   ═══════════════════════════════════════════════ */

function onboardingSteps() {
  const hasCircle = AppState.userCircles.length > 0;
  const hasPeople = AppState.userMembers.length > 0;
  const hasAsked = AppState.userQueries.length > 0;
  const firstCircle = AppState.userCircles[0] || null;
  return [
    { done: hasCircle, label: 'Create your first circle',
      hint: 'A circle is a group you trust on one topic \u2014 dining, travel, health\u2026',
      btn: hasCircle ? null : { label: 'Create a circle', action: 'nav', extra: 'data-view="circles"' } },
    { done: hasPeople, label: 'Add people you trust',
      hint: 'Share an invite link \u2014 they join with one tap.',
      btn: (hasPeople || !firstCircle) ? null : { label: 'Get invite link', action: 'open-circle-link',
        extra: 'data-circle-id="' + esc(firstCircle ? firstCircle.id : '') + '" data-circle-name="' + esc(firstCircle ? firstCircle.name : '') + '"' } },
    { done: hasAsked, label: 'Ask your first question',
      hint: 'Real answers from your people, not from strangers.',
      btn: (hasAsked || !hasPeople) ? null : { label: 'Ask now', action: 'nav', extra: 'data-view="query"' } }
  ];
}

function renderOnboarding() {
  if (AppState.isDemoMode || !AppState.userProfile) return '';
  const steps = onboardingSteps();
  const doneCount = steps.filter(function(st) { return st.done; }).length;
  if (doneCount === steps.length) return '';
  const pct = doneCount / steps.length;
  const R = 17, C = 2 * Math.PI * R;
  const ring = '<svg width="46" height="46" viewBox="0 0 46 46" style="flex-shrink:0;">'
    + '<circle cx="23" cy="23" r="' + R + '" fill="none" stroke="#E5EDE8" stroke-width="5"/>'
    + '<circle cx="23" cy="23" r="' + R + '" fill="none" stroke="#217A4B" stroke-width="5" stroke-linecap="round"'
    + ' stroke-dasharray="' + (C * pct).toFixed(1) + ' ' + C.toFixed(1) + '"'
    + ' transform="rotate(-90 23 23)"/>'
    + '<text x="23" y="27" text-anchor="middle" font-size="11" font-weight="800" fill="#1A5235">' + doneCount + '/' + steps.length + '</text>'
    + '</svg>';
  const rows = steps.map(function(st) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #EEF4F0;">'
      + (st.done
        ? '<span style="width:20px;height:20px;border-radius:50%;background:#217A4B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">\u2713</span>'
        : '<span style="width:20px;height:20px;border-radius:50%;border:2px solid #CDD9D1;flex-shrink:0;"></span>')
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:' + (st.done ? '500' : '700') + ';color:' + (st.done ? '#7A9086' : '#1C2420') + ';'
      + (st.done ? 'text-decoration:line-through;' : '') + '">' + st.label + '</div>'
      + (!st.done ? '<div style="font-size:11px;color:#7A9086;">' + st.hint + '</div>' : '')
      + '</div>'
      + (st.btn ? '<button class="btn btn-primary btn-sm" data-action="' + st.btn.action + '" ' + st.btn.extra + ' style="flex-shrink:0;font-size:12px;">' + st.btn.label + '</button>' : '')
      + '</div>';
  }).join('');
  return '<div id="onboarding-card" style="border-radius:14px;border:1px solid #DCEAE0;background:linear-gradient(135deg,#F6FBF7,#EFF7F1);padding:14px 16px;margin-bottom:20px;">'
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">'
    + ring
    + '<div><div style="font-size:14px;font-weight:800;color:#1A5235;">Set up your Trustnet</div>'
    + '<div style="font-size:11.5px;color:#56695F;">' + (steps.length - doneCount) + ' step' + (steps.length - doneCount !== 1 ? 's' : '') + ' to go \u2014 takes about a minute</div></div>'
    + '</div>'
    + rows
    + '</div>';
}

function renderHome() {
  const user = AppState.isDemoMode
    ? AppState.synUsers.find(function(u) { return u.id === AppState.demoUserId; })
    : AppState.userProfile;
  const name = user ? user.name.split(' ')[0] : 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const allRecs = AppState.allRecs();
  const recentRecs = allRecs.slice(0, 6);

  const circles = AppState.isDemoMode
    ? AppState.synCircles.filter(function(c) { return c.ownerId === AppState.demoUserId; })
    : AppState.userCircles.concat(AppState.synCircles);

  const totalMembers = circles.reduce(function(acc, c) { return acc + (c.memberIds ? c.memberIds.length : 0); }, 0);

  let recentHtml = '';
  if (recentRecs.length === 0) {
    recentHtml = '<div class="empty-state"><div class="empty-icon">🌱</div><div class="empty-title">Your feed is waiting</div><div class="empty-body">Create circles, add trusted contacts, and ask for recommendations. They\'ll appear here.</div><button class="btn btn-primary" data-action="nav" data-view="circles" style="margin-top:8px;">Build your circles</button></div>';
  } else {
    recentHtml = '<div style="display:flex;flex-direction:column;gap:10px;">' +
      recentRecs.map(function(rec) { return recCardHtml(rec, true); }).join('') +
      '</div>';
  }

  return '<div style="max-width:720px;">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:12px;flex-wrap:wrap;">'
    + '<div>'
    + '<h1 style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:var(--slate-800);">' + greeting + ', ' + esc(name) + '</h1>'
    + '<p style="font-size:13px;color:var(--slate-400);margin-top:4px;">Here\'s what your trusted network recommends</p>'
    + '</div>'
    + '</div>'

    + renderOnboarding()

    + reciprocalNudgeHtml()

    + '<div class="stat-row">'
    + '<div class="stat-card"><div class="stat-value">' + circles.length + '</div><div class="stat-label">Circles</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + totalMembers + '</div><div class="stat-label">Trusted contacts</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + allRecs.length + '</div><div class="stat-label">Saved recs</div></div>'
    + '</div>'

    + homeAskHtml()
    + openAsksHtml()

    + networkFeedHtml()

    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<h2 style="font-size:15px;font-weight:700;color:var(--slate-700);">Recent from your network</h2>'
    + '<button class="btn btn-ghost btn-sm" data-action="nav" data-view="library">View all</button>'
    + '</div>'
    + recentHtml

    + '<div style="margin-top:28px;padding:16px 20px;border-radius:12px;background:linear-gradient(135deg,var(--green-50),#fff);border:1px solid var(--green-100);">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'
    + '<span style="font-size:18px;">💡</span>'
    + '<strong style="font-size:13px;color:var(--green-700);">Taste Match is available</strong>'
    + '</div>'
    + '<p style="font-size:12px;color:var(--slate-500);line-height:1.6;margin-bottom:12px;">Discover anonymous recommendations from people across the network whose tastes align with yours — without ever knowing who they are.</p>'
    + '<button class="btn btn-secondary btn-sm" data-action="nav" data-view="taste-match">Explore Taste Match →</button>'
    + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: CIRCLES
   ═══════════════════════════════════════════════ */

function renderCircles() {
  const userCircles = AppState.isDemoMode ? [] : AppState.userCircles;
  const synCircles = AppState.isDemoMode
    ? AppState.synCircles.filter(function(c) { return c.ownerId === AppState.demoUserId; })
    : AppState.synCircles;

  let html = '<div style="max-width:900px;">';

  if (userCircles.length === 0 && !AppState.isDemoMode) {
    html += '<div style="background:linear-gradient(135deg,var(--green-50),#fff);border:1px solid var(--green-100);border-radius:12px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;gap:14px;">'
      + '<span style="font-size:28px;">✨</span>'
      + '<div>'
      + '<div style="font-size:14px;font-weight:700;color:var(--green-700);margin-bottom:3px;">Create your first circle</div>'
      + '<div style="font-size:12px;color:var(--slate-500);">Organise your trusted contacts by topic — Dining, Travel, Healthcare, and more.</div>'
      + '</div>'
      + '<button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="add-circle" style="margin-left:auto;white-space:nowrap;">+ New circle</button>'
      + '</div>';
  }

  if (userCircles.length > 0 && !AppState.isDemoMode) {
    html += '<h2 style="font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:var(--slate-400);margin-bottom:12px;">YOUR CIRCLES</h2>'
      + '<div class="grid-auto" style="margin-bottom:28px;">'
      + userCircles.map(function(c) { return circleCardHtml(c, false); }).join('')
      + '</div>';
  }

  if (synCircles.length > 0) {
    const label = AppState.isDemoMode ? 'CIRCLES' : 'DEMO CIRCLES';
    html += '<h2 style="font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:var(--slate-400);margin-bottom:12px;">' + label + '</h2>'
      + '<div class="grid-auto">'
      + synCircles.map(function(c) { return circleCardHtml(c, true); }).join('')
      + '</div>';
  }

  html += '</div>';
  return html;
}

function circleCardHtml(c, isDemo) {
  const members = AppState.membersOfCircle(c.id);
  const recs = AppState.allRecs().filter(function(r) { return r.circleId === c.id; });
  return '<div class="circle-card" data-action="nav" data-view="circle-detail" data-circle-id="' + esc(c.id) + '">'
    + '<div class="circle-color-bar" style="background:' + esc(c.color || '#2D6A4F') + ';"></div>'
    + (isDemo ? '<span class="chip" style="position:absolute;top:14px;right:14px;font-size:9px;">DEMO</span>' : '')
    + '<div class="circle-name">' + esc(c.name) + '</div>'
    + '<div class="circle-desc">' + esc(c.description) + '</div>'
    + '<div class="circle-meta">'
    + '<div class="circle-meta-item"><span>👤</span>' + members.length + ' member' + (members.length !== 1 ? 's' : '') + '</div>'
    + '<div class="circle-meta-item"><span>📚</span>' + recs.length + ' rec' + (recs.length !== 1 ? 's' : '') + '</div>'
    + '<div class="circle-meta-item"><span class="chip chip-green" style="font-size:9px;">' + esc(domainLabel(c.domain)) + '</span></div>'
    + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: CIRCLE DETAIL
   ═══════════════════════════════════════════════ */

function renderCircleDetail() {
  const cid = AppState.viewParams.circleId;
  const circle = AppState.circleById(cid);
  if (!circle) return '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Circle not found</div></div>';

  const members = AppState.membersOfCircle(cid);
  const recs = AppState.allRecs().filter(function(r) { return r.circleId === cid; });
  const isDemo = AppState.synCircles.some(function(c) { return c.id === cid; });

  return '<div style="max-width:680px;">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'
    + '<button class="btn btn-ghost btn-sm" data-action="nav" data-view="circles">← Circles</button>'
    + '<div class="chip chip-green">' + esc(domainLabel(circle.domain)) + '</div>'
    + (isDemo ? '<div class="chip">DEMO</div>' : '')
    + '</div>'
    + '<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:24px;">'
    + '<div style="width:6px;border-radius:3px;background:' + esc(circle.color || '#2D6A4F') + ';align-self:stretch;flex-shrink:0;"></div>'
    + '<div>'
    + '<h1 style="font-size:20px;font-weight:800;letter-spacing:-0.3px;margin-bottom:4px;">' + esc(circle.name) + '</h1>'
    + '<p style="font-size:13px;color:var(--slate-400);">' + esc(circle.description) + '</p>'
    + '</div>'
    + '</div>'

    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
    + '<h2 style="font-size:13px;font-weight:700;color:var(--slate-600);">MEMBERS (' + members.length + ')</h2>'
    + (!isDemo ? '<div style="display:flex;gap:6px;">'
        + '<button class="btn btn-ghost btn-sm" data-action="open-circle-link" data-circle-id="' + esc(cid) + '" data-circle-name="' + esc(circle.name) + '">Invite link</button>'
        + '<button class="btn btn-ghost btn-sm" data-action="open-invite" data-circle-name="' + esc(circle.name) + '">✉️ Invite</button>'
        + '<button class="btn btn-ghost btn-sm" data-action="open-modal" data-modal="add-member" data-circle-id="' + esc(cid) + '">+ Add member</button>'
        + '</div>' : '')
    + '</div>'

    + '<div class="card" style="margin-bottom:24px;">'
    + '<div class="card-body">'
    + (members.length === 0
      ? '<div class="empty-state" style="padding:30px;"><div class="empty-icon">👥</div><div class="empty-title">No members yet</div><div class="empty-body">Add trusted contacts to this circle.</div></div>'
      : members.map(function(m) { return memberRowHtml(m); }).join(''))
    + '</div></div>'

    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
    + '<h2 style="font-size:13px;font-weight:700;color:var(--slate-600);">RECOMMENDATIONS (' + recs.length + ')</h2>'
    + '</div>'
    + (recs.length === 0
      ? '<div class="empty-state"><div class="empty-icon">📬</div><div class="empty-title">No recommendations yet</div><div class="empty-body">Ask this circle a question to get started.</div><button class="btn btn-primary btn-sm" data-action="nav" data-view="query" data-circle-id="' + esc(cid) + '" style="margin-top:8px;">Ask this circle</button></div>'
      : '<div style="display:flex;flex-direction:column;gap:10px;">' + recs.map(function(r) { return recCardHtml(r, true); }).join('') + '</div>')
    + '</div>';
}

function memberRowHtml(m) {
  const isSource = m.isExternalSource;
  const sourceTypeLabels = { critic:'Critic', publication:'Publication', newsletter:'Newsletter', expert:'Expert' };
  return '<div class="member-row">'
    + avatarEl(m, 'sm')
    + '<div class="member-info">'
    + '<div class="member-name">' + esc(m.name)
    + (isSource ? ' <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#E5EDE8;color:#56695F;font-weight:600;margin-left:4px;">' + esc(sourceTypeLabels[m.sourceType] || 'Source') + '</span>' : '')
    + '</div>'
    + '<div class="member-sub">' + esc(m.trustBasis || '') + (isSource && m.sourceUrl ? ' · <a href="' + esc(m.sourceUrl) + '" target="_blank" style="color:#1A6FA8;">link ↗</a>' : '') + '</div>'
    + '</div>'
    + '<div class="member-badges">'
    + (isSource
      ? '<span class="chip" style="font-size:10px;">📰 External</span>'
      : '<span class="chip" style="font-size:10px;">' + channelIcon(m.contactMethod) + ' ' + esc(channelLabel(m.contactMethod)) + '</span>')
    + (m.responseRate === 'high' ? '<span class="dot dot-green" title="High response rate"></span>' : '')
    + '</div>'
    + (!AppState.isDemoMode
        ? '<div style="display:flex;gap:2px;flex-shrink:0;margin-left:6px;">'
          + '<button class="btn btn-ghost btn-icon" data-action="edit-member" data-member-id="' + esc(m.id) + '" title="Edit" style="font-size:13px;">✏️</button>'
          + '<button class="btn btn-ghost btn-icon" data-action="remove-member" data-member-id="' + esc(m.id) + '" title="Remove" style="font-size:13px;">🗑</button>'
          + '</div>'
        : '')
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: QUERY
   ═══════════════════════════════════════════════ */

function renderQuery() {
  const circles = AppState.isDemoMode
    ? AppState.synCircles.filter(function(c) { return c.ownerId === AppState.demoUserId; })
    : AppState.userCircles.concat(AppState.synCircles);

  const preCircleId = AppState.viewParams.circleId || '';

  const qs = AppState.queryState;

  if (qs && qs.phase === 'sent') {
    return renderQuerySent(qs);
  }

  // Default selected circle
  const defaultCircleId = preCircleId || (circles.length > 0 ? circles[0].id : '');

  const circlePickerHtml = circles.length === 0
    ? '<div style="font-size:13px;color:#7A9086;padding:12px 0;">You have no circles yet. <button class="btn btn-ghost btn-sm" data-action="nav" data-view="circles">Create one →</button></div>'
    : '<div id="q-circle-picker" style="display:flex;flex-direction:column;gap:8px;">'
      + circles.map(function(c) {
        const members = AppState.membersOfCircle(c.id);
        const isSelected = c.id === defaultCircleId;
        const isDemo = AppState.synCircles.some(function(sc) { return sc.id === c.id; });
        return '<div class="q-circle-option' + (isSelected ? ' selected' : '') + '" data-action="select-circle" data-circle-id="' + esc(c.id) + '" style="'
          + 'display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;cursor:pointer;'
          + 'border:2px solid ' + (isSelected ? esc(c.color || '#217A4B') : '#CDD9D1') + ';'
          + 'background:' + (isSelected ? 'rgba(33,122,75,0.04)' : '#fff') + ';'
          + 'transition:all 140ms ease;">'
          + '<div style="width:10px;height:10px;border-radius:50%;background:' + esc(c.color || '#217A4B') + ';flex-shrink:0;"></div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:13px;font-weight:600;color:#1C2420;">' + esc(c.name) + '</div>'
          + '<div style="font-size:11px;color:#7A9086;">' + members.length + ' member' + (members.length !== 1 ? 's' : '') + (isDemo ? ' · demo' : '') + '</div>'
          + '</div>'
          + (isSelected ? '<svg style="width:16px;height:16px;color:#217A4B;flex-shrink:0;" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : '<div style="width:16px;"></div>')
          + '</div>';
      }).join('')
      + '</div>'
      + '<input type="hidden" id="q-circle" value="' + esc(defaultCircleId) + '">';

  return '<div style="max-width:580px;">'
    + '<h1 style="font-size:20px;font-weight:800;letter-spacing:-0.3px;margin-bottom:6px;">Ask your circles</h1>'
    + '<p style="font-size:13px;color:#7A9086;margin-bottom:24px;">Your question goes to your trusted contacts — not the open internet.</p>'
    + '<div class="card"><div class="card-body" style="display:flex;flex-direction:column;gap:16px;">'

    + '<div class="field">'
    + '<div class="field-label">YOUR QUESTION</div>'
    + '<textarea class="field-input field-textarea" id="q-text" placeholder="e.g. Who\'s the best cardiologist in Tel Aviv? Or: Great restaurant for a birthday dinner in Jaffa?" style="min-height:100px;"></textarea>'
    + '</div>'

    + '<div class="field">'
    + '<div class="field-label">SEND TO</div>'
    + circlePickerHtml
    + '</div>'

    + '<div class="field">'
    + '<div class="field-label">DEGREE</div>'
    + '<div style="display:flex;gap:8px;">'
    + '<button class="btn btn-secondary btn-sm" id="q-deg-1" data-degree="1" style="flex:1;">Degree 1 · Direct contacts only</button>'
    + '<button class="btn btn-ghost btn-sm" id="q-deg-2" data-degree="2" style="flex:1;">Degree 2 · + Contacts of contacts (anonymous)</button>'
    + '</div>'
    + '</div>'

    + '<div id="q-routing" style="background:#F2F6F3;border-radius:8px;padding:12px;display:none;">'
    + '<div style="font-size:12px;color:#56695F;">Routing preview loading…</div>'
    + '</div>'

    + '<button class="btn btn-primary" id="q-send" style="justify-content:center;" data-action="send-query">'
    + '<svg style="width:14px;height:14px;" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>'
    + 'Send query'
    + '</button>'

    + '</div></div>'
    + '</div>';
}

function channelWord(ch) {
  if (ch === 'app') return 'In-app';
  if (ch === 'whatsapp') return 'WhatsApp';
  if (ch === 'email') return 'Email';
  if (ch === 'linkedin') return 'LinkedIn';
  return ch || 'unknown';
}

function renderDeliveryStrip(qs) {
  const ds = qs.deliveries;
  if (!ds || !ds.length) return '';
  const failed = ds.filter(function(d) { return d.status === 'failed'; }).length;
  const summary = failed === 0
    ? 'Sent to all ' + ds.length + ' contacts'
    : (ds.length - failed) + ' sent · ' + failed + ' failed';
  const rows = ds.map(function(d) {
    const isFail = d.status === 'failed';
    const isDelivered = d.status === 'delivered';
    const statusWord = isFail ? 'Failed' : (isDelivered ? 'Delivered' : 'Sent');
    const statusColor = isFail ? '#C0392B' : (isDelivered ? '#217A4B' : '#2D9460');
    let row = '<div class="dstrip-row" style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid #EEF4F0;flex-wrap:wrap;" data-member-id="' + esc(d.member_id) + '">'
      + '<span style="font-size:12px;font-weight:600;color:#1C2420;">' + esc(d.member) + '</span>'
      + '<span style="font-size:11px;color:#7A9086;">' + esc(channelWord(d.channel)) + '</span>'
      + '<span class="dstrip-status" style="margin-left:auto;font-size:11px;font-weight:700;color:' + statusColor + ';">' + statusWord + '</span>';
    if (isFail) {
      row += '<div style="flex-basis:100%;display:flex;flex-direction:column;gap:6px;padding-top:4px;">'
        + '<div style="font-size:11px;color:#C0392B;">Error: ' + esc(d.error || 'unknown') + '</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
        + '<input type="email" class="dstrip-email" placeholder="Add an email address" dir="auto" style="flex:1;min-width:150px;font-size:12px;padding:5px 8px;border:1px solid #CDD9D1;border-radius:8px;" />'
        + '<button class="btn btn-secondary btn-sm" data-action="resend-member" data-member-id="' + esc(d.member_id) + '" data-member-name="' + esc(d.member) + '">Resend</button>'
        + '</div></div>';
    }
    return row + '</div>';
  }).join('');
  return '<div id="q-delivery-strip" style="border-radius:12px;border:1px solid #E5EDE8;background:#fff;margin-bottom:20px;overflow:hidden;">'
    + '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#F6FAF7;">'
    + '<span style="font-size:11px;font-weight:700;color:#56695F;letter-spacing:0.5px;">DELIVERY</span>'
    + '<span style="margin-left:auto;font-size:11px;color:' + (failed ? '#C0392B' : '#2D9460') + ';font-weight:600;">' + summary + '</span>'
    + '</div>' + rows + '</div>';
}

function renderQuerySent(qs) {
  const circle = AppState.circleById(qs.circleId);
  const members = AppState.membersOfCircle(qs.circleId);
  const responseIds = qs.responseIds || [];

  const responsesHtml = qs.responses.filter(function(r, i) { return i < (qs.visibleCount || 0); }).map(function(resp) {
    const member = resp.isAnonymous ? null : AppState.memberById(resp.contactId);
    const alreadySaved = resp.savedToLibrary;
    return '<div class="response-card animate-in" style="padding:16px 18px;">'
      + (member ? avatarEl(member, 'sm') : '<div style="width:32px;height:32px;border-radius:50%;background:#C6EDD9;display:flex;align-items:center;justify-content:center;font-size:14px;">🕵️</div>')
      + '<div class="response-body">'
      + '<div class="response-name">' + (member ? esc(member.name) : 'Anonymous contact (D2)') + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;margin:6px 0 4px;">'

      + '<span style="font-size:13px;font-weight:700;color:#1C2420;">' + esc(resp.recName) + '</span>'
      + (resp.recLoc ? '<span style="font-size:11px;color:#7A9086;">· ' + esc(resp.recLoc) + '</span>' : '')
      + '</div>'
      + '<div style="font-size:12px;color:#3D4F46;line-height:1.6;margin-bottom:10px;">' + esc(resp.recNote) + '</div>'
      + (resp.recTags && resp.recTags.length ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">' + resp.recTags.slice(0,3).map(function(t){return'<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#E5EDE8;color:#56695F;">#'+esc(t)+'</span>';}).join('') + '</div>' : '')
      + respFindLinks(resp.recName, resp.recLoc, qs.circleId)
      + '<div class="response-actions" style="display:flex;gap:8px;flex-wrap:wrap;">'
      + (alreadySaved
        ? '<span style="font-size:12px;color:#2D9460;font-weight:600;">✓ Saved to library</span>'
        : '<button class="btn btn-primary btn-sm" data-action="save-to-library" data-resp-id="' + esc(resp.id) + '">+ Save to Library</button>')
      + (!resp.isAnonymous && member
          ? '<button class="btn btn-secondary btn-sm" data-action="open-reply" data-resp-id="' + esc(resp.id) + '" data-member-name="' + esc(member.name) + '">Reply</button>'
          : '')
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  const progress = qs.responses.length > 0 ? Math.min(100, Math.floor((qs.visibleCount / qs.responses.length) * 100)) : 0;
  const circleColor = circle ? (circle.color || '#217A4B') : '#217A4B';
  const circleLoc = circle && circle.location ? ' · ' + circle.location : '';

  return '<div style="max-width:600px;">'

    // Top nav row
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
    + '<button class="btn btn-ghost btn-sm" data-action="reset-query">← New query</button>'
    + '</div>'

    // Query + circle context card
    + '<div style="border-radius:12px;overflow:hidden;border:1px solid #E5EDE8;margin-bottom:20px;">'
    // Circle name bar — prominent, colored
    + '<div style="background:' + esc(circleColor) + ';padding:10px 18px;display:flex;align-items:center;gap:8px;">'
    + '<svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 20 20" fill="rgba(255,255,255,0.8)"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>'
    + '<span style="font-size:13px;font-weight:700;color:#fff;">' + esc(circle ? circle.name : 'Circle') + '</span>'
    + '<span style="font-size:11px;color:rgba(255,255,255,0.65);">' + esc(circleLoc) + '</span>'
    + '<span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,0.65);">' + members.length + ' contacts reached</span>'
    + '</div>'
    // Query text
    + '<div style="background:#fff;padding:14px 18px;">'
    + '<div style="font-size:14px;font-style:italic;color:#3D4F46;line-height:1.5;">"' + esc(qs.text) + '"</div>'
    + '</div>'
    + '</div>'

    + renderDeliveryStrip(qs)

    // Responses header + progress
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
    + '<span style="font-size:12px;font-weight:700;color:#56695F;letter-spacing:0.5px;">RESPONSES</span>'
    + '<span style="font-size:12px;color:#A8BDAF;">' + (qs.visibleCount || 0) + ' of ' + qs.responses.length + '</span>'
    + '</div>'
    + '<div class="progress-bar" style="margin-bottom:14px;"><div class="progress-fill" id="q-progress" style="width:' + progress + '%;background:' + esc(circleColor) + ';"></div></div>'

    + '<div id="q-responses" style="display:flex;flex-direction:column;gap:0;">'
    + (responsesHtml || '<div style="padding:20px;text-align:center;color:#A8BDAF;font-size:13px;">Waiting for responses…</div>')
    + '</div>'
    + '</div>';
}

function initQueryView() {
  // Degree toggle
  const d1 = document.getElementById('q-deg-1');
  const d2 = document.getElementById('q-deg-2');
  if (!d1 || !d2) return;
  let degree = 1;
  function setDegree(n) {
    degree = n;
    d1.className = 'btn btn-sm ' + (n === 1 ? 'btn-secondary' : 'btn-ghost');
    d2.className = 'btn btn-sm ' + (n === 2 ? 'btn-secondary' : 'btn-ghost');
    updateRouting();
  }
  d1.addEventListener('click', function() { setDegree(1); });
  d2.addEventListener('click', function() { setDegree(2); });

  // Routing preview on circle change (hidden input driven by card clicks)
  const qCircle = document.getElementById('q-circle');
  if (qCircle) {
    qCircle.addEventListener('change', updateRouting);
    updateRouting(); // run immediately on load
  }

  function updateRouting() {
    if (!qCircle) return;
    const cid = qCircle.value;
    const members = AppState.membersOfCircle(cid);
    const routingEl = document.getElementById('q-routing');
    if (!routingEl) return;
    if (members.length === 0) { routingEl.style.display = 'none'; return; }
    routingEl.style.display = 'block';
    const counts = { app: 0, whatsapp: 0, email: 0, linkedin: 0 };
    members.forEach(function(m) { if (counts[m.contactMethod] !== undefined) counts[m.contactMethod]++; });
    const d2extra = degree === 2 ? ' <span class="chip chip-green" style="font-size:10px;">+D2 anonymous</span>' : '';
    routingEl.innerHTML = '<div style="font-size:12px;color:var(--slate-600);font-weight:600;margin-bottom:6px;">'
      + members.length + ' contacts' + d2extra + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + (counts.app ? '<span class="chip">💬 ' + counts.app + ' in-app</span>' : '')
      + (counts.whatsapp ? '<span class="chip">📱 ' + counts.whatsapp + ' WhatsApp</span>' : '')
      + (counts.email ? '<span class="chip">✉️ ' + counts.email + ' email</span>' : '')
      + (counts.linkedin ? '<span class="chip">' + counts.linkedin + ' LinkedIn</span>' : '')
      + '</div>';
  }
}

async function handleSendQuery() {
  const textEl = document.getElementById('q-text');
  const circleEl = document.getElementById('q-circle');
  if (!textEl || !circleEl) return;
  const text = textEl.value.trim();
  if (!text) { toast('Please write a question first.', 'warn'); return; }
  const circleId = circleEl.value;
  if (!circleId) { toast('Please select a circle.', 'warn'); return; }

  const members = AppState.membersOfCircle(circleId);
  if (members.length === 0) { toast('This circle has no members yet.', 'warn'); return; }
  if (AppState.isDemoMode) { toast('Switch back to your account to send real queries.', 'warn'); return; }

  // Heads-up: has someone in this circle asked something similar recently?
  try {
    const sim = await fnPost('check-similar-query', { query_text: text, circle_id: circleId });
    if (sim && sim.duplicate) {
      const ok = confirm((sim.sender_name || 'Someone') + ' asked something similar recently: "' + sim.query_text + '". Send anyway?');
      if (!ok) return;
    }
  } catch (e) { /* non-blocking */ }

  toast('Sending to your circle…');
  let result;
  try {
    result = await fnPost('send-query', { circle_id: circleId, text: text, degree: 1 });
  } catch (e) {
    toast('Could not reach the server. Check your connection.', 'warn'); return;
  }
  if (!result || result.error || !result.query_id) {
    toast('Send failed: ' + ((result && result.error) || 'unknown error'), 'warn'); return;
  }

  const q = { id: result.query_id, circleId: circleId, text: text, degree: 1, status: 'sent',
              sentAt: new Date().toISOString(), responses: [] };
  AppState.userQueries.push(q);
  AppState.queryState = { phase: 'sent', text: text, circleId: circleId, queryId: result.query_id,
                          responses: q.responses, visibleCount: 0,
                          deliveries: result.deliveries || null };
  renderApp();
  if (!result.deliveries && result.failures && result.failures.length) {
    // Fallback for an older send-query without per-member deliveries
    toast("Couldn't reach " + result.failures.length + ' contact(s) — check their contact details.', 'warn');
  }

  // Poll for incoming responses (every 4s, up to 5 minutes)
  if (AppState._respPoll) { clearInterval(AppState._respPoll); }
  let polls = 0;
  AppState._respPoll = setInterval(async function() {
    polls++;
    if (polls > 75) { clearInterval(AppState._respPoll); AppState._respPoll = null; return; }
    try {
      const res = await sb.from('query_responses').select('*')
        .eq('query_id', result.query_id).not('responded_at', 'is', null);
      const rows = res.data || [];
      let changed = false;
      for (const r of rows) {
        if (!q.responses.some(function(x){ return x.id === r.id; })) {
          q.responses.push(mapResponse(r)); changed = true;
        }
      }
      if (changed) {
        if (AppState.queryState && AppState.queryState.queryId === result.query_id) {
          AppState.queryState.visibleCount = q.responses.length;
        }
        renderApp();
      }
    } catch (e) { /* keep polling */ }
  }, 4000);
}

async function handleResendMember(btn) {
  const qs = AppState.queryState;
  if (!qs || !qs.queryId || !qs.deliveries) return;
  const memberId = btn.dataset.memberId;
  const row = btn.closest('.dstrip-row');
  const emailInput = row ? row.querySelector('.dstrip-email') : null;
  const email = emailInput ? emailInput.value.trim() : '';
  if (email && email.indexOf('@') === -1) { toast('That email address doesn\'t look right.', 'warn'); return; }

  btn.disabled = true;
  btn.textContent = 'Resending…';
  let res;
  try {
    const payload = { query_id: qs.queryId, member_id: memberId };
    if (email) payload.email = email;
    res = await fnPost('resend-member', payload);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Resend';
    toast('Could not reach the server. Check your connection.', 'warn');
    return;
  }
  if (!res) {
    btn.disabled = false; btn.textContent = 'Resend';
    toast('Resend failed: unknown error', 'warn');
    return;
  }
  if (res.error && res.ok === undefined) {
    // Validation / auth error — row state unchanged, surface verbatim
    btn.disabled = false; btn.textContent = 'Resend';
    toast('Resend failed: ' + res.error, 'warn');
    return;
  }
  const d = qs.deliveries.find(function(x) { return x.member_id === memberId; });
  if (d) {
    d.status = res.ok ? 'sent' : 'failed';
    d.channel = res.channel || d.channel;
    d.error = res.ok ? null : (res.error || 'unknown');
  }
  renderApp();
  if (res.ok) toast('Resent to ' + (res.member || 'contact') + ' via ' + channelWord(res.channel) + '.');
  else toast('Resend failed: ' + (res.error || 'unknown'), 'warn');
}

async function handleTriageAssign(btn) {
  const recId = btn.dataset.recId;
  const circleId = btn.dataset.circleId;
  const rec = AppState.userRecs.find(function(r) { return r.id === recId; });
  const circle = AppState.circleById(circleId);
  if (!rec || !circle) return;
  const prev = rec.circleId;
  rec.circleId = circleId;
  btn.disabled = true;
  const res = await sb.from('recommendations').update({ circle_id: circleId }).eq('id', recId);
  if (res.error) {
    rec.circleId = prev;
    btn.disabled = false;
    toast('Could not file it: ' + res.error.message, 'warn');
    return;
  }
  renderApp();
  toast('Filed to ' + circle.name + '.');
}

/* ═══════════════════════════════════════════════
   VIEW: QUERIES I ANSWERED
   ═══════════════════════════════════════════════ */

function renderAnswered() {
  if (AppState.isDemoMode) {
    return '<div style="max-width:640px;"><div class="empty-state" style="padding:70px 20px;">'
      + '<div class="empty-icon">💬</div>'
      + '<div class="empty-title">Not available in demo view</div>'
      + '<div class="empty-body">Switch back to your account to see the queries you answered.</div>'
      + '</div></div>';
  }
  if (!AppState._answeredFetched) {
    AppState._answeredFetched = true;
    sb.rpc('my_answered_queries').then(function(r) {
      if (r.error) { console.error('answered', r.error); return; }
      AppState._answered = r.data || [];
      if (AppState.currentView === 'answered') renderApp();
    });
  }
  const rows = AppState._answered;

  const refreshBtn = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
    + '<div style="font-size:13px;color:#7A9086;">' + rows.length + ' answer' + (rows.length !== 1 ? 's' : '') + ' given</div>'
    + '<button class="btn btn-ghost btn-sm" data-action="refresh-answered">↻ Refresh</button>'
    + '</div>';

  if (rows.length === 0) {
    return '<div style="max-width:640px;">' + refreshBtn
      + '<div class="empty-state" style="padding:70px 20px;">'
      + '<div class="empty-icon">💬</div>'
      + '<div class="empty-title">Nothing answered yet</div>'
      + '<div class="empty-body">When someone asks their circle a question and you respond, your answer is kept here — your growing track record as a trusted voice.</div>'
      + '</div></div>';
  }

  const cards = rows.map(function(a) {
    const when = a.responded_at ? new Date(a.responded_at).toLocaleDateString() : '';
    return '<div style="background:#fff;border:1px solid #E5EDE8;border-radius:12px;padding:16px 18px;margin-bottom:10px;">'
      + '<div style="display:flex;align-items:flex-start;gap:12px;">'
      + '<div style="font-size:24px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:#F2F6F3;border-radius:10px;flex-shrink:0;">' + esc(a.rec_emoji || '💬') + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:15px;font-weight:700;color:#1C2420;">' + esc(a.rec_name || '') + '</div>'
      + (a.rec_location ? '<div style="font-size:11px;color:#7A9086;">' + esc(a.rec_location) + '</div>' : '')
      + '<div style="font-size:12px;color:#56695F;margin-top:6px;line-height:1.5;">You recommended this to <b>' + esc(a.asker_name || 'someone') + '</b>'
      + (a.circle_name ? ' (' + esc(a.circle_name) + ' circle)' : '') + '</div>'
      + '<div style="font-size:12px;font-style:italic;color:#7A9086;margin-top:4px;">"' + esc(a.query_text || '') + '"</div>'
      + (a.rec_note ? '<div style="font-size:12px;color:#3D4F46;margin-top:8px;padding:8px 10px;background:#F2F6F3;border-radius:8px;line-height:1.5;">' + esc(a.rec_note) + '</div>' : '')
      + '<div style="font-size:10px;color:#A8BDAF;margin-top:8px;">' + esc(when) + '</div>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  return '<div style="max-width:640px;">' + refreshBtn + cards + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: INBOX — everything that happened while you
   were away: answers, joins, system events
   ═══════════════════════════════════════════════ */

function renderInbox() {
  if (AppState.isDemoMode) {
    return '<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-title">Inbox is a real-account feature</div></div>';
  }
  if (AppState._inboxPrevSeen === null) {
    AppState._inboxPrevSeen = parseInt(localStorage.getItem('tn_inbox_seen') || '0', 10);
  }
  localStorage.setItem('tn_inbox_seen', String(Date.now()));
  updateInboxBadge();

  const items = inboxItems();
  const header = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
    + '<div style="font-size:13px;color:#7A9086;">Answers, joins and events — newest first</div>'
    + '<button class="btn btn-ghost btn-sm" data-action="refresh-inbox">↻ Refresh</button>'
    + '</div>';

  if (!items.length) {
    return header + '<div class="empty-state" style="padding:60px 20px;"><div class="empty-icon">🔔</div>'
      + '<div class="empty-title">Quiet in here</div>'
      + '<div class="empty-body">When people answer your questions or join your circles, it shows up here first.</div></div>';
  }

  const rows = items.map(function(it) {
    const unread = it.ts > (AppState._inboxPrevSeen || 0);
    const when = it.ts ? new Date(it.ts).toLocaleDateString() : '';
    let icon, title, body, actions;
    if (it.kind === 'response') {
      icon = '💬';
      title = esc(it.who) + ' answered your query';
      body = '"' + esc(it.queryText) + '" → recommended <b>' + esc(it.recName) + '</b>';
      actions = '<button class="btn btn-primary btn-sm" data-action="open-sheet" data-query-id="' + esc(it.queryId) + '">📋 Answer sheet</button> '
        + '<button class="btn btn-ghost btn-sm" data-action="nav-history-detail" data-query-id="' + esc(it.queryId) + '">View query</button>';
    } else {
      const _svgs = {
        pick_won: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M6 3h12v6a6 6 0 01-12 0V3z"/><path d="M6 5H3v2a4 4 0 004 4M18 5h3v2a4 4 0 01-4 4"/></svg>',
        invite_accepted: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
        query: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>',
        collection: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
        bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
      };
      icon = it.type === 'pick_won' ? _svgs.pick_won : (it.type === 'invite_accepted' ? _svgs.invite_accepted : (it.type === 'query' ? _svgs.query : ((it.type === 'collection_shared' || it.type === 'collection_saved') ? _svgs.collection : _svgs.bell)));
      title = esc(it.title || 'Notification');
      body = esc(it.body || '');
      if (it.type === 'query' && it.token) {
        actions = '<a class="btn btn-primary btn-sm" style="text-decoration:none;" '
          + 'href="respond.html?t=' + esc(it.token) + '" target="_blank" rel="noopener">Answer</a>';
      } else if (it.type === 'collection_shared' && it.linkUrl && /^https:\/\//.test(it.linkUrl)) {
        actions = '<a class="btn btn-primary btn-sm" style="text-decoration:none;" '
          + 'href="' + esc(it.linkUrl) + '" target="tn_ext" rel="noopener">View list</a>';
      } else {
        actions = it.circleId
          ? '<button class="btn btn-ghost btn-sm" data-action="nav" data-view="circles">View circles</button>'
          : '';
      }
    }
    return '<div class="card" style="margin-bottom:9px;' + (unread ? 'border-left:3px solid #2D9460;' : 'opacity:.78;') + '"><div class="card-body">'
      + '<div style="display:flex;gap:12px;align-items:flex-start;">'
      + '<div style="font-size:20px;flex-shrink:0;">' + icon + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div dir="auto" style="font-size:13.5px;font-weight:700;color:#1C2420;">' + title
      + (unread ? ' <span style="font-size:9px;background:#EBF7F1;color:#1A5235;border-radius:8px;padding:2px 7px;font-weight:800;vertical-align:middle;">NEW</span>' : '') + '</div>'
      + (body ? '<div dir="auto" style="font-size:12px;color:#56695F;margin-top:3px;line-height:1.55;">' + body + '</div>' : '')
      + '<div style="font-size:10.5px;color:#A8BDAF;margin-top:4px;">' + when + '</div>'
      + (actions ? '<div style="margin-top:9px;">' + actions + '</div>' : '')
      + '</div></div></div></div>';
  }).join('');

  return header + '<div style="max-width:600px;">' + rows + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: ANSWER SHEET — circle responses + your own
   library, categorized and corroboration-merged
   ═══════════════════════════════════════════════ */

var SHEET_CAT_ORDER = ['dining','travel','culture','hobbies','healthcare','home','professional','other'];
var SHEET_CAT_EMOJI = { dining:'🍽', travel:'🧳', culture:'🎭', hobbies:'🎯', healthcare:'🩺', home:'🏠', professional:'💼', other:'📌' };

function renderSheet() {
  const queryId = AppState.viewParams.queryId;
  const q = AppState.userQueries.find(function(x) { return x.id === queryId; });
  if (!q) {
    return '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Query not found</div></div>';
  }
  const s = AppState._sheet;
  if (!s || s.queryId !== queryId) {
    AppState._sheet = { queryId: queryId, loading: true };
    fnPost('build-sheet', { query_id: queryId }).then(function(r) {
      if (!AppState._sheet || AppState._sheet.queryId !== queryId) return;
      if (r && !r.error) AppState._sheet = { queryId: queryId, loading: false, data: r };
      else AppState._sheet = { queryId: queryId, loading: false, error: (r && r.error) || 'unknown' };
      if (AppState.currentView === 'sheet') renderApp();
    }).catch(function() {
      AppState._sheet = { queryId: queryId, loading: false, error: 'network' };
      if (AppState.currentView === 'sheet') renderApp();
    });
    return sheetShellHtml(q, '<div style="padding:60px 20px;text-align:center;color:#7A9086;font-size:13px;">🧩 Building your answer sheet — gathering responses, searching your own library, filing everything…</div>');
  }
  if (s.loading) {
    return sheetShellHtml(q, '<div style="padding:60px 20px;text-align:center;color:#7A9086;font-size:13px;">🧩 Building…</div>');
  }
  if (s.error || !s.data) {
    return sheetShellHtml(q, '<div style="padding:40px 20px;text-align:center;">'
      + '<div style="font-size:13px;color:#C0392B;margin-bottom:12px;">Could not build the sheet (' + esc(s.error || '') + ')</div>'
      + '<button class="btn btn-secondary btn-sm" data-action="open-sheet" data-query-id="' + esc(queryId) + '">Try again</button>'
      + '</div>');
  }

  const d = s.data;
  const c = d.counts || {};
  const summary = '<div style="font-size:12px;color:#56695F;margin-bottom:20px;">'
    + (c.total || 0) + ' item' + ((c.total || 0) !== 1 ? 's' : '')
    + (c.from_circle ? ' · ' + c.from_circle + ' from your circle' : '')
    + (c.from_you ? ' · ' + c.from_you + ' you already had' : '')
    + (c.corroborated ? ' · <b style="color:#1A5235;">' + c.corroborated + ' corroborated ✓</b>' : '')
    + (c.hidden ? ' · <span style="color:#A8BDAF;">' + c.hidden + ' loosely-related hidden</span>' : '')
    + (d.engine ? ' <span style="color:#DCE7E0;font-size:10px;">' + esc(d.engine) + '</span>' : '')
    + '</div>'
    + (d.judge_error ? '<div style="font-size:11px;color:#C0392B;margin:-12px 0 16px;">⚠ Smart filtering unavailable this time (' + esc(d.judge_error) + ') — showing everything unfiltered.</div>' : '');

  const groups = {};
  (d.items || []).forEach(function(it, idx) {
    const cat = SHEET_CAT_ORDER.indexOf(it.category) >= 0 ? it.category : 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ it: it, idx: idx });
  });

  let sections = '';
  SHEET_CAT_ORDER.forEach(function(cat) {
    if (!groups[cat]) return;
    sections += '<div style="margin-bottom:22px;">'
      + '<div style="font-size:13px;font-weight:800;color:var(--slate-700);margin-bottom:10px;">'
      + domainLabel(cat).toUpperCase()
      + ' <span style="font-weight:400;color:#A8BDAF;">(' + groups[cat].length + ')</span></div>'
      + groups[cat].map(function(g) { return sheetItemHtml(g.it, g.idx); }).join('')
      + '</div>';
  });
  if (!sections) {
    sections = '<div class="empty-state" style="padding:50px 20px;"><div class="empty-icon">🕰</div>'
      + '<div class="empty-title">Nothing yet</div>'
      + '<div class="empty-body">No responses have arrived and nothing in your library matches — check back after your circle answers.</div></div>';
  }

  return sheetShellHtml(q, summary + sections);
}

function sheetShellHtml(q, inner) {
  return '<div style="max-width:640px;">'
    + '<button class="btn btn-ghost btn-sm" data-action="nav-history-detail" data-query-id="' + esc(q.id) + '" style="margin-bottom:14px;">← Back to query</button>'
    + '<div style="background:linear-gradient(135deg,#0D2B1F,#1A5235);border-radius:14px;padding:18px 20px;margin-bottom:18px;">'
    + '<div style="font-size:11px;color:#9BC7AE;font-weight:700;letter-spacing:0.5px;margin-bottom:6px;">ANSWER SHEET</div>'
    + '<div dir="auto" style="font-size:15px;font-style:italic;color:#fff;line-height:1.5;">"' + esc(q.text) + '"</div>'
    + '</div>'
    + inner
    + '</div>';
}

function sheetItemHtml(it, idx) {
  let sourceLine;
  if (it.from_you && it.recommenders.length) {
    sourceLine = '<span style="color:#1A5235;font-weight:700;">✓ In your library · also recommended by ' + esc(it.recommenders.join(', ')) + '</span>';
  } else if (it.from_you) {
    sourceLine = '<span style="color:#7A9086;">From your library</span>';
  } else {
    sourceLine = '<span style="color:#2D9460;">👤 Recommended by ' + esc(it.recommenders.join(', ')) + '</span>';
  }
  const stars = it.rating ? '<span style="color:#E8A020;font-size:11px;margin-left:6px;">' + '★★★★★'.slice(0, it.rating) + '</span>' : '';
  const notes = (it.notes || []).map(function(n) {
    return '<div dir="auto" style="font-size:12px;color:#3D4F46;line-height:1.6;margin-top:5px;">'
      + '<b style="color:#56695F;">' + esc(n.by) + ':</b> ' + esc(n.note) + '</div>';
  }).join('');
  const links = domFindLinks(it.name || '', it.location || '', it.category || '', it.primary_category || '', it.ai_tags || it.tags || []);
  return '<div style="background:#fff;border:1px solid #E5EDE8;border-radius:12px;padding:14px 16px;margin-bottom:8px;">'
    + '<div style="display:flex;gap:12px;align-items:flex-start;">'
    + tnTile(it.name, cat, null, 40)
    + '<div style="flex:1;min-width:0;">'
    + '<div dir="auto" style="font-size:14px;font-weight:700;color:#1C2420;">' + esc(it.name)
    + (it.location ? ' <span style="font-weight:400;font-size:11px;color:#7A9086;">· ' + esc(it.location) + '</span>' : '') + stars + '</div>'
    + '<div style="font-size:11px;margin-top:3px;">' + sourceLine + '</div>'
    + notes
    + (links ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">' + links + '</div>' : '')
    + '<div style="margin-top:8px;">'
    + (it.from_you
        ? ''
        : '<button class="btn btn-secondary btn-sm" data-action="save-from-sheet" data-sheet-idx="' + idx + '">+ Save to my library</button>')
    + '</div>'
    + '</div></div></div>';
}

async function handleSaveFromSheet(idx) {
  const s = AppState._sheet;
  if (!s || !s.data || !s.data.items || !s.data.items[idx]) return;
  const it = s.data.items[idx];
  const q = AppState.userQueries.find(function(x) { return x.id === s.queryId; });
  const existingCan = findExistingCanonical(it.name, it.location);
  const canId = existingCan ? existingCan.id : uid();
  if (!existingCan) {
    AppState.userCanonicals.push({ id: canId, type: 'place', name: it.name, category: '',
      location: it.location || '', imageEmoji: it.emoji || '📌', externalLinks: {} });
  }
  if (!existingRecFor(canId)) {
    const firstNote = (it.notes && it.notes.length) ? it.notes[0].note : '';
    const viaMember = it.member_id && AppState.userMembers.some(function(m) { return m.id === it.member_id; })
      ? it.member_id : (AppState.userProfile ? AppState.userProfile.id : null);
    AppState.userRecs.push({ id: uid(), canonicalId: canId,
      circleId: q ? q.circleId : '', queryId: s.queryId || null, recommendedBy: viaMember,
      note: firstNote, rating: it.rating || 0, tags: [],
      status: 'saved', isAnonymous: false, degree: 1, sharedToNetwork: shareDefault(),
      date: new Date().toISOString().slice(0, 10) });
    await saveCanonicals();
    await saveRecs();
    requestClassify(canId, firstNote, q ? q.text : '');
  }
  it.from_you = true;
  renderApp();
  toast('"' + it.name + '" saved to your library.');
}

/* ═══════════════════════════════════════════════
   VIEW: QUERY HISTORY
   ═══════════════════════════════════════════════ */

function renderHistory() {
  const queries = AppState.userQueries.slice().reverse(); // newest first

  if (queries.length === 0) {
    return '<div style="max-width:640px;">'
      + '<div class="empty-state" style="padding:80px 20px;">'
      + '<div class="empty-icon">💬</div>'
      + '<div class="empty-title">No queries yet</div>'
      + '<div class="empty-body">Every time you ask your circles a question, it\'ll appear here with all the responses.</div>'
      + '<button class="btn btn-primary" data-action="nav" data-view="query" style="margin-top:12px;">Ask my circles</button>'
      + '</div></div>';
  }

  return '<div style="max-width:640px;">'
    + '<p style="font-size:13px;color:#7A9086;margin-bottom:20px;">'
    + queries.length + ' past quer' + (queries.length === 1 ? 'y' : 'ies')
    + '</p>'
    + '<div style="display:flex;flex-direction:column;gap:8px;">'
    + queries.map(function(q) {
        var circle = AppState.circleById(q.circleId);
        var circleColor = circle ? (circle.color || '#217A4B') : '#CDD9D1';
        var saved = (q.responses || []).filter(function(r) { return r.savedToLibrary; }).length;
        return '<div data-action="nav" data-view="history-detail" data-query-id="' + esc(q.id) + '" style="'
          + 'background:#fff;border-radius:10px;border:1px solid #E5EDE8;'
          + 'display:flex;align-items:center;gap:0;overflow:hidden;cursor:pointer;'
          + 'transition:box-shadow 140ms ease,transform 140ms ease;"'
          + ' onmouseenter="this.style.boxShadow=\'0 3px 12px rgba(0,0,0,0.08)\';this.style.transform=\'translateY(-1px)\'"'
          + ' onmouseleave="this.style.boxShadow=\'\';this.style.transform=\'\'">'
          // color stripe
          + '<div style="width:4px;background:' + esc(circleColor) + ';align-self:stretch;flex-shrink:0;"></div>'
          + '<div style="padding:12px 16px;flex:1;min-width:0;">'
          + '<div style="font-size:13px;font-style:italic;color:#2A342E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">"' + esc(q.text) + '"</div>'
          + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
          + (circle ? '<span style="font-size:11px;font-weight:600;color:' + esc(circleColor) + ';">' + esc(circle.name) + '</span>' : '')
          + '<span style="font-size:11px;color:#A8BDAF;">' + relDate(q.sentAt) + '</span>'
          + '<span style="font-size:11px;color:#56695F;">⚡ ' + (q.responses ? q.responses.length : 0) + ' responses</span>'
          + (saved ? '<span style="font-size:11px;color:#2D9460;">✓ ' + saved + ' saved</span>' : '')
          + '</div>'
          + '</div>'
          + '<div style="padding:0 14px;color:#CDD9D1;">'
          + '<svg style="width:14px;height:14px;" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>'
          + '</div>'
          + '</div>';
    }).join('')
    + '</div></div>';
}

function renderHistoryDetail() {
  var queryId = AppState.viewParams.queryId;
  var q = AppState.userQueries.find(function(x) { return x.id === queryId; });
  if (!q) {
    return '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Query not found</div>'
      + '<button class="btn btn-ghost btn-sm" data-action="nav" data-view="history" style="margin-top:8px;">← History</button></div>';
  }

  var circle = AppState.circleById(q.circleId);
  var circleColor = circle ? (circle.color || '#217A4B') : '#217A4B';
  var circleLoc = circle && circle.location ? ' · ' + circle.location : '';
  var members = AppState.membersOfCircle(q.circleId);

  var responsesHtml = (q.responses && q.responses.length)
    ? q.responses.map(function(resp) {
        var member = resp.isAnonymous ? null : AppState.memberById(resp.contactId);
        var alreadySaved = resp.savedToLibrary;
        return '<div class="response-card" style="padding:16px 18px;">'
          + (member ? avatarEl(member, 'sm') : '<div style="width:32px;height:32px;border-radius:50%;background:#C6EDD9;display:flex;align-items:center;justify-content:center;font-size:14px;">🕵️</div>')
          + '<div class="response-body">'
          + '<div class="response-name">' + (member ? esc(member.name) : 'Anonymous (D2)') + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px;margin:6px 0 4px;">'
    
          + '<span style="font-size:13px;font-weight:700;color:#1C2420;">' + esc(resp.recName || '') + '</span>'
          + (resp.recLoc ? '<span style="font-size:11px;color:#7A9086;">· ' + esc(resp.recLoc) + '</span>' : '')
          + '</div>'
          + '<div style="font-size:12px;color:#3D4F46;line-height:1.6;margin-bottom:10px;">' + esc(resp.recNote || resp.text || '') + '</div>'
          + (resp.recTags && resp.recTags.length ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">'
              + resp.recTags.slice(0,3).map(function(t){return'<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#E5EDE8;color:#56695F;">#'+esc(t)+'</span>';}).join('')
              + '</div>' : '')
          + respFindLinks(resp.recName, resp.recLoc, q.circleId)
          + '<div class="response-actions" style="display:flex;gap:8px;flex-wrap:wrap;">'
          + (alreadySaved
              ? '<span style="font-size:12px;color:#2D9460;font-weight:600;">✓ Saved to library</span>'
              : '<button class="btn btn-primary btn-sm" data-action="save-to-library-history" data-query-id="' + esc(q.id) + '" data-resp-id="' + esc(resp.id) + '">+ Save to Library</button>')
          + (!resp.isAnonymous && member
              ? '<button class="btn btn-secondary btn-sm" data-action="open-reply" data-resp-id="' + esc(resp.id) + '" data-member-name="' + esc(member.name) + '">Reply</button>'
              : '')
          + '</div>'
          + '</div></div>';
      }).join('')
    : '<div style="padding:20px;text-align:center;color:#A8BDAF;font-size:13px;">No responses recorded.</div>';

  return '<div style="max-width:600px;">'
    + '<button class="btn btn-ghost btn-sm" data-action="nav" data-view="history" style="margin-bottom:16px;">← Query history</button>'
    // Circle + query card
    + '<div style="border-radius:12px;overflow:hidden;border:1px solid #E5EDE8;margin-bottom:20px;">'
    + '<div style="background:' + esc(circleColor) + ';padding:10px 18px;display:flex;align-items:center;gap:8px;">'
    + '<svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 20 20" fill="rgba(255,255,255,0.8)"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>'
    + '<span style="font-size:13px;font-weight:700;color:#fff;">' + esc(circle ? circle.name : 'Circle') + '</span>'
    + '<span style="font-size:11px;color:rgba(255,255,255,0.65);">' + esc(circleLoc) + '</span>'
    + '<span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,0.65);">' + relDate(q.sentAt) + ' · ' + members.length + ' contacts</span>'
    + '</div>'
    + '<div style="background:#fff;padding:14px 18px;">'
    + '<div style="font-size:14px;font-style:italic;color:#3D4F46;line-height:1.5;">"' + esc(q.text) + '"</div>'
    + (!AppState.isDemoMode
        ? '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
          + '<button class="btn btn-primary btn-sm" data-action="open-sheet" data-query-id="' + esc(q.id) + '">📋 Answer Sheet — everything in one place</button>'
          + (q.resolvedAt
              ? '<span style="font-size:12px;font-weight:800;color:#1A5235;background:#EBF7F1;border:1px solid #C6EDD9;border-radius:10px;padding:5px 11px;">✓ Decided'
                + (function() {
                    const w = (q.responses || []).find(function(x) { return x.id === q.chosenResponseId; });
                    return w ? ': ' + esc(w.recName || '') : '';
                  })()
                + '</span>'
              : ((q.responses || []).length
                  ? '<button class="btn btn-secondary btn-sm" data-action="open-resolve" data-query-id="' + esc(q.id) + '">✓ Decided</button>'
                  : ''))
          + '</div>'
        : '')
    + '</div>'
    + '</div>'
    // Responses
    + '<div style="font-size:12px;font-weight:700;color:#56695F;letter-spacing:0.5px;margin-bottom:10px;">'
    + 'RESPONSES (' + (q.responses ? q.responses.length : 0) + ')'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:0;">' + responsesHtml + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: LIBRARY
   ═══════════════════════════════════════════════ */

const CAT_HUES = {
  dining:      { fg:'#B84A0B', bg:'#FBEFE6' },
  travel:      { fg:'#2B5FA3', bg:'#E9F0FA' },
  healthcare:  { fg:'#B0325B', bg:'#FAEAF0' },
  home:        { fg:'#6B4FA3', bg:'#F0EBFA' },
  culture:     { fg:'#8A6D1A', bg:'#FAF4E1' },
  hobbies:     { fg:'#1F8A70', bg:'#E6F5F0' },
  professional:{ fg:'#3D4F46', bg:'#ECF1EE' },
  other:       { fg:'#7A9086', bg:'#EFF3F0' }
};
function tnTile(name, cat, imageUrl, px) {
  const size = px || 44;
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    return '<div class="tn-tile" style="width:' + size + 'px;height:' + size + 'px;background-image:url(&quot;' + esc(imageUrl) + '&quot;);"></div>';
  }
  const h = CAT_HUES[cat] || CAT_HUES.other;
  const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return '<div class="tn-tile" style="width:' + size + 'px;height:' + size + 'px;background:' + h.bg + ';color:' + h.fg + ';font-size:' + Math.round(size * 0.44) + 'px;">' + esc(letter) + '</div>';
}

function catChipSmall(cat) {
  if (!cat) return '';
  const h = CAT_HUES[cat] || CAT_HUES.other;
  return '<span class="cat-chip" style="color:' + h.fg + ';background:' + h.bg + ';">' + esc(domainLabel(cat)) + '</span>';
}

// One filter to rule all three library render paths (view render, chip taps, live search)
function libFilterRecs() {
  const allRecs = AppState.allRecs();
  const filter = AppState.activeFilter || 'all';
  const catFilter = AppState.activeCatFilter || 'all';
  const search = (AppState.searchQuery || '').toLowerCase().trim();
  const sem = (search && AppState._semantic && AppState._semantic.q === search) ? AppState._semantic.ids : null;
  const semOnly = {};
  const filtered = allRecs.filter(function(rec) {
    const can = AppState.canonicalById(rec.canonicalId);
    if (!can) return false;
    if (filter !== 'all' && rec.circleId !== filter) return false;
    if (catFilter !== 'all' && (can.primaryCategory || 'other') !== catFilter) return false;
    if (search) {
      const hay = [can.name, can.category, can.location, rec.note,
                   rec.tags ? rec.tags.join(' ') : '',
                   can.aiTags ? can.aiTags.join(' ') : '',
                   can.primaryCategory || ''].join(' ').toLowerCase();
      const kwHit = hay.includes(search);
      const semHit = sem && sem.indexOf(rec.id) >= 0;
      if (!kwHit && !semHit) return false;
      if (!kwHit && semHit) semOnly[rec.id] = true;
    }
    return true;
  });
  return { filtered: filtered, semOnly: semOnly };
}

function libResultsHtml(f) {
  const search = (AppState.searchQuery || '').trim();
  const shimmer = (AppState._semPending && search.length >= 3)
    ? '<div class="sem-shimmer" id="sem-shimmer">also searching by meaning\u2026</div>' : '';
  if (!f.filtered.length) {
    return shimmer + '<div class="empty-state"><div class="empty-icon">\ud83d\udcda</div><div class="empty-title">' + (search ? 'No matches' : 'Nothing here yet') + '</div><div class="empty-body">' + (search ? 'Try different keywords.' : 'Your library fills as you ask questions and save recommendations.') + '</div></div>';
  }
  return shimmer + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + f.filtered.map(function(rec) { return recCardHtml(rec, true, { semantic: !!f.semOnly[rec.id] }); }).join('')
    + '</div>';
}

function libUpdateResultsInPlace() {
  const resultsEl = document.getElementById('lib-results');
  const countEl = document.getElementById('lib-count');
  if (!resultsEl) { renderApp(); return; }
  const f = libFilterRecs();
  if (countEl) countEl.textContent = f.filtered.length + ' recommendation' + (f.filtered.length !== 1 ? 's' : '');
  resultsEl.innerHTML = libResultsHtml(f);
}

function collectionUrl(token) {
  return location.origin + '/collection.html?t=' + encodeURIComponent(token);
}

function renderCollectionsStrip() {
  if (AppState.isDemoMode) return '';
  const cols = AppState.userCollections || [];
  const rows = cols.map(function(c) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid #EEF4F0;">'
      + '<span style="color:#56695F;display:flex;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:700;color:#1C2420;" dir="auto">' + esc(c.title) + '</div>'
      + '<div style="font-size:11px;color:#7A9086;">' + c.recIds.length + ' item' + (c.recIds.length !== 1 ? 's' : '') + '</div>'
      + '</div>'
      + '<button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="collection-send" data-token="' + esc(c.token) + '" data-title="' + esc(c.title) + '">Send to circle</button>'
      + '<button class="btn btn-secondary btn-sm" data-action="copy-collection-link" data-token="' + esc(c.token) + '">Copy link</button>'
      + '<a class="btn btn-ghost btn-sm" href="' + esc(collectionUrl(c.token)) + '" target="tn_ext" rel="noopener">View</a>'
      + '</div>';
  }).join('');
  return '<div id="collections-strip" style="border-radius:12px;border:1px solid #E5EDE8;background:#fff;margin-bottom:20px;overflow:hidden;">'
    + '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#F6FAF7;">'
    + '<span style="font-size:11px;font-weight:700;color:#56695F;letter-spacing:0.5px;">MY COLLECTIONS</span>'
    + '<button class="btn btn-primary btn-sm" data-action="open-modal" data-modal="collection-create" style="margin-left:auto;">+ New collection</button>'
    + '</div>'
    + (rows || '<div style="padding:12px;font-size:12px;color:#7A9086;">Curated lists you can share with one link \u2014 your best-of, ready to send instead of retyping.</div>')
    + '</div>';
}

function modalCollectionSend(params) {
  const token = params && params.token ? params.token : '';
  const title = params && params.title ? params.title : 'this list';
  const circleRows = AppState.userCircles.map(function(c) {
    return '<label style="display:flex;align-items:center;gap:9px;padding:8px 4px;border-bottom:1px solid #F0F5F1;cursor:pointer;font-size:13px;">'
      + '<input type="radio" name="cs-circle" value="' + esc(c.id) + '">'
      + '<span style="width:10px;height:10px;border-radius:3px;background:' + esc(c.color || '#217A4B') + ';"></span>'
      + '<b>' + esc(c.name) + '</b><span style="color:#7A9086;font-size:11px;">' + (c.memberIds ? c.memberIds.length : 0) + ' members</span>'
      + '</label>';
  }).join('');
  return '<div class="modal" style="max-width:460px;">'
    + '<div class="modal-header"><div class="modal-title">Send \u201c' + esc(title) + '\u201d</div>'
    + '<button class="modal-close" data-action="close-modal">\u00d7</button></div>'
    + '<div class="modal-body">'
    + '<div class="field"><div class="field-label">TO WHICH CIRCLE?</div>'
    + '<div style="border:1px solid #E5EDE8;border-radius:10px;padding:4px 8px;">'
    + (circleRows || '<div style="padding:10px;font-size:12px;color:#7A9086;">No circles yet.</div>')
    + '</div></div>'
    + '<p style="font-size:11px;color:#7A9086;line-height:1.6;">Members with Trustnet get an in-app notification. Email members get an email. WhatsApp members get a one-tap button here \u2014 the message goes from <b>your</b> WhatsApp, personally.</p>'
    + '<p id="cs-err" style="font-size:12px;color:#C0392B;display:none;"></p>'
    + '<div id="cs-results"></div>'
    + '<button class="btn btn-primary" id="cs-send-btn" data-action="send-collection" data-token="' + esc(token) + '" data-title="' + esc(title) + '" style="width:100%;justify-content:center;">Send</button>'
    + '</div></div>';
}

async function handleSendCollection(btn) {
  const token = btn.dataset.token || '';
  const title = btn.dataset.title || 'My list';
  let circleId = '';
  document.querySelectorAll('input[name="cs-circle"]').forEach(function(r) { if (r.checked) circleId = r.value; });
  const errEl = document.getElementById('cs-err');
  if (!circleId) { errEl.textContent = 'Pick a circle.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Sending\u2026';
  let res;
  try { res = await fnPost('send-collection', { token: token, circle_id: circleId, share_url: collectionUrl(token) }); }
  catch (e) { btn.disabled = false; btn.textContent = 'Send'; errEl.textContent = 'Could not reach the server.'; errEl.style.display = 'block'; return; }
  if (!res || res.error) {
    btn.disabled = false; btn.textContent = 'Send';
    errEl.textContent = 'Send failed: ' + ((res && res.error) || 'unknown'); errEl.style.display = 'block'; return;
  }
  const waText = '\u201c' + title + '\u201d \u2014 my recommendations list on Trustnet: ' + collectionUrl(token);
  const rows = (res.deliveries || []).map(function(d) {
    let right;
    if (d.status === 'manual' && d.channel === 'whatsapp') {
      const digits = ''; // resolved below from members
      const m = AppState.userMembers.find(function(x) { return x.id === d.member_id; });
      const ph = m && m.contactValue ? String(m.contactValue).replace(/[^0-9]/g, '') : '';
      right = ph
        ? '<a class="btn btn-primary btn-sm" style="text-decoration:none;" target="tn_ext" rel="noopener" href="https://wa.me/' + esc(ph) + '?text=' + encodeURIComponent(waText) + '">Open WhatsApp</a>'
        : '<span style="font-size:11px;color:#C0392B;">no number</span>';
    } else if (d.status === 'sent') {
      right = '<span style="font-size:11px;font-weight:700;color:#2D9460;">Sent</span>';
    } else {
      right = '<span style="font-size:11px;font-weight:700;color:#C0392B;" title="' + esc(d.error || '') + '">Failed: ' + esc(d.error || 'unknown') + '</span>';
    }
    if (d.app_doorway) {
      right = '<span style="font-size:10px;font-weight:700;color:#2D9460;background:#E9F6EE;border-radius:8px;padding:2px 7px;">In-app \u2713</span> ' + right;
    }
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 4px;border-top:1px solid #EEF4F0;">'
      + '<span style="font-size:12px;font-weight:600;flex:1;" dir="auto">' + esc(d.member) + '</span>'
      + '<span style="font-size:10.5px;color:#7A9086;">' + esc(channelWord(d.channel)) + '</span>'
      + right + '</div>';
  }).join('');
  const resEl = document.getElementById('cs-results');
  if (resEl) resEl.innerHTML = '<div style="margin:10px 0 4px;font-size:11px;font-weight:700;color:#56695F;letter-spacing:0.5px;">DELIVERY</div>' + rows;
  btn.textContent = 'Done \u2014 close when finished';
  btn.disabled = false;
  btn.dataset.action = 'close-modal';
  toast('List sent to the circle.');
}

function modalCollectionCreate() {
  const recRows = AppState.userRecs.map(function(rec) {
    const can = AppState.canonicalById(rec.canonicalId);
    if (!can) return '';
    return '<label style="display:flex;align-items:center;gap:9px;padding:7px 4px;border-bottom:1px solid #F0F5F1;cursor:pointer;font-size:13px;" dir="auto">'
      + '<input type="checkbox" class="coll-item-cb" value="' + esc(rec.id) + '">'
      + '<span style="font-size:15px;">' + (can.imageEmoji || '\ud83d\udccc') + '</span>'
      + '<span style="flex:1;min-width:0;"><b>' + esc(can.name) + '</b>'
      + (can.location ? ' <span style="color:#7A9086;font-size:11px;">\u00b7 ' + esc(can.location) + '</span>' : '') + '</span>'
      + '</label>';
  }).join('');
  return '<div class="modal" style="max-width:460px;">'
    + '<div class="modal-header"><div class="modal-title">New collection</div>'
    + '<button class="modal-close" data-action="close-modal">\u00d7</button></div>'
    + '<div class="modal-body">'
    + '<div class="field"><div class="field-label">NAME</div>'
    + '<input class="field-input" id="coll-title" dir="auto" placeholder="e.g. My trusted Tel Aviv doctors" maxlength="80" style="width:100%;"></div>'
    + '<div class="field"><div class="field-label">ONE LINE ABOUT IT (optional)</div>'
    + '<input class="field-input" id="coll-desc" dir="auto" placeholder="15 years of experience in one list" maxlength="140" style="width:100%;"></div>'
    + '<div class="field"><div class="field-label">PICK ITEMS FROM YOUR LIBRARY</div>'
    + '<div style="max-height:240px;overflow-y:auto;border:1px solid #E5EDE8;border-radius:10px;padding:4px 8px;">'
    + (recRows || '<div style="padding:10px;font-size:12px;color:#7A9086;">Your library is empty \u2014 save a few things first.</div>')
    + '</div></div>'
    + '<p id="coll-err" style="font-size:12px;color:#C0392B;display:none;"></p>'
    + '<button class="btn btn-primary" data-action="create-collection" style="width:100%;justify-content:center;">Create &amp; get link</button>'
    + '</div></div>';
}

async function handleCreateCollection(btn) {
  const title = ((document.getElementById('coll-title') || {}).value || '').trim();
  const desc = ((document.getElementById('coll-desc') || {}).value || '').trim();
  const cbs = document.querySelectorAll('.coll-item-cb');
  const recIds = [];
  cbs.forEach(function(cb) { if (cb.checked) recIds.push(cb.value); });
  const errEl = document.getElementById('coll-err');
  if (!title) { errEl.textContent = 'Give the collection a name.'; errEl.style.display = 'block'; return; }
  if (!recIds.length) { errEl.textContent = 'Pick at least one item.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Creating\u2026';
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const ins = await sb.from('collections').insert({
    owner_id: CURRENT_UID, token: token, title: title, description: desc,
  }).select('id').single();
  if (ins.error || !ins.data) {
    btn.disabled = false; btn.textContent = 'Create & get link';
    errEl.textContent = 'Could not create: ' + (ins.error ? ins.error.message : 'unknown'); errEl.style.display = 'block';
    return;
  }
  const itemRows = recIds.map(function(rid, i) { return { collection_id: ins.data.id, rec_id: rid, position: i }; });
  const ii = await sb.from('collection_items').insert(itemRows);
  if (ii.error) {
    btn.disabled = false; btn.textContent = 'Create & get link';
    errEl.textContent = 'Could not add items: ' + ii.error.message; errEl.style.display = 'block';
    return;
  }
  AppState.userCollections.push({ id: ins.data.id, token: token, title: title, description: desc, recIds: recIds });
  closeModal();
  renderApp();
  try { await navigator.clipboard.writeText(collectionUrl(token)); toast('Collection created \u2014 link copied. Send it!'); }
  catch (e) { toast('Collection created. Use Copy link to share it.'); }
}

async function handleCopyCollectionLink(btn) {
  const url = collectionUrl(btn.dataset.token || '');
  try { await navigator.clipboard.writeText(url); toast('Link copied \u2014 paste it anywhere.'); }
  catch (e) { prompt('Copy this link:', url); }
}

async function handleImportCollection(token) {
  localStorage.removeItem('tn_collection_token');
  let res;
  try { res = await fnPost('save-collection', { token: token }); }
  catch (e) { toast('Could not save the shared list \u2014 open the link again to retry.', 'warn'); return; }
  if (!res || res.error) { toast('Could not save the shared list: ' + ((res && res.error) || 'unknown'), 'warn'); return; }
  if (res.own) { toast('That\u2019s your own collection \ud83d\ude0a'); return; }
  try { await loadUserData(); } catch (e) { /* view refresh only */ }
  if (res.imported > 0) {
    toast('Saved ' + res.imported + ' items from ' + (res.curator || 'the list') + ' \u2014 file them from the tray below.');
  } else {
    toast('Everything in ' + (res.curator || 'that') + '\u2019s list is already in your library \u2713');
  }
}

function suggestedCircleFor(can) {
  if (!can) return null;
  const byDomain = AppState.userCircles.find(function(c) { return c.domain && can.primaryCategory && c.domain === can.primaryCategory; });
  return byDomain || null;
}

function renderTriageTray() {
  if (AppState.isDemoMode) return '';
  const unfiled = AppState.userRecs.filter(function(r) { return !r.circleId; });
  if (!unfiled.length || !AppState.userCircles.length) return '';
  const rows = unfiled.map(function(rec) {
    const can = AppState.canonicalById(rec.canonicalId);
    if (!can) return '';
    const sug = suggestedCircleFor(can);
    const ordered = sug
      ? [sug].concat(AppState.userCircles.filter(function(c) { return c.id !== sug.id; }))
      : AppState.userCircles.slice();
    const chips = ordered.map(function(c) {
      const isSug = sug && c.id === sug.id;
      return '<button class="btn btn-sm" data-action="triage-assign" data-rec-id="' + esc(rec.id) + '" data-circle-id="' + esc(c.id) + '"'
        + ' style="border-radius:14px;font-size:11px;padding:4px 12px;'
        + (isSug
          ? 'background:' + esc(c.color || '#217A4B') + ';color:#fff;border:1px solid ' + esc(c.color || '#217A4B') + ';font-weight:700;'
          : 'background:#fff;color:#3D4F46;border:1px solid #CDD9D1;')
        + '">' + (isSug ? '\u2605 ' : '') + esc(c.name) + (isSug ? ' <span style="font-size:9px;opacity:0.85;">Suggested</span>' : '') + '</button>';
    }).join('');
    const icon = tnTile(can.name, can.primaryCategory, can.imageUrl, 34);
    return '<div class="triage-row" style="display:flex;gap:10px;padding:10px 12px;border-top:1px solid #EEF4F0;align-items:flex-start;">'
      + icon
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:700;color:#1C2420;" dir="auto">' + esc(can.name) + (can.location ? ' <span style="font-weight:400;color:#7A9086;font-size:11px;">\u00b7 ' + esc(can.location) + '</span>' : '') + '</div>'
      + (rec.sourceLabel ? '<div style="font-size:10.5px;color:#5B3E9E;font-weight:700;margin:2px 0 2px;" dir="auto">From ' + esc(rec.sourceLabel) + '</div>' : '')
      + (rec.note ? '<div style="font-size:11px;color:#56695F;margin:2px 0 6px;" dir="auto">' + esc(rec.note) + '</div>' : '<div style="height:4px;"></div>')
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + chips + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
  return '<div id="triage-tray" style="border-radius:12px;border:1px solid #E5EDE8;background:#fff;margin-bottom:20px;overflow:hidden;">'
    + '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#FFFBEB;">'
    + '<span style="font-size:11px;font-weight:700;color:#8A6D1A;letter-spacing:0.5px;">NEEDS FILING</span>'
    + '<span style="margin-left:auto;font-size:11px;color:#8A6D1A;">' + unfiled.length + ' saved without a circle</span>'
    + '</div>' + rows + '</div>';
}

function renderLibrary() {
  const allRecs = AppState.allRecs();

  // Build filters: always show all user circles, plus synthetic circles that have recs
  const synCirclesWithRecs = AppState.synCircles.filter(function(c) {
    return allRecs.some(function(r) { return r.circleId === c.id; });
  });
  const filterCircles = AppState.userCircles.concat(synCirclesWithRecs);

  const filter = AppState.activeFilter || 'all';
  const catFilter = AppState.activeCatFilter || 'all';
  const f = libFilterRecs();
  const filtered = f.filtered;

  // category tabs: only categories that actually exist in the library
  const catsPresent = [];
  allRecs.forEach(function(r) {
    const can = AppState.canonicalById(r.canonicalId);
    const c = can && can.primaryCategory ? can.primaryCategory : null;
    if (c && catsPresent.indexOf(c) < 0) catsPresent.push(c);
  });
  catsPresent.sort(function(a, b) {
    const order = ['dining','travel','healthcare','home','culture','hobbies','professional','other'];
    return order.indexOf(a) - order.indexOf(b);
  });
  const catBar = catsPresent.length
    ? '<div class="filter-bar" style="margin-top:-6px;">'
      + '<button class="filter-chip cat-tab' + (catFilter === 'all' ? ' active' : '') + '" data-action="set-cat-filter" data-cat="all">All types</button>'
      + catsPresent.map(function(c) {
        const h = CAT_HUES[c] || CAT_HUES.other;
        const isActive = catFilter === c;
        return '<button class="filter-chip cat-tab' + (isActive ? ' active' : '') + '" data-action="set-cat-filter" data-cat="' + esc(c) + '" style="'
          + (isActive ? '' : 'color:' + h.fg + ';border-left:3px solid ' + h.fg + ';') + '">' + esc(domainLabel(c)) + '</button>';
      }).join('')
      + '</div>'
    : '';

  const filterBar = '<div class="filter-bar">'
    + '<button class="filter-chip' + (filter === 'all' ? ' active' : '') + '" data-action="set-filter" data-filter="all">All</button>'
    + filterCircles.map(function(c) {
      const isActive = filter === c.id;
      const recCount = allRecs.filter(function(r) { return r.circleId === c.id; }).length;
      return '<button class="filter-chip' + (isActive ? ' active' : '') + '" data-action="set-filter" data-filter="' + esc(c.id) + '" style="'
        + (isActive ? '' : 'border-left:3px solid ' + esc(c.color || '#CDD9D1') + ';') + '">'
        + esc(c.name)
        + (recCount > 0 ? ' <span style="font-size:10px;opacity:0.7;">(' + recCount + ')</span>' : '')
        + '</button>';
    }).join('')
    + '</div>';

  const shareBtn = ''; // retired v0.18.1 — Collections (the strip above) is the real share-a-list

  const searchBar = '<div style="display:flex;gap:10px;margin-bottom:20px;">'
    + '<div class="search-wrap"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg><input class="search-input" id="lib-search" placeholder="Search recommendations…" value="' + esc(AppState.searchQuery) + '"></div>'
    + shareBtn
    + '</div>';

  const cardsHtml = libResultsHtml(f);

  return '<div style="max-width:720px;">'
    + renderCollectionsStrip()
    + renderTriageTray()
    + filterBar
    + catBar
    + searchBar
    + '<div id="lib-count" style="font-size:12px;color:#7A9086;margin-bottom:16px;">' + filtered.length + ' recommendation' + (filtered.length !== 1 ? 's' : '') + '</div>'
    + '<div id="lib-results">' + cardsHtml + '</div>'
    + '</div>';
}

function recCardHtml(rec, clickable, opts) {
  const can = AppState.canonicalById(rec.canonicalId);
  if (!can) return '';
  var recommender = rec.recommendedBy ? AppState.memberById(rec.recommendedBy) : null;
  if (!recommender && rec.recommendedBy && AppState.userProfile && rec.recommendedBy === AppState.userProfile.id) {
    recommender = AppState.userProfile;
  }
  const action = clickable ? 'data-action="nav" data-view="rec-detail" data-rec-id="' + esc(rec.id) + '"' : '';
  const iconHtml = tnTile(can.name, can.primaryCategory, can.imageUrl, 44);
  return '<div class="rec-card" ' + action + '>'
    + iconHtml
    + '<div class="rec-body">'
    + '<div class="rec-name">' + esc(can.name) + '</div>'
    + '<div class="rec-cat">' + esc(can.category || '') + (can.location ? ' · ' + can.location : '') + '</div>'
    + (rec.note ? '<div class="rec-note">' + esc(rec.note) + '</div>' : '')
    + '<div class="rec-footer">'
    + catChipSmall(can.primaryCategory)
    + (rec.rating ? stars(rec.rating) : '')
    + (recommender ? '<span class="rec-by">via ' + esc(recommender.name) + '</span>' : (rec.isAnonymous ? '<span class="rec-by">Anonymous (D2)</span>' : ''))
    + '<span class="rec-status">' + statusDot(rec.status) + ' ' + esc(rec.status || 'saved') + '</span>'
    + (rec.tags && rec.tags.length ? '<span style="font-size:10px;color:var(--slate-300);">' + rec.tags.slice(0,3).map(function(t){return'#'+esc(t);}).join(' ') + '</span>' : '')
    + (rec.sourceLabel ? '<span style="font-size:9.5px;background:#F3EEFB;color:#5B3E9E;padding:2px 8px;border-radius:9px;font-weight:700;" dir="auto">' + esc(rec.sourceLabel) + '</span>' : '')
    + (opts && opts.semantic ? '<span class="sem-tag">matched by meaning</span>' : '')
    + '</div>'
    + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: REC DETAIL
   ═══════════════════════════════════════════════ */

function domFindLinks(name, loc, dom, cat, tags) {
  if (!name) return '';
  // The item's own AI category outranks the circle's domain (a ski-gear brand
  // in a travel-typed circle must NOT get a Booking button — v0.17.1)
  const eff = cat || dom || '';
  // Google query disambiguator (v0.17.4): location > first AI tag > a category
  // word that humans actually search. Internal drawer names like "hobbies"
  // never leak into queries — tags ("ski") are the real search words.
  const tag0 = (tags && tags.length) ? String(tags[0]) : '';
  const SEARCHABLE_CATS = { dining: 1, travel: 1, healthcare: 1, professional: 1, culture: 1 };
  const disamb = loc ? loc : (tag0 ? tag0 : (SEARCHABLE_CATS[eff] ? eff : ''));
  const gq = encodeURIComponent(name + (disamb ? ' ' + disamb : ''));
  const q = encodeURIComponent(name + (loc ? ' ' + loc : ''));
  const qn = encodeURIComponent(name);
  let out = '';
  if (eff === 'culture') {
    out += extLink('https://www.amazon.com/s?k=' + qn, 'Amazon');
  } else if (eff === 'travel') {
    out += extLink('https://www.booking.com/searchresults.html?ss=' + q, 'Booking');
    out += extLink('https://www.google.com/maps/search/?api=1&query=' + q, 'Maps');
  } else if (eff === 'professional') {
    out += extLink('https://www.linkedin.com/search/results/all/?keywords=' + qn, 'LinkedIn');
  } else if (eff === 'dining' || eff === 'healthcare' || eff === 'home') {
    if (loc) out += extLink('https://www.google.com/maps/search/?api=1&query=' + q, 'Maps');
  } else {
    // hobbies / products / other: Maps only when there is an actual place
    if (loc) out += extLink('https://www.google.com/maps/search/?api=1&query=' + q, 'Maps');
  }
  out += extLink('https://www.google.com/search?q=' + gq, 'Google');
  return out;
}

function respFindLinks(name, loc, circleId) {
  const c = circleId ? AppState.circleById(circleId) : null;
  const links = domFindLinks(name, loc, c ? c.domain : '', '', arguments.length > 3 ? arguments[3] : []);
  if (!links) return '';
  return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' + links + '</div>';
}

function networkFeedHtml() {
  if (AppState.isDemoMode) return '';
  if (!AppState._feedFetched) {
    AppState._feedFetched = true;
    sb.rpc('network_feed').then(function(res) {
      if (res.error) { console.error('feed', res.error); return; }
      AppState._feed = res.data || [];
      if (AppState.currentView === 'home') renderApp();
    });
  }
  const items = AppState._feed;
  const header = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<h2 style="font-size:15px;font-weight:700;color:var(--slate-700);">Shared by people you trust</h2>'
    + '<button class="btn btn-ghost btn-sm" data-action="refresh-feed">↻ Refresh</button>'
    + '</div>';
  if (items.length === 0) {
    return header
      + '<div style="font-size:12px;color:#7A9086;padding:14px 16px;background:#F7FAF8;border:1px dashed #DCE7E0;border-radius:10px;margin-bottom:26px;line-height:1.6;">Nothing shared yet. When someone who trusts you (and whom you trust back in the same domain) shares a recommendation to their network, it appears here.</div>';
  }
  const cards = items.slice(0, 10).map(function(f, i) {
    const inLib = AppState.userRecs.some(function(r) { return r.canonicalId === f.canonical_id; });
    const stars = f.rating ? '★★★★★'.slice(0, f.rating) + '☆☆☆☆☆'.slice(0, 5 - f.rating) : '';
    const links = domFindLinks(f.can_name || '', f.can_location || '', f.domain || '', f.primary_category || '', f.ai_tags || []);
    return '<div class="card" style="margin-bottom:10px;"><div class="card-body">'
      + '<div style="display:flex;gap:12px;align-items:flex-start;">'
      + '<div style="font-size:24px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--slate-50);border-radius:10px;flex-shrink:0;">' + esc(f.can_emoji || '📌') + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div dir="auto" style="font-size:14px;font-weight:700;color:#1C2420;">' + esc(f.can_name || '') + '</div>'
      + '<div style="font-size:11px;color:#7A9086;">' + esc(f.can_category || '') + (f.can_location ? ' · ' + esc(f.can_location) : '') + '</div>'
      + '<div style="font-size:11px;color:#2D9460;margin-top:4px;">📣 ' + esc(f.recommender_name || 'Someone') + ' shared this from their ' + esc(f.circle_name || f.domain || '') + ' circle</div>'
      + (stars ? '<div style="font-size:11px;color:#E8A020;margin-top:3px;">' + stars + '</div>' : '')
      + (f.note ? '<div dir="auto" style="font-size:12px;color:#3D4F46;line-height:1.6;margin-top:6px;">' + esc(f.note) + '</div>' : '')
      + (links ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">' + links + '</div>' : '')
      + '<div style="margin-top:10px;">'
      + (inLib
          ? '<span style="font-size:12px;color:#2D9460;font-weight:600;">✓ In your library</span>'
          : '<button class="btn btn-primary btn-sm" data-action="save-from-feed" data-feed-idx="' + i + '">+ Save to my library</button>')
      + '</div>'
      + '</div></div></div></div>';
  }).join('');
  return header + '<div style="margin-bottom:26px;">' + cards + '</div>';
}

function homeAskHtml() {
  return '<div style="background:linear-gradient(135deg,#0D2B1F,#1A5235);border-radius:16px;padding:16px 18px;margin-bottom:22px;">'
    + '<div style="font-size:10px;font-weight:800;letter-spacing:0.8px;color:#9BC7AE;margin-bottom:9px;">ASK PEOPLE YOU TRUST</div>'
    + '<div style="display:flex;gap:9px;">'
    + '<input id="home-ask" placeholder="What do you need? e.g. best dentist in Ramat Gan…" '
    + 'style="flex:1;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.22);border-radius:11px;color:#fff;font-size:13px;padding:11px 13px;outline:none;">'
    + '<button class="btn btn-primary" data-action="home-ask-go" style="flex-shrink:0;">Ask →</button>'
    + '</div></div>';
}

function handleHomeAsk() {
  const el = document.getElementById('home-ask');
  const draft = el ? el.value.trim() : '';
  showView('query');
  const q = document.getElementById('q-text');
  if (q && draft) q.value = draft;
}

function openAsksHtml() {
  if (AppState.isDemoMode) return '';
  const open = AppState.userQueries
    .filter(function(q) { return !q.resolvedAt; })
    .sort(function(a, b) { return new Date(b.sentAt) - new Date(a.sentAt); })
    .slice(0, 4);
  if (!open.length) return '';
  const cards = open.map(function(q) {
    const circle = AppState.circleById(q.circleId);
    const answered = (q.responses || []).length;
    return '<div class="card" style="margin-bottom:9px;border:1.5px solid #C6EDD9;background:linear-gradient(180deg,#fff,#FBFDFC);"><div class="card-body">'
      + '<div dir="auto" style="font-size:14px;font-weight:700;color:#1C2420;font-style:italic;">"' + esc(q.text) + '"</div>'
      + '<div style="font-size:11px;color:#7A9086;margin-top:3px;">'
      + esc(circle ? circle.name : '') + ' circle · '
      + (answered ? '<b style="color:#2D9460;">' + answered + ' answered</b>' : 'waiting for answers')
      + ' · ' + relDate(q.sentAt) + '</div>'
      + '<div style="margin-top:10px;display:flex;gap:7px;flex-wrap:wrap;">'
      + '<button class="btn btn-primary btn-sm" data-action="open-sheet" data-query-id="' + esc(q.id) + '">📋 Answer sheet</button>'
      + (answered ? '<button class="btn btn-secondary btn-sm" data-action="open-resolve" data-query-id="' + esc(q.id) + '">✓ Decided</button>' : '')
      + '<button class="btn btn-ghost btn-sm" data-action="nav-history-detail" data-query-id="' + esc(q.id) + '">View</button>'
      + '</div>'
      + '</div></div>';
  }).join('');
  return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
    + '<h2 style="font-size:15px;font-weight:700;color:var(--slate-700);">Your open asks</h2></div>'
    + '<div style="margin-bottom:24px;">' + cards + '</div>';
}

async function handleResolveQuery(queryId, responseId) {
  const q = AppState.userQueries.find(function(x) { return x.id === queryId; });
  if (!q) return;
  const r = await sb.rpc('resolve_query', {
    p_query_id: queryId,
    p_response_id: responseId || null
  });
  if (r && r.error) {
    console.error('resolve_query', r.error);
    toast('Could not mark it: ' + (r.error.message || r.error.code || 'unknown error'), 'warn');
    return;
  }
  const verdict = (r && r.data) || {};
  if (verdict.ok === false) {
    console.error('resolve_query verdict', verdict);
    toast('Could not mark it: ' + (verdict.error || 'unknown'), 'warn');
    return;
  }
  if (verdict.note_error) console.warn('thank-you note skipped:', verdict.note_error);
  q.resolvedAt = new Date().toISOString();
  q.chosenResponseId = responseId || null;
  closeModal();
  if (responseId) {
    const resp = (q.responses || []).find(function(x) { return x.id === responseId; });
    const m = resp && !resp.isAnonymous ? AppState.memberById(resp.contactId) : null;
    toast('Decided ✓' + (m ? ' — ' + m.name + ' will hear their pick won 🏆' : ''));
  } else {
    toast('Query closed.');
  }
  renderApp();
}

function mapQueryRow(q) {
  return { id: q.id, circleId: q.circle_id, text: q.text, degree: q.degree || 1,
    status: q.status || 'sent', sentAt: q.sent_at,
    resolvedAt: q.resolved_at || null, chosenResponseId: q.chosen_response_id || null,
    responses: (q.query_responses || []).filter(function(r) { return r.responded_at; }).map(mapResponse) };
}

function mergeLiveData(queryRows, notifRows) {
  if (queryRows) {
    const prevIds = {};
    AppState.userQueries.forEach(function(q) {
      (q.responses || []).forEach(function(r) { prevIds[r.id] = true; });
    });
    const mapped = queryRows.map(mapQueryRow);
    const fresh = [];
    mapped.forEach(function(q) {
      (q.responses || []).forEach(function(r) { if (!prevIds[r.id]) fresh.push({ q: q, r: r }); });
    });
    AppState.userQueries = mapped;
    if (fresh.length) {
      const f = fresh[0];
      const m = f.r.isAnonymous ? null : AppState.memberById(f.r.contactId);
      toast('💬 New answer' + (m ? ' from ' + m.name : '')
        + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' more)' : '') + ' — it\'s in your inbox');
      if (['home', 'inbox', 'history', 'history-detail', 'sheet'].indexOf(AppState.currentView) >= 0) renderApp();
    }
  }
  if (notifRows) {
    const prevN = {};
    AppState._notifications.forEach(function(n) { if (n.id) prevN[n.id] = true; });
    const freshN = notifRows.filter(function(n) { return n.id && !prevN[n.id]; });
    const seeded = AppState._notifSeeded;
    AppState._notifications = notifRows;
    AppState._notifSeeded = true;
    if (seeded && freshN.length) {
      const n = freshN[0];
      if (n.type === 'query') {
        toast((n.title || 'Someone is asking for a recommendation') + ' — answer from your Inbox');
      } else if (n.type === 'pick_won') {
        toast((n.title || 'Your recommendation won!'));
      } else if (n.type === 'invite_accepted') {
        toast((n.title || 'Someone joined your circle'));
      } else if (n.type === 'collection_shared' || n.type === 'collection_saved') {
        toast((n.title || 'A list update — check your Inbox'));
      } else {
        toast('🔔 ' + (n.title || 'New activity — check your Inbox'));
      }
      if (AppState.currentView === 'inbox' || AppState.currentView === 'home') renderApp();
    } else if (freshN.length && AppState.currentView === 'inbox') {
      renderApp();
    }
  }
  updateInboxBadge();
}

async function refreshLive() {
  if (AppState.isDemoMode || !CURRENT_UID || document.hidden) return;
  try {
    const qs = await sb.from('queries').select('*, query_responses!query_id(*)')
      .eq('sent_by', CURRENT_UID).order('sent_at');
    const ns = await sb.from('notifications')
      .select('id,type,title,body,circle_id,actor_name,created_at,response_token,query_id')
      .eq('user_id', CURRENT_UID).order('created_at', { ascending: false }).limit(40);
    mergeLiveData(qs.data || null, ns.data || null);
  } catch (e) { /* next beat */ }
}

function inboxItems() {
  const items = [];
  (AppState._notifications || []).forEach(function(n) {
    items.push({ kind: 'notif', type: n.type || 'note', title: n.title || '', body: n.body || '', linkUrl: n.link_url || '',
      circleId: n.circle_id || null, token: n.response_token || null,
      ts: new Date(n.created_at).getTime() || 0 });
  });
  (AppState.userQueries || []).forEach(function(q) {
    (q.responses || []).forEach(function(r) {
      if (!r.respondedAt && r.status !== 'responded') return;
      const m = r.isAnonymous ? null : AppState.memberById(r.contactId);
      items.push({ kind: 'response', queryId: q.id, queryText: q.text || '',
        who: r.isAnonymous ? 'Someone (anonymous)' : (m ? m.name : 'Someone'),
        recName: r.recName || '',
        ts: new Date(r.respondedAt || 0).getTime() || 0 });
    });
  });
  items.sort(function(a, b) { return b.ts - a.ts; });
  return items.slice(0, 40);
}

function updateInboxBadge() {
  if (AppState.isDemoMode) return;
  const seen = parseInt(localStorage.getItem('tn_inbox_seen') || '0', 10);
  const unread = inboxItems().filter(function(it) { return it.ts > seen; }).length;
  const el = document.getElementById('sb-inbox-count');
  if (el) { el.textContent = String(unread); el.style.display = unread ? '' : 'none'; }
  const mb = document.getElementById('mb-inbox-count');
  if (mb) { mb.textContent = String(unread); mb.style.display = unread ? '' : 'none'; }
}

function updateMobileTabs() {
  const map = {
    home: 'mtab-home',
    circles: 'mtab-circles', 'circle-detail': 'mtab-circles',
    inbox: 'mtab-inbox',
    library: 'mtab-library', 'rec-detail': 'mtab-library',
  };
  const active = map[AppState.currentView] || null;
  ['mtab-home', 'mtab-circles', 'mtab-inbox', 'mtab-library'].forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === active) el.classList.add('on'); else el.classList.remove('on');
  });
}

function ensureNotificationsFetched() {
  if (AppState.isDemoMode || AppState._notifFetched || !CURRENT_UID) return;
  AppState._notifFetched = true;
  sb.from('notifications')
    .select('id,type,title,body,circle_id,actor_name,created_at,response_token,query_id')
    .eq('user_id', CURRENT_UID)
    .order('created_at', { ascending: false })
    .limit(40)
    .then(function(res) {
      AppState._notifications = res.data || [];
      AppState._notifSeeded = true;
      updateInboxBadge();
      if (AppState.currentView === 'inbox') renderApp();
    });
}

function findExistingCanonical(name, loc) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  const l = (loc || '').trim().toLowerCase();
  return AppState.userCanonicals.find(function(c) {
    if ((c.name || '').trim().toLowerCase() !== n) return false;
    const cl = (c.location || '').trim().toLowerCase();
    return !l || !cl || cl === l;
  }) || null;
}

function existingRecFor(canonicalId) {
  return AppState.userRecs.find(function(r) { return r.canonicalId === canonicalId; }) || null;
}

function requestClassify(canonicalId, note, context) {
  if (AppState.isDemoMode) return;
  const can = AppState.canonicalById(canonicalId);
  if (!can || can.primaryCategory || can._classifying) return;
  can._classifying = true;
  fnPost('classify-rec', { canonical_id: canonicalId, note: note || '', context: context || '' }).then(function(r) {
    can._classifying = false;
    if (r && r.error) {
      can._classifyFailed = r.error;
      if (!AppState._classErrToasted) {
        AppState._classErrToasted = true;
        toast('AI filing failed: ' + r.error, 'warn');
      }
      if (AppState.currentView === 'rec-detail') renderApp();
      return;
    }
    if (r && r.category) {
      can._classifyFailed = null;
      can.primaryCategory = r.category;
      can.aiTags = r.tags || [];
      if (AppState.currentView === 'rec-detail' || AppState.currentView === 'library') renderApp();
    }
  }).catch(function() { can._classifying = false; });
}

function catChipHtml(can, rec) {
  if (AppState.isDemoMode || !can) return '';
  if (!can.primaryCategory) {
    var chipCtx = '';
    if (rec && rec.queryId) {
      var oq = AppState.userQueries.find(function(x) { return x.id === rec.queryId; });
      if (oq) chipCtx = oq.text;
    }
    if (can._classifyFailed) {
      return '<div style="font-size:11px;color:#C0392B;margin-bottom:10px;">🏷 Filing failed '
        + '<button class="btn btn-ghost btn-sm" data-action="retry-classify" data-can-id="' + esc(can.id) + '" style="font-size:11px;padding:2px 8px;">retry</button></div>';
    }
    requestClassify(can.id, (rec && rec.note) || '', chipCtx);
    return '<div style="font-size:11px;color:#A8BDAF;margin-bottom:10px;">🏷 Filing this item…</div>';
  }
  return '<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
    + '<span style="font-size:11px;background:#EBF7F1;color:#1A5235;padding:3px 10px;border-radius:10px;font-weight:600;">🏷 ' + esc(domainLabel(can.primaryCategory)) + '</span>'
    + (can.aiTags && can.aiTags.length
        ? can.aiTags.slice(0, 5).map(function(t) { return '<span style="font-size:10px;color:#7A9086;">#' + esc(t) + '</span>'; }).join(' ')
        : '')
    + '<button class="btn btn-ghost btn-sm" data-action="fix-category" data-can-id="' + esc(can.id) + '" style="font-size:11px;padding:2px 8px;">change</button>'
    + '</div>';
}

function shareDefault() {
  return !AppState.userProfile || AppState.userProfile.shareByDefault !== false;
}

function shareRowHtml(rec) {
  if (AppState.isDemoMode) return '';
  if (!AppState.userRecs.some(function(x) { return x.id === rec.id; })) return '';
  return '<div style="margin-top:12px;">'
    + (rec.sharedToNetwork
      ? '<button class="btn btn-secondary btn-sm" data-action="toggle-share-rec" data-rec-id="' + esc(rec.id) + '">✓ Shared to your network — click to unshare</button>'
      : '<button class="btn btn-primary btn-sm" data-action="toggle-share-rec" data-rec-id="' + esc(rec.id) + '">📣 Share with people who trust me</button>')
    + '<div style="font-size:11px;color:#7A9086;margin-top:5px;">Sharing shows this recommendation to people who have you in a matching circle. You can unshare anytime.</div>'
    + '</div>';
}

function extLink(url, label) {
  return '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none;">' + label + '</a>';
}

function renderRecDetail() {
  const recId = AppState.viewParams.recId;
  const rec = AppState.allRecs().find(function(r) { return r.id === recId; });
  if (!rec) return '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Not found</div></div>';
  const can = AppState.canonicalById(rec.canonicalId);
  if (!can) return '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Not found</div></div>';
  const recommender = rec.recommendedBy ? AppState.memberById(rec.recommendedBy) : null;
  const circle = AppState.circleById(rec.circleId);

  const allRecsForCanon = AppState.allRecs().filter(function(r) { return r.canonicalId === can.id; });

  const statusColors = { available:'var(--green-500)', visited:'var(--amber)', saved:'var(--blue)', dismissed:'var(--slate-300)' };

  let linksHtml = '';
  // Links stored on the canonical itself (when known)
  if (can.websiteUrl) linksHtml += extLink(can.websiteUrl, '🌐 Website');
  if (can.googleUrl) linksHtml += extLink(can.googleUrl, 'Google Maps');
  if (can.linkedinUrl) linksHtml += extLink(can.linkedinUrl, 'LinkedIn');
  // Smart "find it" links, routed by the circle's domain
  const findQ = encodeURIComponent(can.name + (can.location ? ' ' + can.location : ''));
  const findName = encodeURIComponent(can.name);
  // Item's own category first; circle domain is only a fallback (v0.17.1)
  const findDom = can.primaryCategory || (circle && circle.domain) || (can.type === 'content' ? 'culture' : '');
  const findTag0 = (can.aiTags && can.aiTags.length) ? String(can.aiTags[0]) : (rec.tags && rec.tags.length ? String(rec.tags[0]) : '');
  const FIND_SEARCHABLE = { dining: 1, travel: 1, healthcare: 1, professional: 1, culture: 1 };
  const findDis = can.location ? can.location : (findTag0 ? findTag0 : (FIND_SEARCHABLE[findDom] ? findDom : ''));
  const findGq = encodeURIComponent(can.name + (findDis ? ' ' + findDis : ''));
  if (findDom === 'culture' || can.type === 'content') {
    linksHtml += extLink('https://www.amazon.com/s?k=' + findName, 'Find on Amazon');
  } else if (findDom === 'travel') {
    linksHtml += extLink('https://www.booking.com/searchresults.html?ss=' + findQ, 'Find on Booking');
    if (!can.googleUrl) linksHtml += extLink('https://www.google.com/maps/search/?api=1&query=' + findQ, 'Google Maps');
  } else if (findDom === 'professional') {
    if (!can.linkedinUrl) linksHtml += extLink('https://www.linkedin.com/search/results/all/?keywords=' + findName, 'LinkedIn search');
  } else if (findDom === 'dining' || findDom === 'healthcare' || findDom === 'home') {
    if (!can.googleUrl && can.location) linksHtml += extLink('https://www.google.com/maps/search/?api=1&query=' + findQ, 'Google Maps');
  } else {
    if (!can.googleUrl && can.location) linksHtml += extLink('https://www.google.com/maps/search/?api=1&query=' + findQ, 'Google Maps');
  }
  linksHtml += extLink('https://www.google.com/search?q=' + findGq, 'Search Google');

  return '<div style="max-width:640px;">'
    + '<button class="btn btn-ghost btn-sm" data-action="nav" data-view="library" style="margin-bottom:16px;">← Library</button>'

    + '<div class="card" style="margin-bottom:20px;">'
    + '<div class="card-body">'
    + '<div style="display:flex;gap:14px;align-items:flex-start;">'
    + tnTile(can.name, can.primaryCategory, can.imageUrl, 60)
    + '<div style="flex:1;">'
    + '<div style="font-size:20px;font-weight:800;letter-spacing:-0.3px;margin-bottom:3px;">' + esc(can.name) + '</div>'
    + '<div style="font-size:13px;color:var(--slate-400);margin-bottom:10px;">' + esc(can.category || '') + (can.location ? ' · ' + esc(can.location) : '') + '</div>'
    + catChipHtml(can, rec)
    + (linksHtml ? '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + linksHtml + '</div>' : '')
    + shareRowHtml(rec)
    + '</div>'
    + '</div>'
    + '</div></div>'

    + '<h2 style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:var(--slate-400);text-transform:uppercase;margin-bottom:12px;">' + allRecsForCanon.length + ' RECOMMENDATION' + (allRecsForCanon.length !== 1 ? 'S' : '') + '</h2>'
    + allRecsForCanon.map(function(r) {
      const rec2 = r;
      // Resolve recommender: check members first, then user profile (self-added recs)
      var rcm = rec2.recommendedBy ? AppState.memberById(rec2.recommendedBy) : null;
      if (!rcm && rec2.recommendedBy && AppState.userProfile && rec2.recommendedBy === AppState.userProfile.id) {
        rcm = AppState.userProfile;
      }
      const rc = AppState.circleById(rec2.circleId);
      return '<div class="card" style="margin-bottom:10px;"><div class="card-body">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
        + (rcm ? avatarEl(rcm, 'sm') : '<div class="avatar avatar-sm" style="background:#A8BDAF;">?</div>')
        + '<div>'
        + '<div style="font-size:13px;font-weight:600;">' + (rcm ? esc(rcm.name) : (rec2.isAnonymous ? 'Anonymous (D2)' : '—')) + '</div>'
        + '<div style="font-size:11px;color:var(--slate-400);">' + (rc ? 'via ' + esc(rc.name) : '') + ' · ' + relDate(rec2.date) + '</div>'
        + '</div>'
        + (rec2.rating ? '<div style="margin-left:auto;">' + stars(rec2.rating) + '</div>' : '')
        + '</div>'
        + (rec2.note ? '<div style="font-size:13px;color:var(--slate-600);line-height:1.6;margin-bottom:10px;">' + esc(rec2.note) + '</div>' : '')
        + (rec2.tags && rec2.tags.length ? '<div style="display:flex;gap:4px;flex-wrap:wrap;">' + rec2.tags.map(function(t){return'<span class="chip" style="font-size:10px;">#'+esc(t)+'</span>';}).join('') + '</div>' : '')
        + '</div></div>';
    }).join('')

    + '<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">'
    + '<button class="btn btn-secondary btn-sm" data-action="toggle-status" data-rec-id="' + esc(rec.id) + '" data-status="visited">Mark visited</button>'
    + '<button class="btn btn-secondary btn-sm" data-action="toggle-status" data-rec-id="' + esc(rec.id) + '" data-status="saved">Save for later</button>'
    + '<button class="btn btn-ghost btn-sm" data-action="toggle-status" data-rec-id="' + esc(rec.id) + '" data-status="dismissed">Dismiss</button>'
    + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: TASTE MATCH
   ═══════════════════════════════════════════════ */

function renderTasteMatch() {
  if (!AppState.isDemoMode && !AppState._tmFetched) {
    AppState._tmFetched = true;
    fnGet('taste-matches').then(function(d) {
      AppState._tmData = ((d && d.matches) || []).map(function(m, i) {
        return { id: 'tm' + i, canonical: { name: m.canonical && m.canonical.name, category: m.canonical && m.canonical.category,
                 location: m.canonical && m.canonical.location, imageEmoji: (m.canonical && m.canonical.image_emoji) || '🌟' },
                 note: m.note || '', rating: m.rating || 0, tags: m.tags || [], matchScore: m.match_score || 0 };
      });
      if (AppState.currentView === 'taste-match') renderApp();
    }).catch(function(){});
  }
  const tasteMatchRecs = AppState.tasteMatchRecs;
  if (!AppState.isDemoMode && tasteMatchRecs.length === 0) {
    return '<div style="max-width:640px;"><div class="empty-state" style="padding:70px 20px;">'
      + '<div class="empty-icon">🌱</div>'
      + '<div class="empty-title">Taste Match is warming up</div>'
      + '<div class="empty-body">Matches appear once you and others on Trustnet have built up libraries with overlapping taste. Keep saving recommendations — this switches on automatically as the network grows.</div>'
      + '</div></div>';
  }

  return '<div style="max-width:640px;">'
    + '<div style="background:linear-gradient(135deg,var(--green-50),#fff);border:1px solid var(--green-100);border-radius:12px;padding:20px 24px;margin-bottom:24px;">'
    + '<div style="font-size:22px;margin-bottom:10px;">💡</div>'
    + '<h2 style="font-size:16px;font-weight:700;margin-bottom:6px;">How Taste Match works</h2>'
    + '<p style="font-size:13px;color:var(--slate-500);line-height:1.7;">Trustnet identifies members across the network whose recommendation patterns closely match yours. You\'ll see their recommendations anonymously — they can\'t see yours either. No names. Just great taste.</p>'
    + '</div>'

    + '<h2 style="font-size:13px;font-weight:700;color:var(--slate-600);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">ANONYMOUS MATCHES FOR YOU</h2>'

    + tasteMatchRecs.map(function(tm) {
      const can = tm.canonical || AppState.canonicalById(tm.canonicalId);
      if (!can) return '';
      return '<div class="taste-card">'
        + '<div class="taste-anon"><span>' + (can.imageEmoji || '🌟') + '</span></div>'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        + '<span style="font-size:10px;color:var(--green-600);font-weight:700;background:var(--green-100);padding:2px 8px;border-radius:10px;">' + tm.matchScore + '% taste match</span>'
        + '<span style="font-size:10px;color:var(--slate-400);">anonymous</span>'
        + '</div>'
        + '<div style="font-size:15px;font-weight:700;margin-bottom:2px;">' + esc(can.name) + '</div>'
        + '<div style="font-size:11px;color:var(--slate-400);margin-bottom:8px;">' + esc(can.category || '') + (can.location ? ' · ' + can.location : '') + '</div>'
        + (stars(tm.rating))
        + '<div style="font-size:12px;color:var(--slate-600);line-height:1.6;margin:8px 0;">' + esc(tm.note) + '</div>'
        + (tm.tags ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">' + tm.tags.map(function(t){return'<span class="chip" style="font-size:10px;">#'+esc(t)+'</span>';}).join('') + '</div>' : '')
        + '<button class="btn btn-secondary btn-sm" data-action="request-intro" data-tm-id="' + esc(tm.id) + '">Request introduction</button>'
        + '</div>'
        + '</div>';
    }).join('')
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: PROFILE
   ═══════════════════════════════════════════════ */

function renderProfile() {
  const user = AppState.isDemoMode
    ? AppState.synUsers.find(function(u) { return u.id === AppState.demoUserId; })
    : AppState.userProfile;
  if (!user) return '<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">No profile</div></div>';

  const myCircles = AppState.isDemoMode
    ? AppState.synCircles.filter(function(c){ return c.ownerId === user.id; })
    : AppState.userCircles;
  const myRecs = AppState.isDemoMode ? AppState.synRecs : AppState.userRecs;

  return '<div style="max-width:560px;">'
    + '<div class="card" style="margin-bottom:20px;">'
    + '<div class="card-body">'
    + '<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">'
    + '<div class="avatar avatar-xl" style="background:' + esc(user.avatarColor || '#217A4B') + ';">' + esc(user.avatar || '?') + '</div>'
    + '<div>'
    + '<div style="font-size:20px;font-weight:800;letter-spacing:-0.3px;">' + esc(user.name) + '</div>'
    + '<div style="font-size:13px;color:var(--slate-400);margin-top:2px;">' + esc(user.location || '') + '</div>'
    + (user.bio ? '<div style="font-size:12px;color:var(--slate-500);margin-top:6px;">' + esc(user.bio) + '</div>' : '')
    + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:20px;">'
    + '<div><div style="font-size:20px;font-weight:800;">' + myCircles.length + '</div><div style="font-size:11px;color:var(--slate-400);">Circles</div></div>'
    + '<div><div style="font-size:20px;font-weight:800;">' + myRecs.length + '</div><div style="font-size:11px;color:var(--slate-400);">Saved recs</div></div>'
    + '</div>'
    + '</div></div>'

    + (AppState.isDemoMode ? '<div class="chip chip-amber" style="margin-bottom:16px;">Viewing demo profile — switch to your account to edit</div>' : '')

    + (!AppState.isDemoMode ? '<div class="card"><div class="card-body" style="display:flex;flex-direction:column;gap:14px;">'
      + '<div class="field"><div class="field-label">NAME</div><input class="field-input" id="p-name" value="' + esc(user.name) + '"></div>'
      + '<div class="field"><div class="field-label">LOCATION</div><input class="field-input" id="p-location" value="' + esc(user.location || '') + '"></div>'
      + '<div class="field"><div class="field-label">BIO</div><textarea class="field-input field-textarea" id="p-bio" style="min-height:70px;">' + esc(user.bio || '') + '</textarea></div>'
      + '<button class="btn btn-primary btn-sm" data-action="save-profile" style="align-self:flex-start;">Save changes</button>'
      + '</div></div>' : '')
    + '</div>';
}

/* ═══════════════════════════════════════════════
   VIEW: SETTINGS
   ═══════════════════════════════════════════════ */

function renderSettings() {
  return '<div style="max-width:480px;">'
    + '<div class="card" style="margin-bottom:16px;"><div class="card-body" style="display:flex;flex-direction:column;gap:16px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--slate-700);">Privacy</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;">'
    + '<div><div style="font-size:13px;font-weight:600;">Share my recommendations</div><div style="font-size:12px;color:var(--slate-400);">New library items are visible to people who have you in a matching circle. You can unshare any single item on its page.</div></div>'
    + (shareDefault()
        ? '<div style="width:44px;height:24px;border-radius:12px;background:var(--green-400);display:flex;align-items:center;justify-content:flex-end;padding:2px;cursor:pointer;flex-shrink:0;" data-action="toggle-share-default"><div style="width:20px;height:20px;border-radius:50%;background:#fff;pointer-events:none;"></div></div>'
        : '<div style="width:44px;height:24px;border-radius:12px;background:#CDD9D1;display:flex;align-items:center;justify-content:flex-start;padding:2px;cursor:pointer;flex-shrink:0;" data-action="toggle-share-default"><div style="width:20px;height:20px;border-radius:50%;background:#fff;pointer-events:none;"></div></div>')
    + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;">'
    + '<div><div style="font-size:13px;font-weight:600;">Taste Matching</div><div style="font-size:12px;color:var(--slate-400);">Allow anonymous recommendations from matched users</div></div>'
    + '<span style="font-size:10px;font-weight:700;color:#7A9086;background:#EFF3F0;padding:3px 10px;border-radius:10px;">Always on \u00b7 controls coming soon</span>'
    + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;">'
    + '<div><div style="font-size:13px;font-weight:600;">Degree 2 queries</div><div style="font-size:12px;color:var(--slate-400);">Allow your contacts to share anonymous queries with their networks</div></div>'
    + '<span style="font-size:10px;font-weight:700;color:#7A9086;background:#EFF3F0;padding:3px 10px;border-radius:10px;">Always on \u00b7 controls coming soon</span>'
    + '</div>'
    + '</div></div>'

    + '<div class="card"><div class="card-body" style="display:flex;flex-direction:column;gap:12px;">'
    + '<div style="font-size:13px;font-weight:700;color:var(--slate-700);">Data</div>'
    + '<button class="btn btn-danger btn-sm" data-action="clear-data" style="align-self:flex-start;">Sign out</button>'
    + '<div style="font-size:11px;color:var(--slate-300);">Removes your profile, circles, members, recommendations and queries. Demo data is not affected.</div>'
    + '</div></div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════
   MODALS
   ═══════════════════════════════════════════════ */

function openModal(name, params) {
  let html = '';
  if (name === 'add-circle') html = modalAddCircle();
  else if (name === 'add-member') html = modalAddMember(params);
  else if (name === 'add-rec') html = modalAddRec();
  else if (name === 'reply') html = modalReply(params);
  else if (name === 'share-list') html = modalShareList();
  else if (name === 'invite') html = modalInvite(params);
  else if (name === 'add-reciprocal') html = modalAddReciprocal(params);
  else if (name === 'circle-link') html = modalCircleLink();
  else if (name === 'fix-category') html = modalFixCategory(params);
  else if (name === 'resolve-query') html = modalResolveQuery(params);
  else if (name === 'fab-menu') html = modalFabMenu();
  else if (name === 'collection-create') html = modalCollectionCreate();
  else if (name === 'collection-send') html = modalCollectionSend(params);
  else return;

  const root = document.getElementById('modal-root');
  root.innerHTML = '<div class="modal-overlay">' + html + '</div>';
  // Close when clicking the overlay backdrop (not the modal itself)
  const overlay = root.querySelector('.modal-overlay');
  const modal   = root.querySelector('.modal');
  overlay.addEventListener('click', function(e) {
    if (!modal.contains(e.target)) closeModal();
  });
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function modalAddCircle() {
  const domainOptions = ['dining','travel','healthcare','home','culture','hobbies','professional','other']
    .map(function(d) { return '<option value="' + d + '">' + domainLabel(d) + '</option>'; }).join('');
  const colorOptions = ['#217A4B','#1A6FA8','#C0392B','#E8A020','#8B2FC9','#2D6A8A','#3D4F46','#E67E22']
    .map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');

  return '<div class="modal"><div class="modal-header"><div class="modal-title">New Circle</div><button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button></div>'
    + '<div class="modal-body">'
    + '<div class="field"><div class="field-label">NAME</div><input class="field-input" id="nc-name" placeholder="e.g. Dining" maxlength="40"></div>'
    + '<div class="field"><div class="field-label">DOMAIN</div><select class="field-input field-select" id="nc-domain">' + domainOptions + '</select></div>'
    + '<div class="field"><div class="field-label">DESCRIPTION</div><textarea class="field-input field-textarea" id="nc-desc" placeholder="What kind of recommendations does this circle give?" style="min-height:70px;"></textarea></div>'
    + '<div class="field"><div class="field-label">COLOUR</div><select class="field-input field-select" id="nc-color">' + colorOptions + '</select></div>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-circle">Create Circle</button></div>'
    + '</div>';
}

function modalAddMember(params) {
  const circleId = params && params.circleId ? params.circleId : (AppState.viewParams.circleId || '');
  const circle = AppState.circleById(circleId);
  const editId = params && params.editMemberId ? params.editMemberId : '';
  const em = editId ? AppState.userMembers.find(function(x) { return x.id === editId; }) : null;
  const emMethod = em ? (em.contactMethod || 'app') : 'app';
  const emContactVisible = !!em && !em.isExternalSource && (emMethod === 'email' || emMethod === 'whatsapp' || emMethod === 'linkedin');
  const emContactLabel = emMethod === 'whatsapp' ? 'THEIR WHATSAPP NUMBER' : (emMethod === 'linkedin' ? 'THEIR LINKEDIN URL' : 'THEIR EMAIL');
  const emContactPh = emMethod === 'whatsapp' ? '+972 50 123 4567 (with country code)' : (emMethod === 'linkedin' ? 'linkedin.com/in/their-name' : 'name@example.com');

  // Segmented button builder — renders a row of clickable option buttons
  function segmentedPicker(id, options, defaultVal) {
    return '<div id="' + id + '-picker" style="display:flex;gap:6px;flex-wrap:wrap;" data-selected="' + defaultVal + '">'
      + options.map(function(opt) {
        const sel = opt.value === defaultVal;
        return '<button type="button" data-action="pick-segment" data-picker-id="' + id + '" data-value="' + esc(opt.value) + '" style="'
          + 'padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;'
          + 'border:1.5px solid ' + (sel ? '#217A4B' : '#CDD9D1') + ';'
          + 'background:' + (sel ? '#EBF7F1' : '#fff') + ';'
          + 'color:' + (sel ? '#1A5235' : '#56695F') + ';'
          + 'transition:all 120ms ease;">'
          + (opt.icon ? opt.icon + ' ' : '') + esc(opt.label)
          + '</button>';
      }).join('')
      + '</div>'
      + '<input type="hidden" id="' + id + '" value="' + esc(defaultVal) + '">';
  }

  const methodPicker = segmentedPicker('nm-method', [
    { value: 'app',       icon: '💬', label: 'In-app'    },
    { value: 'whatsapp',  icon: '📱', label: 'WhatsApp'  },
    { value: 'email',     icon: '✉️',  label: 'Email'     },
    { value: 'linkedin',  icon: '🔗', label: 'LinkedIn'  }
  ], (em && !em.isExternalSource) ? emMethod : 'app');

  const ratePicker = segmentedPicker('nm-rate', [
    { value: 'high',   label: '🟢 High'   },
    { value: 'medium', label: '🟡 Medium' },
    { value: 'low',    label: '🔴 Low'    }
  ], (em && ['high','medium','low'].indexOf(em.responseRate) >= 0) ? em.responseRate : 'high');

  const sourceTypePicker = segmentedPicker('nm-srctype', [
    { value: 'critic',      label: '✍️ Critic'      },
    { value: 'publication', label: '📰 Publication' },
    { value: 'newsletter',  label: '📬 Newsletter'  },
    { value: 'expert',      label: '🎓 Expert'      }
  ], (em && em.sourceType) ? em.sourceType : 'critic');

  // Type toggle (Person / External Source) — used as two tab-style buttons
  const typeToggle = '<div style="display:flex;gap:0;border:1.5px solid #CDD9D1;border-radius:9px;overflow:hidden;margin-bottom:4px;">'
    + '<button type="button" data-action="pick-member-type" data-type="person" id="nm-type-person" style="flex:1;padding:9px;font-size:13px;font-weight:600;border:none;cursor:pointer;background:#EBF7F1;color:#1A5235;transition:all 120ms;">👤 Person</button>'
    + '<button type="button" data-action="pick-member-type" data-type="source" id="nm-type-source" style="flex:1;padding:9px;font-size:13px;font-weight:600;border:none;cursor:pointer;background:#fff;color:#56695F;transition:all 120ms;">📰 External Source</button>'
    + '</div>'
    + '<input type="hidden" id="nm-type" value="person">';
  const typeToggleFinal = em
    ? '<input type="hidden" id="nm-type" value="' + (em.isExternalSource ? 'source' : 'person') + '">'
    : typeToggle;

  // Person fields
  const isSourceEdit = !!(em && em.isExternalSource);
  const personFields = '<div id="nm-person-fields" style="display:' + (isSourceEdit ? 'none' : 'flex') + ';flex-direction:column;gap:14px;">'
    + '<div class="field"><div class="field-label">FULL NAME</div><input class="field-input" id="nm-name" placeholder="e.g. Yael Ben-David" maxlength="60" value="' + esc(em && !isSourceEdit ? em.name : '') + '"></div>'
    + '<div class="field"><div class="field-label">WHY DO YOU TRUST THEM?</div><textarea class="field-input field-textarea" id="nm-trust" placeholder="e.g. Food journalist, same taste in wine. Or: Managed her team for 3 years." style="min-height:60px;">' + esc(em && !isSourceEdit ? (em.trustBasis || '') : '') + '</textarea></div>'
    + '<div class="field"><div class="field-label">HOW TO REACH THEM</div>' + methodPicker + '</div>'
    + '<div class="field" id="nm-contact-wrap" style="display:' + (emContactVisible ? 'block' : 'none') + ';"><div class="field-label" id="nm-contact-label">' + emContactLabel + '</div><input class="field-input" id="nm-contact" placeholder="' + emContactPh + '" maxlength="80" value="' + esc(em && !isSourceEdit ? (em.contactValue || '') : '') + '"><div style="font-size:11px;color:#7A9086;margin-top:5px;">Queries you send will be delivered here.</div></div>'
    + '<div class="field"><div class="field-label">RESPONSE RATE</div>' + ratePicker + '</div>'
    + '</div>';

  // External source fields
  const sourceFields = '<div id="nm-source-fields" style="display:' + (isSourceEdit ? 'flex' : 'none') + ';flex-direction:column;gap:14px;">'
    + '<div class="field"><div class="field-label">SOURCE NAME</div><input class="field-input" id="nm-srcname" placeholder="e.g. Eater London, Monocle, Adam Gopnik" maxlength="80" value="' + esc(isSourceEdit ? em.name : '') + '"></div>'
    + '<div class="field"><div class="field-label">TYPE</div>' + sourceTypePicker + '</div>'
    + '<div class="field"><div class="field-label">URL <span style="font-weight:400;color:#A8BDAF;">(optional)</span></div><input class="field-input" id="nm-srcurl" placeholder="https://…" type="url" value="' + esc(isSourceEdit ? (em.sourceUrl || '') : '') + '"></div>'
    + '<div class="field"><div class="field-label">WHY DO YOU TRUST THIS SOURCE?</div><textarea class="field-input field-textarea" id="nm-srctrust" placeholder="e.g. Best coverage of London restaurants for 10 years. Always ahead of trends." style="min-height:60px;">' + esc(isSourceEdit ? (em.trustBasis || '') : '') + '</textarea></div>'
    + '<div style="padding:10px 12px;background:#EBF7F1;border-radius:8px;border:1px solid #C6EDD9;">'
    + '<div style="font-size:11px;color:#1A5235;font-weight:600;margin-bottom:3px;">How external sources work</div>'
    + '<div style="font-size:11px;color:#56695F;line-height:1.6;">External sources are not messaged directly. Their recommendations are surfaced when you query this circle, based on their published coverage — alongside responses from your personal contacts.</div>'
    + '</div>'
    + '</div>';

  return '<div class="modal"><div class="modal-header">'
    + '<div><div class="modal-title">' + (em ? 'Edit ' + esc(em.name) : 'Add to ' + esc(circle ? circle.name : 'Circle')) + '</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">' + (em ? 'Update their details' : 'A trusted contact or an external source you rely on') + '</div></div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body" data-circle-id="' + esc(circleId) + '" data-edit-id="' + esc(editId) + '">'
    + (em ? typeToggleFinal : '<div class="field"><div class="field-label">TYPE</div>' + typeToggleFinal + '</div>')
    + personFields
    + sourceFields
    + '</div>'
    + '<div class="modal-footer"><button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-member">' + (em ? 'Save changes' : 'Add') + '</button></div>'
    + '</div>';
}

function modalAddRec() {
  const allCircles = AppState.userCircles.concat(AppState.synCircles);

  const circlePickerHtml = allCircles.length === 0
    ? '<div style="font-size:12px;color:#7A9086;">No circles yet — rec will be added to your general library.</div>'
    : '<div id="ar-circle-picker" style="display:flex;flex-direction:column;gap:6px;">'
      + '<div class="ar-circle-opt" data-action="pick-ar-circle" data-circle-id="" style="'
      + 'display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;cursor:pointer;'
      + 'border:2px solid #217A4B;background:rgba(33,122,75,0.04);">'
      + '<div style="width:10px;height:10px;border-radius:50%;background:#CDD9D1;flex-shrink:0;"></div>'
      + '<span style="font-size:13px;color:#56695F;flex:1;">No circle — general library</span>'
      + '<svg style="width:14px;height:14px;color:#217A4B;flex-shrink:0;" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>'
      + '</div>'
      + allCircles.map(function(c) {
        const isDemo = AppState.synCircles.some(function(sc) { return sc.id === c.id; });
        return '<div class="ar-circle-opt" data-action="pick-ar-circle" data-circle-id="' + esc(c.id) + '" style="'
          + 'display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;cursor:pointer;'
          + 'border:2px solid #CDD9D1;background:#fff;">'
          + '<div style="width:10px;height:10px;border-radius:50%;background:' + esc(c.color || '#CDD9D1') + ';flex-shrink:0;"></div>'
          + '<span style="font-size:13px;font-weight:600;color:#1C2420;flex:1;">' + esc(c.name) + '</span>'
          + (isDemo ? '<span style="font-size:10px;color:#A8BDAF;">demo</span>' : '')
          + '<div style="width:14px;"></div>'
          + '</div>';
      }).join('')
      + '</div>'
      + '<input type="hidden" id="ar-circle" value="">';

  return '<div class="modal"><div class="modal-header"><div class="modal-title">Add to Library</div><button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button></div>'
    + '<div class="modal-body">'
    + '<div class="field"><div class="field-label">HAVE A LINK? <span style="font-weight:400;color:#A8BDAF;">(TikTok, Booking, Maps, any page — optional)</span></div>'
    + '<div style="display:flex;gap:8px;">'
    + '<input class="field-input" id="ar-url" placeholder="Paste a link and let AI fill this form" style="flex:1;">'
    + '<button class="btn btn-secondary" data-action="ingest-link" id="ar-url-btn" style="flex-shrink:0;">Fetch</button>'
    + '</div></div>'
    + '<div class="field"><div class="field-label">WHAT ARE YOU RECOMMENDING?</div><input class="field-input" id="ar-name" placeholder="Restaurant, book, doctor, place…" maxlength="80"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    + '<div class="field"><div class="field-label">CATEGORY</div><input class="field-input" id="ar-cat" placeholder="e.g. Restaurant, Book"></div>'
    + '<div class="field"><div class="field-label">LOCATION <span style="font-weight:400;color:#A8BDAF;">(optional)</span></div><input class="field-input" id="ar-location" placeholder="e.g. Tel Aviv"></div>'
    + '</div>'
    + '<div class="field"><div class="field-label">YOUR NOTE</div><textarea class="field-input field-textarea" id="ar-note" placeholder="What makes it great? Any insider tips?" style="min-height:80px;"></textarea></div>'
    + '<div class="field"><div class="field-label">TAGS <span style="font-weight:400;color:#A8BDAF;">(optional, comma-separated)</span></div><input class="field-input" id="ar-tags" placeholder="e.g. romantic, outdoor, vegetarian, cheap"></div>'
    + '<div class="field"><div class="field-label">RATING</div>'
    + '<div id="ar-stars" style="display:flex;gap:2px;" data-rating="5">'
    + [1,2,3,4,5].map(function(n) {
        return '<button type="button" class="ar-star" data-action="set-ar-star" data-n="' + n + '" style="font-size:24px;cursor:pointer;opacity:1;background:none;border:none;padding:0 2px;color:#E8A020;">★</button>';
      }).join('')
    + '</div></div>'
    + '<div class="field"><div class="field-label">CIRCLE <span style="font-weight:400;color:#A8BDAF;">(optional)</span></div>'
    + circlePickerHtml
    + '</div>'
    + '</div>'
    + '<div class="modal-footer"><button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-rec">Add to Library</button></div>'
    + '</div>';
}

function modalReply(params) {
  var memberName = (params && params.memberName) ? params.memberName : 'contact';
  var respId = (params && params.respId) ? params.respId : '';
  return '<div class="modal" style="max-width:440px;">'
    + '<div class="modal-header">'
    + '<div><div class="modal-title">Reply</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">To: ' + esc(memberName) + '</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body">'
    + '<div class="field">'
    + '<div class="field-label">MESSAGE</div>'
    + '<textarea class="field-input field-textarea" id="reply-text" placeholder="Thanks for the recommendation! Quick question — …" style="min-height:100px;"></textarea>'
    + '</div>'
    + '<div style="padding:10px 12px;background:#EBF7F1;border-radius:8px;border:1px solid #C6EDD9;">'
    + '<div style="font-size:11px;color:#1A5235;line-height:1.6;">This will be sent to ' + esc(memberName) + ' via their preferred contact method. In the live product, this routes through the app, WhatsApp, or email.</div>'
    + '</div>'
    + '</div>'
    + '<div class="modal-footer">'
    + '<button class="btn btn-secondary" data-action="close-modal">Cancel</button>'
    + '<button class="btn btn-primary" data-action="send-reply" data-member-name="' + esc(memberName) + '">Send</button>'
    + '</div>'
    + '</div>';
}

// SIMULATED: Curator Share — shows a preview of the public shareable list page
function modalShareList() {
  var user = AppState.userProfile;
  var name = user ? user.name : 'You';
  var handle = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  var allRecs = AppState.allRecs().slice(0, 4);

  var previewItems = allRecs.length > 0
    ? allRecs.map(function(rec) {
        var can = AppState.canonicalById(rec.canonicalId);
        if (!can) return '';
        return '<div style="background:#fff;border:1px solid #E5EDE8;border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;">'
          + '<div style="font-size:22px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:#F2F6F3;border-radius:8px;flex-shrink:0;">' + esc(can.imageEmoji || '📌') + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:14px;font-weight:700;color:#1C2420;">' + esc(can.name) + '</div>'
          + '<div style="font-size:11px;color:#7A9086;">' + esc(can.category || '') + (can.location ? ' · ' + esc(can.location) : '') + '</div>'
          + (rec.note ? '<div style="font-size:12px;color:#3D4F46;line-height:1.5;margin-top:4px;">' + esc(rec.note) + '</div>' : '')
          + '</div>'
          + '</div>';
      }).join('')
    : '<div style="text-align:center;padding:20px;color:#A8BDAF;font-size:13px;">Add recommendations to your library to include them here.</div>';

  return '<div class="modal" style="max-width:460px;">'
    + '<div class="modal-header">'
    + '<div><div class="modal-title">Share as a public list</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">A beautiful page anyone can view — no account needed</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body">'
    // The share URL bar
    + '<div style="display:flex;align-items:center;gap:8px;background:#F2F6F3;border:1px solid #E5EDE8;border-radius:8px;padding:10px 12px;margin-bottom:16px;">'
    + '<span style="font-size:12px;color:#56695F;font-family:monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">trustnet.com/u/' + esc(handle) + '/my-favourites</span>'
    + '<button class="btn btn-secondary btn-sm" data-action="copy-share-link" style="flex-shrink:0;">Copy</button>'
    + '</div>'
    // Live preview of the public page
    + '<div style="font-size:11px;font-weight:700;color:#7A9086;letter-spacing:0.5px;margin-bottom:8px;">PREVIEW</div>'
    + '<div style="border:1px solid #E5EDE8;border-radius:12px;overflow:hidden;">'
    + '<div style="background:#0D2B1F;padding:20px;text-align:center;">'
    + '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:1px;margin-bottom:12px;">TRUSTNET</div>'
    + '<div class="avatar" style="background:' + esc(user && user.avatarColor ? user.avatarColor : '#217A4B') + ';margin:0 auto 8px;">' + esc(user && user.avatar ? user.avatar : 'ME') + '</div>'
    + '<div style="font-size:13px;color:rgba(255,255,255,0.85);">' + esc(name) + '</div>'
    + '<div style="font-size:18px;font-weight:800;color:#fff;margin-top:2px;">My Favourites</div>'
    + '</div>'
    + '<div style="padding:16px;background:#F2F6F3;max-height:280px;overflow-y:auto;">'
    + previewItems
    + '<div style="background:linear-gradient(135deg,#EBF7F1,#fff);border:1px solid #C6EDD9;border-radius:10px;padding:14px;text-align:center;margin-top:8px;">'
    + '<div style="font-size:12px;font-weight:700;color:#0D2B1F;margin-bottom:8px;">Recommendations from people you trust</div>'
    + '<div style="display:inline-block;background:#217A4B;color:#fff;font-size:12px;font-weight:600;padding:8px 18px;border-radius:6px;">Build your trusted network →</div>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div style="padding:10px 12px;background:#EBF7F1;border-radius:8px;border:1px solid #C6EDD9;margin-top:16px;">'
    + '<div style="font-size:11px;color:#1A5235;line-height:1.6;">Anyone who opens this link sees your picks — and an invitation to join. This is how curators bring their friends onto Trustnet.</div>'
    + '</div>'
    + '</div>'
    + '<div class="modal-footer">'
    + '<button class="btn btn-secondary" data-action="close-modal">Close</button>'
    + '<button class="btn btn-primary" data-action="copy-share-link">Copy share link</button>'
    + '</div>'
    + '</div>';
}

// SIMULATED: Direct Invite — shows the flattering "you're trusted" message preview
function modalInvite(params) {
  var circleName = (params && params.circleName) ? params.circleName : 'your';
  var user = AppState.userProfile;
  var inviterName = user ? user.name.split(' ')[0] : 'You';

  return '<div class="modal" style="max-width:440px;">'
    + '<div class="modal-header">'
    + '<div><div class="modal-title">Invite to Trustnet</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">Invite someone who isn\'t on Trustnet yet</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body">'
    + '<div class="field">'
    + '<div class="field-label">HOW TO REACH THEM</div>'
    + '<div class="segmented" style="display:flex;gap:6px;">'
    + '<button type="button" class="btn btn-secondary btn-sm" style="flex:1;">WhatsApp</button>'
    + '<button type="button" class="btn btn-ghost btn-sm" style="flex:1;">Email</button>'
    + '</div>'
    + '</div>'
    + '<div class="field">'
    + '<div class="field-label">PHONE NUMBER</div>'
    + '<input class="field-input" placeholder="+972 50 123 4567">'
    + '</div>'
    // Message preview — the flattering framing
    + '<div style="font-size:11px;font-weight:700;color:#7A9086;letter-spacing:0.5px;margin:16px 0 8px;">THEY\'LL RECEIVE</div>'
    + '<div style="background:#E8F5E9;border-radius:12px 12px 12px 4px;padding:14px 16px;max-width:88%;">'
    + '<div style="font-size:13px;color:#1C2420;line-height:1.6;">'
    + '<strong>' + esc(inviterName) + '</strong> trusts your taste — they added you to their <strong>' + esc(circleName) + '</strong> circle on Trustnet.'
    + '<br><br>'
    + 'When ' + esc(inviterName) + ' needs a recommendation, you\'re one of the few people they ask.'
    + '<br><br>'
    + '<span style="color:#217A4B;font-weight:600;">See what this means →</span>'
    + '</div>'
    + '</div>'
    + '<div style="padding:10px 12px;background:#EBF7F1;border-radius:8px;border:1px solid #C6EDD9;margin-top:16px;">'
    + '<div style="font-size:11px;color:#1A5235;line-height:1.6;">Notice the framing: it\'s about them being valued, not about installing an app. That\'s what makes trust-based invites convert.</div>'
    + '</div>'
    + '</div>'
    + '<div class="modal-footer">'
    + '<button class="btn btn-secondary" data-action="close-modal">Cancel</button>'
    + '<button class="btn btn-primary" data-action="send-invite-sim">Send invite</button>'
    + '</div>'
    + '</div>';
}

function modalFabMenu() {
  return '<div class="modal" style="max-width:360px;">'
    + '<div class="modal-body" style="padding-top:20px;">'
    + '<button type="button" data-action="fab-ask" style="display:flex;align-items:center;gap:12px;width:100%;background:#0D2B1F;border:none;border-radius:14px;padding:16px;cursor:pointer;margin-bottom:10px;text-align:left;">'
    + '<span style="font-size:22px;">🎯</span>'
    + '<span><span style="display:block;font-size:15px;font-weight:800;color:#fff;">Ask a question</span>'
    + '<span style="display:block;font-size:11.5px;color:#9BC7AE;margin-top:2px;">Send it to a circle you trust</span></span>'
    + '</button>'
    + '<button type="button" data-action="fab-save" style="display:flex;align-items:center;gap:12px;width:100%;background:#EBF7F1;border:1.5px solid #C6EDD9;border-radius:14px;padding:16px;cursor:pointer;text-align:left;">'
    + '<span style="font-size:22px;">📌</span>'
    + '<span><span style="display:block;font-size:15px;font-weight:800;color:#1A5235;">Save a recommendation</span>'
    + '<span style="display:block;font-size:11.5px;color:#56695F;margin-top:2px;">To your library — link, place, anything</span></span>'
    + '</button>'
    + '</div>'
    + '</div>';
}

function modalResolveQuery(params) {
  const q = AppState.userQueries.find(function(x) { return x.id === (params && params.queryId); });
  if (!q) return '<div class="modal"><div class="modal-body">Query not found.</div></div>';
  const opts = (q.responses || []).map(function(r) {
    const m = r.isAnonymous ? null : AppState.memberById(r.contactId);
    return '<button type="button" data-action="resolve-pick" data-query-id="' + esc(q.id) + '" data-response-id="' + esc(r.id) + '" '
      + 'style="display:block;width:100%;text-align:left;background:#fff;border:1.5px solid #E5EDE8;border-radius:10px;padding:11px 14px;margin-bottom:7px;cursor:pointer;">'
      + '<span dir="auto" style="font-size:14px;font-weight:700;color:#1C2420;">' + esc(r.recName || '') + '</span>'
      + '<span style="font-size:11px;color:#7A9086;"> — ' + esc(r.isAnonymous ? 'anonymous' : (m ? m.name : 'someone')) + '</span>'
      + '</button>';
  }).join('');
  return '<div class="modal" style="max-width:440px;">'
    + '<div class="modal-header">'
    + '<div><div class="modal-title">What did you go with?</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">The person behind the winning pick gets a small thank-you note</div></div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body">'
    + opts
    + '<button type="button" data-action="resolve-pick" data-query-id="' + esc(q.id) + '" data-response-id="" '
    + 'style="display:block;width:100%;text-align:left;background:#F7FAF8;border:1.5px dashed #DCE7E0;border-radius:10px;padding:11px 14px;cursor:pointer;font-size:13px;color:#56695F;">'
    + 'Decided differently — just close this ask</button>'
    + '</div>'
    + '</div>';
}

function modalFixCategory(params) {
  const canId = params && params.canId ? params.canId : '';
  const can = AppState.canonicalById(canId);
  const doms = ['dining','travel','healthcare','home','culture','hobbies','professional','other'];
  return '<div class="modal" style="max-width:420px;">'
    + '<div class="modal-header">'
    + '<div><div class="modal-title">Where does this belong?</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">' + esc(can ? can.name : '') + ' — your correction teaches the app</div></div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body">'
    + doms.map(function(d) {
        const current = can && can.primaryCategory === d;
        return '<button type="button" data-action="apply-category" data-can-id="' + esc(canId) + '" data-cat="' + d + '" '
          + 'style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;background:' + (current ? '#EBF7F1' : '#fff') + ';border:1.5px solid ' + (current ? '#C6EDD9' : '#E5EDE8') + ';border-radius:10px;padding:11px 14px;margin-bottom:7px;cursor:pointer;font-size:14px;font-weight:600;color:#1C2420;">'
          + domainLabel(d) + (current ? '<span style="color:#2D9460;font-size:12px;">current</span>' : '')
          + '</button>';
      }).join('')
    + '</div>'
    + '</div>';
}

function modalCircleLink() {
  const d = AppState._circleLink;
  if (!d) return '<div class="modal"><div class="modal-body">Link not ready.</div></div>';
  const waText = encodeURIComponent('Join my ' + d.circleName + ' circle on Trustnet — tap to become one of the people I ask for recommendations: ' + d.url);
  return '<div class="modal" style="max-width:460px;">'
    + '<div class="modal-header">'
    + '<div><div class="modal-title">Invite link — ' + esc(d.circleName) + '</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">Anyone with this link can join this circle</div></div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body">'
    + '<div style="display:flex;align-items:center;gap:8px;background:#F2F6F3;border:1px solid #E5EDE8;border-radius:8px;padding:10px 12px;margin-bottom:14px;">'
    + '<span style="font-size:12px;color:#56695F;font-family:monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(d.url) + '</span>'
    + '<button class="btn btn-secondary btn-sm" data-action="copy-circle-link" style="flex-shrink:0;">Copy</button>'
    + '</div>'
    + '<a class="btn btn-primary" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;margin-bottom:14px;" href="https://wa.me/?text=' + waText + '">Share on WhatsApp</a>'
    + '<div style="padding:10px 12px;background:#EBF7F1;border-radius:8px;border:1px solid #C6EDD9;">'
    + '<div style="font-size:11px;color:#1A5235;line-height:1.7;">Perfect for a WhatsApp group: post it once and everyone who taps joins this circle — signed up, linked, and reachable by your queries. People who already have Trustnet just get added.</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-sm" data-action="revoke-circle-link" data-circle-id="' + esc(d.circleId) + '" style="margin-top:12px;color:#C0392B;">Disable this link</button>'
    + '</div>'
    + '</div>';
}

async function handleOpenCircleLink(circleId, circleName) {
  toast('Creating link…');
  const r = await sb.rpc('get_or_create_circle_link', { p_circle_id: circleId });
  if (r.error || !r.data) { toast('Could not create the link.', 'warn'); return; }
  AppState._circleLink = {
    circleId: circleId, circleName: circleName,
    url: location.origin + '/?join=' + r.data
  };
  openModal('circle-link');
}

async function handleJoinViaLink(token) {
  try {
    const r = await sb.rpc('join_circle_via_link', { p_token: token });
    localStorage.removeItem('tn_join_token');
    const d = r.data || {};
    if (r.error || !d.joined) {
      if (d.reason === 'own_circle') toast('That is your own circle 🙂', 'warn');
      else toast('This invite link is no longer valid.', 'warn');
      return;
    }
    if (d.already) {
      toast('You are already in ' + (d.owner_name || 'their') + "'s " + (d.circle_name || '') + ' circle.');
    } else {
      toast('You joined ' + (d.owner_name || 'their') + "'s " + (d.circle_name || '') + ' circle — they can now ask you for recommendations.');
    }
  } catch (e) {
    localStorage.removeItem('tn_join_token');
  }
}

// SIMULATED: picker — choose which circle to add the reciprocal contact to
function modalAddReciprocal(params) {
  var recipId = (params && params.recipId) ? params.recipId : '';
  var recip = SIMULATED_RECIPROCALS.find(function(r) { return r.id === recipId; });
  if (!recip) return '<div class="modal"><div class="modal-body">Contact not found.</div></div>';

  var domainNames = { dining: 'Dining', travel: 'Travel', healthcare: 'Healthcare', culture: 'Culture', home: 'Home', hobbies: 'Hobbies', professional: 'Professional', other: 'Recommendations' };

  // Existing circles as options
  var existing = AppState.userCircles.map(function(c) {
    var count = c.memberIds ? c.memberIds.length : 0;
    return '<button type="button" class="recip-circle-opt" data-action="confirm-add-reciprocal" data-recip-id="' + esc(recipId) + '" data-circle-choice="' + esc(c.id) + '" '
      + 'style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#fff;border:1.5px solid #E5EDE8;border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;">'
      + '<span style="width:10px;height:10px;border-radius:50%;background:' + esc(c.color || '#217A4B') + ';flex-shrink:0;"></span>'
      + '<span style="flex:1;min-width:0;"><span style="display:block;font-size:14px;font-weight:600;color:#1C2420;">' + esc(c.name) + '</span>'
      + '<span style="display:block;font-size:11px;color:#7A9086;">' + count + ' member' + (count !== 1 ? 's' : '') + ' · ' + esc(domainLabel(c.domain)) + '</span></span>'
      + '<span style="color:#CDD9D1;font-size:16px;">→</span>'
      + '</button>';
  }).join('');

  // Suggested new circle, seeded from the contact's domain
  var suggestedName = domainNames[recip.domain] || 'Recommendations';
  var hasSuggested = AppState.userCircles.some(function(c) { return c.domain === recip.domain; });
  var suggestion = !hasSuggested
    ? '<button type="button" class="recip-circle-opt" data-action="confirm-add-reciprocal" data-recip-id="' + esc(recipId) + '" data-circle-choice="new:' + esc(recip.domain) + '" '
      + 'style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#EBF7F1;border:1.5px dashed #C6EDD9;border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;">'
      + '<span style="width:24px;height:24px;border-radius:50%;background:#217A4B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">+</span>'
      + '<span style="flex:1;"><span style="display:block;font-size:14px;font-weight:600;color:#1A5235;">New "' + esc(suggestedName) + '" circle</span>'
      + '<span style="display:block;font-size:11px;color:#56695F;">Create it and add ' + esc(recip.name.split(' ')[0]) + '</span></span>'
      + '</button>'
    : '';

  return '<div class="modal" style="max-width:440px;">'
    + '<div class="modal-header">'
    + '<div><div class="modal-title">Add ' + esc(recip.name) + '</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">Choose which circle to add them to</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body">'
    // who + why
    + '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#F2F6F3;border-radius:10px;margin-bottom:18px;">'
    + '<div class="avatar" style="background:' + esc(recip.avatarColor) + ';flex-shrink:0;">' + esc(recip.avatar) + '</div>'
    + '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:700;color:#1C2420;">' + esc(recip.name) + '</div>'
    + '<div style="font-size:12px;color:#56695F;line-height:1.5;">' + esc(recip.trustBasis) + '</div></div>'
    + '</div>'
    + '<div style="font-size:11px;font-weight:700;color:#7A9086;letter-spacing:0.5px;margin-bottom:10px;">ADD TO</div>'
    + suggestion
    + existing
    + (existing === '' && suggestion === '' ? '<div style="font-size:13px;color:#7A9086;text-align:center;padding:16px;">You have no circles yet — a new one will be created.</div>' : '')
    + '</div>'
    + '<div class="modal-footer">'
    + '<button class="btn btn-secondary" data-action="close-modal">Cancel</button>'
    + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════
   ACTION HANDLERS
   ═══════════════════════════════════════════════ */

async function handleSaveCircle() {
  const name = (document.getElementById('nc-name') || {}).value.trim();
  const domain = (document.getElementById('nc-domain') || {}).value;
  const desc = (document.getElementById('nc-desc') || {}).value.trim();
  const color = (document.getElementById('nc-color') || {}).value;
  if (!name) { toast('Please enter a name.', 'warn'); return; }

  const newCircle = { id: uid(), ownerId: 'me', name: name, domain: domain, description: desc, color: color, memberIds: [], isOwn: true, createdAt: new Date().toISOString() };
  AppState.userCircles.push(newCircle);
  await saveCircles();
  closeModal();
  toast('Circle "' + name + '" created!');
  showView('circle-detail', { circleId: newCircle.id });
}

async function handleSaveMember() {
  const mb = document.querySelector('.modal-body[data-circle-id]');
  const circleId = mb ? mb.dataset.circleId : AppState.viewParams.circleId;
  const editId = mb ? (mb.dataset.editId || '') : '';
  if (!circleId) { toast('No circle selected.', 'error'); return; }

  const memberType = (document.getElementById('nm-type') || {}).value || 'person';
  const isSource = memberType === 'source';

  const initials = function(str) { return (str||'').split(' ').map(function(w){return w[0]||'';}).join('').slice(0,2).toUpperCase(); };
  const palette = ['#217A4B','#1A6FA8','#C0392B','#E8A020','#8B2FC9','#2D6A8A'];
  const color = palette[Math.floor(Math.random() * palette.length)];

  let newMember;

  if (isSource) {
    const srcName = (document.getElementById('nm-srcname') || {}).value.trim();
    const srcType = (document.getElementById('nm-srctype') || {}).value || 'critic';
    const srcUrl  = (document.getElementById('nm-srcurl') || {}).value.trim();
    const srcTrust= (document.getElementById('nm-srctrust') || {}).value.trim();
    if (!srcName) { toast('Please enter a source name.', 'warn'); return; }

    newMember = {
      id: uid(), name: srcName,
      avatar: initials(srcName), avatarColor: '#56695F',
      isExternalSource: true, sourceType: srcType,
      sourceUrl: srcUrl, trustBasis: srcTrust,
      contactMethod: 'source', responseRate: 'high',
      circleId: circleId, addedAt: new Date().toISOString()
    };
    if (!editId) toast('"' + srcName + '" added as an external source.');
  } else {
    const name  = (document.getElementById('nm-name') || {}).value.trim();
    const trust = (document.getElementById('nm-trust') || {}).value.trim();
    const method= (document.getElementById('nm-method') || {}).value || 'app';
    const rate  = (document.getElementById('nm-rate') || {}).value || 'high';
    let contact = ((document.getElementById('nm-contact') || {}).value || '').trim();
    if (!name) { toast('Please enter a name.', 'warn'); return; }
    if (method === 'email') {
      if (!contact || contact.indexOf('@') < 1) { toast('Please enter their email address.', 'warn'); return; }
      const myEmail = (AppState._authEmail || (AppState.userProfile && AppState.userProfile.email) || '').toLowerCase();
      if (myEmail && contact.toLowerCase() === myEmail) {
        toast("That's the email you're signed in with — you own this circle, so you don't add yourself as a member.", 'warn');
        return;
      }
    }
    if (method === 'whatsapp') {
      contact = contact.replace(/[\s()-]/g, '');
      if (!contact || contact.charAt(0) !== '+' || contact.length < 8) {
        toast('Please enter their WhatsApp number with country code, e.g. +972501234567.', 'warn'); return;
      }
    }

    newMember = {
      id: uid(), name: name,
      avatar: initials(name), avatarColor: color,
      isExternalSource: false,
      trustBasis: trust, contactMethod: method, contactValue: contact || null, responseRate: rate,
      circleId: circleId, addedAt: new Date().toISOString()
    };
    if (!editId) toast(name + ' added to circle.');
  }

  if (editId) {
    const ex = AppState.userMembers.find(function(x) { return x.id === editId; });
    if (!ex) { toast('Member not found.', 'error'); return; }
    newMember.id = ex.id;
    newMember.avatarColor = ex.avatarColor;
    newMember.addedAt = ex.addedAt;
    newMember.circleId = ex.circleId;
    if (ex.linkedUserId) newMember.linkedUserId = ex.linkedUserId;
    Object.assign(ex, newMember);
    toast(newMember.name + ' updated.');
  } else {
    AppState.userMembers.push(newMember);
    const circle = AppState.userCircles.find(function(c) { return c.id === circleId; });
    if (circle) {
      if (!circle.memberIds) circle.memberIds = [];
      circle.memberIds.push(newMember.id);
      await saveCircles();
    }
  }
  await saveMembers();
  closeModal();
  renderApp();
}

async function handleSaveRec() {
  const name = (document.getElementById('ar-name') || {}).value.trim();
  const cat = (document.getElementById('ar-cat') || {}).value.trim();
  const loc = (document.getElementById('ar-location') || {}).value.trim();
  const note = (document.getElementById('ar-note') || {}).value.trim();
  const tagsRaw = (document.getElementById('ar-tags') || {}).value || '';
  const tags = tagsRaw.split(',').map(function(t) { return t.trim().toLowerCase().replace(/\s+/g,'-'); }).filter(Boolean);
  const starsEl = document.getElementById('ar-stars');
  const rating = starsEl ? (parseInt(starsEl.dataset.rating) || 5) : 5;
  const circleEl = document.getElementById('ar-circle');
  const circleId = circleEl ? circleEl.value : '';

  if (!name) { toast('Please name what you\'re recommending.', 'warn'); return; }

  const emojiMap = { restaurant:'🍽️', book:'📖', film:'🎬', hotel:'🏨', doctor:'👩‍⚕️', wine:'🍷', bar:'🍷', place:'📍', museum:'🏛️' };
  const catLow = (cat || '').toLowerCase();
  const emoji = Object.keys(emojiMap).find(function(k){ return catLow.includes(k); });

  const existingCan = findExistingCanonical(name, loc);
  const canId = existingCan ? existingCan.id : uid();
  if (!existingCan) {
    AppState.userCanonicals.push({ id: canId, type: 'place', name: name, category: cat, location: loc, imageEmoji: emojiMap[emoji] || '📌', imageUrl: AppState._ingestImage || '', websiteUrl: AppState._ingestUrl || null, externalLinks: {} });
  }
  AppState._ingestUrl = null;
  AppState._ingestImage = null;
  const dupRec = existingRecFor(canId);
  if (dupRec) {
    if (note) dupRec.note = note;
    dupRec.rating = Math.min(5, Math.max(1, rating));
    if (tags.length) dupRec.tags = tags;
    await saveRecs();
    closeModal();
    toast('"' + name + '" is already in your library — updated it.');
    renderApp();
    return;
  }
  const newRec = { id: uid(), canonicalId: canId, circleId: circleId || '', recommendedBy: AppState.userProfile ? AppState.userProfile.id : 'user', note: note, rating: Math.min(5,Math.max(1,rating)), tags: tags, date: new Date().toISOString().split('T')[0], status: 'saved', degree: 1, isAnonymous: false, sharedToNetwork: shareDefault() };
  AppState.userRecs.push(newRec);
  await saveCanonicals();
  await saveRecs();
  requestClassify(canId, note);
  closeModal();
  toast('"' + name + '" added to your library.');
  renderApp();
}

async function handleSaveProfile() {
  const name = (document.getElementById('p-name') || {}).value.trim();
  const location = (document.getElementById('p-location') || {}).value.trim();
  const bio = (document.getElementById('p-bio') || {}).value.trim();
  if (!name) { toast('Name is required.', 'warn'); return; }
  AppState.userProfile.name = name;
  AppState.userProfile.location = location;
  AppState.userProfile.bio = bio;
  AppState.userProfile.avatar = name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
  // preserve avatarColor — don't overwrite it
  await saveProfile();
  toast('Profile saved.');
  renderApp();
}

async function handleToggleStatus(recId, status) {
  const rec = AppState.userRecs.find(function(r) { return r.id === recId; });
  if (rec) {
    rec.status = status;
    await saveRecs();
    toast('Marked as ' + status + '.');
    renderApp();
  } else {
    // Synthetic — find and copy
    const synRec = AppState.synRecs.find(function(r) { return r.id === recId; });
    if (synRec) toast('Demo recs can\'t be edited — add your own!', 'warn');
  }
}

async function handleSaveToLibrary(respId) {
  if (!AppState.queryState) return;
  const resp = AppState.queryState.responses.find(function(r) { return r.id === respId; });
  if (!resp) return;
  if (resp.savedToLibrary) { toast('Already saved.', 'warn'); return; }

  const root = document.getElementById('modal-root');
  const emojiMap = { restaurant:'🍽️', book:'📖', film:'🎬', hotel:'🏨', doctor:'👩‍⚕️', wine:'🍷', bar:'🍷', place:'📍', museum:'🏛️', physiotherapist:'🦴', psychiatrist:'🧠', cardiologist:'❤️', dermatologist:'👩‍⚕️', plumber:'🔧', cinema:'🎬' };
  const catLow = (resp.recCat || '').toLowerCase();
  const emojiKey = Object.keys(emojiMap).find(function(k){ return catLow.includes(k); });
  const emoji = resp.recEmoji || emojiMap[emojiKey] || '📌';

  const member = resp.contactId ? AppState.memberById(resp.contactId) : null;
  const recommenderName = member ? member.name : 'Anonymous';

  const starsHtml = [1,2,3,4,5].map(function(n) {
    return '<button class="save-lib-star" data-star="' + n + '" style="font-size:22px;cursor:pointer;opacity:' + (n <= resp.recRating ? '1' : '0.25') + ';background:none;border:none;padding:0 2px;" data-action="set-star" data-n="' + n + '">★</button>';
  }).join('');

  root.innerHTML = '<div class="modal-overlay">'
    + '<div class="modal" style="max-width:460px;">'
    + '<div class="modal-header">'
    + '<div>'
    + '<div class="modal-title">Save to Library</div>'
    + '<div style="font-size:11px;color:#7A9086;margin-top:2px;">Recommended by ' + esc(recommenderName) + '</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-icon" data-action="close-modal">✕</button>'
    + '</div>'
    + '<div class="modal-body">'

    // Rec name
    + '<div class="field">'
    + '<div class="field-label">WHAT</div>'
    + '<div style="display:flex;align-items:center;gap:8px;">'
    + '<span style="font-size:20px;">' + emoji + '</span>'
    + '<input class="field-input" id="sl-name" value="' + esc(resp.recName || '') + '" placeholder="Name" style="flex:1;">'
    + '</div>'
    + '</div>'

    // Category + Location
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    + '<div class="field"><div class="field-label">CATEGORY</div><input class="field-input" id="sl-cat" value="' + esc(resp.recCat || '') + '" placeholder="e.g. Restaurant"></div>'
    + '<div class="field"><div class="field-label">LOCATION</div><input class="field-input" id="sl-loc" value="' + esc(resp.recLoc || '') + '" placeholder="City"></div>'
    + '</div>'

    // Note
    + '<div class="field">'
    + '<div class="field-label">NOTE <span style="font-weight:400;color:#A8BDAF;">(edit or keep)</span></div>'
    + '<textarea class="field-input field-textarea" id="sl-note" style="min-height:80px;">' + esc(resp.recNote || '') + '</textarea>'
    + '</div>'

    // Rating
    + '<div class="field">'
    + '<div class="field-label">RATING</div>'
    + '<div id="sl-stars" style="display:flex;gap:0;align-items:center;" data-rating="' + (resp.recRating || 5) + '">' + starsHtml + '</div>'
    + '</div>'

    + '</div>'
    + '<div class="modal-footer">'
    + '<button class="btn btn-secondary" data-action="close-modal">Cancel</button>'
    + '<button class="btn btn-primary" data-action="confirm-save-to-library" data-resp-id="' + esc(respId) + '">Save to Library</button>'
    + '</div>'
    + '</div></div>';

  // Close when clicking outside the modal
  const overlayEl2 = root.querySelector('.modal-overlay');
  const modalEl2   = root.querySelector('.modal');
  if (overlayEl2 && modalEl2) {
    overlayEl2.addEventListener('click', function(e) {
      if (!modalEl2.contains(e.target)) closeModal();
    });
  }
}

async function handleConfirmSaveToLibrary(respId) {
  if (!AppState.queryState) return;
  const resp = AppState.queryState.responses.find(function(r) { return r.id === respId; });
  if (!resp) return;

  const name = (document.getElementById('sl-name') || {}).value.trim();
  const cat  = (document.getElementById('sl-cat') || {}).value.trim();
  const loc  = (document.getElementById('sl-loc') || {}).value.trim();
  const note = (document.getElementById('sl-note') || {}).value.trim();
  const starsEl = document.getElementById('sl-stars');
  const rating = starsEl ? parseInt(starsEl.dataset.rating) || 5 : 5;

  if (!name) { toast('Please enter a name.', 'warn'); return; }

  const emojiMap = { restaurant:'🍽️', book:'📖', film:'🎬', hotel:'🏨', doctor:'👩‍⚕️', wine:'🍷', bar:'🍷', place:'📍', museum:'🏛️', physiotherapist:'🦴', cardiologist:'❤️', dermatologist:'👩‍⚕️', plumber:'🔧', cinema:'🎬' };
  const catLow = (cat || '').toLowerCase();
  const emojiKey = Object.keys(emojiMap).find(function(k){ return catLow.includes(k); });
  const emoji = resp.recEmoji || emojiMap[emojiKey] || '📌';

  const existingCan2 = findExistingCanonical(name, loc);
  const canId = existingCan2 ? existingCan2.id : uid();
  const recId = uid();
  const dupRec2 = existingRecFor(canId);
  if (dupRec2) {
    if (note) dupRec2.note = note;
    dupRec2.rating = Math.min(5, Math.max(1, rating));
    await saveRecs();
    resp.savedToLibrary = true;
    await saveQueries();
    closeModal();
    toast('"' + name + '" was already in your library — updated it.');
    renderApp();
    return;
  }
  const newCan = existingCan2 ? null : { id: canId, type: 'place', name: name, category: cat, location: loc, imageEmoji: emoji, externalLinks: {} };
  const newRec = {
    id: recId, canonicalId: canId, circleId: AppState.queryState.circleId,
    queryId: (AppState.queryState && (AppState.queryState.queryId || AppState.queryState._historyQueryId)) || null,
    recommendedBy: resp.contactId || 'user', note: note,
    rating: Math.min(5, Math.max(1, rating)),
    tags: resp.recTags || [], date: new Date().toISOString().split('T')[0],
    status: 'saved', degree: resp.isAnonymous ? 2 : 1, isAnonymous: resp.isAnonymous || false,
    sharedToNetwork: shareDefault()
  };

  if (newCan) AppState.userCanonicals.push(newCan);
  AppState.userRecs.push(newRec);
  await saveCanonicals();
  await saveRecs();
  requestClassify(canId, note, AppState.queryState ? AppState.queryState.text : '');

  // Mark response as saved so button changes to ✓ — and PERSIST it,
  // or the 60s heartbeat re-fetch resurrects the button (bug fixed v0.16.1)
  resp.savedToLibrary = true;
  await saveQueries();

  closeModal();
  toast('"' + name + '" saved to your library.');

  // Re-render the response list in place without resetting query state
  const respEl = document.getElementById('q-responses');
  if (respEl && AppState.queryState) {
    const updatedHtml = AppState.queryState.responses.slice(0, AppState.queryState.visibleCount).map(function(r) {
      const mem = r.isAnonymous ? null : AppState.memberById(r.contactId);
      const saved = r.savedToLibrary;
      return '<div class="response-card animate-in" style="padding:16px 18px;">'
        + (mem ? avatarEl(mem, 'sm') : '<div style="width:32px;height:32px;border-radius:50%;background:#C6EDD9;display:flex;align-items:center;justify-content:center;font-size:14px;">🕵️</div>')
        + '<div class="response-body">'
        + '<div class="response-name">' + (mem ? esc(mem.name) : 'Anonymous') + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin:6px 0 4px;">'
        + '<span style="font-size:16px;">' + esc(r.recEmoji || '📌') + '</span>'
        + '<span style="font-size:13px;font-weight:700;color:#1C2420;">' + esc(r.recName) + '</span>'
        + (r.recLoc ? '<span style="font-size:11px;color:#7A9086;">· ' + esc(r.recLoc) + '</span>' : '')
        + '</div>'
        + '<div style="font-size:12px;color:#3D4F46;line-height:1.6;margin-bottom:10px;">' + esc(r.recNote) + '</div>'
        + (r.recTags && r.recTags.length ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">' + r.recTags.slice(0,3).map(function(t){return'<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#E5EDE8;color:#56695F;">#'+esc(t)+'</span>';}).join('') + '</div>' : '')
        + respFindLinks(r.recName, r.recLoc, AppState.queryState ? AppState.queryState.circleId : null)
        + '<div class="response-actions" style="display:flex;gap:8px;flex-wrap:wrap;">'
        + (saved ? '<span style="font-size:12px;color:#2D9460;font-weight:600;">✓ Saved to library</span>' : '<button class="btn btn-primary btn-sm" data-action="save-to-library" data-resp-id="' + esc(r.id) + '">+ Save to Library</button>')
        + (!r.isAnonymous && mem ? '<button class="btn btn-secondary btn-sm" data-action="open-reply" data-resp-id="' + esc(r.id) + '" data-member-name="' + esc(mem.name) + '">Reply</button>' : '')
        + '</div></div></div>';
    }).join('');
    respEl.innerHTML = updatedHtml;
  } else {
    renderApp(); // saving from history-detail or other views: full re-render flips the button
  }
}

async function handleSaveFromFeed(idx) {
  const f = AppState._feed[idx];
  if (!f) return;
  if (!AppState.canonicalById(f.canonical_id)) {
    AppState.userCanonicals.push({ id: f.canonical_id, type: 'place', name: f.can_name || '',
      category: f.can_category || '', location: f.can_location || '',
      imageEmoji: f.can_emoji || '📌', _noSync: true });
  }
  const viaMember = AppState.userMembers.find(function(m) { return m.linkedUserId === f.recommender_id; });
  const myCircle = AppState.userCircles.find(function(c) { return c.domain === f.domain; });
  AppState.userRecs.push({
    id: uid(), canonicalId: f.canonical_id,
    circleId: myCircle ? myCircle.id : '',
    recommendedBy: viaMember ? viaMember.id : (AppState.userProfile ? AppState.userProfile.id : null),
    note: f.note || '', rating: f.rating || 0, tags: f.tags || [],
    status: 'saved', isAnonymous: false, degree: 1, sharedToNetwork: shareDefault(),
    date: new Date().toISOString().slice(0, 10)
  });
  await saveRecs();
  requestClassify(f.canonical_id, f.note || '');
  renderApp();
  toast('Saved to your library.');
}

async function handleClearData() {
  if (!confirm('Sign out of Trustnet on this device?')) return;
  try { await sb.auth.signOut(); } catch (e) {}
  location.reload();
}

async function handleSwitchDemo(userId) {
  AppState.isDemoMode = true;
  AppState.demoUserId = userId;
  AppState.queryState = null;
  showView('home');
  const user = AppState.synUsers.find(function(u) { return u.id === userId; });
  if (user) toast('Viewing ' + user.name + '\'s network');
}

function handleSwitchToOwn() {
  AppState.isDemoMode = false;
  AppState.demoUserId = null;
  AppState.queryState = null;
  showView('home');
  toast('Back to your account');
}

// SIMULATED: add a reciprocal contact back — creates a real circle+member so
// the user sees them appear, then marks the nudge as handled.
// SIMULATED: Step 1 — open a picker so the user chooses WHERE to add the contact
function handleAddReciprocal(recipId) {
  openModal('add-reciprocal', { recipId: recipId });
}

// SIMULATED: Step 2 — actually add the contact to the chosen circle.
// circleId may be an existing circle id, or 'new:<domain>' to create one.
async function handleConfirmAddReciprocal(recipId, circleChoice) {
  const recip = SIMULATED_RECIPROCALS.find(function(r) { return r.id === recipId; });
  if (!recip) return;

  var circle;
  if (circleChoice && circleChoice.indexOf('new:') === 0) {
    var domain = circleChoice.slice(4);
    var domainNames = { dining: 'Dining', travel: 'Travel', healthcare: 'Healthcare', culture: 'Culture', home: 'Home', hobbies: 'Hobbies', professional: 'Professional', other: 'Recommendations' };
    circle = { id: uid(), ownerId: 'me', name: domainNames[domain] || 'Recommendations', domain: domain, description: '', color: recip.avatarColor, memberIds: [], isOwn: true, createdAt: new Date().toISOString() };
    AppState.userCircles.push(circle);
  } else {
    circle = AppState.userCircles.find(function(c) { return c.id === circleChoice; });
  }
  if (!circle) { toast('Please choose a circle.', 'warn'); return; }

  var newMember = {
    id: uid(), name: recip.name,
    avatar: recip.avatar, avatarColor: recip.avatarColor,
    isExternalSource: false,
    trustBasis: recip.trustBasis, contactMethod: 'app', responseRate: 'high',
    circleId: circle.id, addedAt: new Date().toISOString()
  };
  AppState.userMembers.push(newMember);
  if (!circle.memberIds) circle.memberIds = [];
  circle.memberIds.push(newMember.id);

  AppState.addedReciprocals.push(recipId);
  await saveCircles();
  await saveMembers();
  closeModal();
  renderApp();
  toast(recip.name + ' added to your ' + circle.name + ' circle.');
}

/* ═══════════════════════════════════════════════
   GLOBAL EVENT DELEGATION
   ═══════════════════════════════════════════════ */

document.addEventListener('click', function(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'nav') {
    const view = target.dataset.view;
    const params = {};
    if (target.dataset.circleId) params.circleId = target.dataset.circleId;
    if (target.dataset.recId) params.recId = target.dataset.recId;
    if (target.dataset.queryId) params.queryId = target.dataset.queryId;

    // If "ask this circle" includes a circle param, pass it through
    if (view === 'query' && params.circleId) AppState.viewParams.circleId = params.circleId;
    else if (view !== 'query') delete AppState.viewParams.circleId;

    // Switch back to own account if clicking main nav while in demo mode
    if (AppState.isDemoMode && ['home','circles','library','taste-match','profile','settings'].includes(view)) {
      AppState.isDemoMode = false; AppState.demoUserId = null;
    }
    showView(view, params);
  }
  else if (action === 'open-modal') {
    // Forward the FULL dataset — modals declare their params as data-* on the
    // opening button (v0.19.1 fix: token/title were being dropped)
    openModal(target.dataset.modal, Object.assign({}, target.dataset));
  }
  else if (action === 'close-modal') {
    closeModal();
  }
  else if (action === 'save-circle') {
    handleSaveCircle();
  }
  else if (action === 'open-fab') {
    openModal('fab-menu');
  }
  else if (action === 'fab-ask') {
    closeModal();
    showView('query');
  }
  else if (action === 'fab-save') {
    closeModal();
    openModal('add-rec');
  }
  else if (action === 'home-ask-go') {
    handleHomeAsk();
  }
  else if (action === 'open-resolve') {
    openModal('resolve-query', { queryId: target.dataset.queryId });
  }
  else if (action === 'resolve-pick') {
    handleResolveQuery(target.dataset.queryId, target.dataset.responseId || null);
  }
  else if (action === 'refresh-inbox') {
    AppState._notifFetched = false;
    AppState._notifications = [];
    renderApp();
  }
  else if (action === 'open-sheet') {
    AppState._sheet = null;
    showView('sheet', { queryId: target.dataset.queryId });
  }
  else if (action === 'nav-history-detail') {
    showView('history-detail', { queryId: target.dataset.queryId });
  }
  else if (action === 'save-from-sheet') {
    handleSaveFromSheet(parseInt(target.dataset.sheetIdx, 10));
  }
  else if (action === 'ingest-link') {
    (async function() {
      const urlEl = document.getElementById('ar-url');
      const btn = document.getElementById('ar-url-btn');
      const url = urlEl ? urlEl.value.trim() : '';
      if (!/^https?:\/\/.+/i.test(url)) { toast('Paste a full link starting with http…', 'warn'); return; }
      if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
      let r;
      try { r = await fnPost('ingest-link', { url: url }); }
      catch (e) { r = { error: 'network' }; }
      if (btn) { btn.disabled = false; btn.textContent = 'Fetch'; }
      if (!r || r.error) { toast('Could not read that link' + (r && r.error ? ' (' + r.error + ')' : '') + ' — fill it in manually.', 'warn'); return; }
      const setV = function(id, v) { const el = document.getElementById(id); if (el && v) el.value = v; };
      setV('ar-name', r.name || r.source_title || '');
      setV('ar-cat', r.category ? domainLabel(r.category) : '');
      setV('ar-location', r.location || '');
      setV('ar-note', r.note || '');
      setV('ar-tags', (r.tags || []).join(', '));
      AppState._ingestUrl = r.url || url;
      AppState._ingestImage = (r.image_url && /^https?:\/\//i.test(r.image_url)) ? r.image_url : null;
      toast(r.needs_review
        ? 'Filled what I could — please check the name before saving.'
        : 'Got it — review and save.');
    })();
  }
  else if (action === 'retry-classify') {
    const rc = AppState.canonicalById(target.dataset.canId);
    if (rc) { rc._classifyFailed = null; AppState._classErrToasted = false; requestClassify(rc.id, ''); renderApp(); }
  }
  else if (action === 'fix-category') {
    openModal('fix-category', { canId: target.dataset.canId });
  }
  else if (action === 'apply-category') {
    (async function() {
      const canId = target.dataset.canId;
      const cat = target.dataset.cat;
      const can = AppState.canonicalById(canId);
      await sb.rpc('correct_category', { p_canonical_id: canId, p_category: cat });
      if (can) { can.primaryCategory = cat; }
      closeModal();
      renderApp();
      toast('Filed under ' + domainLabel(cat) + ' — noted for next time.');
    })();
  }
  else if (action === 'open-circle-link') {
    handleOpenCircleLink(target.dataset.circleId, target.dataset.circleName || 'this');
  }
  else if (action === 'copy-circle-link') {
    if (AppState._circleLink && navigator.clipboard) {
      navigator.clipboard.writeText(AppState._circleLink.url).then(function() {
        toast('Link copied.');
      }).catch(function() { toast('Copy failed — select and copy manually.', 'warn'); });
    }
  }
  else if (action === 'revoke-circle-link') {
    (async function() {
      await sb.rpc('revoke_circle_link', { p_circle_id: target.dataset.circleId });
      closeModal();
      toast('Link disabled. Open "Invite link" again to create a fresh one.');
    })();
  }
  else if (action === 'toggle-share-default') {
    if (AppState.userProfile) {
      AppState.userProfile.shareByDefault = !(AppState.userProfile.shareByDefault !== false);
      saveProfile();
      renderApp();
      toast(AppState.userProfile.shareByDefault
        ? 'New recommendations will be shared with people who trust you.'
        : 'Sharing off — new recommendations stay private.');
    }
  }
  else if (action === 'toggle-share-rec') {
    const tr = AppState.userRecs.find(function(x) { return x.id === target.dataset.recId; });
    if (tr) {
      tr.sharedToNetwork = !tr.sharedToNetwork;
      saveRecs();
      renderApp();
      toast(tr.sharedToNetwork ? 'Shared with people who trust you.' : 'No longer shared.');
    }
  }
  else if (action === 'save-from-feed') {
    handleSaveFromFeed(parseInt(target.dataset.feedIdx, 10));
  }
  else if (action === 'refresh-feed') {
    AppState._feedFetched = false;
    AppState._feed = [];
    renderApp();
  }
  else if (action === 'refresh-answered') {
    AppState._answeredFetched = false;
    AppState._answered = [];
    renderApp();
  }
  else if (action === 'edit-member') {
    const em2 = AppState.userMembers.find(function(x) { return x.id === target.dataset.memberId; });
    if (em2) openModal('add-member', { circleId: em2.circleId, editMemberId: em2.id });
  }
  else if (action === 'remove-member') {
    const rm = AppState.userMembers.find(function(x) { return x.id === target.dataset.memberId; });
    if (rm && confirm('Remove ' + rm.name + ' from this circle?')) {
      const rid = rm.id;
      AppState.userMembers = AppState.userMembers.filter(function(x) { return x.id !== rid; });
      AppState.userCircles.forEach(function(c) {
        if (c.memberIds) c.memberIds = c.memberIds.filter(function(i) { return i !== rid; });
      });
      saveMembers(); saveCircles();
      renderApp();
      toast(rm.name + ' removed.');
    }
  }
  else if (action === 'pick-segment') {
    // Generic segmented button picker — updates hidden input and visual state
    const pickerId = target.dataset.pickerId;
    const val = target.dataset.value;
    const pickerEl = document.getElementById(pickerId + '-picker');
    const hiddenEl = document.getElementById(pickerId);
    if (pickerEl) {
      pickerEl.dataset.selected = val;
      pickerEl.querySelectorAll('[data-action="pick-segment"]').forEach(function(btn) {
        const sel = btn.dataset.value === val;
        btn.style.borderColor = sel ? '#217A4B' : '#CDD9D1';
        btn.style.background  = sel ? '#EBF7F1' : '#fff';
        btn.style.color       = sel ? '#1A5235' : '#56695F';
      });
    }
    if (hiddenEl) hiddenEl.value = val;

    // Add-member modal: show/relabel the contact field per channel
    if (pickerId === 'nm-method') {
      const wrap = document.getElementById('nm-contact-wrap');
      const label = document.getElementById('nm-contact-label');
      const input = document.getElementById('nm-contact');
      if (wrap && label && input) {
        if (val === 'email') {
          wrap.style.display = 'block'; label.textContent = 'THEIR EMAIL';
          input.placeholder = 'name@example.com';
        } else if (val === 'whatsapp') {
          wrap.style.display = 'block'; label.textContent = 'THEIR WHATSAPP NUMBER';
          input.placeholder = '+972 50 123 4567 (with country code)';
        } else if (val === 'linkedin') {
          wrap.style.display = 'block'; label.textContent = 'THEIR LINKEDIN URL';
          input.placeholder = 'linkedin.com/in/their-name';
        } else {
          wrap.style.display = 'none';
        }
      }
    }
  }
  else if (action === 'pick-member-type') {
    const type = target.dataset.type;
    const typeInput = document.getElementById('nm-type');
    if (typeInput) typeInput.value = type;
    const personBtn  = document.getElementById('nm-type-person');
    const sourceBtn  = document.getElementById('nm-type-source');
    const personFlds = document.getElementById('nm-person-fields');
    const sourceFlds = document.getElementById('nm-source-fields');
    const isPerson = type === 'person';
    if (personBtn) { personBtn.style.background = isPerson ? '#EBF7F1' : '#fff'; personBtn.style.color = isPerson ? '#1A5235' : '#56695F'; }
    if (sourceBtn) { sourceBtn.style.background = !isPerson ? '#EBF7F1' : '#fff'; sourceBtn.style.color = !isPerson ? '#1A5235' : '#56695F'; }
    if (personFlds) personFlds.style.display = isPerson ? 'flex' : 'none';
    if (sourceFlds) sourceFlds.style.display  = !isPerson ? 'flex' : 'none';
  }
  else if (action === 'save-member') {
    handleSaveMember();
  }
  else if (action === 'pick-ar-circle') {
    const cid = target.dataset.circleId;
    const hiddenEl = document.getElementById('ar-circle');
    if (hiddenEl) hiddenEl.value = cid;
    document.querySelectorAll('.ar-circle-opt').forEach(function(opt) {
      const isMe = opt.dataset.circleId === cid;
      const c = AppState.circleById(opt.dataset.circleId);
      opt.style.borderColor = isMe ? (c ? c.color || '#217A4B' : '#217A4B') : '#CDD9D1';
      opt.style.background  = isMe ? 'rgba(33,122,75,0.04)' : '#fff';
      const chk = opt.querySelector('svg');
      const ph  = opt.querySelector('div[style*="width:14px"]');
      if (isMe && ph)  { ph.outerHTML  = '<svg style="width:14px;height:14px;color:#217A4B;flex-shrink:0;" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>'; }
      if (!isMe && chk) { chk.outerHTML = '<div style="width:14px;"></div>'; }
    });
  }
  else if (action === 'set-ar-star') {
    const n = parseInt(target.dataset.n);
    const starsEl = document.getElementById('ar-stars');
    if (starsEl) {
      starsEl.dataset.rating = n;
      starsEl.querySelectorAll('.ar-star').forEach(function(s) {
        s.style.opacity = parseInt(s.dataset.n) <= n ? '1' : '0.3';
      });
    }
  }
  else if (action === 'save-rec') {
    handleSaveRec();
  }
  else if (action === 'save-profile') {
    handleSaveProfile();
  }
  else if (action === 'send-query') {
    handleSendQuery();
  }
  else if (action === 'resend-member') {
    handleResendMember(target);
  }
  else if (action === 'triage-assign') {
    handleTriageAssign(target);
  }
  else if (action === 'create-collection') {
    handleCreateCollection(target);
  }
  else if (action === 'copy-collection-link') {
    handleCopyCollectionLink(target);
  }
  else if (action === 'send-collection') {
    handleSendCollection(target);
  }
  else if (action === 'select-circle') {
    const cid = target.dataset.circleId;
    const hiddenInput = document.getElementById('q-circle');
    if (hiddenInput) hiddenInput.value = cid;
    // Update visual state of all circle options
    document.querySelectorAll('.q-circle-option').forEach(function(opt) {
      const isMe = opt.dataset.circleId === cid;
      const circle = AppState.circleById(opt.dataset.circleId);
      const color = circle ? (circle.color || '#217A4B') : '#CDD9D1';
      opt.style.borderColor = isMe ? color : '#CDD9D1';
      opt.style.background = isMe ? 'rgba(33,122,75,0.04)' : '#fff';
      // Swap checkmark
      const last = opt.lastElementChild;
      if (isMe) {
        last.outerHTML = '<svg style="width:16px;height:16px;color:#217A4B;flex-shrink:0;" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
      } else {
        opt.lastElementChild.outerHTML = '<div style="width:16px;"></div>';
      }
    });
    // Trigger routing update
    const routingUpdateEvent = new Event('change');
    if (hiddenInput) hiddenInput.dispatchEvent(routingUpdateEvent);
  }
  else if (action === 'reset-query') {
    AppState.queryState = null;
    showView('query');
  }
  else if (action === 'confirm-save-to-library') {
    handleConfirmSaveToLibrary(target.dataset.respId);
  }
  else if (action === 'set-star') {
    const n = parseInt(target.dataset.n);
    const starsEl = document.getElementById('sl-stars');
    if (starsEl) {
      starsEl.dataset.rating = n;
      starsEl.querySelectorAll('.save-lib-star').forEach(function(s) {
        s.style.opacity = parseInt(s.dataset.star) <= n ? '1' : '0.25';
      });
    }
  }
  else if (action === 'open-reply') {
    openModal('reply', { respId: target.dataset.respId, memberName: target.dataset.memberName });
  }
  else if (action === 'send-reply') {
    var text = (document.getElementById('reply-text') || {}).value.trim();
    var name = target.dataset.memberName || 'contact';
    if (!text) { toast('Please write a message first.', 'warn'); return; }
    closeModal();
    toast('Reply sent to ' + name + '.');
  }
  else if (action === 'save-to-library-history') {
    // Save a response from history detail to library
    var qId = target.dataset.queryId;
    var rId = target.dataset.respId;
    var hq = AppState.userQueries.find(function(x) { return x.id === qId; });
    if (!hq) return;
    var hr = (hq.responses || []).find(function(x) { return x.id === rId; });
    if (!hr || hr.savedToLibrary) { toast('Already saved.', 'warn'); return; }
    // Reuse the save-to-library modal
    AppState.queryState = { phase: 'history', text: hq.text, circleId: hq.circleId, responses: hq.responses, visibleCount: hq.responses.length, _historyQueryId: qId };
    handleSaveToLibrary(rId);
  }
  else if (action === 'save-to-library') {
    handleSaveToLibrary(target.dataset.respId);
  }
  else if (action === 'toggle-status') {
    handleToggleStatus(target.dataset.recId, target.dataset.status);
  }
  else if (action === 'set-filter') {
    AppState.activeFilter = target.dataset.filter;
    // Update chip active states in place
    document.querySelectorAll('.filter-chip:not(.cat-tab)').forEach(function(chip) {
      chip.classList.toggle('active', chip.dataset.filter === AppState.activeFilter);
    });
    libUpdateResultsInPlace();
  }
  else if (action === 'set-cat-filter') {
    AppState.activeCatFilter = target.dataset.cat;
    document.querySelectorAll('.cat-tab').forEach(function(chip) {
      chip.classList.toggle('active', chip.dataset.cat === AppState.activeCatFilter);
    });
    libUpdateResultsInPlace();
  }
  else if (action === 'switch-demo') {
    handleSwitchDemo(target.dataset.userId);
  }
  else if (action === 'request-intro') {
    toast('Introduction requested — they\'ll be notified anonymously.');
  }
  else if (action === 'dismiss-reciprocal') {
    var rid = target.dataset.recipId;
    if (rid && !AppState.dismissedReciprocals.includes(rid)) {
      AppState.dismissedReciprocals.push(rid);
    }
    renderApp();
  }
  else if (action === 'add-reciprocal') {
    handleAddReciprocal(target.dataset.recipId);
  }
  else if (action === 'confirm-add-reciprocal') {
    handleConfirmAddReciprocal(target.dataset.recipId, target.dataset.circleChoice);
  }
  else if (action === 'open-share-list') {
    openModal('share-list');
  }
  else if (action === 'open-invite') {
    openModal('invite', { circleName: target.dataset.circleName });
  }
  else if (action === 'copy-share-link') {
    toast('Link copied to clipboard.');
  }
  else if (action === 'send-invite-sim') {
    closeModal();
    toast('Invite sent (simulated).');
  }
  else if (action === 'clear-data') {
    handleClearData();
  }
});

// Library search — update only the results, never re-render the whole view
document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'lib-search') {
    AppState.searchQuery = e.target.value;
    clearTimeout(window._searchDebounce);
    window._runLibFilter = libUpdateResultsInPlace;
    window._searchDebounce = setTimeout(window._runLibFilter, 160);

    // Semantic layer: meaning-search over the library (Hebrew/English)
    const sq = (AppState.searchQuery || '').trim();
    if (sq.length >= 3 && !AppState.isDemoMode) {
      AppState._semPending = true;
      clearTimeout(window._semDebounce);
      window._semDebounce = setTimeout(function() {
        const q = sq.toLowerCase();
        fnPost('search-library', { q: sq }).then(function(r) {
          if ((AppState.searchQuery || '').trim().toLowerCase() === q) {
            AppState._semPending = false;
            if (r && r.ids) AppState._semantic = { q: q, ids: r.ids };
            libUpdateResultsInPlace();
          }
        }).catch(function() {
          AppState._semPending = false;
          libUpdateResultsInPlace();
        });
      }, 600);
    } else {
      AppState._semantic = null;
      AppState._semPending = false;
    }
  }
});

// Keyboard: Escape closes modal
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

document.addEventListener('visibilitychange', function() {
  if (!document.hidden) refreshLive();
});

/* ═══════════════════════════════════════════════
   ONBOARDING
   ═══════════════════════════════════════════════ */

function initOnboarding() {
  const startBtn = document.getElementById('ob-start');
  if (startBtn) {
    startBtn.addEventListener('click', async function() {
      const name = (document.getElementById('ob-name') || {}).value.trim();
      const location = (document.getElementById('ob-location') || {}).value.trim();
      if (!name) { toast('Please enter your name.', 'warn'); return; }

      // Auto-assign colour based on first initial
      const palette = ['#217A4B','#1A6FA8','#8B2FC9','#C0392B','#E8A020','#2D6A8A','#3D7D6F','#A04020'];
      const charCode = (name.charCodeAt(0) || 0);
      const color = palette[charCode % palette.length];

      const avatar = name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
      const sess = (await sb.auth.getSession()).data.session;
      if (!sess) { toast('Session expired — please sign in again.', 'warn'); location.reload(); return; }
      CURRENT_UID = sess.user.id;
      AppState.userProfile = { id: sess.user.id, name: name, avatar: avatar, avatarColor: color, location: location, bio: '', email: sess.user.email || '', joinedDate: new Date().toISOString() };
      await saveProfile();
      try { await sb.rpc('link_member_on_signup', { p_user_id: sess.user.id, p_email: sess.user.email || null, p_phone: null }); } catch (e) {}
      const pendingJoin2 = localStorage.getItem('tn_join_token');
      if (pendingJoin2) { await handleJoinViaLink(pendingJoin2); }

      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      showView('home');
      toast('Welcome to Trustnet, ' + name + '! 🎉');
    });
  }
}

/* ═══════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════ */

function hideLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.opacity = '0'; setTimeout(function() { ls.style.display = 'none'; }, 420); }
}

function showLoginScreen() {
  hideLoadingScreen();
  document.getElementById('app').style.display = 'none';
  document.getElementById('onboarding').style.display = 'none';
  const lg = document.getElementById('login');
  lg.style.display = 'flex';
  const btn = document.getElementById('login-send');
  if (btn && !btn._wired) {
    btn._wired = true;
    btn.addEventListener('click', async function() {
      const email = (document.getElementById('login-email') || {}).value.trim();
      const errEl = document.getElementById('login-err');
      if (!email || email.indexOf('@') < 1) { errEl.textContent = 'Please enter a valid email.'; errEl.style.display = 'block'; return; }
      errEl.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Sending…';
      const pj = localStorage.getItem('tn_join_token');
      const redirectTo = pj ? (location.origin + '/?join=' + encodeURIComponent(pj)) : location.origin;
      const r = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo } });
      btn.disabled = false; btn.textContent = 'Send sign-in link';
      if (r.error) { errEl.textContent = r.error.message; errEl.style.display = 'block'; return; }
      document.getElementById('login-sent-addr').textContent = email;
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('login-sent').style.display = 'block';
      const codeIn = document.getElementById('login-code');
      if (codeIn) setTimeout(function() { codeIn.focus(); }, 100);
    });
  }
  const vbtn = document.getElementById('login-verify');
  if (vbtn && !vbtn._wired) {
    vbtn._wired = true;
    const doVerify = async function() {
      const email = (document.getElementById('login-sent-addr') || {}).textContent || '';
      const code = (((document.getElementById('login-code') || {}).value || '')).replace(/[^0-9]/g, '');
      const errEl = document.getElementById('login-code-err');
      if (!/^[0-9]{5,10}$/.test(code)) { errEl.textContent = 'Enter the code exactly as it appears in the email.'; errEl.style.display = 'block'; return; }
      errEl.style.display = 'none';
      vbtn.disabled = true; vbtn.textContent = 'Checking…';
      const r = await sb.auth.verifyOtp({ email: email, token: code, type: 'email' });
      if (r.error) {
        vbtn.disabled = false; vbtn.textContent = 'Sign in';
        errEl.textContent = 'Sign-in failed: ' + r.error.message; errEl.style.display = 'block';
        return;
      }
      location.reload();
    };
    vbtn.addEventListener('click', doVerify);
    const codeEl = document.getElementById('login-code');
    if (codeEl) codeEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') doVerify(); });
  }
  const backLink = document.getElementById('login-back');
  if (backLink && !backLink._wired) {
    backLink._wired = true;
    backLink.addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('login-sent').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
    });
  }
}

async function boot() {
  // Capture a circle-join token from the URL; it must survive the magic-link
  // round trip (which opens a new tab), so stash it in localStorage.
  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam) {
    localStorage.setItem('tn_join_token', joinParam);
    history.replaceState(null, '', location.pathname);
  }
  const collParam = new URLSearchParams(location.search).get('collection');
  if (collParam) {
    localStorage.setItem('tn_collection_token', collParam);
    history.replaceState(null, '', location.pathname);
  }

  const sess = (await sb.auth.getSession()).data.session;
  if (!sess) { showLoginScreen(); return; }
  CURRENT_UID = sess.user.id;
  AppState._authEmail = sess.user.email || '';

  try { await loadUserData(); } catch (e) { console.error('load failed', e); }
  hideLoadingScreen();
  if (!AppState._livePoll) {
    AppState._livePoll = setInterval(refreshLive, 60000);
  }

  if (!AppState.userProfile) {
    document.getElementById('onboarding').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    initOnboarding();
  } else {
    document.getElementById('onboarding').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    const pendingJoin = localStorage.getItem('tn_join_token');
    if (pendingJoin) { await handleJoinViaLink(pendingJoin); }
    const pendingColl = localStorage.getItem('tn_collection_token');
    if (pendingColl) { await handleImportCollection(pendingColl); }
    showView(pendingColl ? 'library' : 'home');
  }
}

boot();
