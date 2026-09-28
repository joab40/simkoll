-- Versionerat godkännande av tränarvillkor och regler för informationshantering.
alter table public.coach_accounts
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create index if not exists coach_accounts_terms_idx
  on public.coach_accounts (terms_version, terms_accepted_at);
