begin;

create or replace function public.open_chat_coach_read_totals(p_message_ids uuid[])
returns table (message_id uuid, seen_count integer, recipient_count integer, like_count integer)
language sql stable set search_path = ''
as $$
  with recipients as (
    select id from public.profiles
    where active and approval_status = 'approved' and not is_test_profile
  )
  select m.id, count(r.id)::integer, (select count(*)::integer from recipients),
    count(*) filter (where e.liked)::integer
  from public.open_chat_messages m
  left join public.open_chat_engagement e on e.message_id = m.id
  left join recipients r on r.id = e.profile_id
  where m.id = any(p_message_ids) and m.sender_role = 'coach'
    and m.visibility = 'group' and m.deleted_at is null
  group by m.id;
$$;

create or replace function public.open_chat_coach_read_details(p_message_id uuid)
returns table (seen_count integer, recipient_count integer, unseen jsonb)
language sql stable set search_path = ''
as $$
  select count(e.profile_id)::integer, count(p.id)::integer,
    coalesce(
      jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name, 'emoji', p.emoji)
        order by lower(p.display_name), p.id)
        filter (where p.id is not null and e.profile_id is null),
      '[]'::jsonb
    )
  from public.open_chat_messages m
  left join public.profiles p on p.active and p.approval_status = 'approved' and not p.is_test_profile
  left join public.open_chat_engagement e on e.message_id = m.id and e.profile_id = p.id
  where m.id = p_message_id and m.sender_role = 'coach'
    and m.visibility = 'group' and m.deleted_at is null
  group by m.id;
$$;

revoke all on function public.open_chat_coach_read_totals(uuid[]),
  public.open_chat_coach_read_details(uuid) from public, anon, authenticated;
grant execute on function public.open_chat_coach_read_totals(uuid[]),
  public.open_chat_coach_read_details(uuid) to service_role;

commit;
