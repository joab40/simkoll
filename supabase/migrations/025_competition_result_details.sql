alter table public.competition_results
  add column if not exists competition_name text;

alter table public.competition_results
  drop constraint if exists competition_results_profile_id_event_pool_result_date_swim_time_key;

alter table public.competition_results
  add constraint competition_results_unique_result
    unique (profile_id, event, pool, result_date, swim_time, competition_name);
