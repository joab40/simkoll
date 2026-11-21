-- Accept percentage weights alongside saved 0–5 weights.
begin;

alter table public.profiles
  drop constraint if exists profiles_flight_record_weights_check;

alter table public.profiles
  add constraint profiles_flight_record_weights_check check (
    case
      when flight_record_weights is null then true
      when jsonb_typeof(flight_record_weights) <> 'object' then false
      when flight_record_weights ?& array['speedFeeling','body','energy','feeling','motivation','passRating','setupRating','sleepQuality','times']
        and flight_record_weights - array['speedFeeling','body','energy','feeling','motivation','passRating','setupRating','sleepQuality','times'] = '{}'::jsonb
      then case
        when jsonb_path_exists(flight_record_weights, 'strict $.* ? (@.type() != "number" || @ < 0 || @ > 100 || @.floor() != @)') then false
        else (
          (flight_record_weights->>'speedFeeling')::numeric
          + (flight_record_weights->>'body')::numeric
          + (flight_record_weights->>'energy')::numeric
          + (flight_record_weights->>'feeling')::numeric
          + (flight_record_weights->>'motivation')::numeric
          + (flight_record_weights->>'passRating')::numeric
          + (flight_record_weights->>'setupRating')::numeric
          + (flight_record_weights->>'sleepQuality')::numeric
        ) in (0, 100)
      end
      else flight_record_weights ?& array['speedFeeling','body','energy','sleepQuality','feeling','motivation','times']
        and flight_record_weights - array['speedFeeling','body','energy','sleepQuality','feeling','motivation','times'] = '{}'::jsonb
        and not jsonb_path_exists(flight_record_weights, 'strict $.* ? (@.type() != "number" || (@ != 0 && @ != 1 && @ != 2 && @ != 3 && @ != 4 && @ != 5))')
    end
  );

commit;
