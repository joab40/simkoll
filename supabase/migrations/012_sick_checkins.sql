-- Tillåter att en simmare markerar sjukdom utan att behöva ange diagnos.
-- Kör denna migration i Supabase SQL Editor innan funktionen används.
do $$
declare constraint_name text;
begin
  select c.conname into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'responses'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%day_type%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.responses drop constraint %I', constraint_name);
  end if;
end $$;
alter table public.responses
  add constraint responses_day_type_check check (day_type in ('before', 'after', 'rest', 'sick'));
