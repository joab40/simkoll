alter table public.app_feedback
  add column if not exists workflow_status text not null default 'new'
    check (workflow_status in ('new', 'in_progress', 'completed')),
  add column if not exists admin_note text,
  add column if not exists admin_reply text,
  add column if not exists admin_reply_sent_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists app_feedback_workflow_idx
  on public.app_feedback (archived_at, workflow_status, created_at desc);
