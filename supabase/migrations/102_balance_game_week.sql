-- Preppes balansjakt: nästa veckas spel, 26 oktober–1 november 2026.
-- Inga nya tabeller/behörigheter behövs. Befintliga spelperioder behålls.
-- Kan köras igen: ändrar inte en redan skapad period, även om den avpublicerats.
insert into public.app_settings (setting_key, setting_value)
values ('game_schedule', '{"schedule":[{"id":"balance-2026-10-26","gameKey":"balance","startDate":"2026-10-26","endDate":"2026-11-01","published":true}]}'::jsonb)
on conflict (setting_key) do update
set setting_value = jsonb_set(
  app_settings.setting_value,
  '{schedule}',
  coalesce(app_settings.setting_value->'schedule', '[]'::jsonb) || (excluded.setting_value->'schedule')
), updated_at = now()
where not exists (
  select 1 from jsonb_array_elements(coalesce(app_settings.setting_value->'schedule', '[]'::jsonb)) as period
  where period->>'gameKey' = 'balance'
    and period->>'startDate' = '2026-10-26'
    and period->>'endDate' = '2026-11-01'
);
