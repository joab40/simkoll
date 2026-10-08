alter table public.competition_results
  alter column result_date drop not null;

alter table public.competition_results
  add column if not exists date_precision text not null default 'exact'
    check (date_precision in ('exact', 'year', 'unknown')),
  add column if not exists result_year integer,
  add column if not exists entered_by uuid;

alter table public.competition_results
  add constraint competition_results_manual_date_check
  check (
    (date_precision = 'exact' and result_date is not null and result_year is null)
    or (date_precision = 'year' and result_date is null and result_year between 1900 and 2100)
    or (date_precision = 'unknown' and result_date is null and result_year is null)
  );
