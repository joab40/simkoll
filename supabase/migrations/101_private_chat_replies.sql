alter table public.private_messages
  add column if not exists reply_to_open_chat_id uuid references public.open_chat_messages(id) on delete set null;
create index if not exists private_messages_chat_reply_idx
  on public.private_messages(reply_to_open_chat_id, created_at)
  where reply_to_open_chat_id is not null;
