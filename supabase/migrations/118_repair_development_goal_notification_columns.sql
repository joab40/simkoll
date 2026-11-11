-- Repair databases missing the notification columns introduced in migration 091.
-- Required by /api/goals?coachAlerts=true, /api/goals?home=true and
-- /api/notifications. Safe to run when either or both columns already exist.
-- Unlike 091, this repair does not mark existing goals as read: existing goals,
-- replies and read timestamps are preserved. Older unread items may appear.

begin;

alter table public.goal_updates
  add column if not exists coach_seen_at timestamptz;

alter table public.development_goals
  add column if not exists swimmer_seen_at timestamptz;

create index if not exists goal_updates_unread_coach_idx
  on public.goal_updates (created_at desc)
  where author_role = 'swimmer'
    and coach_seen_at is null;

commit;
