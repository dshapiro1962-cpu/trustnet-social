# Identity audit — who decides whether a person is on the app

**19 Aug 2026 · findings only, nothing changed.**

---

## The question

dan: *"how come we haven't solved the issue of the app using the email address
or phone number as the definitive identity of a person and using that identity
for every aspect of the app — e.g. knowing Chain Answerer is not on the app and
acting accordingly."*

**The answer: we solved it in the database and never propagated it.**

`resolve_contact` (0024) does exactly what he describes — one contact in, one
authoritative answer out: `found_person` / `in_circle` / `on_trustnet` / `free`.
`person_contacts` enforces one contact, one person. That work is correct.

**But it is called from ONE file** — `index.html` — and nowhere else. Every other
surface answers "who is this?" its own way.

---

## THIRTEEN SURFACES, SIX DIFFERENT QUESTIONS

| Surface | The question it actually asks |
|---|---|
| `respond.html` | **Is a session present in THIS browser?** |
| `wa-signin` | Does `users.phone_key` equal `phoneKey(phone)`? |
| `whatsapp-webhook` | Does `digits(users.phone)` equal `digits(sender)`? |
| `complete-join` | Does any user's `phoneKey(phone)` match? |
| `my_answered_queries` (0025) | Does `lower(contact_value)` equal `lower(email)`? |
| `link_member_to_existing_user` (0016) | `auth.users.email` OR `auth.users.phone` |
| `send-query`, `send-collection`, `resend-member`, `check-similar-query`, `check-reciprocal`, `update-taste-match`, `suggest-sweep` | Trusts `members.linked_user_id` was set correctly by someone earlier |
| `index.html` (add member) | **`resolve_contact` — the authoritative one** |

---

## The faults this produces

### 1. `respond.html` reads the WRONG PERSON'S session ● CONFIRMED TODAY

```js
if (readTnSession()) { /* replace the invitation with "Back to Trustnet" */ }
```

It asks whether a session exists **in this browser**, not whether **the
answerer** has an account.

dan added `dshari08@hotmail.com` as Chain Answerer, opened the answer link on his
own machine, and the page found **dan's** session — so it concluded the answerer
already had Trustnet, **suppressed the invitation**, and its "Back to Trustnet"
button landed on dan's account.

Not only a test artefact: anyone answering on a shared or family computer, or on
a machine where someone else used Trustnet, is denied the invitation. And
`receive-response` already knows the truth — the answerer's contact is right
there — but never tells the page.

### 2. Two phone normalisers that disagree ● PROVEN

```
phoneKey('0545543467')   -> '545543467'      (last 9 digits)
digits('0545543467')     -> '0545543467'     (all digits)
```

Same person, same phone, stored as `0545543467`, arriving from WhatsApp as
`972545543467`:

- **`wa-signin` MATCHES** (both reduce to `545543467`) → they sign in fine
- **`whatsapp-webhook` DOES NOT** (`0545543467` ≠ `972545543467`) → *"this phone
  isn't linked to an account yet"*

So a user can sign in by WhatsApp and then be refused by save-to-library, on the
same number, in the same app. Executed and confirmed, not inferred.

### 3. Phone-only lookups strand email users ● KNOWN, STILL OPEN

`wa-signin` and `complete-join` match on phone alone. Someone who signed up by
**email** before WhatsApp sign-in existed gets a **SECOND ACCOUNT** — their
library, circles and history stranded on the first. naama would have hit exactly
this; it is only unhit because her account was deleted.

### 4. Three implementations of one lookup

`wa-signin` uses the indexed `phone_key` column. `complete-join` loads EVERY user
and compares in JavaScript. `whatsapp-webhook` loads every user and compares with
a different rule. Three ways to answer one question, one of them wrong, and the
two that scan every row will not scale.

### 5. Nine functions trust a field they never verify

`send-query`, `send-collection`, `resend-member`, `check-similar-query`,
`check-reciprocal`, `update-taste-match`, `suggest-sweep` and others branch on
`members.linked_user_id`. **Nothing re-checks it.** It is set by
`resolve_contact` when a member is added — but only on paths that call it, and
it was set by ONE of five member producers before v0.60.0.

That is the direct cause of `app_doorways: 0` in today's test: the member had a
valid contact matching a real account, and `linked_user_id` was null, so
`send-query` treated a Trustnet user as a stranger.

---

## Why this survived the seam audit

The seam audit asked *"which fields does each producer set?"* — a question about
**data**. This is a question about **rules**: every surface has the same field
available and applies a different test to it.

`resolve_contact` was built to fix add-member. It was wired there and the other
twelve surfaces were never revisited — the same mistake as fixing `from_name` on
the direct-send path and leaving the sweep, and fixing one member producer and
leaving four.

---

## The shape of a fix — NOT a proposal yet

1. **One resolver, called by everything.** No surface decides identity locally.
   `respond.html` asks about the ANSWERER's contact — which `receive-response`
   already holds — instead of inspecting localStorage.
2. **One normaliser.** `phone_key()` exists in SQL and is duplicated in three
   TypeScript files, one of them wrong. It should be imported from `_shared`,
   like `contact_key` and `enrichmentPatch` already are.
3. **Match on phone OR email, never one alone.** This is finding 3, and it is
   the difference between a returning user and a duplicate account.
4. **A guard.** The check that caught `norm` being out of scope can catch a
   surface deciding identity by itself: any `phone_key`, `digits(` or session
   test outside the shared module is a finding.

---

## What I have NOT verified

- Whether `respond.html`'s session check causes harm for real users on their own
  phones, where the session genuinely is theirs. **It is only wrong on a shared
  browser**, and I do not know how common that is for this product.
- Whether any user has actually been duplicated by finding 3. It needs a query
  against production, not reading.
- ~~`collection.html` and `privacy.html`~~ — CHECKED after writing this: zero
  identity decisions in either. Gap closed.
