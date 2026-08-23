-- the four known writers, CONVERTED to the RPC. w5 and w6 are not converted:
-- that is the point of them.
create or replace function w1() returns void language plpgsql as $$
declare v uuid; begin
  v := save_recommendation(w_y(), 'La Leggenda dei Frati', 'Firenze', '+39055068550',
                           'answered a query', w_ycircle(), 'restaurant');
  perform log_try('w1 receive-response', true, 'canonical ' || left(v::text,8));
exception when others then perform log_try('w1 receive-response', false, sqlerrm); end $$;
create or replace function w2() returns void language plpgsql as $$
declare v uuid; begin
  v := save_recommendation(w_y(), 'La Leggenda dei Frati', 'Firenze', null,
                           'from a whatsapp chat export', w_ycircle(), null);
  perform log_try('w2 extract-chat-recs', true, 'canonical ' || left(v::text,8));
exception when others then perform log_try('w2 extract-chat-recs', false, sqlerrm); end $$;
create or replace function w3() returns void language plpgsql as $$
declare v uuid; begin
  v := save_recommendation(w_y(), 'la leggenda dei frati', 'Firenze', null,
                           'saved via the whatsapp bot', w_ycircle(), null);
  perform log_try('w3 whatsapp-webhook', true, 'canonical ' || left(v::text,8));
exception when others then perform log_try('w3 whatsapp-webhook', false, sqlerrm); end $$;
create or replace function w4() returns void language plpgsql as $$
declare v uuid; begin
  v := save_recommendation(w_y(), 'Leggenda dei Frati', 'Firenze', null,
                           'typed into Add to Library', w_ycircle(), null);
  perform log_try('w4 client handleSaveRec', true, 'canonical ' || left(v::text,8));
exception when others then perform log_try('w4 client handleSaveRec', false, sqlerrm); end $$;
