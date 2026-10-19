alter table public.push_subscriptions
  add column if not exists training_reminders boolean not null default true;

create table if not exists public.training_reminder_deliveries (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null,
  reminder_kind text not null check (reminder_kind in ('missingCheckin', 'afterTraining')),
  created_at timestamptz not null default now(),
  primary key (profile_id, reminder_date)
);

alter table public.training_reminder_deliveries enable row level security;
revoke all on public.training_reminder_deliveries from anon, authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  old_job record;
begin
  for old_job in select jobid from cron.job where jobname = 'simkoll-after-training-reminder' loop
    perform cron.unschedule(old_job.jobid);
  end loop;
  perform cron.schedule(
    'simkoll-after-training-reminder',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'simkoll_training_reminder_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'simkoll_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'simkoll_training_reminder_url')
        and exists (select 1 from vault.decrypted_secrets where name = 'simkoll_cron_secret')
    $job$
  );
end $$;
