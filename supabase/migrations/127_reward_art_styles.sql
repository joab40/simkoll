begin;
-- Expand only the fixed style allow-list. Existing art, active combinations,
-- generation quotas, role checks, storage and points are unchanged.
alter table public.reward_level_art drop constraint reward_level_art_style_check;
alter table public.reward_level_art add constraint reward_level_art_style_check
  check (style in ('aurora', 'pool', 'cosmic', 'abyss', 'glacier', 'sunset', 'neon', 'champion', 'origami'));
commit;
