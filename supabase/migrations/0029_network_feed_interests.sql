-- ============================================================================
-- 0029_network_feed_interests.sql                                9 Aug 2026
--
-- network_feed was the LAST place still enforcing the OLD promise.
--
-- IT MATCHED CIRCLE DOMAINS:
--     join circles vc on vc.id = m.circle_id
--                    and vc.domain = coalesce(cn.primary_category, rc.domain)
-- Two things wrong with that, and the second is a product-law violation:
--   1. `domain` is one of eight coarse buckets, so a BOOK and a MUSEUM are both
--      'culture' and neither can be distinguished.
--   2. The fallback `rc.domain` is THE CONTRIBUTOR'S CIRCLE — using what X
--      called his circle to decide what his item IS. Circles are provenance,
--      never evidence (dan's law, v0.37.0). It is the same mistake that put a
--      dermatologist on the "ski" results screen.
--
-- The cards now promise "people in your circles who share this interest", so
-- the code must match on INTEREST: the item's own kind against a CONFIRMED
-- interest of a circle the contributor is actually in. Otherwise the app says
-- one thing and does another — the class of bug this project has spent a week
-- removing.
--
-- Matching lives in ONE place: circle_interest_matches(), which the sweep's
-- vocabulary mirrors. Built-in interests resolve through kind_matches_interest;
-- custom interests carry their own terms.
--
-- Idempotent. Safe on production.
-- ============================================================================

-- Whole-word containment. Substring matching is what made "skin" match "ski";
-- padding both sides is the same guard the TypeScript vocabulary uses.
create or replace function public.kind_has_term(p_kind text, p_term text)
returns boolean language sql immutable as $$
  select position(' ' || lower(btrim(p_term)) || ' '
                  in ' ' || regexp_replace(lower(coalesce(p_kind,'')), '[^[:alnum:]]+', ' ', 'g') || ' ') > 0;
$$;

-- Does an item of this kind belong to any CONFIRMED interest of this circle?
-- Built-ins are matched by a term list kept deliberately in step with
-- _shared/enrich_core.ts; custom interests carry their own confirmed terms.
create or replace function public.circle_accepts_kind(p_circle uuid, p_kind text)
returns boolean language plpgsql stable as $$
declare r record;
begin
  if p_kind is null or btrim(p_kind) = '' then return false; end if;
  for r in select interest, terms, is_custom from public.circle_interests
           where circle_id = p_circle and source = 'confirmed'
  loop
    if r.is_custom then
      if exists (select 1 from unnest(r.terms) t where public.kind_has_term(p_kind, t)) then
        return true;
      end if;
    else
      if exists (select 1 from unnest(
           case r.interest
             when 'book'        then array['novel','book','novella','memoir','biography','textbook','cookbook','ספר','רומן']
             when 'ski'         then array['ski resort','ski area','ski touring boot','ski boot','ski','skis','מסלול סקי','סקי']
             when 'restaurant'  then array['restaurant','bistro','eatery','diner','steakhouse','pizzeria','מסעדה','פיצריה']
             when 'bar'         then array['bar','pub','cocktail bar','wine bar','בר']
             when 'cafe'        then array['cafe','coffee shop','coffeehouse','bakery','patisserie','בית קפה','מאפיה']
             when 'hotel'       then array['hotel','guesthouse','hostel','lodge','bed and breakfast','מלון','אכסניה']
             when 'destination' then array['island','city','town','region','beach','national park','landmark','monument','museum','gallery','אי','עיר','מוזיאון','ski resort','ski area']
             when 'doctor'      then array['doctor','dermatologist','physician','dentist','clinic','surgeon','רופא','רופאה','מרפאה']
             when 'tradesperson' then array['plumber','electrician','handyman','technician','contractor','painter','framer','air conditioning','שיפוצניק','חשמלאי','טכנאי','מסגר']
             when 'shop'        then array['butcher','grocer','market','store','shop','boutique','חנות','קצביה','סופר']
             when 'product'     then array['grill','gas grill','appliance','equipment','gear','device','machine','מכשיר','ציוד']
             when 'service'     then array['babysitter','nanny','cleaner','tutor','dog sitter','accountant','lawyer','בייביסיטר','מטפלת','מנקה']
             else array[]::text[]
           end) t where public.kind_has_term(p_kind, t)) then
        return true;
      end if;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.network_feed()
 returns table(rec_id uuid, canonical_id uuid, recommender_id uuid, recommender_name text,
               domain text, circle_name text, note text, rating smallint, tags text[],
               shared_at timestamp with time zone, can_name text, can_category text,
               can_location text, can_emoji text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select * from (
    select distinct on (r.id)
      r.id as rec_id, r.canonical_id, r.owner_id as recommender_id,
      u.name as recommender_name,
      coalesce(cn.primary_category, rc.domain) as domain,
      vc.name as circle_name,          -- MY circle, not theirs: provenance I can see
      r.note, r.rating, r.tags,
      r.created_at as shared_at,
      cn.name as can_name, cn.category as can_category,
      cn.location as can_location, cn.image_emoji as can_emoji
    from public.recommendations r
    join public.users u  on u.id  = r.owner_id
    join public.circles rc on rc.id = r.circle_id
    join public.canonicals cn on cn.id = r.canonical_id
    join public.members m on m.linked_user_id = r.owner_id
                         and m.owner_id = auth.uid()
    join public.circles vc on vc.id = m.circle_id
    where r.shared_to_network = true
      and r.owner_id <> auth.uid()
      -- THE CHANGE: the item's own KIND against a CONFIRMED interest of MY
      -- circle. Never the contributor's circle name or domain.
      and public.circle_accepts_kind(vc.id, cn.kind)
    order by r.id, r.created_at desc
  ) feed
  order by feed.shared_at desc
  limit 50
$function$;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from pg_proc where proname='kind_has_term')        as helper_should_be_1,
  (select count(*) from pg_proc where proname='circle_accepts_kind')  as matcher_should_be_1,
  (select count(*) from pg_proc where proname='network_feed')         as feed_should_be_1,
  public.kind_has_term('skin doctor', 'ski')                          as skin_is_not_ski_expect_f,
  public.kind_has_term('ski resort', 'ski')                           as ski_resort_is_ski_expect_t;
