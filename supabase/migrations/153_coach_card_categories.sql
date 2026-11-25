alter table public.coach_accounts
  add column if not exists view_category text not null default 'bas'
    check (view_category in ('bas', 'pro', 'exp'));
