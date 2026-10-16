-- Keep goal visibility and swimmer replies consistent across devices.
alter table public.development_goals
  add column if not exists swimmer_seen_at timestamptz;

-- Existing goals predate the home-card feature; only newly created goals
-- should appear as unread after this migration is deployed.
update public.development_goals
  set swimmer_seen_at = created_at
  where swimmer_seen_at is null;

alter table public.goal_updates
  add column if not exists coach_seen_at timestamptz;

create index if not exists goal_updates_unread_coach_idx
  on public.goal_updates (created_at desc)
  where author_role = 'swimmer' and coach_seen_at is null;
