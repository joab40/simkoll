alter table public.profiles
  add column if not exists primary_stroke text,
  add column if not exists secondary_stroke text;
