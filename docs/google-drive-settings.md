# Google Drive i inställningar

Superadmin har **Inställningar → Google Drive** med mapp för träningspass och mapp för veckoplanering. Den senare följer passmappen som standard. Mapplänk (`https://drive.google.com/drive/folders/…` eller `/drive/u/1/folders/…`) och mapp-ID stöds; vanlig textsökväg, fillänk och externa adresser avvisas.

## Lagring och prioritet

Endast `workoutFolderId`, `planningFolderId` och `useWorkoutFolder` sparas i en separat `app_settings`-post med `setting_key=google_drive`. Ingen API-nyckel, mappinnehåll eller kontrollhistorik sparas där. Befintliga webapp-inställningar skrivs inte över. Ingen ny SQL behövs för Drive-kortet.

Passmapp: sparad inställning → `GOOGLE_DRIVE_FOLDER_ID` → den befintliga standardmappen. Planering: samma passmapp om `useWorkoutFolder=true`, annars explicit sparad planeringsmapp. Att tömma passfältet betyder miljö-/standardmapp, inte tidigare sparat värde. Befintliga installationer behåller alltså sin nuvarande passmapp tills administratören ändrar något.

## Status och kontroll

`apiKeyConfigured` och `environmentFolderConfigured` är serverberäknade booleska värden. `GOOGLE_DRIVE_API_KEY` returneras aldrig. Konfigurerad nyckel betyder inte verifierad behörighet. `Testa anslutning` läser mappmetadata (`id`, `name`, `mimeType`, `trashed`) och provar sedan innehållslistning. Ett lyckat, tomt listsvar räcker inte utan verifierbar mappmetadata. Tillgänglig tom mapp ger ett uttryckligt OK/tom-status. Grönt OK gäller bara den aktuella kontrollerade länken och tiden; ändringar återställer statusen. Ny kontroll krävs efter omladdning.

Spara kontrollerar båda nya effektiva mapparna igen innan databasskrivning. Om en kontroll misslyckas sparas inget. API-fel och nätverksfel visas utan URL:er som innehåller API-nyckeln. API-anrop har tidsgräns och stödflaggor för delade enheter. Fillistor anger om fler än de första 100 objekten finns; planeringsfilväljaren visar då en uppmaning att avgränsa till undermapp.

## Behörighet och integritet

Endast befintlig superadmin-roll får läsa miljöstatus, testa mappar och spara globala Drive-inställningar. Tränare kan använda filväljarna utan att få nyckeln eller konfigurationsstatusen. Samma behörighetsgräns gäller som för övriga globala kopplingar; huvudtränarens rättigheter utökas inte.

Kopplingen är fortsatt API-nyckelbaserad och läser länkdelat material. Inställningen ger inte privat Drive-åtkomst, ändrar aldrig delning och är ingen säkerhetsgräns som begränsar all Drive-åtkomst till startmappen. Inloggning/OAuth för privata mappar är ett separat framtida arbete. Flytta inte känsliga simmar-/hälsodata till en offentlig länkdelad mapp.

## Verifiering

Lokala tester täcker mapplänkar/ID, andra värdar och fillänkar, miljöstatus utan nyckelexponering, felaktig mappmetadata, nekad listning, tomma mappar, test utan sparande, återkontroll vid sparande, misslyckad kontroll utan skrivning, separata startmappar och superadmin-skydd. Faktisk åtkomst i driftsmiljön verifieras med knappen Testa anslutning; inga Google-behörigheter ändras av testerna.
