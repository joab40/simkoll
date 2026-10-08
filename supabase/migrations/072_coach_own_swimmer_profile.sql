alter table public.coach_accounts
  add column if not exists linked_profile_id uuid references public.profiles(id) on delete set null;

create unique index if not exists coach_accounts_linked_profile_id_unique
  on public.coach_accounts (linked_profile_id)
  where linked_profile_id is not null;
