# Grenprogram med dag/tid-kolumner · 3.115.0

Kontrollfil: användarens `usm2026.pdf`, sex sidor. Bilaga 1 (sida 5) är regionfinalen 28–29 november 2026 med fyra kolumner: lördag 09:00, lördag 16:00, söndag 09:00 och söndag 16:00. Varje kolumn har 19 grenar; totalt 76. Bilaga 2 på sida 6 avser riksfinalen 29–31 januari 2027 och återanvänder numren, men flyttar vissa grenar till ett fredagspass. De får inte kombineras. Sidnummer är 1-baserade faktiska PDF-sidor, inte eventuella tryckta sidnummer.

## Ändring

- Import-API:t läser tävlingens sparade titel och datum från `competition_calendar`; klienten får inte byta kontexten via importkroppen. Bara dessa tävlingsmetadata går vidare, inte anmälningar eller simmaruppgifter.
- Valfritt PDF-sidval före filvalet gör bilagevalet uttryckligt. Det är en tolkningsavgränsning: hela PDF-bilagan skickas fortfarande till den befintliga modellen, inte en lokalt extraherad enstaka sida.
- Första analysen inventerar rätt programvariant och varje dag/tid-kolumn separat. Den returnerar stabilt pass-ID, unik etikett, veckodag, källsida, ordagrann kolumnrubrik, start/insim och alla faktiskt synliga grennummer. Osäker programvariant stoppar före grenanalysen och ber om sidval.
- Andra analysen transkriberar bara dessa kolumner med `sessionId` och `sourcePage` per gren. RPE, träningsdata eller andra appfunktioner berörs inte.
- `bindCompetitionLayout` binder grenar till kolumnerna, inte numeriska intervall. En felaktig passkoppling med en unik ägare i inventeringen kan rättas men markeras osäker och kräver kontroll. Fel källsida lämnar passkopplingen olöst och blockerar sparande via befintlig validering.
- En veckodag får datum från det sparade tävlingsintervallet bara vid exakt en matchning. Explicit ISO-datum utanför intervallet stoppar analysen. Oklara datum lämnas tomma med varning, aldrig som ett anmälnings-/kvaldatum. Kolumnens 09:00/16:00 är tävlingsstart, inte påhittat insim.
- Källsida och kolumnrubrik bevaras av normaliseringen och visas i redigerbart granskningsutkast. Befintligt sparande använder oförändrad granskning, konfliktkontroll och skydd för anmälda grenar. Ingen SQL eller automatisk publicering.

Modell, endpoint, tvåstegsflöde, `store: false`, befintlig användningsloggning och behörighetskrav behålls. PDF anges med `detail: high` för tät tabelltext. Implementationen har kontrollerats mot OpenAI Docs om PDF-filindata och strikt strukturerad JSON. Ingen modelluppgradering görs.

## Verifiering och begränsning

`tests/fixtures/usm-region-2026.mjs` är manuellt kontrollerad mot sida 5, inte ett sparat live-AI-resultat. Testerna täcker 76 grenar, fyra pass med 19 vardera, veckodagsdatum, kön/ålder, totalmeter för lagkapper, felkolumn, fel bilaga, icke sammanhängande fredagsnummer, oklar datumkoppling och att importen inte ersätter befintligt program. Live-modellprecision kan inte garanteras av dessa tester; lokala miljön saknar OpenAI API-nyckel. Tränaren behöver läsa in filen på nytt och granska resultatet i den konfigurerade appen.

Källor:
- https://developers.openai.com/api/docs/guides/file-inputs
- https://developers.openai.com/api/docs/guides/structured-outputs
