-- Kör före driftsättning. Återställning, spärrar och sessionsversion är atomiska.
begin;
alter table public.coach_accounts add column if not exists session_version integer not null default 0;
create table if not exists public.coach_password_resets (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  coach_id uuid not null references public.coach_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists coach_password_reset_owner on public.coach_password_resets(coach_id);
create table if not exists public.coach_mail_limits (
  key_hash text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists coach_mail_limits_lookup on public.coach_mail_limits(key_hash, attempted_at);
alter table public.coach_password_resets enable row level security;
alter table public.coach_mail_limits enable row level security;
revoke all on public.coach_password_resets, public.coach_mail_limits from public, anon, authenticated;
grant all on public.coach_password_resets, public.coach_mail_limits to service_role;

create or replace function public.coach_mail_gate(p_keys text[], p_limits integer[], p_seconds integer[])
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; i integer;
begin
  if cardinality(p_keys) < 1 or cardinality(p_keys) > 4 or cardinality(p_keys) <> cardinality(p_limits) or cardinality(p_keys) <> cardinality(p_seconds) then raise exception 'Invalid gate'; end if;
  for k in select distinct unnest(p_keys) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(k, 0));
  end loop;
  for i in 1..cardinality(p_keys) loop
    if p_limits[i] < 1 or p_seconds[i] < 1 or p_seconds[i] > 86400 then raise exception 'Invalid limit'; end if;
    if (select count(*) from public.coach_mail_limits where key_hash = p_keys[i] and attempted_at > now() - make_interval(secs => p_seconds[i])) >= p_limits[i] then return false; end if;
  end loop;
  delete from public.coach_mail_limits where attempted_at < now() - interval '1 day';
  insert into public.coach_mail_limits(key_hash) select distinct unnest(p_keys);
  return true;
end $$;

create or replace function public.coach_begin_reset(p_email text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare account public.coach_accounts%rowtype;
begin
  select * into account from public.coach_accounts where lower(email) = p_email and status = 'active' for update;
  if not found then return null; end if;
  delete from public.coach_password_resets where coach_id = account.id;
  insert into public.coach_password_resets(token_hash, coach_id, expires_at) values(p_token_hash, account.id, now() + interval '30 minutes');
  return jsonb_build_object('id', account.id, 'email', account.email);
end $$;

create or replace function public.coach_finish_reset(p_token_hash text, p_password_hash text, p_password_salt text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare owner_id uuid;
begin
  if p_password_hash !~ '^[a-f0-9]{128}$' or p_password_salt !~ '^[a-f0-9]{32}$' then raise exception 'Invalid credentials'; end if;
  select coach_id into owner_id from public.coach_password_resets where token_hash = p_token_hash;
  if not found then return null; end if;
  -- Samma låsordning som vid utfärdande. Två samtidiga försök kan inte lyckas.
  perform 1 from public.coach_accounts where id = owner_id and status = 'active' for update;
  if not found then return null; end if;
  perform 1 from public.coach_password_resets where token_hash = p_token_hash and expires_at > now() for update;
  if not found then return null; end if;
  update public.coach_accounts set password_hash = p_password_hash, password_salt = p_password_salt, session_version = session_version + 1 where id = owner_id;
  delete from public.coach_password_resets where coach_id = owner_id;
  return owner_id;
end $$;
revoke all on function public.coach_mail_gate(text[], integer[], integer[]), public.coach_begin_reset(text, text), public.coach_finish_reset(text, text, text) from public, anon, authenticated;
grant execute on function public.coach_mail_gate(text[], integer[], integer[]), public.coach_begin_reset(text, text), public.coach_finish_reset(text, text, text) to service_role;
commit;
