create table public.private_messages (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('swimmer', 'coach')),
  recipient_profile_id uuid references public.profiles(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('swimmer', 'coach')),
  content text not null check (char_length(content) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((sender_role = 'swimmer' and sender_profile_id is not null) or (sender_role = 'coach')),
  check ((recipient_role = 'swimmer' and recipient_profile_id is not null) or (recipient_role = 'coach'))
);

create index private_messages_recipient_idx on public.private_messages (recipient_role, recipient_profile_id, created_at desc);
create index private_messages_sender_idx on public.private_messages (sender_role, sender_profile_id, created_at desc);
alter table public.private_messages enable row level security;
