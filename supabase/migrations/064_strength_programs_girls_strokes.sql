-- Styrkeprogram från "Styrketräningskompendium V2 - Tjejer per simsätt".
-- 12 valbara pass: tre per simsätt, med cykelanpassning och simspecifikt syfte.
-- Körs idempotent så att samma migration inte skapar dubbletter.

insert into public.training_programs (program_type, title, description, content, start_date)
select v.program_type, v.title, v.description, v.content, current_date
from (values
  ('strength', 'Tjejer · Frisim · Pass 1 – Maxstyrka & asymmetrisk dragkraft',
   '60 min · Tisdag. Fokus på benstyrka, ensidig dragkraft, bålrotation och en stark catch i frisim.',
   $$Upplägg: 10 min dynamisk uppvärmning (axlar, bröstrygg, höft och bål) · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Follikulär fas (dag 1–14): full belastning, 4–6 repetitioner i huvudövningarna och möjlighet till progressiv ökning. Lutealfas (dag 15–28): sänk belastningen cirka 10–15 %, arbeta oftare med 8–10 repetitioner och prioritera teknik, kontroll och extra vila.

1. Knäböj — follikulär: 4 x 4–6 · luteal: 3 x 8 · vila 90 s. Benstyrka för vändningar och starter.
2. Enarms kabeldrag i catch-vinkel — follikulär: 4 x 6/arm · luteal: 3 x 8/arm · vila 90 s. Simulerar den enskilda armens dragfas i crawl.
3. Rumänska marklyft — 3 x 8 · vila 60 s. Stärker baksidan och hjälper till att hålla kroppen högt i vattnet.
4. Landmine press — 3 x 8/arm · vila 60 s. Kopplar bålrotation till presskraft.
5. Sidoplanka med rotation — 3 x 8/sida · vila 45 s. Roterande bålstabilitet under rörelse.

Avsluta med lätt rörlighet och lugn andning.$$),
  ('strength', 'Tjejer · Frisim · Pass 2 – Unilateral balans & axelhälsa',
   '60 min · Torsdag. Ensidig benstyrka, skulderbladskontroll och skadeförebyggande axelarbete för frisim.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: I follikulär fas kan belastningen ökas gradvis. I lutealfas, sänk vid behov 10–15 %, håll 8–10 repetitioner och prioritera lugn kontroll.

1. Utfallssteg bakåt — 3 x 8/ben · vila 75 s. Jämnar ut benstyrkan för effektivare benspark.
2. Sittande hantelpress — 3 x 8 · vila 75 s. Vertikal axelstyrka för stabil armisättning.
3. Face pulls — 3 x 12–15 · vila 60 s. Bakre axel och rotatorkuff.
4. Smal kabelrodd — 3 x 10 · vila 60 s. Skulderbladsstabilitet.
5. Pallof press — 3 x 10/sida · vila 45 s. Anti-rotation för en rak vattenlinje.

Avsluta med lätt rörlighet och lugn andning.$$),
  ('strength', 'Tjejer · Frisim · Pass 3 – Bålrotation & uthållig effekt',
   '60 min · Söndag. Helkroppsstyrka med fokus på uthållig dragkraft, höft och streamline.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Follikulär fas tillåter tyngre arbete i 4–6 repetitioner. Lutealfas: cirka 10–15 % lägre belastning, 8–10 repetitioner och längre vila om det behövs.

1. Trap bar-marklyft — follikulär: 4 x 5 · luteal: 3 x 8 · vila 90 s. Skonsam helkroppsstyrka.
2. Chins med neutralt grepp — 3 x 6–8 · vila 90 s. Uthållig dragstyrka i ryggen.
3. Hip thrust — 3 x 8–10 · vila 60 s. Säte och höft för kontinuerlig kick.
4. Liggande hantelpullover — 3 x 10 · vila 60 s. Styrka i glidfasen med utsträckt arm.
5. Hängande benlyft — 3 x 10–12 · vila 45 s. Bålkontroll i streamline.

Avsluta med lätt rörlighet och lugn andning.$$),

  ('strength', 'Tjejer · Bröstsim · Pass 1 – Höftextension & presskraft',
   '60 min · Tisdag. Ljumskar, höft och presskraft i bröstsimskickens och armtagets riktning.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Follikulär fas: tyngre 4–6 repetitioner i huvudövningar. Lutealfas: sänk 10–15 %, använd 8–10 repetitioner och prioritera teknik.

1. Bred knäböj (sumo/frog style) — follikulär: 4 x 5 · luteal: 3 x 8 · vila 90 s. Ljumskar och lår i bentagets vinkel.
2. Sned bänkpress — follikulär: 4 x 6 · luteal: 3 x 8 · vila 90 s. Pressfas framåt och åt sidan.
3. Rumänska marklyft — 3 x 8 · vila 60 s. Bakre kedjan för utsparken.
4. Latsdrag med brett grepp — 3 x 8 · vila 60 s. Drivande kraft i inåtdraget.
5. Copenhagen-planka — 3 x 20–30 s/sida · vila 45 s. Förebygger ljumsk- och knäproblem.

Avsluta med lätt rörlighet och lugn andning.$$),
  ('strength', 'Tjejer · Bröstsim · Pass 2 – Ljumskskydd & prehab',
   '60 min · Torsdag. Adduktorer, sidledsstyrka, axelhälsa och anti-rotation.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Justera belastningen efter dagsform. Under lutealfas är cirka 10–15 % lägre belastning och fler kontrollerade repetitioner lämpligt.

1. Kabel-adduktion — 3 x 10/ben · vila 60 s. Isolerad styrka runt knä och ljumske.
2. Sittande hantelpress — 3 x 8 · vila 75 s. Axelstabilitet i övre läget.
3. Lateral lunge (utfall åt sidan) — 3 x 8/ben · vila 60 s. Rörlighet och styrka i sidled.
4. Face pulls — 3 x 12–15 · vila 60 s. Axelprehab och hållning.
5. Pallof press — 3 x 10/sida · vila 45 s. Anti-rotation för stabil bål.

Avsluta med lätt rörlighet och lugn andning.$$),
  ('strength', 'Tjejer · Bröstsim · Pass 3 – Bålkedja & explosiv glid',
   '60 min · Söndag. Höftextension, rygg, streamline och bål i sträckt läge.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Follikulär fas: 4–6 repetitioner med full belastning. Lutealfas: cirka 10–15 % lägre belastning och 8–10 repetitioner med teknik i fokus.

1. Hip thrust (tung) — follikulär: 4 x 6 · luteal: 3 x 8–10 · vila 90 s. Maximal höftextension i bentagets slut.
2. Kabelrodd — 3 x 10 · vila 60 s. Ryggstyrka och hållning.
3. Liggande hantelpullover — 3 x 10 · vila 60 s. Styrka i den sträckta glidfasen.
4. Rygglyft / glute ham raise — 3 x 10 · vila 60 s. Baksida lår och säte.
5. Hängande benlyft — 3 x 10 · vila 45 s. Bålstyrka i sträckt läge.

Avsluta med lätt rörlighet och lugn andning.$$),

  ('strength', 'Tjejer · Ryggsim · Pass 1 – Posterior kedja & ryggstyrka',
   '60 min · Tisdag. Baksida, rygg, höft och stabil armisättning över huvudet.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Follikulär fas: full belastning i 4–6 repetitioner där det anges. Lutealfas: sänk cirka 10–15 %, arbeta med 8–10 repetitioner och mer vila.

1. Marklyft (trap bar eller klassisk) — follikulär: 4 x 5 · luteal: 3 x 8 · vila 90 s. Hela baksidan för en plan vattenlinje.
2. Kabelrodd med brett grepp — follikulär: 4 x 6 · luteal: 3 x 8 · vila 90 s. Ryggbredd och skulderbladsretraktion.
3. Hip thrust — 3 x 8 · vila 60 s. Pressar upp höften i ryggsim.
4. Sittande hantelpress — 3 x 8 · vila 60 s. Styrka vid armisättning över huvudet.
5. Sidoplanka med benlyft — 3 x 8/sida · vila 45 s. Sido- och bålstabilitet i ryggläge.

Avsluta med lätt rörlighet och lugn andning.$$),
  ('strength', 'Tjejer · Ryggsim · Pass 2 – Axelhälsa & hållning',
   '60 min · Torsdag. Enkelsidig benstyrka, bakre axel, skulderblad och bål.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Arbeta tyngre och progressivt i follikulär fas. I lutealfas, sänk belastningen cirka 10–15 % och prioritera kontroll, andning och god ledlinje.

1. Utfallssteg bakåt — 3 x 8/ben · vila 75 s. Enkelsidig benstyrka.
2. Face pulls — 4 x 12–15 · vila 60 s. Öppnar bröstrygg och stärker bakre axlar.
3. Enarms hantelrodd — 3 x 8/arm · vila 60 s. Isolerad roddstyrka.
4. Y-T-W-höjningar med hantlar — 3 x 10 · vila 45 s. Skulderkontroll och hållning.
5. Pallof press — 3 x 10/sida · vila 45 s. Bålstabilitet.

Avsluta med lätt rörlighet och lugn andning.$$),
  ('strength', 'Tjejer · Ryggsim · Pass 3 – Armåterföring & bålkontroll',
   '60 min · Söndag. Baksida lår, vertikal dragstyrka, streamline och skulderrörlighet.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Anpassa vikten efter dagsform. Follikulär fas kan använda tyngre huvudset; lutealfas cirka 10–15 % lättare och fler kontrollerade repetitioner.

1. Rumänska marklyft — 3 x 8 · vila 75 s. Baksida lår för kontinuerlig benspark.
2. Chins eller latsdrag — 3 x 8 · vila 75 s. Vertikal dragstyrka.
3. Liggande hantelpullover — 3 x 10 · vila 60 s. Rörlighet och styrka bakom huvudet.
4. Landmine press — 3 x 8/arm · vila 60 s. Skulderbladsrörlighet och bål.
5. Hängande benlyft — 3 x 10 · vila 45 s. Främre bålstyrka.

Avsluta med lätt rörlighet och lugn andning.$$),

  ('strength', 'Tjejer · Fjärilsim · Pass 1 – Symmetrisk maxkraft & delfinkick',
   '60 min · Tisdag. Dubbelsidig dragkraft, höft, kick och främre bålkedja.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Follikulär fas: 4–6 repetitioner och full belastning i huvudövningar. Lutealfas: sänk cirka 10–15 %, öka till 8–10 repetitioner och prioritera teknik.

1. Viktade pull-ups eller tunga chins — follikulär: 4 x 4–6 · luteal: 3 x 8 · vila 90 s. Dubbelsidig dragkraft i fjärilsdraget.
2. Heavy hip thrust — follikulär: 4 x 6 · luteal: 3 x 8 · vila 90 s. Maximal kraft i delfinkickens snärt.
3. Knäböj — 3 x 6 · vila 75 s. Benstyrka för kick och starter.
4. Liggande hantelpullover — 3 x 8–10 · vila 60 s. Armdrag i helt utsträckt läge.
5. Ab wheel rollouts (maghjul) — 3 x 8–10 · vila 45 s. Kontroll i främre bålkedjan.

Avsluta med lätt rörlighet och lugn andning.$$),
  ('strength', 'Tjejer · Fjärilsim · Pass 2 – Axelhälsa & ländryggsprehab',
   '60 min · Torsdag. Skonsam ryggstyrka, axelprehab och bål utan onödig ländryggsbelastning.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Belastningen styrs av teknik och dagsform. I lutealfas kan vikten sänkas cirka 10–15 % och vilan förlängas.

1. Trap bar-marklyft — 3 x 6 · vila 75 s. Skonsam styrka för hela baksidan.
2. Sittande hantelpress — 3 x 8 · vila 75 s. Pressstyrka för axlar.
3. Face pulls — 3 x 12–15 · vila 60 s. Prehab för rotatorkuffen.
4. Rygglyft (hyperextensions) — 3 x 10–12 · vila 60 s. Tålighet i ländryggen.
5. Pallof press — 3 x 10/sida · vila 45 s. Bålstabilitet.

Avsluta med lätt rörlighet och lugn andning.$$),
  ('strength', 'Tjejer · Fjärilsim · Pass 3 – Explosiv effekt & bålkedja',
   '60 min · Söndag. Explosiv press, draguthållighet, höft och en stark sammanhängande bålkedja.',
   $$Upplägg: 10 min dynamisk uppvärmning · 45 min huvudpass · 5 min nedvarvning.

Cykelanpassning: Follikulär fas kan ge utrymme för progressiv belastning. Lutealfas: sänk cirka 10–15 % om det behövs och behåll kontrollerad teknik.

1. Landmine press — 3 x 8 · vila 75 s. Explosiv bål- och presskraft.
2. Latsdrag med brett grepp — 3 x 8 · vila 75 s. Uthållig dragstyrka i lats.
3. Rumänska marklyft — 3 x 8 · vila 60 s. Baksida lår.
4. Sidoplanka — 3 x 30 s/sida · vila 45 s. Sidobål.
5. Hängande benlyft (toes to bar) — 3 x 10 · vila 45 s. Främre bålkedja.

Avsluta med lätt rörlighet och lugn andning.$$)
) as v(program_type, title, description, content)
where not exists (
  select 1 from public.training_programs p where p.title = v.title
);
