create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9._-]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  emoji text not null default '🏊' check (char_length(emoji) between 1 and 16),
  pin_hash text not null,
  pin_salt text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profile_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.profile_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.responses
  add column profile_id uuid references public.profiles(id) on delete set null;

create index responses_profile_id_idx on public.responses (profile_id, created_at desc);
create index profile_sessions_token_idx on public.profile_sessions (token_hash);
create index profile_reset_tokens_token_idx on public.profile_reset_tokens (token_hash);

alter table public.profiles enable row level security;
alter table public.profile_sessions enable row level security;
alter table public.profile_reset_tokens enable row level security;

