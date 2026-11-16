begin;
-- Existing ready images from SQL 124 are reused as-is. No image generation,
-- points changes or activation takes place when this migration is run.
create table if not exists public.reward_level_cards (
  id uuid primary key,
  level_id bigint not null references public.reward_levels(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  source_emoji text not null,
  background_art_id uuid references public.reward_level_art(id) on delete set null,
  emblem_art_id uuid references public.reward_level_art(id) on delete set null,
  coach_id uuid references public.coach_accounts(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.reward_level_cards enable row level security;
revoke all on public.reward_level_cards from public, anon, authenticated;
grant select on public.reward_level_cards to service_role;
create index if not exists reward_level_cards_level_date_idx on public.reward_level_cards(level_id, created_at desc, id desc);
create index if not exists reward_level_art_level_date_idx on public.reward_level_art(level_id, created_at desc, id desc) where status = 'ready';

create or replace function public.configure_reward_level_card(
  p_actor_id uuid, p_session_version integer, p_level_id bigint, p_action text,
  p_source_emoji text, p_background_id uuid, p_emblem_id uuid,
  p_name text, p_card_id uuid, p_expected_background_id uuid, p_expected_emblem_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_level public.reward_levels%rowtype;
  v_card public.reward_level_cards%rowtype;
  v_asset public.reward_level_art%rowtype;
  v_kind text;
  v_asset_id uuid;
begin
  perform 1 from public.coach_accounts where id = p_actor_id and status = 'active'
    and role in ('head_coach', 'superadmin') and session_version = p_session_version for share;
  if not found then raise exception 'Privileged session required' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('save', 'activate') then
    raise exception 'Invalid action' using errcode = '22023';
  end if;
  select * into v_level from public.reward_levels where id = p_level_id for update;
  if not found or p_source_emoji is distinct from v_level.emoji then
    raise exception 'Level changed; reload library' using errcode = '22023';
  end if;
  if p_action = 'activate' and (p_expected_background_id is distinct from v_level.background_art_id
      or p_expected_emblem_id is distinct from v_level.emblem_art_id) then
    raise exception 'Active combination changed; reload library' using errcode = '40001';
  end if;
  foreach v_kind in array array['background', 'emblem'] loop
    v_asset_id := case when v_kind = 'background' then p_background_id else p_emblem_id end;
    if v_asset_id is not null then
      select * into v_asset from public.reward_level_art where id = v_asset_id for share;
      if not found or v_asset.level_id <> p_level_id or v_asset.kind <> v_kind
        or v_asset.status <> 'ready' or v_asset.source_emoji is distinct from v_level.emoji
        or v_asset.storage_path is null or v_asset.storage_path !~ ('^' || p_level_id::text || '/[0-9a-fA-F-]{36}\.(webp|png|jpg)$') then
        raise exception 'Image is not compatible with this level' using errcode = '22023';
      end if;
    end if;
  end loop;
  if p_action = 'save' then
    if p_card_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
      raise exception 'Card name and request ID required' using errcode = '22023';
    end if;
    select * into v_card from public.reward_level_cards where id = p_card_id;
    if found then
      if v_card.level_id <> p_level_id or v_card.name <> btrim(p_name)
        or v_card.source_emoji is distinct from p_source_emoji or v_card.coach_id is distinct from p_actor_id
        or v_card.background_art_id is distinct from p_background_id or v_card.emblem_art_id is distinct from p_emblem_id then
        raise exception 'Request ID already used' using errcode = '22023';
      end if;
      return jsonb_build_object('saved', true, 'cardId', p_card_id, 'created', false);
    end if;
    insert into public.reward_level_cards(id, level_id, name, source_emoji, background_art_id, emblem_art_id, coach_id)
      values(p_card_id, p_level_id, btrim(p_name), v_level.emoji, p_background_id, p_emblem_id, p_actor_id);
    insert into public.audit_logs(event_type, role, status, details)
      values('reward_level_card_saved', 'coach', 'success', jsonb_build_object('levelId', p_level_id, 'cardId', p_card_id, 'coachAccountId', p_actor_id));
    return jsonb_build_object('saved', true, 'cardId', p_card_id, 'created', true);
  end if;
  if p_background_id is not distinct from v_level.background_art_id and p_emblem_id is not distinct from v_level.emblem_art_id then
    return jsonb_build_object('activated', true, 'changed', false);
  end if;
  -- One UPDATE: swimmers never see a half-published background/emblem pair.
  update public.reward_levels set background_art_id = p_background_id, emblem_art_id = p_emblem_id where id = p_level_id;
  insert into public.audit_logs(event_type, role, status, details)
    values('reward_level_card_activated', 'coach', 'success', jsonb_build_object('levelId', p_level_id,
      'backgroundId', p_background_id, 'emblemId', p_emblem_id, 'coachAccountId', p_actor_id));
  return jsonb_build_object('activated', true, 'changed', true);
end;
$$;
revoke all on function public.configure_reward_level_card(uuid, integer, bigint, text, text, uuid, uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.configure_reward_level_card(uuid, integer, bigint, text, text, uuid, uuid, text, uuid, uuid, uuid) to service_role;
commit;
