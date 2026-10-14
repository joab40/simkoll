-- Keep old answers unassigned: guessing AM/PM would fabricate attendance.
alter table public.responses
  add column if not exists session_slot text check (session_slot in ('morning_swim', 'afternoon_swim')),
  add column if not exists training_registered boolean;
