# Banfördelning klubbar

Kör `supabase/migrations/133_lane_usage.sql` före publicering. Funktionen är
avstängd från början. Superadmin öppnar **Inställningar → Banfördelning**,
anger kortets namn och 1–5 klubbar/grupper och aktiverar kortet. Sundsvall och
Njurunda är förifyllda namn, inte automatiskt importerade klubbar.

Kortet ligger direkt under **Närvaro under simpass** på tränarens Idag-sida.
Personligt inloggade aktiva tränare, huvudtränare och superadmin får registrera
och läsa. Delad tränarkod och simmarinloggning ger ingen åtkomst. Servern
kontrollerar både sessionsversionen och det aktuella kontots status/roll.
Endast superadmin kan spara konfigurationen; det kontrolleras även i SQL.

En observation har datum, klockslag, valfri plats och 1–5 valda klubbar/grupper.
Varje vald grupp får 1–8 banor och 0–500 simmare. Grupperna sparas tillsammans
i en transaktion. Antal banor summeras inte med någon påhittad bassänggräns:
olika bassänger kan förekomma. Mätningen är en observation, inte individuell
närvaro; inga träningspass, mängder, dagboksrader eller poäng ändras.

Varje mätning visar simmare/bana för varje klubb. Statistik hämtas separat
när kortet öppnas, för 30, 90 eller 365 dagar till det valda översiktsdatumet.
Periodens/dagens kvot är **summan av observerade simmare / summan av
observerade banor**. Antal observationer visas. Upprepade observationer av
samma simmare är inte unika personer; saknade dagar är inte nollvärden.
Daglig fördelning och ursprungliga mätningar med namn, tid och plats finns kvar.
Hämtning pagineras; över 10 000 observationer kräver kortare period, utan att
visa en tyst kapad totalsumma.

Namn sparas som ögonblicksbilder på observationerna. En ändrad benämning
behåller gruppens id/statistikserie men skriver inte om historiska namn.
En borttagen grupp behåller sin historik; nytillagda grupper får nya id:n.
Konfigurationen låses/versionskontrolleras vid sparande så att ändringar i
andra flikar inte tyst skriver över varandra. Ett stabilt mät-id skyddar
återförsök/dubbelklick från att skapa extra observationer.

## Valfria foton

Ett foto kan bifogas hela observationen. Appen komprimerar JPG/PNG/WebP till
JPEG, högst 1 600 px på längsta sidan och 2 MB. Canvas-omkodningen behåller
inte källfilens EXIF/GPS. HEIC behöver exporteras till JPG först. Tränaren
uppmanas att undvika identifierbara personer och privata uppgifter, och måste
granska/bekräfta bilden före sparande. Ingen bildtolkning eller AI används.

Fotot sparas i den privata bucketen `lane-usage-evidence`, utan direkt
klientpolicy. Endast servern laddar upp och skapar fem minuter långa signerade
länkar, efter ny tränarbehörighetskontroll och uppslag av mätningen. Klienten
kan inte ange en godtycklig Storage-sökväg eller publik bild-URL. Fotounderlag
får en tydlig kategori i lagringsöversikten.

Uppladdning sker före transaktionssparandet. Ett bekräftat transaktionsfel
städar bara den egna nya uppladdningen. Vid tappat svar kontrolleras samma
mät-id igen; ett redan committat fotos referens raderas aldrig. Om även den
kontrollen misslyckas behålls den möjliga filen och formuläret för återförsök
(en möjlig överbliven fil kan då kräva senare administrativ städning). Historik
och foton raderas inte av att inställningen stängs av eller en grupp tas bort.

Inställningsändringar, sparade observationer och fotoöppningar auditloggas
med tränarkontots/mätningens id, aldrig med själva bilden eller signerad URL.
RLS, återkallade klienträttigheter och service-only RPC:er skyddar tabellerna.
Det finns ingen raderings- eller rättningsknapp i denna första version.

## Kontroller

`tests/lane-usage*.test.mjs` täcker validering, viktade kvoter, åtkomst, privat
fotolagring, återförsök och SQL-skydd. SQL-testet använder PGlite när
`SIMKOLL_PGLITE_MODULE` är satt. `lane-usage-qa.html` är en lokal testvy utan
serveranrop. `?width=320` / `?width=390` visar mobilbredder.
