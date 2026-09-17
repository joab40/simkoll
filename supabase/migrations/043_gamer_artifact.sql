insert into artifact_catalog (artifact_key, name, emoji, description)
values ('gamer', 'Gamer', '🎮', 'Du gör plats för spelglädje och återkommer till Simkoll.')
on conflict (artifact_key) do nothing;
