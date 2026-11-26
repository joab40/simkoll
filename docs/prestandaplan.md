# Prestandaplan för Simkoll

## Första paketet

- [x] **Flight Record för hela gruppen.** Samordna likadana databasläsningar per källa för de simmare som ingår i samma anrop. Beräkna sedan linjen med respektive simmares inställningar och underlag. Vid läsfel eller för stort underlag kan varje simmare hämtas separat.
- [x] **Färre omladdningar i simmarvyn.** Återanvänd tävlingskalendern i två minuter och spelkatalogen i fem minuter inom den aktiva sessionen. Låt varje kort laddas oberoende och uppdatera träningsöversikten och poängen efter relevanta ändringar.
- [ ] **Mät i produktion.** Jämför Flight Record för hela gruppen vid 28 och 90 dagar, gruppens utveckling vid 90 dagar och simmarens första sidöppning på iPhone. Följ tiden till användbar vy, API-tider (p50 och p95), antalet anrop och överförd datamängd. Testa även veckobyten och återgång till appen.

## Fortsättning i prioritetsordning

1. **Snabbare 90-dagarsvyer.** Träningsdagboken visar grafen, periodjämförelsen och den sökbara historiken från en lättare första hämtning. Passinstruktioner och detaljerade loggar hämtas för den dag vars registrering öppnas. Gruppens utveckling hämtar sidorna med incheckningar parallellt för vald period och jämförelseperiod.
2. **Mindre startpaket.** Meddelanden för tränare, aktivitetskorrigering, Drive-inställningar, testmejl, masstilldelning, passförhandsvisning och tävlingsöverblick laddas vid behov. Lokalt bygge efter den här ändringen ger cirka 346 kB komprimerad JavaScript i startfilen och 80 kB CSS, jämfört med 354 respektive 84 kB tidigare. Fortsätt dela upp tränar- och simmarvyn utifrån mätningar.
3. **Träffsäkra index.** Rangordna frågor efter total tid och anropsfrekvens. Undersök `responses (profile_id, activity_date, created_at)` och `planned_training_sessions (profile_id, planned_date)`. Kontrollera befintliga index och jämför frågeplanerna med representativa läsningar före och efter en ändring. [Supabase Query Performance](https://supabase.com/docs/guides/database/extensions/pg_stat_statements) · [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
4. **Stabilare mobillayout.** Reservera plats för kort och bilder under laddningen. Behåll redan visat innehåll när samma vy uppdateras. Följ LCP, CLS och INP för mobiltrafiken. [Vercel Speed Insights](https://vercel.com/docs/speed-insights/metrics)

Om långa gruppperioder fortfarande tar tid efter mätning och batchläsning, undersök förberäknade dagsvärden som kan räknas om när en registrering korrigeras.
