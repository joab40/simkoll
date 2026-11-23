begin;

create table if not exists public.competition_logo_library (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  path text not null unique,
  surface text not null default 'light' check (surface in ('light', 'dark')),
  created_at timestamptz not null default now()
);

alter table public.competition_logo_library enable row level security;
revoke all on public.competition_logo_library from anon, authenticated, public;
grant select, insert on public.competition_logo_library to service_role;

with saved_logos as (
  select (c.logo_document->>'version')::uuid as id,
    coalesce(nullif(left(btrim(c.title), 120), ''), 'Tävlingslogga') as name,
    obj.name as path,
    case when c.logo_document->>'surface' = 'dark' then 'dark' else 'light' end as surface,
    obj.created_at
  from public.competition_calendar c
  join storage.objects obj
    on obj.bucket_id = 'competition-logos'
    and obj.name = c.id::text || '/' || (c.logo_document->>'version') || '.png'
    and obj.name = c.logo_document->>'path'
  where c.logo_document->>'version' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    and not (c.logo_document ? 'libraryId')
)
insert into public.competition_logo_library (id, name, path, surface, created_at)
select id, name, path, surface, coalesce(created_at, now()) from saved_logos
on conflict do nothing;

update public.competition_calendar c
set logo_document = c.logo_document || jsonb_build_object('libraryId', l.id)
from public.competition_logo_library l
where c.logo_document->>'path' = l.path
  and c.logo_document->>'version' = l.id::text
  and not (c.logo_document ? 'libraryId');

commit;
