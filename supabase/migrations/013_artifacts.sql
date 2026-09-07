create table public.artifact_catalog (
  id uuid primary key default gen_random_uuid(),
  artifact_key text not null unique check (artifact_key ~ '^[a-z0-9_-]+$'),
  name text not null check (char_length(name) between 1 and 50),
  emoji text not null check (char_length(emoji) between 1 and 16),
  description text not null check (char_length(description) between 1 and 300),
  created_at timestamptz not null default now()
);

insert into public.artifact_catalog (artifact_key, name, emoji, description) values
  ('first_step', 'Första steget', '🌱', 'Du började bygga din egen träningsvana.'),
  ('weekly_rhythm', 'Veckorytm', '🔥', 'Du höll en jämn rytm i din träning.'),
  ('proactive', 'Proaktiv', '🧭', 'Du planerade din vecka med framförhållning.'),
  ('team_mate', 'Lagkamrat', '🤝', 'Du bidrar till en bra lagkänsla.'),
  ('reflective', 'Reflekterande', '💬', 'Du stannar upp och funderar över din utveckling.'),
  ('strong_habit', 'Stark vana', '🏋️', 'Du visar uthållighet i styrketräningen.'),
  ('land_training', 'Landtränare', '🤸', 'Du prioriterar din landträning.'),
  ('goal_minded', 'Målmedveten', '🎯', 'Du arbetar aktivt mot dina mål.'),
  ('steady', 'Stabil över tid', '🌊', 'Du bygger en hållbar träningsvana.'),
  ('coach_choice', 'Tränarens val', '⭐', 'Ett personligt märke från tränaren.')
on conflict (artifact_key) do nothing;

create table public.profile_artifacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  artifact_id uuid not null references public.artifact_catalog(id) on delete cascade,
  awarded_by uuid references public.profiles(id) on delete set null,
  source text not null default 'coach' check (source in ('coach', 'automatic')),
  created_at timestamptz not null default now(),
  unique (profile_id, artifact_id)
);

create index profile_artifacts_profile_idx on public.profile_artifacts (profile_id, created_at desc);
alter table public.artifact_catalog enable row level security;
alter table public.profile_artifacts enable row level security;
