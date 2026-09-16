create table if not exists training_groups (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into training_groups (id, name) values
  ('ungdom_orange', 'Ungdom Orange'), ('ungdom_svart', 'Ungdom Svart'), ('junior', 'Junior')
on conflict (id) do nothing;
