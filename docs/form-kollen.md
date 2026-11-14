# Formkollen · första versionen

Formkollen ersätter hjärta/ring på simmarkortet. Öppna **Simmare → Visa mer → kortet under Simmarens riktning → Visa utveckling & underlag**. Det nuvarande hälsotrafikljuset och dess varningar ändras inte. Tidigare hjärtexempel finns märkta Arkiv i hjälpen. Nya fiktiva exempel finns också i hjälpen; lokal utvecklingsdemo: `/form-kollen-qa.html`.

## Verkliga källor

`responses`: aktivitetsdatum, kropp, dagskänsla, simfartkänsla, RPE, egen tid, aktivitet, passdel och valt upplägg. `profile_daily_sleep`: sovtid, kvalitet, överhoppat. `profile_daily_illness`: nej/känningar/sjuk, överhoppat. Vid behov används samma säkra planeringskoppling som tidigare för uppskattad tid från `daily_workouts`/`training_plans`. Råa kommentarer eller andra simmares rapporter returneras inte.

`GET /api/training?formKollen=true&profileId=…` läser 42 kalenderdagar för en profil, vid öppning. Ingen polling, ingen AI, inga nya beroenden/migrationer. Aktivt personligt tränarkonto krävs för tränare (befintlig klubbomfattande läsbehörighet); en inloggad simmare kan via API bara läsa sin egen profil. Första gränssnittet finns i tränarens simmarkort, inte en ny separat simmarsida. Testprofiler/avstängda/ej godkända profiler undantas. `private, no-store`; ofullständig/pagineringsbegränsad läsning blir fel, aldrig fejkade nollor. Saknad sjukdomstabell blir uttryckligt otillgänglig källa, vilket hindrar positiva faser.

## Analysregler – produktheuristiker, inte fysiologiska gränser

Ren logik i `shared/form-kollen.js` använder befintlig `buildTrainingHeart` för validerad RPE × tid, deduplicering, säkra tidsuppskattningar och sömn-/sjukdomsvarningar. Senaste efterrapport per dag/aktivitet/passdel används; separata verkliga pass med samma nyckel kan ännu inte särskiljas. Tävling och Inte genomfört tas inte med i belastning eller simfart.

- Aktuellt: tre kalenderdagar. Varje dags medel väger lika; minst två svarsdagar vardera för kropp, dagskänsla, simfart.
- Baslinje: fem separata sjudagarsperioder före aktuell vecka, minst fyra jämförbara. Varje jämförbar vecka har minst tre kompletta rapporter på två dagar och minst 80 % RPE/tid-täckning. Baslinjen är deras medelbelastning. Det är en praktisk startregel, inte ett vetenskapligt minimikrav. Förhållande under 0,8 = lägre, över 1,2 = högre, annars nära baslinjen. Ingen formpoäng eller godtycklig procentuell återhämtning visas.
- Kort trend: tre dagar mot de fyra före, minst två svarsdagar i varje del. Veckotrend: sju mot föregående sju, minst tre dagar vardera. 0,5/5 är förändringsgräns. Upp: minst ett mått ökar i båda jämförelser och inget annat minskar i någon. Blandat om både upp och ned; ned om minst ett sjunker i båda; stabilt annars när jämförelser finns. Okänt utan jämförelse.
- Uppföljning prioriteras alltid: befintliga sömn-/sjukdomsvarningar, befintligt ihållande tungt mönster eller minst två känslomått som faller minst 0,5 i båda jämförelserna. Det är samtalsstöd, inte diagnos.
- Utan baslinje eller aktuella känslor: Otillräckligt underlag, med verkliga observationer. En känd uppföljningssignal visas ändå.
- Tungt: aktuell kropp eller dagskänsla högst 2,5. Hög fart döljer inte detta. Hög belastning ensam ger aldrig tung fas/nedtränad.
- Starka positiva signaler (guld): alla tre aktuella känslor minst 4,5/5, giltigt Nej i sjukdomskollen idag/igår, minst två giltiga sömnnätter senaste tre dagar med minst åtta timmar vardera och kvalitet minst 4/5 i snitt, inget Dålig. Åtta timmar är en försiktig produktregel, inte ett individuellt sömnmål eller bevis på återhämtning.
- På väg upp (turkos): alla tre aktuella känslor minst 3, uppåtgående riktning och aktuellt Nej. Annars blandade signaler (blått). Inga verkliga etiketter Bygger kapacitet eller Möjlig toppform antas från enbart dessa svar.
- Underlag gott: två aktuella dagar vardera för alla tre känslor, två sömnnätter, ett aktuellt giltigt sjukdomssvar (även känningar/sjuk) samt jämförbar aktuell belastning och baslinje. Måttligt: två dagar vardera för kropp och dagskänsla. Annars begränsat. Detta graderar datatäckning, inte positiva svar eller sannolikhet för formtopp.

7/14/28 dagars grafer visar faktiska dagsmedel på separata skalor. Inga streck dras över dagar som saknar värden. Belastning är dagsbelastning, inklusive markerad planerad tid där sådan används. Exakta tabellvärden, datum, antal dagar/rapporter och belastningskällor finns i detaljerna. Alla fem baslinjeveckor redovisas. Skiftande rapporteringsgrad och uppskattad tid kan påverka jämförelsen; kompletta registrerade rapporter är inte bevis på en komplett träningsvecka.

## Visuellt och tillgänglighet

Vågorb, kort orsakstext och märkt riktning i stället för flera betydelser i ett hjärta. Native knappar/details, `aria-expanded`/`aria-controls`, textalternativ för graf och tabell. Ingen färg är ensam informationsbärare. Rörelse är symbolisk och kan pausas; `prefers-reduced-motion` stoppar animationerna. Inget blinkande eller roterande. Demo är isolerad, uttryckligen fiktiv och används aldrig som reserv för en riktig simmare.

## Nästa iteration och begränsningar

Verifierade, jämförbara farttester, koppling till huvudtävling/toppningsperiod samt individkalibrering över flera tävlingar saknas. Befintliga tävlingsresultat används inte som automatisk verifikation. Därför visas aldrig verifierad eller möjlig toppform i den verkliga klassificeringen. Ingen prognos, medicinsk tolkning eller automatisk träningsändring görs. Ingen historisk post skrivs om.

Tester: `node --test tests/*.test.mjs`. Bygg: `node node_modules/vite/bin/vite.js build --configLoader runner`. Projektet har ingen separat lint- eller typkontrollkonfiguration. Automatisk analys/API-testning använder fiktiva fixtures, aldrig riktiga simmares uppgifter.
