-- Samlade veckoprogram för tjejer per simsätt.
-- De enskilda passen från migration 064 ligger kvar, men dessa program gör det
-- möjligt att tilldela en hel vecka med Pass 1, Pass 2 och Pass 3 samtidigt.

insert into public.training_programs (program_type, title, description, content, start_date)
select
  'strength',
  v.title,
  v.description,
  concat(
    'Veckoupplägg: tre styrkepass under samma period. Förslag: Pass 1 på tisdag, Pass 2 på torsdag och Pass 3 på söndag. Anpassa dagar efter simplaneringen och återhämtningen.',
    E'\n\n', p1.content,
    E'\n\n==============================\n\n', p2.content,
    E'\n\n==============================\n\n', p3.content
  ),
  current_date
from (values
  ('Tjejer · Frisim · Veckoprogram (Pass 1–3)', 'Tre frisimsspecifika styrkepass för en vecka: maxstyrka/catch, axelhälsa och uthållig bål/effekt.', 'Tjejer · Frisim'),
  ('Tjejer · Bröstsim · Veckoprogram (Pass 1–3)', 'Tre bröstsimsspecifika styrkepass för en vecka: höft/press, ljumskskydd och explosiv glid/bål.', 'Tjejer · Bröstsim'),
  ('Tjejer · Ryggsim · Veckoprogram (Pass 1–3)', 'Tre ryggsimsspecifika styrkepass för en vecka: posterior kedja, axelhälsa och armåterföring.', 'Tjejer · Ryggsim'),
  ('Tjejer · Fjärilsim · Veckoprogram (Pass 1–3)', 'Tre fjärilsspecifika styrkepass för en vecka: symmetrisk maxkraft, axel/ryggprehab och explosiv bålkedja.', 'Tjejer · Fjärilsim')
) as v(title, description, prefix)
join public.training_programs p1 on p1.title = v.prefix || ' · Pass 1 – ' || case
  when v.prefix = 'Tjejer · Frisim' then 'Maxstyrka & asymmetrisk dragkraft'
  when v.prefix = 'Tjejer · Bröstsim' then 'Höftextension & presskraft'
  when v.prefix = 'Tjejer · Ryggsim' then 'Posterior kedja & ryggstyrka'
  else 'Symmetrisk maxkraft & delfinkick'
end
join public.training_programs p2 on p2.title = v.prefix || ' · Pass 2 – ' || case
  when v.prefix = 'Tjejer · Frisim' then 'Unilateral balans & axelhälsa'
  when v.prefix = 'Tjejer · Bröstsim' then 'Ljumskskydd & prehab'
  when v.prefix = 'Tjejer · Ryggsim' then 'Axelhälsa & hållning'
  else 'Axelhälsa & ländryggsprehab'
end
join public.training_programs p3 on p3.title = v.prefix || ' · Pass 3 – ' || case
  when v.prefix = 'Tjejer · Frisim' then 'Bålrotation & uthållig effekt'
  when v.prefix = 'Tjejer · Bröstsim' then 'Bålkedja & explosiv glid'
  when v.prefix = 'Tjejer · Ryggsim' then 'Armåterföring & bålkontroll'
  else 'Explosiv effekt & bålkedja'
end
where not exists (
  select 1 from public.training_programs existing where existing.title = v.title
);
