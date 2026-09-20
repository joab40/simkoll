create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  role text,
  profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'success',
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_event_idx on public.audit_logs (event_type, created_at desc);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  model text,
  role text,
  profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'success',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_created_idx on public.ai_usage_logs (created_at desc);
