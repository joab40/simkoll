create table if not exists public.community_reactions (
  id uuid primary key default gen_random_uuid(),
  message_type text not null check (message_type in ('coach_post', 'group_pep')),
  message_id uuid not null,
  actor_key text not null,
  emoji text not null check (emoji in ('👍', '😊', '🙌', '❤️')),
  created_at timestamptz not null default now(),
  unique (message_type, message_id, actor_key, emoji)
);

create index if not exists community_reactions_message_idx
  on public.community_reactions (message_type, message_id);

alter table public.community_reactions enable row level security;
