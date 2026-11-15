-- Numeric telemetry / price snapshots only; no conversation or source data.
-- Existing ai_usage_logs RLS and service-role access remain unchanged.
begin;
alter table public.ai_usage_logs add column if not exists usage_details jsonb;
comment on column public.ai_usage_logs.usage_details is
  'Allowlisted AI usage/size counts and estimated USD price snapshot. No prompt, reply or raw swimmer data.';
commit;
