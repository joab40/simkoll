create table if not exists training_cycles (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references training_cycles(id) on delete cascade,
  cycle_type text not null check (cycle_type in ('term', 'block')),
  name text not null,
  start_date date not null,
  end_date date not null,
  target_groups text[] not null default '{}',
  focus text,
  goal text,
  phase text not null default 'build' check (phase in ('adaptation', 'build', 'specific', 'taper', 'recovery')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_cycles_date_range check (end_date >= start_date),
  constraint training_cycles_parent_type check ((cycle_type = 'term' and parent_id is null) or (cycle_type = 'block' and parent_id is not null))
);
create index if not exists training_cycles_dates_idx on training_cycles(start_date, end_date);
create index if not exists training_cycles_parent_idx on training_cycles(parent_id);
