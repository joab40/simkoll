-- Basprogram utifrån Styrkeprogram.xlsx. Tränaren väljer belastning och
-- anpassar övningar efter simmarens erfarenhet och tillgänglig utrustning.
insert into public.training_programs (program_type, title, description, content, start_date)
select
  'strength',
  'Basstyrka · 3 pass',
  'Tre grundpass byggda från klubbens styrkeprogram: press, drag samt ben och bål. Välj en vikt som låter dig hålla god teknik genom alla repetitioner.',
  E'Upplägg\nGör passen i ordning när de passar in i träningsveckan. Börja lugnt och låt tränaren hjälpa till med teknik och belastning. Avbryt vid smärta.\n\nPass 1 · Bröst, axlar och triceps\nUppvärmning: 5–8 min lätt aktivitet och några lugna rörelser för axlarna.\n1. Bröstpress i maskin: 3 x 8–10\n2. Pec-deck: 2 x 10–12\n3. Axelpress i maskin: 2 x 8–10\n4. Tricepspress i kabel: 2 x 10–12\nVila cirka 90–120 sekunder mellan set.\n\nPass 2 · Rygg och biceps\nUppvärmning: 5–8 min lätt aktivitet.\n1. Latsdrag: 3 x 8–10\n2. Sittande rodd: 3 x 8–10\n3. Chins med assistans vid behov: 2 x 5–8\n4. Bicepscurl med hantlar: 2 x 10–12\nVila cirka 90–120 sekunder mellan set.\n\nPass 3 · Ben och bål\nUppvärmning: 5–8 min lätt aktivitet och lugna benrörelser.\n1. Benpress: 3 x 8–10\n2. Benspark (framsida lår): 2 x 10–12\n3. Lårcurl (baksida lår): 2 x 10–12\n4. Vadpress: 2 x 12–15\n5. Magmaskin: 2 x 10–12\nVila cirka 90–120 sekunder mellan set.\n\nBelastning och progression\nBörja med en lätt belastning som känns kontrollerad. Avsluta varje set med några repetitioner kvar i tanken. När alla set känns stabila och tekniken är god kan tränaren höja vikten lite. Skriv ned vikterna i träningsloggen. Inga startvikter anges i programmet.',
  current_date
where not exists (
  select 1 from public.training_programs where title = 'Basstyrka · 3 pass'
);
