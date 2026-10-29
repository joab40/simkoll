-- Explicit alternatives from workbook tabs share one training occasion.
alter table public.daily_workouts add column if not exists alternative_group_id uuid;
alter table public.training_plans add column if not exists alternative_group_id uuid;
create index if not exists daily_workouts_alternative_group_idx
  on public.daily_workouts (alternative_group_id) where alternative_group_id is not null;
notify pgrst, 'reload schema';
