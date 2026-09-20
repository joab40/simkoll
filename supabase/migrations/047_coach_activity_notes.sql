-- Tränarens sammanfattningar för en dag, ett pass eller en tävling.
create table if not exists public.coach_activity_notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null,
  activity_type text not null default 'day' check (activity_type in ('day', 'workout', 'competition')),
  activity_id uuid,
  scope_key text not null unique,
  content text not null check (char_length(content) between 1 and 5000),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_activity_notes_date_idx
  on public.coach_activity_notes (note_date desc, updated_at desc);
