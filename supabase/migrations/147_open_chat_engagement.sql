begin;

create table if not exists public.open_chat_engagement (
  message_id uuid not null references public.open_chat_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  liked boolean not null default false,
  primary key (message_id, profile_id)
);

create index if not exists open_chat_engagement_profile_idx on public.open_chat_engagement(profile_id);
alter table public.open_chat_engagement enable row level security;
revoke all on public.open_chat_engagement from public, anon, authenticated;
grant select, insert, update on public.open_chat_engagement to service_role;

create or replace function public.open_chat_engagement_totals(p_message_ids uuid[], p_profile_id uuid)
returns table (message_id uuid, seen_count integer, like_count integer, seen boolean, liked boolean)
language sql stable set search_path = ''
as $$
  select m.id, count(e.profile_id)::integer, count(*) filter (where e.liked)::integer,
    coalesce(bool_or(e.profile_id = p_profile_id), false),
    coalesce(bool_or(e.profile_id = p_profile_id and e.liked), false)
  from public.open_chat_messages m
  left join public.open_chat_engagement e on e.message_id = m.id
  where m.id = any(p_message_ids) and m.sender_role = 'coach'
    and m.visibility = 'group' and m.deleted_at is null
  group by m.id;
$$;

create or replace function public.save_open_chat_engagement(p_message_ids uuid[], p_profile_id uuid, p_liked boolean)
returns table (message_id uuid, seen_count integer, like_count integer, seen boolean, liked boolean)
language plpgsql set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_profile_id is null or coalesce(cardinality(p_message_ids), 0) not between 1 and 40
    or (p_liked is not null and cardinality(p_message_ids) <> 1) then
    raise exception 'Invalid engagement request';
  end if;
  if not exists (
    select 1 from public.app_settings
    where setting_key = 'webapp' and setting_value #> '{openChat,enabled}' = 'true'::jsonb
  ) then
    return;
  end if;

  select array(select m.id from public.open_chat_messages m
    where m.id = any(p_message_ids) and m.sender_role = 'coach'
      and m.visibility = 'group' and m.deleted_at is null
    order by m.id for share) into v_ids;

  insert into public.open_chat_engagement as e (message_id, profile_id, liked)
    select id, p_profile_id, coalesce(p_liked, false) from unnest(v_ids) as ids(id)
    on conflict on constraint open_chat_engagement_pkey do update set liked = excluded.liked
      where p_liked is not null and e.liked is distinct from excluded.liked;

  return query select * from public.open_chat_engagement_totals(v_ids, p_profile_id);
end;
$$;

revoke all on function public.open_chat_engagement_totals(uuid[], uuid),
  public.save_open_chat_engagement(uuid[], uuid, boolean) from public, anon, authenticated;
grant execute on function public.open_chat_engagement_totals(uuid[], uuid),
  public.save_open_chat_engagement(uuid[], uuid, boolean) to service_role;

commit;
