begin;
-- The original suggestion and internal notes must not be reachable directly
-- through public/client database roles either. Existing server routes use the
-- Supabase service role (BYPASSRLS); their workflow operations remain unchanged.
alter table public.app_feedback enable row level security;
revoke all on public.app_feedback from public, anon, authenticated;
grant select, insert, update, delete on public.app_feedback to service_role;
do $$ declare v_sequence text; begin
  v_sequence := pg_get_serial_sequence('public.app_feedback','id');
  if v_sequence is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated',v_sequence);
    execute format('grant usage, select on sequence %s to service_role',v_sequence);
  end if;
end $$;
create table public.app_feedback_messages (
  id bigint generated always as identity primary key,
  feedback_id bigint not null references public.app_feedback(id) on delete cascade,
  author_role text not null check (author_role in ('swimmer', 'superadmin')),
  author_id uuid,
  request_id uuid not null,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  legacy_reply boolean not null default false,
  unique (feedback_id, author_role, request_id)
);
create index feedback_messages_thread_idx on public.app_feedback_messages(feedback_id, id desc);
create unique index feedback_messages_legacy_idx on public.app_feedback_messages(feedback_id) where legacy_reply;
revoke all on sequence public.app_feedback_messages_id_seq from public, anon, authenticated;
create table public.app_feedback_reads (
  feedback_id bigint not null references public.app_feedback(id) on delete cascade,
  reader_role text not null check (reader_role in ('swimmer', 'superadmin')),
  reader_id uuid not null,
  through_id bigint not null default 0,
  primary key (feedback_id, reader_role, reader_id)
);
alter table public.app_feedback_messages enable row level security;
alter table public.app_feedback_reads enable row level security;
revoke all on public.app_feedback_messages, public.app_feedback_reads from public, anon, authenticated;
-- Historic replies are retained once, in their original chronology. Legacy
-- private messages are not deleted or resent, and internal notes never enter here.
insert into public.app_feedback_messages(feedback_id, author_role, request_id, content, created_at, legacy_reply)
select id, 'superadmin', gen_random_uuid(), admin_reply, admin_reply_sent_at, true
from public.app_feedback where submitted_by_role = 'swimmer' and profile_id is not null
  and admin_reply_sent_at is not null and nullif(btrim(admin_reply), '') is not null;

create or replace function public.app_feedback_dialog(
  p_action text, p_profile_id uuid default null, p_coach_id uuid default null,
  p_session_version integer default null, p_feedback_id bigint default null,
  p_request_id uuid default null, p_content text default null,
  p_through_id bigint default null, p_before_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role text; v_actor uuid; v_feedback public.app_feedback%rowtype;
  v_message public.app_feedback_messages%rowtype; v_messages jsonb; v_items jsonb;
  v_count bigint; v_last bigint; v_older boolean; v_created boolean := false;
begin
  if p_coach_id is not null and p_profile_id is null then
    perform 1 from public.coach_accounts where id=p_coach_id and role='superadmin'
      and status='active' and session_version=p_session_version for share;
    if not found then raise exception 'Feedback access denied' using errcode='42501'; end if;
    v_role := 'superadmin'; v_actor := p_coach_id;
  elsif p_profile_id is not null and p_coach_id is null then
    perform 1 from public.profiles where id=p_profile_id and active=true and approval_status='approved' for share;
    if not found then raise exception 'Feedback access denied' using errcode='42501'; end if;
    v_role := 'swimmer'; v_actor := p_profile_id;
  else raise exception 'Feedback access denied' using errcode='42501'; end if;

  if p_action in ('list', 'unread', 'count') then
    -- Count all unread threads before limiting the visible page. A new original
    -- submission is unread for each superadmin, even before its first follow-up.
    with threads as (
      select f.id, f.comment, f.workflow_status, f.archived_at, f.created_at,
        p.display_name, p.emoji, r.feedback_id is null as initial_unread,
        (select count(*) from public.app_feedback_messages m where m.feedback_id=f.id
          and m.author_role<>v_role and m.id>coalesce(r.through_id,0)) as unread_messages,
        (select jsonb_build_object('id',m.id::text,'role',m.author_role,'content',m.content,'createdAt',m.created_at)
          from public.app_feedback_messages m where m.feedback_id=f.id order by m.id desc limit 1) as last_message
      from public.app_feedback f left join public.profiles p on p.id=f.profile_id
      left join public.app_feedback_reads r on r.feedback_id=f.id and r.reader_role=v_role and r.reader_id=v_actor
      where f.submitted_by_role='swimmer' and f.profile_id is not null
        and (v_role='superadmin' or f.profile_id=p_profile_id)
    ), summary as (
      select *, unread_messages>0 or (v_role='superadmin' and initial_unread) as unread from threads
    )
    select (select count(*) from summary where unread),
      (select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'comment',comment,'status',workflow_status,
        'archived',archived_at is not null,'profileName',case when v_role='superadmin' then display_name else null end,
        'profileEmoji',case when v_role='superadmin' then emoji else null end,'createdAt',created_at,
        'unread',unread,'lastMessage',last_message) order by id desc),'[]'::jsonb)
        from (select * from summary where (p_before_id is null or id<p_before_id)
          and (p_action<>'unread' or unread) order by id desc limit 30) page)
      into v_count, v_items;
    return jsonb_build_object('unreadCount',v_count,'items',case when p_action='count' then '[]'::jsonb else v_items end,
      'nextBefore',case when jsonb_array_length(v_items)=30 then v_items->29->>'id' else null end);
  end if;
  if p_action not in ('thread','send','read') or p_action is null then
    raise exception 'Invalid feedback action' using errcode='22023';
  end if;
  if p_action='send' then perform pg_advisory_xact_lock(hashtextextended(v_actor::text,130)); end if;
  -- Lock the original thread for writes; privacy and owner checks are repeated
  -- here, not only in the HTTP route. State/archiving remains a separate workflow.
  select * into v_feedback from public.app_feedback where id=p_feedback_id for update;
  if not found or v_feedback.submitted_by_role<>'swimmer' or v_feedback.profile_id is null
    or (v_role='swimmer' and v_feedback.profile_id<>p_profile_id) then
    raise exception 'Feedback not found' using errcode='P0002';
  end if;
  if p_action='send' then
    if p_request_id is null or nullif(btrim(p_content),'') is null or char_length(p_content)>1000 then
      raise exception 'Invalid feedback message' using errcode='22023';
    end if;
    select * into v_message from public.app_feedback_messages
      where feedback_id=p_feedback_id and author_role=v_role and request_id=p_request_id;
    if found then
      if v_message.author_id is distinct from v_actor or v_message.content<>btrim(p_content) then
        raise exception 'Request ID reused' using errcode='22023';
      end if;
    else
      perform 1 from public.profiles where id=v_feedback.profile_id and active=true and approval_status='approved';
      if not found then raise exception 'Recipient inactive' using errcode='22023'; end if;
      if (select count(*) from public.app_feedback_messages where author_role=v_role and author_id=v_actor
        and created_at>clock_timestamp()-interval '1 minute')>=10 then
        raise exception 'Feedback rate limit' using errcode='P0001';
      end if;
      insert into public.app_feedback_messages(feedback_id,author_role,author_id,request_id,content)
        values(p_feedback_id,v_role,v_actor,p_request_id,btrim(p_content)) returning * into v_message;
      v_created := true;
    end if;
    return jsonb_build_object('id',v_message.id::text,'created',v_created);
  end if;
  if p_action='read' then
    if p_through_id is null or p_through_id<0 or (p_through_id<>0 and not exists(
      select 1 from public.app_feedback_messages where feedback_id=p_feedback_id and id=p_through_id)) then
      raise exception 'Invalid read cursor' using errcode='22023';
    end if;
    insert into public.app_feedback_reads(feedback_id,reader_role,reader_id,through_id)
      values(p_feedback_id,v_role,v_actor,p_through_id)
      on conflict(feedback_id,reader_role,reader_id) do update
        set through_id=greatest(app_feedback_reads.through_id,excluded.through_id);
    return jsonb_build_object('read',true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'role',author_role,'content',content,'createdAt',created_at) order by id),'[]'::jsonb)
    into v_messages from (select * from public.app_feedback_messages where feedback_id=p_feedback_id
      and (p_before_id is null or id<p_before_id) order by id desc limit 50) page;
  select coalesce(max(id),0) into v_last from public.app_feedback_messages where feedback_id=p_feedback_id;
  select exists(select 1 from public.app_feedback_messages where feedback_id=p_feedback_id
    and id<coalesce((v_messages->0->>'id')::bigint,0)) into v_older;
  return jsonb_build_object('id',v_feedback.id::text,'comment',v_feedback.comment,'status',v_feedback.workflow_status,
    'archived',v_feedback.archived_at is not null,'createdAt',v_feedback.created_at,'messages',v_messages,
    'readThrough',case when p_before_id is null then v_last::text else null end,
    'olderBefore',case when v_older then v_messages->0->>'id' else null end,
    'canReply',exists(select 1 from public.profiles where id=v_feedback.profile_id and active=true and approval_status='approved'));
end;
$$;
revoke all on function public.app_feedback_dialog(text,uuid,uuid,integer,bigint,uuid,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.app_feedback_dialog(text,uuid,uuid,integer,bigint,uuid,text,bigint,bigint) to service_role;
commit;
