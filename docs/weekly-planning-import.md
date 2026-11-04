# Import av veckoplanering

Planering har **Importera veckoplanering** för lokal XLS/XLSX, befintlig delad Drive-mapp och Google Sheets/Drive-länk. Veckonummer visas även i simmarens planering.

## Aktivering

Kör `supabase/migrations/113_weekly_planning_import.sql` innan sparande används. Den skapar en privat importlogg och en transaktionell RPC; inga befintliga planeringar ändras när migrationen körs. Befintliga miljövariabler `GOOGLE_DRIVE_API_KEY`, `GOOGLE_DRIVE_FOLDER_ID` och `OPENAI_API_KEY` används. AI använder `gpt-6.1-sol`, Responses Structured Outputs, `store:false`, befintlig AI-budget och användningslogg. Inga dagboks-/hälsodata hämtas till filanalysen. Filens valda cellinnehåll (inklusive eventuella namn som står där) skickas när tränaren väljer AI. Filinnehåll behandlas som data, inte instruktioner.

## Flöde och avgränsning

1. Inspektera flikar utan databasändringar. Välj högst fem flikar; arkiv/stödflikar är inte förvalda.
2. Kontrollera år, analysera med GPT-6.1 eller den deterministiska tabelläsaren. Upp till 20 veckoblock och 40 planeringsrader/block. En gemensam Junior/Svart-tabell är ett block; Orange hålls separat. Källhänvisningar, datumkonflikter och varningar visas.
   Excel-hänvisningar normaliseras, inklusive absoluta adresser, bladprefix och flera delområden. Det räcker att det angivna området innehåller källdata; första cellen behöver inte vara ifylld. Sammanslagna celler kontrolleras mot sin innehållsankare. Om AI-hänvisningarna ändå inte kan bekräftas används vanlig tabelläsning endast om samtliga valda flikar har igenkända veckotabeller med verifierbara källor. Då visas en tydlig varning och resultatet märks Tabelläsning. Annars stoppas importen utan sparande; kontroller av datum, grupper och sparande är oförändrade.
3. Välj veckor/grupper, komplettera (standard) eller ersätt. Redigera varje rad och matcha kalender. Datum, grupper, storleksgränser och cellreferenser kontrolleras av servern. AI-resultat måste alltid granskas av tränaren.
4. Kalenderträffar grupperas per datum/klockslag/plats över gruppflöden. Bara tydligt namngivna, tidsatta simträningar föreslås. Flera träffar kräver val; användaren kan uttryckligen välja utan kalender. Kalendern hämtas på nytt före förhandsgranskning och sparande. Fel vid kalenderhämtning stoppar importen, inte tyst fallback.
5. Kalenderns tid/plats är auktoritativa. Minuter från filen prioriteras; annars används entydig start-/sluttidslängd från kalendern. Saknade minuter är okända, inte noll. Fristående rad utan kalender går att markera som eget tillfälle; annars är samma halvdag alternativ. Importen publicerar inga `daily_workouts` och skickar inga passnotiser.
6. Fräsch servergranskning visar antal nya/ersatta/identiska/skyddade rader. Spara kräver tränarens godkännande och extra bekräftelse för ersättning. En SHA-256-granskningsnyckel jämför canonical rows/snapshot. SQL kontrollerar därefter rad-ID/updated_at under lås i samma transaktion. Om något ändrats sparas ingenting.

## Skydd, idempotens och återställning

`planning_import_batches` och RPC är endast tillgängliga för service_role. Alla API-åtgärder kräver coach. RLS och explicit återkallade rättigheter skyddar importloggen från simmarkonton.

Ersättning omfattar endast manuella grundplansrader inom valda veckor och grupper. Publicerade pass, tävlingskopplingar och bortkopplingsmarkörer tas inte bort. En rad med både vald och ej vald grupp behåller de ej valda grupperna. Publicerade tillfällen får inte nya importerade alternativ ovanpå sig; dessa import­rader hoppas över. Registreringar/närvaro/personlig träning ändras aldrig.

Varje granskning får ett import-ID. Upprepat sparande av samma ID/innehåll returnerar samma resultat utan nya rader. Samma ID med ändrat innehåll avvisas. En separat ny import hoppar över innehållsmässigt identiska rader.

Loggen innehåller före-bilder i `before_state` och skapade IDs i `inserted_ids`. Den är en administrativ säkerhetskopia, inte en automatiserad ångra-knapp. Vid återställning: säkerhetskopiera först nuvarande planering, jämför mot senare ändringar, ta endast bort batchens oförändrade nya rader och återställ de berörda före-bilderna. Kör aldrig en blind restore över senare tränarändringar. Loggen bör omfattas av klubbens vanliga gallring/backup-policy.

## Verifiering

Tester: ISO-årsskiften, filgränser, stödflikar, sammanfogade veckodagar, alternativ, kalendermatchning, UTC→Stockholm, AI-strukturschema/källor, coach-behörighet, previewkrav, stale-check och PostgreSQL-transaktion/rollback/idempotens/gruppisolering. Planeringsvyn och dess passkopplingsläsning är sidindelade (500 rader/anrop), så nya veckor inte döljs av den tidigare 200-radsgränsen eller giltiga passkopplingar bedöms som borttagna utifrån en ofullständig passlista. Kör SQL-test med `SIMKOLL_SQL_TEST_MODULE` satt till en installerad PGlite-modul. Live-OpenAI och produktions-Drive/DB används inte av testerna.
