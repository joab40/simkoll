alter table public.profiles
  add column approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));

alter table public.profiles alter column approval_status set default 'pending';

create index profiles_approval_status_idx on public.profiles (approval_status, created_at desc);
