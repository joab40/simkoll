-- Run after 096. Saving reminder settings in Simkoll provisions the schedule
-- and its credentials automatically; no manual Vault or Vercel variables.
create or replace function public.configure_training_reminders(
  p_url text,
  p_token text,
  p_reminders jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured boolean;
  existing_id uuid;
  old_job record;
  reminders jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(197096097);
  reminders := jsonb_build_object(
    'missingCheckin', coalesce((p_reminders->>'missingCheckin')::boolean, false),
    'afterTraining', coalesce((p_reminders->>'afterTraining')::boolean, false)
  );
  configured := (reminders->>'missingCheckin')::boolean or (reminders->>'afterTraining')::boolean;

  if configured then
    if p_url is null or p_url !~ '^https://[a-zA-Z0-9.-]+(:443)?/api/notifications\?push=true&cron=training-reminder&kind=scheduled$'
       or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
      raise exception 'INVALID_REMINDER_CONFIGURATION';
    end if;
    select id into existing_id from vault.secrets where name = 'simkoll_training_reminder_url';
    if existing_id is null then
      perform vault.create_secret(p_url, 'simkoll_training_reminder_url');
    else
      perform vault.update_secret(existing_id, p_url);
    end if;
    select id into existing_id from vault.secrets where name = 'simkoll_cron_secret';
    if existing_id is null then
      perform vault.create_secret(p_token, 'simkoll_cron_secret');
    else
      perform vault.update_secret(existing_id, p_token);
    end if;
  end if;

  for old_job in select jobid from cron.job where jobname in ('simkoll-after-training-reminder', 'simkoll-training-reminders') loop
    perform cron.unschedule(old_job.jobid);
  end loop;

  if configured then
    perform cron.schedule('simkoll-training-reminders', '*/5 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'simkoll_training_reminder_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'simkoll_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
    $job$);
  end if;

  insert into public.app_settings (setting_key, setting_value, updated_at)
    values ('web_push', jsonb_build_object('checkinReminders', reminders), now())
    on conflict (setting_key) do update
      set setting_value = jsonb_set(public.app_settings.setting_value, '{checkinReminders}', reminders), updated_at = now();
end;
$$;

revoke all on function public.configure_training_reminders(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.configure_training_reminders(text, text, jsonb) to service_role;
