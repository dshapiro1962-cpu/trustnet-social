create or replace function w1() returns void language plpgsql as $$
begin insert into recommendations (owner_id, note, circle_id, in_name, in_location, in_phone, in_kind)
  values (w_y(), 'answered a query', w_ycircle(), 'La Leggenda dei Frati', 'Firenze', '+39055068550', 'restaurant');
  perform log_try('w1 receive-response', true, 'via transient columns');
exception when others then perform log_try('w1 receive-response', false, sqlerrm); end $$;
create or replace function w2() returns void language plpgsql as $$
begin insert into recommendations (owner_id, note, circle_id, in_name, in_location)
  values (w_y(), 'from a whatsapp chat export', w_ycircle(), 'La Leggenda dei Frati', 'Firenze');
  perform log_try('w2 extract-chat-recs', true, 'via transient columns');
exception when others then perform log_try('w2 extract-chat-recs', false, sqlerrm); end $$;
create or replace function w3() returns void language plpgsql as $$
begin insert into recommendations (owner_id, note, circle_id, in_name, in_location)
  values (w_y(), 'saved via the whatsapp bot', w_ycircle(), 'la leggenda dei frati', 'Firenze');
  perform log_try('w3 whatsapp-webhook', true, 'via transient columns');
exception when others then perform log_try('w3 whatsapp-webhook', false, sqlerrm); end $$;
create or replace function w4() returns void language plpgsql as $$
begin insert into recommendations (owner_id, note, circle_id, in_name, in_location)
  values (w_y(), 'typed into Add to Library', w_ycircle(), 'Leggenda dei Frati', 'Firenze');
  perform log_try('w4 client handleSaveRec', true, 'via transient columns');
exception when others then perform log_try('w4 client handleSaveRec', false, sqlerrm); end $$;
