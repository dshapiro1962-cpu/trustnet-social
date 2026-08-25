# Beta smoke test · one pass through the whole product

Everything built on 24–25 Aug has been seen working **individually**. This walks
it all in one sequence, in the order a real person meets it. About 25 minutes.

Each step says what to DO, what to EXPECT, and what it PROVES. If a step fails,
stop and report that step number — later steps depend on earlier ones.

**Accounts used.** Two are enough:

- **A** = `dshapiro8@hotmail.com` — owns a `ski` circle with a confirmed `ski`
  interest, and **B** is a linked member of it.
- **B** = `dshapiro1962@gmail.com`

Use a different browser (or a private window) for each, so both stay signed in.

**Before starting:** hard-refresh both. Home must read **`v0.75.0 · live`** on
both. If it does not, nothing below is meaningful.

---

## Part A · The answer loop — the product itself

This is the only part where a stranger with no account is involved, and the part
that matters most.

**A1. As A, ask a question.**
DO — *Ask my circles* → the `ski` circle → ask something specific and
answerable, e.g. *"best ski resort in the Alps for a family week?"* → send.
EXPECT — a delivery list naming each member and how they were reached.
PROVES — `send-query` created a response row **before** sending. As of 24 Aug it
refuses to send a link whose row failed to insert.

**A2. Open the answer link as the member.**
DO — take the link B received (WhatsApp, email, or the in-app Answer button) and
open it. Answer with a real place — *"Avoriaz 1800"* — and add a sentence of
note.
EXPECT — a thanks screen.
PROVES — `receive-response` stored the answer. Since 24 Aug it will not show
that screen over a refused write; a failure now says *"That didn't save —
nothing was lost. Please press send again."*

**A3. As A, look at the answer.**
EXPECT — the answer appears with **the note intact**, attributed to B.
PROVES — the write landed and the notification is not being composed from the
request body.

**A4. Save it to your library.**
DO — Save to Library → keep the name → save.
EXPECT — it appears in A's library.
PROVES — `saveCanonicals` + `saveRecs` both wrote, id-scoped.

---

## Part B · The enricher — does it invent?

**B1. A name that says nothing.**
DO — as A, add an item called exactly `Jacob`. No location, no note.
EXPECT — it saves. No location appears. No category badge, or `Other`.
PROVES — the anchor guard. Before 24 Aug a bare name was resolved by web search
to whoever is most prominent with it, and written `verified: true`.
FAIL LOOKS LIKE — Jacob acquires a profession and a city out of nowhere.

**B2. A name that says what it is.**
DO — add `Rossignol Forza 90 skis`. Again no location, no note.
EXPECT — it saves, and within a few seconds a kind like `skis` appears.
PROVES — classifying is not inventing. The first version of the guard
suppressed this too, which broke suggestions entirely.
FAIL LOOKS LIKE — no kind at all. That blocks Part D.

**B3. The question frames the answer.** *(the Cherry Orchard case)*
DO — as A, ask the `ski` circle — or any circle — *"recommend me a good read"*.
As B, answer with `The Cherry Orchard`.
EXPECT — as A, the saved entity is a book/play. Not a farm, not a restaurant,
not a housing development.
PROVES — the question is being used as a type constraint, not decoration.
This is the 25 Aug change and the one with the least production evidence.

**B4. A lookup may not contradict a person.**
DO — add an item with a name that exists elsewhere in the world but give it a
local location: name `Art Pizza`, location `tel aviv`.
EXPECT — the location stays Tel Aviv, or becomes `Tel Aviv, Israel`. It must
NOT become New Haven, Connecticut.
PROVES — normalising is allowed; contradicting is not. `Art Pizza` became a New
Haven pizzeria under the old code.

---

## Part C · Search

**C1. A name that is not there.**
DO — as A, search the library for `greta`.
EXPECT — **nothing**.
PROVES — the reranker's empty verdict is final. It used to be overridden by a
fallback that returned "the closest match", which answered `greta` with
The Israel Museum at a trigram score of 0.500.

**C2. A name that is there.**
DO — search for the exact name of something in the library (`Avoriaz`).
EXPECT — it comes back.
PROVES — the name net still catches what the reranker drops.

**C3. Search by meaning.**
DO — search for something described only in a note, e.g. `family`.
EXPECT — items whose notes or questions are about that.
PROVES — the vector arm and the search documents are intact.

---

## Part D · Suggestions — the passive half

Trust points one way: **A owns the circle, B is in it, so A receives B's saves.**
Not the reverse.

**D1. Check the gate first.**
DO — as A, open the `ski` circle.
EXPECT — a green **THIS CIRCLE IS ABOUT · skiing** panel, not a prompt to set
it.
PROVES — the circle seeded its own interest from its name. A circle with no
confirmed interest receives nothing, silently, which is what cost an evening on
24 Aug.

**D2. B saves something skiing.**
DO — as **B**, save a ski item with a descriptive name (`Salomon QST 98 skis`).
Make sure it is shared to network.
EXPECT — nothing immediately.

**D3. Wait for the sweep, then check A's inbox.**
DO — wait a few minutes, then as **A** open Inbox.
EXPECT — a **SUGGESTED** card naming B.
PROVES — the whole sweep: shared_to_network → kind → confirmed interest →
membership → suggestion.
FAIL — go to Part G's sweep query; it names the gate that stopped it.

**D4. File it.**
DO — press **Add to my library**.
EXPECT — an in-app panel (NOT an OS dialog asking for a number). It should lead
with a circle that actually fits if you have one, say plainly if none does, and
offer **Save unfiled**.
PROVES — the 25 Aug filing fix. A native `prompt()` here is a regression.

---

## Part E · Categories

**E1. Set one.**
DO — as A, open any café-ish item → **YOUR CATEGORY** → type `coffee` → save.
EXPECT — the card's chip reads `coffee`, in a colour of its own. `coffee`
appears in the **Type:** filter row.
PROVES — `recommendations.category` is written and displayed.

**E2. It is yours, not the machine's.**
DO — filter by `coffee`.
EXPECT — only that item.
PROVES — the filter reads your word, falling back to the shared type only where
you have not spoken.

**E3. A use-case, not a type.**
DO — categorise a restaurant AND a shop both as `shabbat dinner`.
EXPECT — one category holding two different kinds of thing.
PROVES — the eight could never express this. This is the point of the change.

**E4. It learns.**
DO — categorise a **second** café as `coffee`. Reload.
EXPECT — any other café in the library with no category has filed itself as
`coffee`.
PROVES — two examples make a rule; one does not.
NOTE — only reaches items whose canonical has a `kind`. Older items predate the
enricher fixes and many have none; they will stay uncategorised. Not a bug.

---

## Part F · The save path under stress

The fault this whole exercise started from. Needs two devices signed in as the
**same** account.

**F1.** As A on device 1 and device 2, both loaded and idle.
**F2.** On **device 1**, delete a circle that has items filed in it.
**F3.** On **device 2** — which still has those items in memory pointing at the
now-deleted circle — save anything at all. Edit a note, change a rating.

EXPECT — it saves.
PROVES — the narrowed write. Before 24 Aug device 2 sent the whole library in
one statement including rows with a dead `circle_id`; Postgres refused all of
them with 23503, and **every future save on that device failed permanently**
with nothing on screen to say which row was at fault.
FAIL LOOKS LIKE — "Could not save to library" and it never recovers until
reload.

---

## Part G · What the UI cannot show

Supabase SQL editor.

**G1. Did anything get invented?** Should return no rows.

```sql
select c.name, c.location, c.kind, c.verified, c.classified_at
from public.canonicals c
where c.created_at > now() - interval '1 day'
  and c.verified = true
  and coalesce(c.location, '') <> ''
  and not exists (
    select 1 from public.recommendations r
    where r.canonical_id = c.id and coalesce(r.note, '') <> '')
order by c.created_at desc;
```

Rows here are things marked verified with a location, created today, that nobody
wrote a word about — the shape the Tony Vespa rows had.

**G2. Why did a suggestion not appear?** Replace the name.

```sql
with item as (
  select r.owner_id as contributor, r.canonical_id, c.name, c.kind,
         r.shared_to_network, r.created_at
  from public.recommendations r
  join public.canonicals c on c.id = r.canonical_id
  where lower(c.name) like '%salomon%'
  order by r.created_at desc limit 1
)
select i.name, i.kind, i.shared_to_network,
       (select last_at from public.sweep_state where name='suggestions') as sweep_last_at,
       ((select last_at from public.sweep_state where name='suggestions') >= i.created_at)
         as sweep_ran_after_save,
       cir.name as circle, ci.interest, ci.source,
       (m.id is not null) as contributor_is_linked_member
from item i
join public.circles cir
  on cir.owner_id = (select id from public.users where email = 'dshapiro8@hotmail.com')
left join public.circle_interests ci on ci.circle_id = cir.id
left join public.members m on m.circle_id = cir.id and m.linked_user_id = i.contributor
order by cir.name;
```

Read the ski row: a null `kind` is the enricher, a `source` that is not
`confirmed` is the circle, `contributor_is_linked_member` false is the
membership, `sweep_ran_after_save` false just means wait.

**G3. Are answers still attached to their questions?**

```sql
select count(*) filter (where canonical_id is null) as answers_with_no_entity,
       count(*)                                     as answers_today
from public.query_responses
where responded_at > now() - interval '1 day';
```

`answers_with_no_entity` should be 0.

---

## What this does NOT test

**The unchecked-write fixes.** Fifteen writes across nine functions now report
their own refusal, but you cannot make Postgres refuse a write by hand. Their
guard is `unchecked-writes-sim.js`, and it is a source-structure check, not a
behavioural one — stated plainly in its header.

**The OTP and invite-claim paths.** `wa-signin` and `complete-join` were changed
on 24 Aug and are only exercised by a genuinely new person signing up. Worth one
real invite to a phone that has never used Trustnet before beta.

**Anything about load.** One person, one item at a time.
