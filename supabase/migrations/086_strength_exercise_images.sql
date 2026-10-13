-- Private exercise illustrations and uploaded alternatives. Access is checked
-- in Simkoll's server before issuing expiring download URLs.
alter table public.training_programs
  add column if not exists exercise_images jsonb not null default '[]'::jsonb;

create table if not exists public.strength_exercise_images (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_accounts(id),
  storage_path text not null unique,
  source text not null check (source in ('ai', 'upload')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now()
);
alter table public.strength_exercise_images enable row level security;
create index if not exists strength_exercise_images_coach_idx on public.strength_exercise_images(coach_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('strength-exercise-images', 'strength-exercise-images', false, 3000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
