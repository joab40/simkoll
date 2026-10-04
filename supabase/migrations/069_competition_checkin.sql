alter table public.responses
  add column if not exists competition boolean not null default false;
