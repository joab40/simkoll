alter table public.session_attendance
  add column if not exists session_slot text not null default 'afternoon_swim';

alter table public.session_attendance
  drop constraint if exists session_attendance_profile_id_attendance_date_key;

alter table public.session_attendance
  add constraint session_attendance_slot_check
  check (session_slot in ('morning_swim', 'afternoon_swim'));

alter table public.session_attendance
  add constraint session_attendance_profile_date_slot_key
  unique (profile_id, attendance_date, session_slot);
