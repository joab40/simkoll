-- References only: never retain a copy of a deleted message in a quote.
alter table public.group_pep add column if not exists reply_type text;
alter table public.group_pep add column if not exists reply_id uuid;
alter table public.group_pep drop constraint if exists group_pep_reply_check;
alter table public.group_pep add constraint group_pep_reply_check check (
  (reply_type is null and reply_id is null)
  or (reply_type is not null and reply_type in ('group', 'coach') and reply_id is not null)
);
