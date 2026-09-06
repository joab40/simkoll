alter table public.personal_training_sessions
  add column session_slot text,
  add column session_date date;

update public.personal_training_sessions
set session_slot = 'legacy',
    session_date = (completed_at at time zone 'Europe/Stockholm')::date;

alter table public.personal_training_sessions
  alter column session_slot set not null,
  alter column session_date set not null,
  alter column session_date set default ((now() at time zone 'Europe/Stockholm')::date),
  add constraint personal_training_sessions_slot_check
    check (session_slot in ('morning_swim', 'afternoon_swim', 'strength', 'dryland', 'legacy'));

drop index if exists public.personal_swim_checkin_per_day_idx;

create unique index personal_training_session_slot_idx
  on public.personal_training_sessions (profile_id, session_date, session_slot)
  where session_slot <> 'legacy';

create index personal_training_sessions_week_idx
  on public.personal_training_sessions (profile_id, session_date desc);
