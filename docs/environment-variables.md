# Simkolls miljövariabler

Det här är driftguiden och förklaringen till inställningarna. Filen [`.env.example`](../.env.example)
är en tom mall för utveckling; lägg aldrig riktiga lösenord, API-nycklar eller
pushnycklar i den filen eller i Git.

## Var anger jag värdena?

För den publicerade appen: öppna projektet i Vercel och gå till
**Settings → Environment Variables**. Lägg varje värde i de miljöer där det ska
gälla (vanligen **Production**, vid behov även **Preview**). Miljövariabler ändras
inte i redan skapade deployar, så gör en ny deployment eller redeploya efter en
ändring. Vercel beskriver detta i [sin guide till miljövariabler](https://vercel.com/docs/environment-variables/managing-environment-variables).

För lokal backendutveckling, kopiera `.env.example` till `.env.local`, fyll i
utvecklingsvärden och kör API-funktionerna med Vercels lokala utvecklingsmiljö.
Vanliga `npm run dev` startar bara Vite-frontend och kör inte Vercels API-routes.
Lägg inte `.env.local` i Git.

I tabellen betyder **Krävs** att den centrala funktionen behöver värdet. **Valfri**
anger en tilläggsfunktion eller ett modellval. Funktionen kan också behöva
aktiveras separat i Simkolls inställningar efter deployment.

## Variabler

| Variabel | Krävs? | Vad den gör och hur den sätts |
| --- | --- | --- |
| `SUPABASE_URL` | Ja | URL till Supabase-projektet, från Project Settings → API. |
| `SUPABASE_SECRET_KEY` | Ja | Serverns hemliga Supabase-nyckel med service-rollbehörighet. Koden accepterar även det äldre namnet `SUPABASE_SERVICE_ROLE_KEY`. Använd ett av namnen. Den får aldrig börja med `VITE_` eller skickas till webbläsaren. |
| `SIMKOLL_SWIMMER_CODE` | Ja för simmarinloggning | Klubbens gruppkod som simmaren anger innan sin personliga profil väljs. Byt den genom att uppdatera Vercel och göra en ny deployment; dela den sedan säkert med gruppen. |
| `SIMKOLL_COACH_CODE` | Valfri/äldre inloggning | Äldre gemensam tränarkod. Nya personliga tränarkonton med roller är bättre; undvik att sprida en gemensam kod. |
| `SIMKOLL_COACH_BOOTSTRAP_TOKEN` | För första superadmin | Stark engångskod för att skapa det första superadmin-kontot. Endpointen tillåter bootstrap bara när inga tränarkonton finns. Koden använder den också som reservsigneringsnyckel om `COACH_SESSION_SECRET` saknas. När första superadmin är skapat kan den tas bort om en separat `COACH_SESSION_SECRET` är konfigurerad. |
| `COACH_SESSION_SECRET` | Rekommenderas starkt | Slumpmässig, separat hemlighet för att signera tränarsessioner. Sätt den till ett långt slumpvärde och behåll samma värde mellan deployar. Byte gör att befintliga tränarsessioner slutar gälla. |
| `CRON_SECRET` | Krävs för att låsa cron-endpointen | Skyddar det schemalagda Tempus-synkjobbet. När variabeln finns kräver API:t `Authorization: Bearer <värdet>`. Utan den är cron-endpointen inte låst av denna kontroll och kan anropas publikt. Vercels cron skickar den som bearer-token när den är konfigurerad. |
| `AUDIT_LOG_SALT` | Valfri, rekommenderas | Slumpvärde som saltar hashade IP-fingeravtryck i loggar. Ett eget stabilt värde ger bättre avskiljning från standardvärdet. Byt inte i onödan om du vill kunna jämföra befintliga fingeravtryck över tid. |
| `OPENAI_API_KEY` | Valfri, krävs för de flesta AI-funktioner | API-nyckel från OpenAI. Aktivering av AI kan även styras i Simkolls inställningar. Håll nyckeln server-side. |
| `OPENAI_MODEL` | Valfri | Standardmodell för assistent och flera generativa AI-funktioner när OpenAI används. Kodens reservvärde är `gpt-4o-mini`. Välj en modell som API-kontot har tillgång till. |
| `OPENAI_TRANSCRIBE_MODEL` | Valfri | Ljudtranskriberingens modell. Reservvärde `gpt-4o-mini-transcribe`. |
| `OPENAI_WORKOUT_IMAGE_MODEL` | Valfri | Modell för bildtolkning av träningspass. Om tom används `OPENAI_MODEL` och därefter standardmodellen. |
| `OPENAI_COMPETITION_MODEL` | Valfri | Modell för tävlingsrelaterad analys i den äldre separata tävlingsfunktionen. Reservvärde `gpt-4o`. |
| `OPENAI_COMPETITION_PROGRAM_MODEL` | Valfri | Den separata tvåstegsmodellen för att läsa in grenprogram från tävlings-PM som bild eller PDF. Reservvärde `gpt-6.1-sol`. Den ändrar inte assistentens modell. |
| `AI_GATEWAY_API_KEY` | Valfri | Alternativ nyckel till Vercel AI Gateway för trendanalys när en OpenAI-nyckel inte används där. |
| `AI_MODEL` | Valfri | Modellnamn för trendanalys via AI Gateway. Reservvärde `inclusionai/ling-3.0-flash-fin-free`. |
| `GOOGLE_DRIVE_API_KEY` | Valfri | Google API-nyckel för att läsa passmaterial från Drive. Drive-integrationen fungerar inte utan den. Begränsa nyckeln till rätt Google API och användningsmiljö. |
| `GOOGLE_DRIVE_FOLDER_ID` | Valfri | Drive-mapp som Simkoll läser från. Om den saknas använder appen klubbens förinställda mapp. |
| `WEB_PUSH_PUBLIC_KEY` | Valfri | Publik VAPID-nyckel för Web Push. Generera ett nyckelpar en gång och behåll det. |
| `WEB_PUSH_PRIVATE_KEY` | Valfri, hemlig | Privat VAPID-nyckel. Måste hållas server-side och får aldrig läggas i Git, frontendkod eller en `VITE_`-variabel. |
| `WEB_PUSH_SUBJECT` | Valfri | Kontakt för pushleverantören, exempelvis `mailto:klubbens-kontakt@example.org`. Alla tre `WEB_PUSH_*`-värden behövs och Push måste sedan aktiveras av superadmin i appen. Se även [pushguiden](web-push.md). |

### Vercel-variabler som hanteras av plattformen

`VERCEL_GIT_COMMIT_SHA` läses bara vid bygget för att visa byggrevisionen i
appens sidfot. Vercel sätter den automatiskt. `VERCEL_OIDC_TOKEN` kan Vercel
skapa för AI Gateway; lägg inte in den manuellt som långlivad hemlighet.

## Säker grundkonfiguration

För en normal produktionsmiljö bör du åtminstone lägga in Supabase URL och
servernyckel, simmarkod, bootstrap-token, en separat `COACH_SESSION_SECRET` och
`CRON_SECRET`. `CRON_SECRET` är särskilt viktig eftersom synk-endpointen annars
saknar denna bearer-kontroll. Lägg till OpenAI om AI-funktionerna ska användas.
Lägg endast in Drive- och Web Push-värden om de funktionerna ska användas.

Generera hemligheter från terminalen, till exempel:

```sh
openssl rand -base64 48
```

Använd olika slumpvärden för bootstrap-token, sessionshemlighet, cronhemlighet
och audit-salt. Klistra in varje värde i rätt Vercel-miljö. Efter ändringar,
skapa en ny deployment och kontrollera funktionen i produktion. Vercel skriver
inte automatiskt om redan existerande deploymentar när en miljövariabel ändras.

## Vanliga felsymtom

- **Supabase svarar inte / inloggning fungerar inte:** kontrollera `SUPABASE_URL`
  och att servernyckeln är korrekt och ligger i Vercels servermiljö.
- **AI-funktioner saknas:** kontrollera `OPENAI_API_KEY`, vald modells åtkomst och
  att AI-funktionen är aktiverad i Simkolls inställningar.
- **Tempus synkar inte:** kontrollera `CRON_SECRET`, Vercels cron-körning och att
  samma secret finns i deploymentmiljön. Appen hämtar resultat från Tempus Open;
  det finns ingen Tempus API-nyckel i den här konfigurationen.
- **Pushinställningen är låst:** kontrollera `WEB_PUSH_PUBLIC_KEY`,
  `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` och att databasuppdatering 078 har
  körts. Därefter behövs en ny deployment om servervariablerna ändrades.
- **Drive-listan är tom eller ger fel:** kontrollera Google API-nyckel,
  mappbehörigheter och `GOOGLE_DRIVE_FOLDER_ID`.
