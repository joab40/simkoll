alter table public.coach_accounts
  add column if not exists managed_groups jsonb not null default '[]'::jsonb,
  add column if not exists personal_settings_enabled boolean not null default false,
  add column if not exists personal_settings jsonb not null default '{}'::jsonb;
