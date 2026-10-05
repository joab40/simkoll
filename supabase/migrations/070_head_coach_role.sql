-- Add the middle trainer permission level. Existing coach and superadmin rows
-- remain unchanged; the API controls which roles can assign it.
alter table public.coach_accounts
  drop constraint if exists coach_accounts_role_check;

alter table public.coach_accounts
  add constraint coach_accounts_role_check
  check (role in ('coach', 'head_coach', 'superadmin'));
