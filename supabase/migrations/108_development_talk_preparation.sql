-- Private preparation for coaches; never included in swimmer API responses.
alter table public.development_talks
  add column if not exists coach_preparation jsonb;

comment on column public.development_talks.coach_preparation is
  'Coach-only AI preparation: summary, questions, period, sources, generatedAt, sourceVersion and contextHash. Not a shared agreement.';
