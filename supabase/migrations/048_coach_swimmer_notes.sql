create table if not exists public.coach_swimmer_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  note_date date not null,
  content text not null check (char_length(content) between 1 and 3000),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_swimmer_notes_profile_date_idx
  on public.coach_swimmer_notes (profile_id, note_date desc, updated_at desc);
