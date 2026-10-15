-- Analysis attachments are private and served only after goal authorization.
alter table public.development_goals add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goal-analysis-images', 'goal-analysis-images', false, 3000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No client storage policies: all reads/writes use the authorized server API.
