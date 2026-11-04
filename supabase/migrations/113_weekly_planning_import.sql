-- Run before using weekly spreadsheet import. No existing planning is changed.
create table if not exists public.planning_import_batches (
  id uuid primary key,
  request_digest text not null,
  summary jsonb not null,
  before_state jsonb not null,
  inserted_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.planning_import_batches enable row level security;
revoke all on public.planning_import_batches from public, anon, authenticated;
grant select, insert on public.planning_import_batches to service_role;

create or replace function public.apply_weekly_planning_import(
  p_id uuid, p_digest text, p_weeks jsonb, p_rows jsonb, p_summary jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  old_batch public.planning_import_batches%rowtype;
  week jsonb;
  row_data jsonb;
  current_state jsonb;
  backup_rows jsonb := '[]'::jsonb;
  monday date;
  groups text[];
  plan public.training_plans%rowtype;
  remaining text[];
  inserted uuid[] := '{}';
begin
  if p_id is null or p_digest is null or length(p_digest) <> 64 or
     jsonb_typeof(p_weeks) is distinct from 'array' or jsonb_array_length(p_weeks) not between 1 and 20 or
     jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 800 then
    raise exception 'Invalid planning import';
  end if;
  -- Serializes imports and manual planning writes during this short transaction.
  lock table public.training_plans in share row exclusive mode;
  select * into old_batch from public.planning_import_batches where id = p_id;
  if found then
    if old_batch.request_digest <> p_digest then raise exception 'Import ID already used'; end if;
    return old_batch.summary;
  end if;
  for week in select value from jsonb_array_elements(p_weeks) loop
    monday := (week->>'monday')::date;
    groups := array(select jsonb_array_elements_text(week->'groups'));
    if extract(isodow from monday) <> 1 or cardinality(groups) = 0 or
       not groups <@ array['junior','ungdom_svart','ungdom_orange']::text[] or
       week->>'mode' not in ('add','replace') or jsonb_typeof(week->'expected') is distinct from 'array' then
      raise exception 'Invalid planning scope';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'updatedAt', updated_at) order by id), '[]'::jsonb)
      into current_state from public.training_plans
      where plan_date between monday and monday + 6 and target_groups && groups;
    -- JSON timestamps from PostgREST and PostgreSQL may have different formatting.
    if exists (
      (select id, updated_at from public.training_plans where plan_date between monday and monday + 6 and target_groups && groups
       except select (x->>'id')::uuid, (x->>'updatedAt')::timestamptz from jsonb_array_elements(week->'expected') x)
      union all
      (select (x->>'id')::uuid, (x->>'updatedAt')::timestamptz from jsonb_array_elements(week->'expected') x
       except select id, updated_at from public.training_plans where plan_date between monday and monday + 6 and target_groups && groups)
    ) then raise exception 'Planning changed: review again' using errcode = '40001'; end if;
    if week->>'mode' = 'replace' then
      for plan in select * from public.training_plans
        where plan_date between monday and monday + 6 and target_groups && groups
          and source_workout_id is null and source_competition_id is null and activity_type <> 'competition'
          and not coalesce(calendar_link ? 'detachedWorkoutId', false)
      loop
        backup_rows := backup_rows || jsonb_build_array(to_jsonb(plan));
        remaining := array(select unnest(plan.target_groups) except select unnest(groups));
        if cardinality(remaining) = 0 then delete from public.training_plans where id = plan.id;
        else update public.training_plans set target_groups = remaining, updated_at = now() where id = plan.id; end if;
      end loop;
    end if;
  end loop;
  for row_data in select value from jsonb_array_elements(p_rows) loop
    groups := array(select jsonb_array_elements_text(row_data->'target_groups'));
    if not exists (select 1 from jsonb_array_elements(p_weeks) w
        where (row_data->>'plan_date')::date between (w->>'monday')::date and (w->>'monday')::date + 6
          and groups <@ array(select jsonb_array_elements_text(w->'groups')))
       or cardinality(groups) = 0 or row_data->>'activity_type' not in ('swim','strength','dryland','competition')
       or row_data->>'time_of_day' not in ('morning','afternoon')
       or length(coalesce(row_data->>'title','')) not between 1 and 100 then raise exception 'Invalid import row'; end if;
    insert into public.training_plans (id,plan_date,activity_type,title,focus,distance_meters,duration_minutes,time_of_day,target_groups,location,notes,calendar_link,alternative_group_id,sync_status)
      values ((row_data->>'id')::uuid,(row_data->>'plan_date')::date,row_data->>'activity_type',row_data->>'title',row_data->>'focus',
        (row_data->>'distance_meters')::integer,(row_data->>'duration_minutes')::integer,row_data->>'time_of_day',groups,row_data->>'location',row_data->>'notes',row_data->'calendar_link',(row_data->>'alternative_group_id')::uuid,'manual');
    inserted := array_append(inserted,(row_data->>'id')::uuid);
  end loop;
  insert into public.planning_import_batches (id,request_digest,summary,before_state,inserted_ids)
    values (p_id,p_digest,p_summary,backup_rows,inserted);
  return p_summary;
end;
$$;
revoke all on function public.apply_weekly_planning_import(uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_weekly_planning_import(uuid,text,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
