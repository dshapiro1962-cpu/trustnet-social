-- ============================================================================
-- 0023_dedupe_memberships.sql                                    6 Aug 2026
--
-- After 0022, one person may still hold SEVERAL member rows in the SAME circle
-- — the residue of a duplicate guard that fell back to name equality. One row
-- per person per circle is the correct state.
--
-- SURVIVOR RULE, in order:
--   1. dan's rule: a row named 'shapiro' wins, if one exists
--   2. otherwise the row with the MOST query_responses attached — history is
--      the tiebreaker, because a member that has actually answered questions
--      carries more meaning than one that never did
--   3. otherwise the earliest row
--
-- HISTORY IS NEVER DROPPED. query_responses.member_id on the losing rows is
-- RE-POINTED to the survivor before deletion. Deleting a member that answered a
-- question would orphan the answer — and answers are the product.
--
-- Idempotent: re-running finds nothing to do.
-- ============================================================================

do $$
declare
  g        record;
  v_keep   uuid;
  n_moved  int;
  n_gone   int := 0;
  n_resp   int := 0;
begin
  for g in
    select person_id, circle_id, count(*) as n
    from public.members
    where person_id is not null
    group by person_id, circle_id
    having count(*) > 1
  loop
    select m.id into v_keep
    from public.members m
    left join (
      select member_id, count(*) as c
      from public.query_responses group by member_id
    ) qr on qr.member_id = m.id
    where m.person_id = g.person_id and m.circle_id = g.circle_id
    order by (lower(btrim(m.name)) = 'shapiro') desc,   -- 1. the named survivor
             coalesce(qr.c, 0) desc,                     -- 2. most history
             m.created_at asc                            -- 3. oldest
    limit 1;

    update public.query_responses qr
    set member_id = v_keep
    where qr.member_id in (
      select id from public.members
      where person_id = g.person_id and circle_id = g.circle_id and id <> v_keep);
    get diagnostics n_moved = row_count;
    n_resp := n_resp + n_moved;

    delete from public.members
    where person_id = g.person_id and circle_id = g.circle_id and id <> v_keep;
    n_gone := n_gone + (g.n - 1);
  end loop;

  raise notice 'Removed % duplicate memberships; re-pointed % responses to survivors.', n_gone, n_resp;
end $$;

-- ── VERIFICATION — both must be 0 ───────────────────────────────────────────
select
  (select count(*) from (
     select person_id, circle_id from public.members
     where person_id is not null
     group by person_id, circle_id having count(*) > 1) d)      as duplicates_left,
  (select count(*) from public.query_responses qr
     where qr.member_id is not null
       and not exists (select 1 from public.members m where m.id = qr.member_id))
                                                                as orphaned_responses;
