alter table competition_events add column if not exists item_type text not null default 'race' check (item_type in ('race', 'pause', 'award', 'info'));
alter table competition_events add column if not exists entry_allowed boolean not null default true;
