-- Visibility applies to an individual weekly planning card.
alter table public.training_plans
  add column if not exists hidden_from_weekly_planning boolean not null default false;
