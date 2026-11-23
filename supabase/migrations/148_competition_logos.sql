begin;

alter table public.competition_calendar add column if not exists logo_document jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('competition-logos', 'competition-logos', false, 458752, array['image/png'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

commit;
