create table if not exists public.open_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_role text not null check (sender_role in ('coach', 'swimmer')),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists open_chat_messages_created_idx on public.open_chat_messages (created_at desc) where deleted_at is null;
alter table public.open_chat_messages enable row level security;
