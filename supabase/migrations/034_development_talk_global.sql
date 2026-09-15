create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (setting_key, setting_value) values ('development_talks', '{"enabled": true}'::jsonb) on conflict (setting_key) do nothing;
