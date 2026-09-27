-- Training groups are managed in training_groups and may be added by coaches.
-- Keep the non-empty invariant, but do not restrict rows to the original
-- three seeded groups.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.daily_workouts'::regclass
      and pg_get_constraintdef(oid) like '%target_groups%'
  loop
    execute format('alter table public.daily_workouts drop constraint if exists %I', constraint_row.conname);
  end loop;
end $$;

alter table public.daily_workouts
  add constraint daily_workouts_target_groups_nonempty
  check (cardinality(target_groups) > 0);
