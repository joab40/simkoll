alter table public.development_goals
  add column if not exists video_path text,
  add column if not exists video_poster_path text,
  add column if not exists video_duration_ms integer check (video_duration_ms between 1 and 30000),
  add column if not exists video_bytes integer check (video_bytes between 1 and 25000000),
  add column if not exists video_codec text check (video_codec in ('avc1','avc3','hvc1','hev1'));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'development_goals_one_attachment' and conrelid = 'public.development_goals'::regclass) then
    alter table public.development_goals add constraint development_goals_one_attachment
      check (image_path is null or video_path is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'development_goals_video_owner' and conrelid = 'public.development_goals'::regclass) then
    alter table public.development_goals add constraint development_goals_video_owner
      check (video_path is null or (video_path like profile_id::text || '/' || id::text || '/%'
        and video_duration_ms is not null and video_bytes is not null and video_codec is not null
        and (video_poster_path is null or video_poster_path like profile_id::text || '/' || id::text || '/%')));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goal-analysis-videos', 'goal-analysis-videos', false, 25000000,
  array['video/mp4', 'video/quicktime', 'image/jpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No public/client policies. The server authorizes goal ownership, creates an
-- upload URL for one incoming object, verifies its actual contents, then stores
-- a new immutable copy. Only that verified copy is linked to a goal.
