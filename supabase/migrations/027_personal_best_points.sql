alter table public.point_events drop constraint if exists point_events_event_type_check;
alter table public.point_events add constraint point_events_event_type_check check (
  event_type in ('daily_active', 'checkin', 'kudos_sent', 'kudos_received', 'goal_progress', 'goal_complete', 'program_goal', 'weekly_goal', 'strength_weekly_goal', 'dryland_weekly_goal', 'planning_weekly_goal', 'game_played', 'personal_best')
);
