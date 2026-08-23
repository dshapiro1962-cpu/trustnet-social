-- ═══════════════════════════════════════════════════════════════════════════
-- identity_backfill_guards.sql
--
-- Guards for 0042. Run AFTER base.sql + prod-shape.sql + 0041 + 0042.
-- Row outcomes only. run-implementation.sh also runs 0042 a second time and
-- requires every number here to be unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists backfill_results;
create table backfill_results (seq serial primary key, name text, passed boolean, note text);
create or replace function b(p_name text, p_cond boolean, p_note text default null)
returns void language sql as $$
  insert into backfill_results(name, passed, note) values (p_name, coalesce(p_cond,false), p_note);
$$;

-- 1 · tier 1 folded every normalised-exact cluster
select b('B1 · no two live rows share a normalised name',
         (select count(*) from (select norm_name(name) n from canonicals
                                 where merged_into is null
                                 group by 1 having count(*) > 1) x) = 0);

-- 2 · tier 2 folded the phone pair, and did NOT ask about it
-- Which of the pair survives is not determined — both rows carry the same
-- created_at, so the head is settled by uuid. Assert the PROPERTY (exactly one
-- of them is folded) and not which one, or this guard passes or fails by luck.
select b('B2 · exactly one of the Eli pair is folded, on phone',
         (select count(*) from canonicals
           where name like 'Eli %' and merged_into is not null) = 1
     and (select count(*) from canonicals
           where name like 'Eli %' and merged_into is null) = 1);
select b('B2 · and no question was raised about it',
         not exists (select 1 from canonical_fold_queue q
                      join canonicals a on a.id = q.candidate_id
                      join canonicals c on c.id = q.head_id
                     where q.status = 'pending'
                       and (a.name like 'Eli %' or c.name like 'Eli %')));

-- 3 · no live row shares a phone with another live row
select b('B3 · no two live rows share a phone_key',
         (select count(*) from (select phone_key from canonicals
                                 where merged_into is null and phone_key is not null
                                   and length(phone_key) >= 9
                                 group by 1 having count(*) > 1) x) = 0);

-- 4 · NEGATIVE · the guess was not merged by the backfill
select b('B4 NEG · Artzieli Pizza and Art Pizza are both still live',
         (select count(*) from canonicals
           where merged_into is null and norm_name(name) in ('artzieli pizza','art pizza')) = 2);
select b('B4 NEG · and it is waiting as a question instead',
         exists (select 1 from canonical_fold_queue where status = 'pending' and score = 0.563));

-- 5 · nothing is left pointing at a tombstone
select b('B5 · no recommendation points at a folded canonical',
         (select count(*) from recommendations r
            join canonicals c on c.id = r.canonical_id
           where c.merged_into is not null) = 0);

-- 6 · PROMOTION · a head must not lose what a folded row knew
-- Set up: two rows, same normalised name, only the SECOND has a kind.
do $$
declare a uuid; b_id uuid; v_head uuid;
begin
  insert into canonicals (type, name, kind, created_by)
    values ('place','Promotion Test', null, null) returning id into a;
  insert into canonicals (type, name, kind, created_by)
    values ('place','promotion test', 'restaurant', null) returning id into b_id;
  -- the write-time trigger folds the second into the first; the head has no kind
  select canonical_head(a) into v_head;
  perform b('B6 · a fold happened', (select merged_into from canonicals where id = b_id) is not null);
  perform b('B6 · BEFORE promotion the head is unenriched — gate 2 would drop it',
            (select kind from canonicals where id = v_head) is null);
end $$;

-- 7 · run statement 6 of 0042 and the head must now carry the kind
update public.canonicals h
   set kind = coalesce(h.kind, s.kind), updated_at = now()
  from (select public.canonical_head(id) as head_id,
               (array_agg(kind) filter (where kind is not null))[1] as kind
          from public.canonicals where merged_into is not null group by 1) s
 where h.id = s.head_id and h.kind is null;

select b('B7 · promotion carries the kind up to the head',
         (select kind from canonicals where norm_name(name) = 'promotion test'
           and merged_into is null) = 'restaurant');

-- ══ RESULT ════════════════════════════════════════════════════════════════
select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
  from backfill_results;
select seq, name from backfill_results where not passed order by seq;
