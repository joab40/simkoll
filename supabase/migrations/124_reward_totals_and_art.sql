begin;
-- SUM runs inside Postgres, before the REST row limit. No points are rewritten.
create or replace function public.reward_point_totals(p_profile_ids uuid[])
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(profile_id::text, total), '{}'::jsonb)
  from (select profile_id, sum(points)::bigint as total from public.point_events
    where profile_id = any(p_profile_ids) group by profile_id) totals;
$$;
revoke all on function public.reward_point_totals(uuid[]) from public, anon, authenticated;
grant execute on function public.reward_point_totals(uuid[]) to service_role;

create table if not exists public.reward_level_art (
  id uuid primary key default gen_random_uuid(),
  level_id bigint not null references public.reward_levels(id) on delete cascade,
  coach_id uuid references public.coach_accounts(id) on delete set null,
  kind text not null check (kind in ('background', 'emblem')),
  style text not null check (style in ('aurora', 'pool', 'cosmic')),
  source_emoji text not null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  storage_path text,
  created_at timestamptz not null default now()
);
alter table public.reward_level_art enable row level security;
revoke all on public.reward_level_art from public, anon, authenticated;
grant select, insert, update on public.reward_level_art to service_role;
alter table public.reward_levels add column if not exists background_art_id uuid references public.reward_level_art(id) on delete set null;
alter table public.reward_levels add column if not exists emblem_art_id uuid references public.reward_level_art(id) on delete set null;
create index if not exists reward_art_coach_date_idx on public.reward_level_art(coach_id, created_at desc);

-- Public images contain only generic level artwork, never swimmer data.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('reward-level-art', 'reward-level-art', true, 3000000, array['image/webp', 'image/png', 'image/jpeg'])
  on conflict(id) do nothing;

create or replace function public.reserve_reward_art(p_actor_id uuid, p_session_version integer, p_level_id bigint, p_kind text, p_style text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_emoji text;
begin
  perform 1 from public.coach_accounts where id = p_actor_id and status = 'active'
    and role in ('head_coach', 'superadmin') and session_version = p_session_version for share;
  if not found then raise exception 'Privileged session required' using errcode = '42501'; end if;
  -- Serialise both an actor's quota and a level's in-flight generation.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 124));
  perform pg_advisory_xact_lock(hashtextextended(p_level_id::text, 125));
  if (select count(*) from public.reward_level_art where coach_id = p_actor_id and created_at > now() - interval '24 hours') >= 12
    then raise exception 'Daily image limit reached' using errcode = 'P0001'; end if;
  if exists(select 1 from public.reward_level_art where level_id = p_level_id and status = 'pending' and created_at > now() - interval '4 minutes')
    then raise exception 'Generation already running' using errcode = 'P0001'; end if;
  select emoji into v_emoji from public.reward_levels where id = p_level_id for share;
  if not found then raise exception 'Level not found' using errcode = '22023'; end if;
  insert into public.reward_level_art(level_id, coach_id, kind, style, source_emoji)
    values(p_level_id, p_actor_id, p_kind, p_style, v_emoji) returning id into v_id;
  return jsonb_build_object('id', v_id, 'emoji', v_emoji);
end;
$$;
revoke all on function public.reserve_reward_art(uuid, integer, bigint, text, text) from public, anon, authenticated;
grant execute on function public.reserve_reward_art(uuid, integer, bigint, text, text) to service_role;
commit;
