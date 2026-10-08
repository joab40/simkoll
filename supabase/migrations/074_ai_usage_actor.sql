alter table public.ai_usage_logs
  add column if not exists actor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists coach_account_id uuid references public.coach_accounts(id) on delete set null;

create index if not exists ai_usage_logs_actor_profile_created_idx
  on public.ai_usage_logs (actor_profile_id, created_at desc);

create index if not exists ai_usage_logs_coach_account_created_idx
  on public.ai_usage_logs (coach_account_id, created_at desc);
