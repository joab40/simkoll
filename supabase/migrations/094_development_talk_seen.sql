alter table public.development_talks
  add column if not exists swimmer_seen_at timestamptz;
