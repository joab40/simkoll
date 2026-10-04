-- Redigerbara startprogram för styrketräning. Tränaren kan ändra innehållet
-- i programbiblioteket eller använda dem som mall när ett nytt program skapas.
insert into public.training_programs (program_type, title, description, content, start_date)
select 'strength', 'Basstyrka · 30 min', 'Ett enkelt helkroppspass med fokus på teknik och kontroll.', E'1. Uppvärmning: 5 min lätt cykel eller jogg\n2. Knäböj: 3 x 8\n3. Armhävningar: 3 x 8–12\n4. Höftlyft: 3 x 12\n5. Planka: 3 x 30 sek\n6. Nedvarvning och rörlighet: 5 min', current_date
where not exists (select 1 from public.training_programs where title = 'Basstyrka · 30 min');

insert into public.training_programs (program_type, title, description, content, start_date)
select 'strength', 'Bål och stabilitet · 20 min', 'Kort program för bål, balans och kontroll runt axlar och höfter.', E'1. Dead bug: 3 x 8 per sida\n2. Sidoplanka: 3 x 20 sek per sida\n3. Bird dog: 3 x 8 per sida\n4. Höftlyft på ett ben: 3 x 8 per sida\n5. Pallof press: 3 x 10 per sida', current_date
where not exists (select 1 from public.training_programs where title = 'Bål och stabilitet · 20 min');

insert into public.training_programs (program_type, title, description, content, start_date)
select 'strength', 'Explosivitet · 25 min', 'Kontrollerad explosiv styrka med lång vila och bra teknik.', E'1. Uppvärmning: 5 min\n2. Kettlebell-sving: 4 x 6\n3. Utfallshopp: 3 x 5 per sida\n4. Medicinbollskast: 4 x 5\n5. Excentriska chins eller rodd: 3 x 6\n6. Rörlighet: 5 min', current_date
where not exists (select 1 from public.training_programs where title = 'Explosivitet · 25 min');
