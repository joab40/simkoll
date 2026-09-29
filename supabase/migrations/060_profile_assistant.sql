alter table public.profiles
  add column if not exists assistant_enabled boolean not null default true;
