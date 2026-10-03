alter table public.open_chat_messages add column if not exists visibility text not null default 'group';
alter table public.open_chat_messages drop constraint if exists open_chat_messages_visibility_check;
alter table public.open_chat_messages add constraint open_chat_messages_visibility_check check (visibility in ('group', 'coaches'));

-- Existing swimmer posts follow the new privacy rule as well; coach posts remain public.
update public.open_chat_messages
set visibility = 'coaches'
where sender_role = 'swimmer' and visibility = 'group';
