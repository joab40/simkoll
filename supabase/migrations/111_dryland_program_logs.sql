-- Separate results/history from strength weights. No new AI or push settings.
create table if not exists public.dryland_program_logs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.program_assignments(id) on delete no action deferrable initially deferred,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pass_number smallint not null check (pass_number between 1 and 5),
  session_date date not null,
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object' and pg_column_size(results) <= 20000),
  notes text not null default '' check (char_length(notes) <= 1000),
  program_title text not null check (char_length(program_title) <= 100),
  pass_title text not null check (char_length(pass_title) <= 100),
  pass_content text not null check (char_length(pass_content) <= 5000),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (assignment_id, pass_number, session_date)
);
create index if not exists dryland_logs_profile_date_idx on public.dryland_program_logs (profile_id, session_date desc);
alter table public.dryland_program_logs enable row level security;
revoke all on public.dryland_program_logs from public, anon, authenticated;
grant select, insert, update on public.dryland_program_logs to service_role;

-- The result log and the completed day are committed together. The existing
-- slot uniqueness means planner, program and repeat saves still count once.
create or replace function public.save_dryland_program_log(
  p_profile_id uuid, p_assignment_id uuid, p_pass_number integer,
  p_session_date date, p_results jsonb, p_notes text,
  p_pass_title text, p_pass_content text, p_program_version timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare program public.training_programs; saved public.dryland_program_logs;
begin
  if p_session_date is null or p_session_date > (now() at time zone 'Europe/Stockholm')::date
    or p_pass_number is null or p_pass_number not between 1 and 5 then raise exception 'INVALID_DRYLAND_LOG'; end if;
  select p.* into program from public.program_assignments a join public.training_programs p on p.id = a.program_id
    join public.profiles s on s.id = a.profile_id
    where a.id = p_assignment_id and a.profile_id = p_profile_id and a.removed_at is null
      and p.program_type = 'dryland' and s.active and s.approval_status = 'approved'
    for share of a, p;
  if not found then raise exception 'DRYLAND_ASSIGNMENT_UNAVAILABLE'; end if;
  if program.updated_at is distinct from p_program_version then raise exception 'DRYLAND_PROGRAM_CHANGED'; end if;
  insert into public.dryland_program_logs (assignment_id, profile_id, pass_number, session_date, results, notes, program_title, pass_title, pass_content)
    values (p_assignment_id, p_profile_id, p_pass_number, p_session_date, p_results, p_notes, program.title, p_pass_title, p_pass_content)
    on conflict (assignment_id, pass_number, session_date) do update set results = excluded.results, notes = excluded.notes,
      program_title = excluded.program_title, pass_title = excluded.pass_title, pass_content = excluded.pass_content, completed_at = now()
    returning * into saved;
  insert into public.personal_training_sessions (profile_id, activity_type, session_slot, session_date, source)
    values (p_profile_id, 'dryland', 'dryland', p_session_date, 'program') on conflict do nothing;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_dryland_program_log(uuid,uuid,integer,date,jsonb,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.save_dryland_program_log(uuid,uuid,integer,date,jsonb,text,text,text,timestamptz) to service_role;

create or replace function public.assign_dryland_program(p_profile_id uuid, p_program_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dryland:' || p_profile_id::text, 0));
  perform 1 from public.profiles where id = p_profile_id and active and approval_status = 'approved' for share;
  if not found then raise exception 'DRYLAND_PROFILE_UNAVAILABLE'; end if;
  perform 1 from public.training_programs where id = p_program_id and program_type = 'dryland' and active for share;
  if not found then raise exception 'DRYLAND_PROGRAM_UNAVAILABLE'; end if;
  update public.program_assignments a set removed_at = now() from public.training_programs p
    where a.program_id = p.id and a.profile_id = p_profile_id and a.removed_at is null and p.program_type = 'dryland';
  insert into public.program_assignments (profile_id, program_id, removed_at) values (p_profile_id, p_program_id, null)
    on conflict (program_id, profile_id) do update set removed_at = null;
end;
$$;
revoke all on function public.assign_dryland_program(uuid,uuid) from public, anon, authenticated;
grant execute on function public.assign_dryland_program(uuid,uuid) to service_role;
