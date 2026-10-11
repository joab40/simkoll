alter table public.responses
  add column if not exists planned_completion text
  check (planned_completion in ('full', 'partial', 'no'));

comment on column public.responses.planned_completion is
  'Simmarens svar på om dagens planerade simpass genomfördes: full, partial eller no.';
