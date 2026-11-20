begin;

create table if not exists public.lane_usage_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  title text not null check(length(trim(title)) between 1 and 80),
  participants jsonb not null check(jsonb_typeof(participants)='array' and jsonb_array_length(participants) between 1 and 5),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.coach_accounts(id) on delete set null
);
insert into public.lane_usage_settings(singleton,title,participants) values(true,'Banfördelning klubbar',
  '[{"id":"00000000-0000-4000-8000-000000000001","name":"Sundsvall"},{"id":"00000000-0000-4000-8000-000000000002","name":"Njurunda"}]') on conflict do nothing;

create table if not exists public.lane_usage_measurements (
  id uuid primary key,
  measurement_date date not null check(measurement_date>='2000-01-01'),
  observed_time text not null check(observed_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  location text not null default '' check(length(location)<=100),
  entries jsonb not null check(jsonb_typeof(entries)='array' and jsonb_array_length(entries) between 1 and 5),
  photo_path text,
  created_by uuid references public.coach_accounts(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists lane_usage_measurement_date_idx on public.lane_usage_measurements(measurement_date desc,observed_time desc,id);
alter table public.lane_usage_settings enable row level security;
alter table public.lane_usage_measurements enable row level security;
revoke all on public.lane_usage_settings,public.lane_usage_measurements from public,anon,authenticated;
grant select,insert,update,delete on public.lane_usage_settings,public.lane_usage_measurements to service_role;

create or replace function public.save_lane_usage_settings(p_actor uuid,p_expected timestamptz,p_enabled boolean,p_title text,p_participants jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settings public.lane_usage_settings; v_item jsonb;
begin
  if not exists(select 1 from public.coach_accounts where id=p_actor and status='active' and role='superadmin') then raise exception 'LANE_ACCESS' using errcode='42501'; end if;
  select * into v_settings from public.lane_usage_settings where singleton for update;
  if p_expected is distinct from v_settings.updated_at then raise exception 'LANE_CONFLICT' using errcode='40001'; end if;
  if p_enabled is null or p_title is null or length(trim(p_title)) not between 1 and 80 or p_participants is null or jsonb_typeof(p_participants)<>'array' or jsonb_array_length(p_participants) not between 1 and 5 then raise exception 'LANE_INVALID'; end if;
  for v_item in select value from jsonb_array_elements(p_participants) loop
    if jsonb_typeof(v_item->'id') is distinct from 'string' or (v_item->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(v_item->'name') is distinct from 'string' or length(trim(v_item->>'name')) not between 1 and 60 then raise exception 'LANE_INVALID'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_participants))<>jsonb_array_length(p_participants) or (select count(distinct lower(trim(value->>'name'))) from jsonb_array_elements(p_participants))<>jsonb_array_length(p_participants) then raise exception 'LANE_INVALID'; end if;
  update public.lane_usage_settings set enabled=p_enabled,title=trim(p_title),participants=p_participants,updated_at=clock_timestamp(),updated_by=p_actor where singleton returning * into v_settings;
  return to_jsonb(v_settings);
end;
$$;

create or replace function public.save_lane_usage_measurement(p_actor uuid,p_expected timestamptz,p_id uuid,p_date date,p_time text,p_location text,p_entries jsonb,p_photo_path text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_settings public.lane_usage_settings; v_existing public.lane_usage_measurements; v_item jsonb; v_name text;
begin
  if not exists(select 1 from public.coach_accounts where id=p_actor and status='active' and role in ('coach','head_coach','superadmin')) then raise exception 'LANE_ACCESS' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,133));
  select * into v_existing from public.lane_usage_measurements where id=p_id;
  if found then
    if v_existing.created_by=p_actor and v_existing.measurement_date=p_date and v_existing.observed_time=p_time and v_existing.location=p_location and v_existing.entries=p_entries and (v_existing.photo_path is null)=(p_photo_path is null) then return to_jsonb(v_existing); end if;
    raise exception 'LANE_DUPLICATE' using errcode='23505';
  end if;
  select * into v_settings from public.lane_usage_settings where singleton for share;
  if not v_settings.enabled then raise exception 'LANE_DISABLED'; end if;
  if p_expected is distinct from v_settings.updated_at then raise exception 'LANE_CONFLICT' using errcode='40001'; end if;
  if p_id is null or p_date is null or p_date<'2000-01-01' or p_date>(now() at time zone 'Europe/Stockholm')::date or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_location is null or length(p_location)>100 or p_entries is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries) not between 1 and 5 then raise exception 'LANE_INVALID'; end if;
  for v_item in select value from jsonb_array_elements(p_entries) loop
    select value->>'name' into v_name from jsonb_array_elements(v_settings.participants) where value->>'id'=v_item->>'participantId';
    if v_name is null or v_name is distinct from v_item->>'name' or jsonb_typeof(v_item->'lanes') is distinct from 'number' or jsonb_typeof(v_item->'swimmers') is distinct from 'number' or (v_item->>'lanes') !~ '^[1-8]$' or (v_item->>'swimmers') !~ '^(0|[1-9][0-9]{0,2})$' or (v_item->>'swimmers')::integer>500 then raise exception 'LANE_INVALID'; end if;
  end loop;
  if (select count(distinct value->>'participantId') from jsonb_array_elements(p_entries))<>jsonb_array_length(p_entries) then raise exception 'LANE_INVALID'; end if;
  if p_photo_path is not null and (p_photo_path !~ ('^'||p_actor::text||'/'||p_id::text||'/[0-9a-f-]{36}\.jpg$')) then raise exception 'LANE_INVALID'; end if;
  insert into public.lane_usage_measurements(id,measurement_date,observed_time,location,entries,photo_path,created_by) values(p_id,p_date,p_time,p_location,p_entries,p_photo_path,p_actor) returning * into v_existing;
  return to_jsonb(v_existing);
end;
$$;

revoke all on function public.save_lane_usage_settings(uuid,timestamptz,boolean,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_lane_usage_measurement(uuid,timestamptz,uuid,date,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_lane_usage_settings(uuid,timestamptz,boolean,text,jsonb) to service_role;
grant execute on function public.save_lane_usage_measurement(uuid,timestamptz,uuid,date,text,text,jsonb,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('lane-usage-evidence','lane-usage-evidence',false,2000000,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=2000000,allowed_mime_types=array['image/jpeg'];
-- No client Storage policy: only the server may upload or sign these photos.
commit;
