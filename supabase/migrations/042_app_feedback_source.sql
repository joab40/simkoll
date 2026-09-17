alter table app_feedback add column if not exists submitted_by_role text not null default 'swimmer';
