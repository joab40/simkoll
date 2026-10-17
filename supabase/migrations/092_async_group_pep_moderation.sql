alter table public.group_pep
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_note text,
  add column if not exists point_eligible boolean not null default false;

alter table public.group_pep
  drop constraint if exists group_pep_moderation_status_check;

alter table public.group_pep
  add constraint group_pep_moderation_status_check
  check (moderation_status in ('pending', 'approved', 'rejected'));

create index if not exists group_pep_pending_moderation_idx
  on public.group_pep (created_at)
  where moderation_status = 'pending';
