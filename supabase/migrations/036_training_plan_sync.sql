alter table training_plans add column if not exists source_workout_id uuid;
alter table training_plans add column if not exists sync_status text not null default 'manual';
alter table training_plans add column if not exists synced_at timestamptz;
create index if not exists training_plans_source_workout_idx on training_plans(source_workout_id);
