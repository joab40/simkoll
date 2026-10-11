alter table public.app_feedback
  drop constraint if exists app_feedback_workflow_status_check;

alter table public.app_feedback
  add constraint app_feedback_workflow_status_check
  check (workflow_status in ('new', 'in_progress', 'completed', 'not_implementing'));
