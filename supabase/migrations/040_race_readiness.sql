alter table responses add column if not exists race_concern text;

comment on column responses.race_concern is 'Tävlingsdags-signal: sjuk/ont eller inget särskilt.';
