-- Viktlogg per styrkepass. En rad per tilldelning, pass och datum.
create table public.strength_program_logs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.program_assignments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pass_number smallint not null check (pass_number between 1 and 3),
  session_date date not null,
  weights jsonb not null default '{}'::jsonb,
  notes text check (char_length(notes) <= 1000),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (assignment_id, pass_number, session_date)
);

create index strength_program_logs_profile_idx on public.strength_program_logs (profile_id, session_date desc);
create index strength_program_logs_assignment_idx on public.strength_program_logs (assignment_id, session_date desc);
alter table public.strength_program_logs enable row level security;
