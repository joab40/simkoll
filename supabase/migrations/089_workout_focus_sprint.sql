alter table public.daily_workouts
  drop constraint if exists daily_workouts_focus_check,
  add constraint daily_workouts_focus_check check (
    focus is null or focus in (
      'fart', 'sprint', 'troskel', 'syra', 'f2_frisim', 'f2_spec',
      'distans', 'teknik', 'aterhamtning', 'kondition_frisim', 'kondition_special'
    )
  );
