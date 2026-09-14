create table if not exists public.development_talks (
  id uuid primary key default gen_random_uuid(),
  swimmer_id uuid not null references public.profiles(id) on delete cascade,
  coach_id text,
  group_id text,
  meeting_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'prepared', 'completed')),
  swimmer_answers jsonb not null default '{}'::jsonb,
  coach_notes jsonb not null default '{}'::jsonb,
  agreement jsonb not null default '{}'::jsonb,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists development_talks_swimmer_idx on public.development_talks (swimmer_id, meeting_date desc);
