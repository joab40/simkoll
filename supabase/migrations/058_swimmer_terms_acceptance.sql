-- Simmarens bekräftelse av Info & villkor.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create index if not exists profiles_terms_idx
  on public.profiles (terms_version, terms_accepted_at);
