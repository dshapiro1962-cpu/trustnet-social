# The save failure — cause, fix, and what it says about the guards

**23 Aug 2026. Not applied to production.**

## What happens

Dan saves Hummus Arafat. The app shows it in the library and reports it could
not save. Reload and it is gone. The database never received it.

    POST /rest/v1/canonicals  403
    42501  new row violates row-level security policy (USING expression)

## Cause

`canonicals_update_creator` is `using (created_by = auth.uid())` with no
`with check`. When `created_by` is NULL the expression evaluates to NULL, not
true, so **an unowned row is writable by nobody** — not its creator, not
anyone. Production has **9 such rows**, all written by server functions that
do not stamp `created_by`.

`saveCanonicals` (index.html:1497) sends the user's ENTIRE library as one
`.upsert()`. That is one SQL statement. One unwritable row in it refuses the
whole statement, and every save in the batch is lost with it.

The client filter at 1490 is `!c.createdBy || c.createdBy === CURRENT_UID`.
The July fix excluded rows owned by *someone else* and treated NULL as safe.
NULL is not "unowned and therefore writable"; it is "owned by nobody".

The nine rows are also the duplicate clusters: three `Tony Vespa` written in a
single statement at `06:19:02.532896`, plus `art pizza` / `Art Pizza`. They
carry 6 recommendations. Unsigned and unmatched are the same population.

## Two things I asserted and then disproved by executing

**"The upsert path always evaluates the UPDATE policy."** False. Postgres
evaluates it only when a row genuinely conflicts. An upsert of a brand-new
place succeeds under the current policy.

**"canonicals is shared, so an owner-scoped update policy is the fault."**
That reasoning pointed at letting any authenticated user update any row. The
negative test showed it lets one user rewrite another's place. Shared identity
does not imply shared authorship — convergence and editing are different
questions, and I had run them together.

## The fix

    using      (created_by = auth.uid() or created_by is null)
    with check (created_by = auth.uid())

Grants no new permission. A row owned by another user stays untouchable. The
added `with check` — absent from the original — means that after your write the
row must be YOURS, so unowned rows are claimed on first touch and the pool of
unwritable rows drains instead of growing.

Measured, real role, real policies:

    A  today's policy      batch REFUSED    saved 0    hijack no
    B  0043                batch accepted   saved 1    hijack no
    C  any authenticated   batch accepted   saved 1    hijack YES

## A dependency this creates

`with check (created_by = auth.uid())` makes the client's `created_by` stamp
load-bearing: a writer that upserts an existing row WITHOUT sending
`created_by` is now refused. The client does send it. Edge functions using the
service role bypass RLS and are unaffected. Any future anon-key writer must
stamp it. There is a guard for exactly this.

## What this does NOT fix

`saveCanonicals` sends the whole library as one statement. 0043 removes
today's nine poison rows. It does not stop the next unwritable row doing the
same thing to every save at once. One save writing one row would end it
permanently. That is a client change and is not proposed here.

## About the guards

`simulation_suite/rls-sim.js` existed through v0.65.0 and was dropped by
v0.67.0. It would NOT have caught this: its mock `upsert` returns
`{error:null}` and never evaluates a policy. It asserts which rows are SENT,
not whether Postgres accepts them. It passes today while production 403s.

`rls_guards.sh` runs against a real Postgres, a real non-superuser role, RLS
enabled, and the three policies as read back from production on 23 Aug. It
begins with a CONTROL section that must FAIL on today's policy — a guard that
passes before the fix is applied is testing nothing.

My first version of it also failed, correctly: the `DO UPDATE SET` omitted
`created_by`, which is not what PostgREST emits. Testing an unfaithful shape
tests nothing.

The repo has a Playwright e2e suite. A browser test driving a real save
against real policies would be a better guard than any of this, and should
probably replace it.

## Running it

    cd simulation_suite
    ./rls_guards.sh        # expects: passed 10, failed 0
    ./compare.sh           # the A/B/C comparison above
