# Formkollen · första versionen

Formkollen ersätter hjärta/ring på simmarkortet. Öppna **Simmare → Visa mer → kortet under Simmarens riktning → Visa utveckling & underlag**. Det nuvarande hälsotrafikljuset och dess varningar ändras inte. Tidigare hjärtexempel finns märkta Arkiv i hjälpen. Nya fiktiva exempel finns också i hjälpen; lokal utvecklingsdemo: `/form-kollen-qa.html`.

## Verkliga källor

`responses`: aktivitetsdatum, kropp, dagskänsla, simfartkänsla, RPE, egen tid, aktivitet, passdel och valt upplägg. `profile_daily_sleep`: sovtid, kvalitet, överhoppat. `profile_daily_illness`: nej/känningar/sjuk, överhoppat. Vid behov används samma säkra planeringskoppling som tidigare för uppskattad tid från `daily_workouts`/`training_plans`. Råa kommentarer eller andra simmares rapporter returneras inte.

`GET /api/training?formKollen=true&profileId=…` läser 42 kalenderdagar för en profil, vid öppning. Ingen polling, ingen AI och inga nya beroenden. Aktivt personligt tränarkonto krävs för tränare (befintlig klubbomfattande läsbehörighet); en inloggad simmare kan via API bara läsa sin egen profil. Första gränssnittet finns i tränarens simmarkort, inte en ny separat simmarsida. Testprofiler/avstängda/ej godkända profiler undantas. `private, no-store`; ofullständig/pagineringsbegränsad läsning blir fel, aldrig fejkade nollor. Saknad sjukdomstabell blir uttryckligt otillgänglig källa, vilket hindrar positiva faser. Tränarkontext läses bara efter tränarbehörighet och lämnas aldrig ut till simmaren, inte heller via en härledd PB-tolkning.

## Analysregler – produktheuristiker, inte fysiologiska gränser

Ren logik i `shared/form-kollen.js` använder befintlig `buildTrainingHeart` för validerad RPE × tid, deduplicering, säkra tidsuppskattningar och sömn-/sjukdomsvarningar. Senaste efterrapport per dag/aktivitet/passdel används; separata verkliga pass med samma nyckel kan ännu inte särskiljas. Tävling och Inte genomfört tas inte med i belastning eller simfart.

- Aktuellt: tre kalenderdagar. Varje dags medel väger lika; minst två svarsdagar vardera för kropp, dagskänsla, simfart.
- Baslinje: fem separata sjudagarsperioder före aktuell vecka granskas. Två eller tre jämförbara veckor ger en märkt preliminär belastningsbaslinje; minst fyra ger den längre baslinjen. Varje jämförbar vecka har minst tre kompletta rapporter på två dagar och minst 80 % RPE/tid-täckning. Baslinjen är deras medelbelastning. Fyra veckor är en produktregel, inte ett vetenskapligt analysförbud vid kortare historik. Förhållande under 0,8 = lägre, över 1,2 = högre, annars nära baslinjen. Ingen formpoäng eller godtycklig procentuell återhämtning visas.
- Kort trend: tre dagar mot de fyra före, minst två svarsdagar i varje del. Veckotrend: sju mot föregående sju, minst tre dagar vardera. 0,5/5 är förändringsgräns. I gränssnittet visas **separata riktningar för kropp, dagskänsla och fart**. Bara en jämförelse ger preliminär riktning. Motsatta kort-/veckotrender ger blandat; ingen jämförelse ger aktuell observation, ingen upp-/nedpil. En ensam fartdag kan vara positiv men är ingen säker trend. Intern samlad riktning används fortfarande försiktigt för starkare stigande mönster, men visas inte som nedgång i simprestation.
- Uppföljning prioriteras alltid: befintliga sömn-/sjukdomsvarningar, befintligt ihållande tungt mönster eller minst två känslomått som faller minst 0,5 i båda jämförelserna. Det är samtalsstöd, inte diagnos.
- Utan längre baslinje kan en preliminär sammanfattning ändå visas med minst två aktuella svarsdagar vardera för kropp och dagskänsla. Saknas dessa: Begränsat aktuellt underlag. En känd uppföljningssignal visas alltid. Bristande sjukdomskälla hindrar positiv tolkning. Saknad/äldre sjukdomskoll antas aldrig vara Nej.
- Tungt: aktuell kropp eller dagskänsla högst 2,5 på två dagar. Samtidig hög aktuell fart (även en ensam giltig fartdag) eller färska PB-uppgifter från tränaren ger **blandade signaler** med båda observationerna tydligt utskrivna, inte en samlad prestationsnedgång. Hög belastning ensam ger aldrig tung fas/nedtränad.
- Starka positiva signaler (guld): alla tre aktuella känslor minst 4,5/5 på två dagar vardera, giltigt Nej i sjukdomskollen idag/igår, minst två giltiga sömnnätter senaste tre dagar med minst åtta timmar vardera och kvalitet minst 4/5 i snitt, inget Dålig. Kort historik/luckor ger fortfarande en preliminär markering. Åtta timmar är en försiktig produktregel, inte ett individuellt sömnmål eller bevis på återhämtning. PB-uppgifter kan inte ensamma ge guld.
- På väg upp (turkos): alla tre aktuella känslor minst 3, uppåtgående riktning och aktuellt Nej. Annars blandade signaler (blått). Inga verkliga etiketter Bygger kapacitet eller Möjlig toppform antas från enbart dessa svar.
- Underlag gott: två aktuella dagar vardera för alla tre känslor, två sömnnätter, ett aktuellt giltigt sjukdomssvar (även känningar/sjuk) samt jämförbar aktuell belastning och baslinje. Måttligt: två dagar vardera för kropp och dagskänsla. Annars begränsat. Detta graderar datatäckning, inte positiva svar eller sannolikhet för formtopp.

7/14/28 dagars grafer visar faktiska dagsmedel på separata skalor. Heldragna linjer mellan sammanhängande svarsdagar; **streckade linjer mellan verkliga observationer över luckor**. Inga mellanvärden skapas, och tabell/analys/antal dagar ändras inte. Saknad belastning betyder varken vila eller noll. Belastning är dagsbelastning, inklusive markerad planerad tid där sådan används. RPE × minuter är inte simmeter; en sjudagarssumma kan släpa efter en nyligen påbörjad mängdminskning. Alla fem baslinjeveckor och källor redovisas. Skiftande rapporteringsgrad och uppskattad tid kan påverka jämförelsen; kompletta registrerade rapporter är inte bevis på en komplett träningsvecka.

## Daterade tränaruppgifter och SQL 120

`supabase/migrations/120_coach_form_observations.sql` skapar en intern tabell med RLS, utan klienträttigheter. Kör den för att aktivera sparade tränaruppgifter. Analys och grafer fungerar utan migrationen; bara tränarkontext markeras otillgänglig. Ingen migration körs automatiskt.

Personlig aktiv tränare kan POST:a `action: save-form-context` till samma profilbundna endpoint. Servern kontrollerar profil, datum, 600-teckensgräns och författaridentitet. Fält: observationsdatum, datum för senaste tränings-/tävlings-PB, påbörjad toppning, måltävling och notering. Varje sparande gör INSERT, inte UPDATE/DELETE: tidigare versioner bevaras. Auditlogg spårar observations-ID och tränarkonto, inte noteringstext. Klubbens befintliga backup inkluderar tabellen. Inga poäng, pass, tävlingsresultat eller historiska svar ändras.

Den senast daterade observationen inom 42 dagar används (vid samma datum senaste skapandet, sedan ID). Senaste fem versioner kan visas. Framtida observationsdatum avvisas. PB räknas som färsk uppgift bara om händelsedatumet ligger under de senaste sju kalenderdagarna; att spara om ett gammalt PB förnyar inte det. Toppning är aktuell bara med angiven start och en måltävling som ännu inte passerat. Det är tränarens planering, aldrig automatiskt en effekt eller prognos. Tom ny version med dagens datum tar bort tidigare kontext från aktuell tolkning utan att radera historiken. Fritext visas som notering och analyseras inte. Tränaruppgifterna läses inte av simmarens egen endpoint och används inte i dennes tolkning. De skickas inte till AI.

## Visuellt och tillgänglighet

Vågorb, kort orsakstext och märkt riktning i stället för flera betydelser i ett hjärta. Native knappar/details, `aria-expanded`/`aria-controls`, textalternativ för graf och tabell. Ingen färg är ensam informationsbärare. Rörelse är symbolisk och kan pausas; `prefers-reduced-motion` stoppar animationerna. Inget blinkande eller roterande. Demo är isolerad, uttryckligen fiktiv och används aldrig som reserv för en riktig simmare.

## Nästa iteration och begränsningar

Verifierade, jämförbara farttester, faktisk tävlingsresultatkoppling och individkalibrering över flera tävlingar saknas. Toppning/måltävling kan nu anges manuellt som tränarkontext. Befintliga tävlingsresultat används inte som automatisk verifikation. Därför visas aldrig verifierad eller möjlig toppform i klassificeringen. Ingen prognos, medicinsk tolkning eller automatisk träningsändring görs. Ingen historisk rapport skrivs om.

Tester: `node --test tests/*.test.mjs`. Bygg: `node node_modules/vite/bin/vite.js build --configLoader runner`. Projektet har ingen separat lint- eller typkontrollkonfiguration. Automatisk analys/API-testning använder fiktiva fixtures, aldrig riktiga simmares uppgifter.
