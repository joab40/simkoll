alter table public.profiles
  add column if not exists training_group text;

alter table public.profiles
  drop constraint if exists profiles_training_group_check,
  add constraint profiles_training_group_check
    check (training_group is null or training_group in ('ungdom_orange', 'ungdom_svart', 'junior'));
