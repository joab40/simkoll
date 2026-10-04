-- Bevara historik när ett program tas bort från en simmare.
alter table public.program_assignments add column if not exists removed_at timestamptz;
create index if not exists program_assignments_active_idx on public.program_assignments (profile_id, removed_at) where removed_at is null;
