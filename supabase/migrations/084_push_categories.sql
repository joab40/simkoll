alter table public.push_subscriptions
  add column if not exists development_talks boolean not null default true,
  add column if not exists competition_entries boolean not null default true;
