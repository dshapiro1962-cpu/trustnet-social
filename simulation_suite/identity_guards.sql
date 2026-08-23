-- ═══════════════════════════════════════════════════════════════════════════
-- identity_guards.sql
--
-- Every guard below asserts a ROW OUTCOME. None of them checks that a trigger
-- exists, that a function is defined, or that a message reads a certain way.
-- The mistakes list records guards that matched text which survived the thing
-- they were meant to catch, and one that passed when its condition was
-- neutered to `if (false)`. neuter-tests.sh disables each mechanism in turn
-- and requires this suite to FAIL. A guard that passes with its mechanism
-- removed is not a guard.
--
-- Run against a fresh fixture with 0041 applied. Offline, deterministic.
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists guard_results;
create table guard_results (seq serial primary key, name text, passed boolean, note text);

create or replace function g(p_name text, p_cond boolean, p_note text default null)
returns void language sql as $$
  insert into guard_results(name, passed, note) values (p_name, coalesce(p_cond, false), p_note);
$$;

create or replace function gy() returns uuid language sql immutable as
  $$ select 'bbbbbbbb-0000-4000-8000-000000000002'::uuid $$;

-- ══ POSITIVE ══════════════════════════════════════════════════════════════

-- 1 · normalisation folds case and punctuation, in both scripts
select g('01 norm_name · Tony vespa = Tony Vespa',
         norm_name('Tony vespa') = norm_name('Tony Vespa'));
select g('01 norm_name · שושן שמוליק = שושן-שמוליק',
         norm_name('שושן שמוליק') = norm_name('שושן-שמוליק'));
select g('01 norm_name · K2 = k2', norm_name('K2') = norm_name('k2'));
select g('01 norm_name · art pizza = Art Pizza',
         norm_name('art pizza') = norm_name('Art Pizza'));

-- 2 · a case-differing row is folded, and a rec against it lands on the head
do $$
declare a uuid; b uuid; r uuid;
begin
  insert into canonicals (type, name, created_by) values ('place','Tony Vespa', gy()) returning id into a;
  insert into canonicals (type, name, created_by) values ('place','tony vespa', gy()) returning id into b;
  insert into recommendations (canonical_id, owner_id, note) values (b, gy(), 'guard 2') returning id into r;
  perform g('02 tier 1 · duplicate row carries merged_into',
            (select merged_into from canonicals where id = b) = a);
  perform g('02 tier 1 · the rec lands on the head, not the duplicate',
            (select canonical_id from recommendations where id = r) = a);
  perform g('02 tier 1 · the redirect is recorded and reversible',
            exists (select 1 from canonical_resolution_log
                     where rec_id = r and tier = 'redirect'
                       and prev_canonical_id = b and new_canonical_id = a));
end $$;

-- 3 · a matching phone is proof, and it beats a non-matching name
do $$
declare a uuid; b uuid;
begin
  insert into canonicals (type, name, phone, created_by)
    values ('place','Eli מיזוג אוויר','+972545666006', gy()) returning id into a;
  insert into canonicals (type, name, phone, created_by)
    values ('place','Eli מזוג אויר','054-566-6006', gy()) returning id into b;
  perform g('03 tier 2 · same phone folds despite different spelling',
            (select merged_into from canonicals where id = b) = a);
  perform g('03 tier 2 · the fold is logged as phone',
            exists (select 1 from canonical_resolution_log
                     where canonical_id = b and tier = 'phone'));
end $$;

-- 4 · THE FORGETTING TEST · a writer that knows nothing still lands correctly
do $$
declare v uuid; r uuid;
begin
  insert into canonicals (type, name, created_by) values ('place','TONY  VESPA!!', gy()) returning id into v;
  insert into recommendations (canonical_id, owner_id, note) values (v, gy(), 'guard 4') returning id into r;
  perform g('04 forgetting test · a blind writer''s rec reaches the head',
            (select canonical_id from recommendations where id = r)
            = (select id from canonicals where norm_name(name) = 'tony vespa' and merged_into is null));
end $$;

-- 5 · the id handed back by `returning id` is usable as a foreign key at once
do $$
declare v uuid; ok boolean := true;
begin
  begin
    insert into canonicals (type, name, created_by) values ('place','Caffe Tamati', gy()) returning id into v;
    insert into recommendations (canonical_id, owner_id, note) values (v, gy(), 'guard 5');
  exception when others then ok := false;
  end;
  perform g('05 returning id · is a valid FK immediately', ok);
end $$;

-- 6 · a chain resolves to the live row; a cycle terminates instead of hanging
do $$
declare a uuid; b uuid; c uuid; v uuid;
begin
  insert into canonicals (type, name, created_by) values ('place','Chain Head', gy()) returning id into a;
  insert into canonicals (type, name, created_by) values ('place','chain head', gy()) returning id into b;
  insert into canonicals (type, name, created_by) values ('place','CHAIN HEAD', gy()) returning id into c;
  perform g('06 chain · canonical_head follows to the live row',
            canonical_head(c) = a and canonical_head(b) = a);
  update canonicals set merged_into = c where id = a;   -- deliberate cycle
  select canonical_head(a) into v;
  perform g('06 cycle · terminates rather than hanging', v is not null);
  update canonicals set merged_into = null where id = a;
end $$;

-- 7 · an answered merge is reversible, down to the individual recommendation
do $$
declare a uuid; b uuid; r uuid; q uuid; ev uuid;
begin
  insert into canonicals (type, name, created_by) values ('place','Caffe Tamati Two', gy()) returning id into a;
  insert into canonicals (type, name, created_by) values ('place','tamati two', gy()) returning id into b;
  insert into recommendations (canonical_id, owner_id, note) values (b, gy(), 'guard 7') returning id into r;
  select id into q from canonical_fold_queue
   where status = 'pending' and (candidate_id = b or head_id = b) limit 1;
  perform g('07 unmerge · a question was raised, nothing folded',
            q is not null and (select merged_into from canonicals where id = b) is null);
  select resolve_fold(q, true) into ev;
  perform g('07 unmerge · answering yes moves the rec',
            (select canonical_id from recommendations where id = r) = a);
  perform unmerge(ev);
  perform g('07 unmerge · undoing restores the rec to where it was',
            (select canonical_id from recommendations where id = r) = b);
  perform g('07 unmerge · and clears the pointer',
            (select merged_into from canonicals where id = b) is null);
end $$;

-- ══ NEGATIVE · none of these may happen ══════════════════════════════════

-- 8 · the normaliser must not treat two different places as one string
select g('08 NEG · Art Pizza is not Artzieli Pizza',
         norm_name('Art Pizza') <> norm_name('Artzieli Pizza'));
select g('08 NEG · Trattoria Mario is not Trattoria Marco',
         norm_name('Trattoria Mario') <> norm_name('Trattoria Marco'));

-- 9 · a guess folds NOTHING. Both rows live, one question, no merge.
do $$
declare a uuid; b uuid;
begin
  insert into canonicals (type, name, created_by) values ('place','Artzieli Pizza', gy()) returning id into a;
  insert into canonicals (type, name, created_by) values ('place','Art Pizza', gy()) returning id into b;
  perform g('09 NEG · the guess did not fold either row',
            (select merged_into from canonicals where id = a) is null
        and (select merged_into from canonicals where id = b) is null);
  perform g('09 NEG · exactly one question was raised',
            (select count(*) from canonical_fold_queue
              where status = 'pending' and candidate_id = b and head_id = a) = 1);
  perform g('09 NEG · and nothing was written to the fold log',
            not exists (select 1 from canonical_resolution_log
                         where canonical_id in (a, b) and tier in ('norm_exact','phone')));
end $$;

-- 10 · 0.684 is not close enough to merge anything
do $$
declare a uuid; b uuid;
begin
  insert into canonicals (type, name, location, created_by) values ('place','Trattoria Mario','Firenze', gy()) returning id into a;
  insert into canonicals (type, name, location, created_by) values ('place','Trattoria Marco','Firenze', gy()) returning id into b;
  perform g('10 NEG · Trattoria Marco stays its own place',
            (select merged_into from canonicals where id = b) is null);
end $$;

-- 11 · a phone too short to be proof proves nothing
do $$
declare a uuid; b uuid;
begin
  insert into canonicals (type, name, phone, created_by) values ('place','Short Phone One','1234', gy()) returning id into a;
  insert into canonicals (type, name, phone, created_by) values ('place','Different Name Entirely','1234', gy()) returning id into b;
  perform g('11 NEG · a phone under nine digits folds nothing',
            (select merged_into from canonicals where id = b) is null);
end $$;

-- 12 · a decision is about things, not rows. Do not ask twice.
do $$
declare q uuid; c uuid; before_n int; after_n int;
begin
  select id into q from canonical_fold_queue
   where status = 'pending' and candidate_norm = 'art pizza' and head_norm = 'artzieli pizza' limit 1;
  perform resolve_fold(q, false);
  select count(*) into before_n from canonical_fold_queue where status = 'pending';
  insert into canonicals (type, name, created_by) values ('place','ART PIZZA', gy()) returning id into c;
  select count(*) into after_n from canonical_fold_queue where status = 'pending';
  perform g('12 NEG · a further save folds onto the kept-apart row, not the head it was kept apart from',
            (select norm_name(name) from canonicals where id = canonical_head(c)) = 'art pizza');
  perform g('12 NEG · and the answered question is not asked again', after_n = before_n);
end $$;

-- 13 · a pending question never resolves itself
do $$
declare n int;
begin
  insert into canonicals (type, name, created_by) values ('place','Some Unrelated Place', gy());
  insert into canonicals (type, name, created_by) values ('place','Another Unrelated Place', gy());
  select count(*) into n from canonical_fold_queue q
    join canonicals a on a.id = q.candidate_id
   where q.status = 'pending' and a.merged_into is not null;
  perform g('13 NEG · no pending question has silently folded its candidate', n = 0);
end $$;

-- ══ RESULT ════════════════════════════════════════════════════════════════
select count(*) filter (where passed)       as passed,
       count(*) filter (where not passed)   as failed,
       count(*)                             as total
  from guard_results;
select seq, case when passed then 'ok  ' else 'FAIL' end as r, name
  from guard_results where not passed order by seq;
