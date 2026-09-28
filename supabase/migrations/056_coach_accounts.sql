-- Personliga tränarkonton. Gruppkoden kan finnas kvar som övergång,
-- men nya superadmins skapas endast via en server-side bootstrap-token.
create table if not exists public.coach_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  password_salt text not null,
  role text not null default 'coach' check (role in ('coach', 'superadmin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  totp_secret text,
  totp_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  last_login_at timestamptz
);

create index if not exists coach_accounts_status_idx on public.coach_accounts (status, created_at desc);
