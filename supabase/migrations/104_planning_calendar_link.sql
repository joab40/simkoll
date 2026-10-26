-- NULL retains automatic matching for existing plans. An explicit "none"
-- prevents automatic matching, while "linked" stores a stable event key.
alter table public.training_plans add column if not exists calendar_link jsonb;
alter table public.training_plans drop constraint if exists training_plans_calendar_link_check;
alter table public.training_plans add constraint training_plans_calendar_link_check
  check (calendar_link is null or (
    jsonb_typeof(calendar_link) = 'object' and
    (calendar_link->>'mode' = 'none' or
      (calendar_link->>'mode' = 'linked' and jsonb_typeof(calendar_link->'key') = 'string' and length(calendar_link->>'key') between 1 and 2000))
  ));
notify pgrst, 'reload schema';
