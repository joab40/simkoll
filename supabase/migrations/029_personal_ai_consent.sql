alter table public.profiles
  add column if not exists ai_analysis_status text not null default 'not_requested';

alter table public.profiles
  drop constraint if exists profiles_ai_analysis_status_check;

alter table public.profiles
  add constraint profiles_ai_analysis_status_check
  check (ai_analysis_status in ('not_requested', 'pending', 'approved', 'revoked'));

create index if not exists profiles_ai_analysis_status_idx
  on public.profiles(ai_analysis_status);
