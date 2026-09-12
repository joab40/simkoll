create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null,
  period text not null,
  insight jsonb not null,
  created_at timestamptz not null default now(),
  unique (scope_key, period)
);
create index if not exists ai_insights_created_idx on public.ai_insights(created_at desc);
