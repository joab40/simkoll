create table if not exists public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  present boolean not null default true,
  marked_at timestamptz not null default now(),
  unique (profile_id, attendance_date)
);

create index if not exists session_attendance_date_idx
  on public.session_attendance(attendance_date);
