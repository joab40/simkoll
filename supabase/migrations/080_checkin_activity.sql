-- Explicit self-reported activity; do not reinterpret historical comments.
alter table public.responses
  add column if not exists activity_type text check (activity_type in ('swim','strength','dryland','cycling','other')),
  add column if not exists activity_minutes numeric check (activity_minutes > 0 and activity_minutes <= 1440),
  add column if not exists activity_distance_meters numeric check (activity_distance_meters > 0 and activity_distance_meters <= 1000000);

alter table public.personal_training_sessions drop constraint if exists personal_training_sessions_activity_type_check;
alter table public.personal_training_sessions add constraint personal_training_sessions_activity_type_check
  check (activity_type in ('swim','strength','dryland','cycling','other'));
alter table public.personal_training_sessions drop constraint if exists personal_training_sessions_slot_check;
alter table public.personal_training_sessions add constraint personal_training_sessions_slot_check
  check (session_slot in ('morning_swim','afternoon_swim','strength','dryland','cycling','other','legacy'));
