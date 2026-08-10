
window.TRUSTNET_CONFIG = {
  FUNCTIONS_URL: "https://kgsdtfrcyjrxeyqqxoic.supabase.co/functions/v1",
  APP_URL: location.origin
};
const CFG = window.TRUSTNET_CONFIG || {};
const SUPABASE_FUNCTIONS_URL = CFG.FUNCTIONS_URL || window.TRUSTNET_FUNCTIONS_URL || "https://YOUR_PROJECT.supabase.co/functions/v1";
const APP_URL = CFG.APP_URL || "https://trustnetsocial.netlify.app";
const RESPOND_VERSION = "r2.4-lib";
const LIB_DEBUG = new URLSearchParams(location.search).get("debug") === "1";
function dbg(line) {
  if (!LIB_DEBUG) return;
  const el = document.getElementById("lib-debug");
  if (el) { el.style.display = "block"; el.textContent += line + "\n"; }
}
const SUPABASE_REST_URL = "https://kgsdtfrcyjrxeyqqxoic.supabase.co/rest/v1";
const SUPABASE_ANON_KEY = "sb_publishable_8MAMd56FzHTyNZtnO2XK4A_cp2lFGEm";

const params = new URLSearchParams(location.search);
const token = params.get("t");

const $ = (id) => document.getElementById(id);
function show(view) {
  ["loading","form-view","thanks-view","error-view"].forEach((v) => $(v).classList.add("hidden"));
  $(view).classList.remove("hidden");
}

let context = { requesterName: "them", circleName: "" };

async function init() {
  if (LIB_DEBUG) initLibraryLookup();
  if (!token) { showError("Invalid link", "This link is missing its token."); return; }
  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/response-meta?t=${encodeURIComponent(token)}`);
    if (res.ok) {
      const meta = await res.json();
      if (meta.used) { showError("This link was already used", "Each response link works exactly once \u2014 a recommendation has already been sent from this one. If you have a newer request email, use the button in that message (in Gmail, the newest message sits at the bottom of the thread)."); return; }
      if (meta.expired) { showError(); return; }
      context.requesterName = meta.requester_name || "them";
      context.circleName = meta.circle_name || "";
      $("ask-from").textContent = context.requesterName + " is asking their " + context.circleName + " circle";
      $("ask-text").textContent = '"' + (meta.query_text || "") + '"';
    }
  } catch (_) { /* show form anyway */ }
  show("form-view");
  initLibraryLookup();
}

function escR(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

let LIB = null;
let libMatches = [];

function readTnSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/^sb-.*-auth-token$/.test(k)) continue;
      let o = null;
      try { o = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
      const tok = o && (o.access_token || (o.currentSession && o.currentSession.access_token));
      let uid = o && o.user && o.user.id;
      if (!uid && o && o.currentSession && o.currentSession.user) uid = o.currentSession.user.id;
      if (!uid && tok && tok.split(".").length === 3) {
        try { uid = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub; } catch (e) {}
      }
      if (tok && uid) return { token: tok, uid: uid };
    }
  } catch (e) {}
  return null;
}

let libInitDone = false;
async function initLibraryLookup() {
  if (libInitDone) return;
  libInitDone = true;
  dbg("respond " + RESPOND_VERSION);
  let keyList = [];
  try { for (let i = 0; i < localStorage.length; i++) keyList.push(localStorage.key(i)); } catch (e) { dbg("localStorage error: " + e.message); }
  dbg("storage keys (" + keyList.length + "): " + keyList.join(" | "));
  const sess = readTnSession();
  if (!sess) { dbg("session: NONE matched /^sb-.*-auth-token$/ -> strip stays hidden"); return; }
  dbg("session: found, uid=" + sess.uid + ", token len=" + (sess.token || "").length);
  let rows = [];
  try {
    const res = await fetch(SUPABASE_REST_URL + "/recommendations?select=id,note,rating,canonicals(name,location,primary_category)&owner_id=eq." + encodeURIComponent(sess.uid), {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + sess.token }
    });
    dbg("REST status: " + res.status);
    if (!res.ok) {
      let bodyTxt = "";
      try { bodyTxt = await res.text(); } catch (e) {}
      dbg("REST error body: " + bodyTxt.slice(0, 300));
      return;
    }
    rows = await res.json();
    dbg("rows returned: " + (rows ? rows.length : "null"));
  } catch (e) { dbg("fetch exception: " + e.message); return; }
  LIB = (rows || []).filter((r) => r.canonicals && r.canonicals.name).map((r) => ({
    name: r.canonicals.name,
    location: r.canonicals.location || "",
    cat: r.canonicals.primary_category || "",
    note: r.note || ""
  }));
  dbg("usable items (with canonical): " + LIB.length);
  if (!LIB.length) { dbg("library empty -> strip stays hidden"); return; }
  dbg("strip: SHOWN");
  $("lib-strip").classList.remove("hidden");
  $("lib-search").addEventListener("input", renderLibResults);
  renderLibResults();
}

function renderLibResults() {
  if (!LIB) return;
  const q = ($("lib-search").value || "").trim().toLowerCase();
  // Nothing until they type: an arbitrary first-6 list reads as noise.
  libMatches = q
    ? LIB.filter((it) => (it.name + " " + it.location + " " + it.cat + " " + it.note).toLowerCase().indexOf(q) >= 0).slice(0, 6)
    : [];
  if (!q) {
    $("lib-results").innerHTML = '<div style="font-size:11.5px;color:#7A9086;">Type to search your saved recommendations.</div>';
    return;
  }
  $("lib-results").innerHTML = libMatches.map((it, i) =>
    '<div class="lib-row" data-lib-i="' + i + '" role="button" tabindex="0" style="background:#fff;border:1px solid #DCE7E0;border-radius:8px;padding:9px 12px;margin-bottom:6px;cursor:pointer;">'
    + '<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">'
    + '<span dir="auto" style="font-size:13.5px;font-weight:700;color:#1C2420;">' + escR(it.name) + '</span>'
    + (it.location ? '<span dir="auto" style="font-size:11px;color:#7A9086;">' + escR(it.location) + '</span>' : '')
    + (it.cat ? '<span style="font-size:9.5px;font-weight:700;color:#1A5235;background:#E9F6EE;border-radius:8px;padding:1px 7px;">' + escR(it.cat) + '</span>' : '')
    + '</div>'
    + (it.note ? '<div dir="auto" style="font-size:11.5px;color:#56695F;margin-top:3px;line-height:1.45;">' + escR(it.note.slice(0, 80)) + (it.note.length > 80 ? '\u2026' : '') + '</div>' : '')
    + '</div>').join('')
    + (libMatches.length === 0 && q ? '<div style="font-size:11.5px;color:#7A9086;">Nothing matching in your library \u2014 fill the form below.</div>' : '');
}

document.addEventListener("click", (e) => {
  const row = e.target && e.target.closest ? e.target.closest(".lib-row") : null;
  if (!row) return;
  const it = libMatches[parseInt(row.dataset.libI, 10)];
  if (!it) return;
  $("rec-name").value = it.name;
  $("rec-location").value = it.location;
  $("rec-note").value = it.note;
  $("lib-search").value = it.name;
  $("lib-results").innerHTML = "";
  $("lib-filled").style.display = "block";
});

function showError(title, body) {
  if (title) $("error-title").textContent = title;
  if (body) $("error-body").textContent = body;
  show("error-view");
}

$("submit-btn").addEventListener("click", async () => {
  const recName = $("rec-name").value.trim();
  if (!recName) { $("rec-name").focus(); return; }
  $("submit-btn").disabled = true;
  $("submit-btn").textContent = "Sending…";
  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/receive-response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        rec_name: recName,
        rec_location: $("rec-location").value.trim(),
        rec_note: $("rec-note").value.trim(),
        // Opt-OUT, not opt-in: default true, unticking keeps the answer private
        // to the asker. Stored on query_responses.shared_to_network (0026).
        shared_to_network: $("rec-share") ? !!$("rec-share").checked : true,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      // Personalise the conversion screen with real context
      $("thanks-title").textContent = "Sent to " + context.requesterName + "!";
      $("thanks-body").textContent =
        "You just gave " + context.requesterName + " a recommendation they'll actually trust.";
      if (context.circleName) {
        $("convert-headline").textContent =
          context.requesterName + " has you in their " + context.circleName + " circle.";
        $("convert-body").textContent =
          "People ask you for recommendations all the time. Trustnet keeps them in one place — and lets you ask your own trusted people back. No ads, no strangers, no algorithm.";
      }
      $("convert-btn").href = APP_URL;
      // A member answering from inside the app already HAS Trustnet — replace the
      // conversion pitch with a plain confirmation. Anonymous answerers keep it.
      if (readTnSession()) {
        var conv = document.querySelector(".convert");
        if (conv) {
          conv.innerHTML = '<div style="text-align:center;">'
            + '<a class="convert-btn" id="convert-btn" href="' + APP_URL + '">Back to Trustnet →</a>'
            + '</div>';
        }
      }
      show("thanks-view");
    } else if (data.error === "token_already_used") {
      showError("This link was already used", "Each response link works exactly once \u2014 a recommendation has already been sent from this one.");
    } else if (data.error === "token_expired") {
      showError();
    } else {
      $("submit-btn").disabled = false;
      $("submit-btn").textContent = "Send recommendation";
      alert("Something went wrong. Please try again.");
    }
  } catch (_) {
    $("submit-btn").disabled = false;
    $("submit-btn").textContent = "Send recommendation";
    alert("Network error. Please try again.");
  }
});

init();
