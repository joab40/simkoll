-- Storage overview is service-only. No swimmer records, filenames or file
-- contents are copied to these tables. Run in the Supabase SQL Editor.
create table if not exists public.storage_usage_settings (
  id boolean primary key default true check (id),
  database_budget_bytes bigint check (database_budget_bytes > 0 and database_budget_bytes <= 1000000000000000),
  file_budget_bytes bigint check (file_budget_bytes > 0 and file_budget_bytes <= 1000000000000000),
  updated_at timestamptz not null default now()
);
insert into public.storage_usage_settings (id) values (true) on conflict do nothing;

create table if not exists public.storage_usage_snapshots (
  measured_on date primary key,
  measured_at timestamptz not null,
  database_bytes bigint not null,
  file_bytes bigint not null,
  file_count bigint not null,
  unknown_size_count bigint not null default 0
);

create table if not exists public.storage_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null check (action in ('upload', 'delete', 'upload_link', 'budget')),
  bucket_id text,
  stage text check (stage in ('temporary', 'saved')),
  bytes bigint check (bytes >= 0),
  object_count integer check (object_count >= 0),
  success boolean not null,
  http_status integer check (http_status between 100 and 599)
);
create index if not exists storage_usage_events_time_idx on public.storage_usage_events (created_at desc);

alter table public.storage_usage_settings enable row level security;
alter table public.storage_usage_snapshots enable row level security;
alter table public.storage_usage_events enable row level security;
revoke all on public.storage_usage_settings, public.storage_usage_snapshots, public.storage_usage_events from public, anon, authenticated;
grant select, insert, update on public.storage_usage_settings, public.storage_usage_snapshots to service_role;
grant select, insert on public.storage_usage_events to service_role;

create or replace function public.measure_storage_usage() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  -- pg_total_relation_size includes indexes and TOAST. Count ordinary tables
  -- and materialized views, not their indexes/TOAST again or partition parents.
  with relations as (
    select n.nspname as schema_name, c.relname as table_name,
      pg_catalog.pg_total_relation_size(c.oid) as bytes,
      case when c.reltuples >= 0 then c.reltuples::bigint else null end as estimated_rows
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'm') and n.nspname not like 'pg_toast%'
      and n.nspname not like 'pg_temp%'
  ), objects as (
    select bucket_id,
      case when coalesce(metadata->>'size', '') ~ '^[0-9]{1,18}$'
        then (metadata->>'size')::bigint else null end as bytes,
      case when lower(coalesce(metadata->>'mimetype', '')) like 'video/%' then 'video'
        when lower(coalesce(metadata->>'mimetype', '')) like 'image/%' then 'image'
        when lower(coalesce(metadata->>'mimetype', '')) in ('application/pdf', 'text/plain', 'text/csv',
          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') then 'document'
        else 'other' end as kind
    from storage.objects
  ), buckets as (
    select b.id, b.public, count(o.bucket_id) as object_count,
      coalesce(sum(o.bytes), 0) as bytes,
      count(o.bucket_id) filter (where o.bytes is null) as unknown_size_count
    from storage.buckets b left join objects o on o.bucket_id = b.id group by b.id, b.public
  ), kinds as (
    select kind, count(*) as object_count, coalesce(sum(bytes), 0) as bytes,
      count(*) filter (where bytes is null) as unknown_size_count
    from objects group by kind
  ), schemas as (
    select schema_name, sum(bytes) as bytes from relations group by schema_name
  ), areas as (
    select case
      when table_name in ('profiles','responses','profile_daily_sleep','profile_daily_activity') then 'Simmarprofiler och incheckningar'
      when table_name in ('development_goals','goal_updates','development_talks','program_goals','season_swim_goals','cross_training_goals') then 'Mål och utvecklingssamtal'
      when table_name in ('private_messages','group_pep','community_posts','open_chat_messages','coach_info_messages','private_chat_replies','kudos') then 'Meddelanden och återkoppling'
      when table_name like 'competition_%' or table_name = 'training_swim_times' then 'Tävlingsresultat och egna tider'
      when table_name in ('daily_workouts','training_plans','planned_training_sessions','personal_training_sessions','training_programs','program_assignments','session_attendance','training_groups','training_diary_reflections','training_cycles','strength_programs','strength_exercise_images','strength_program_logs') then 'Träning och planering'
      when table_name like '%log%' or table_name like 'storage_usage_%' then 'Loggar och mätningar'
      else 'Övrig appdata' end as area,
      sum(bytes) as bytes
    from relations where schema_name = 'public' group by 1
  )
  select jsonb_build_object(
    'measuredAt', pg_catalog.clock_timestamp(),
    'databaseBytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'fileBytes', (select coalesce(sum(bytes), 0) from objects),
    'fileCount', (select count(*) from objects),
    'unknownSizeCount', (select count(*) from objects where bytes is null),
    'buckets', (select coalesce(jsonb_agg(to_jsonb(b) order by b.bytes desc, b.id), '[]'::jsonb) from buckets b),
    'kinds', (select coalesce(jsonb_agg(to_jsonb(k) order by k.bytes desc, k.kind), '[]'::jsonb) from kinds k),
    'schemas', (select coalesce(jsonb_agg(to_jsonb(s) order by s.bytes desc, s.schema_name), '[]'::jsonb) from schemas s),
    'areas', (select coalesce(jsonb_agg(to_jsonb(a) order by a.bytes desc, a.area), '[]'::jsonb) from areas a),
    'tables', (select coalesce(jsonb_agg(to_jsonb(t) order by t.bytes desc, t.table_name), '[]'::jsonb)
      from (select table_name, bytes, estimated_rows from relations where schema_name = 'public' order by bytes desc, table_name limit 30) t)
  ) into result;
  return result;
end;
$$;

create or replace function public.capture_storage_usage() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sample jsonb; captured_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(197110);
  sample := public.measure_storage_usage();
  captured_at := (sample->>'measuredAt')::timestamptz;
  insert into public.storage_usage_snapshots (measured_on, measured_at, database_bytes, file_bytes, file_count, unknown_size_count)
    values ((captured_at at time zone 'Europe/Stockholm')::date, captured_at,
      (sample->>'databaseBytes')::bigint, (sample->>'fileBytes')::bigint,
      (sample->>'fileCount')::bigint, (sample->>'unknownSizeCount')::bigint)
    on conflict (measured_on) do update set measured_at = excluded.measured_at,
      database_bytes = excluded.database_bytes, file_bytes = excluded.file_bytes,
      file_count = excluded.file_count, unknown_size_count = excluded.unknown_size_count;
  return sample;
end;
$$;

create or replace function public.storage_admin_overview(p_capture boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sample jsonb;
begin
  sample := case when p_capture then public.capture_storage_usage() else public.measure_storage_usage() end;
  return jsonb_build_object('current', sample,
    'settings', (select to_jsonb(s) - 'id' from public.storage_usage_settings s where id),
    'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.measured_on), '[]'::jsonb)
      from (select * from public.storage_usage_snapshots order by measured_on desc limit 366) h),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
      from (select * from public.storage_usage_events order by created_at desc limit 100) e),
    'dailyScheduleEnabled', exists(select 1 from cron.job where jobname = 'simkoll-storage-snapshot' and active));
end;
$$;

create or replace function public.set_storage_budgets(p_database bigint, p_files bigint, p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved public.storage_usage_settings;
begin
  if (p_database is not null and (p_database <= 0 or p_database > 1000000000000000))
     or (p_files is not null and (p_files <= 0 or p_files > 1000000000000000)) then
    raise exception 'INVALID_STORAGE_BUDGET';
  end if;
  update public.storage_usage_settings set database_budget_bytes = p_database,
    file_budget_bytes = p_files, updated_at = pg_catalog.clock_timestamp()
    where id and updated_at = p_expected_updated_at returning * into saved;
  if not found then raise exception 'STORAGE_BUDGET_CONFLICT'; end if;
  insert into public.storage_usage_events (action, success) values ('budget', true);
  return to_jsonb(saved) - 'id';
end;
$$;

revoke all on function public.measure_storage_usage(), public.capture_storage_usage(), public.storage_admin_overview(boolean), public.set_storage_budgets(bigint, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.measure_storage_usage(), public.capture_storage_usage(), public.storage_admin_overview(boolean), public.set_storage_budgets(bigint, bigint, timestamptz) to service_role;

-- SQL-only daily sampling: no HTTP callback, Vault secret or Vercel variable.
create extension if not exists pg_cron;
select cron.schedule('simkoll-storage-snapshot', '15 3 * * *', 'select public.capture_storage_usage();');
select public.capture_storage_usage();
