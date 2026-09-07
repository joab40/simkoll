alter table public.profiles
  add column if not exists is_test_profile boolean not null default false;
