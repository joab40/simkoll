# SportAdmin: döljning och gruppvisa importtider

Kör `supabase/migrations/115_sportadmin_hidden_activities.sql` före driftsättning. Den skapar en privat RLS-skyddad tabell med service-role-åtkomst. Inga befintliga träningsplaner, pass eller incheckningar ändras av migrationen.

## Dölj / återställ

- Planering visar **Dölj i Simkoll** för kalenderkort och kort som innehåller en kopplad kalenderaktivitet. Sammanfogade kalenderkort listar vilka originalaktiviteter som påverkas.
- POST `set-calendar-visibility` kräver tränarinloggning. Servern hämtar originalkalendern och verifierar nycklarna. Inga klientskickade titlar, grupper eller tider sparas som auktoritativa snapshots.
- Markeringens SHA-256-nyckel bygger på samma `calendarActivityKey` som kalenderkopplingarna. UID + kalender-ID + datum behåller identiteten över namn-/tidsändringar. Andra veckor och andra gruppflöden påverkas inte. Utan UID är namn/tid/plats del av identiteten, så ändrade källaktiviteter kan behöva döljas igen.
- Markeringarna läses på servern vid kalenderhämtning och filtrerar både tränar-/simmarplanering, kalenderförslag i passimport, veckoplaneringsimport och assistentens kalenderkontext. Hämtfel stoppar läsningen, inte en tyst återvisning av dolda aktiviteter. Assistentens kalendercache filtreras även vid cacheträff.
- **Visa dolda aktiviteter** filtrerar markeringarna till vald vecka och grupper. Återställning raderar bara markeringen; aktiviteten visas om den finns kvar i källkalendern. Snapshots gör återställningen tillgänglig även om källposten försvunnit.
- Kopplade planeringar och publicerade pass raderas eller avpubliceras aldrig. Om någon planeringsrad refererar till kalendernyckeln krävs en andra uttrycklig bekräftelse. Dialogen redovisar antal rader och kopplade publicerade pass och förklarar att de fortfarande kan visas. Tränaren måste ändra/avpublicera sådana pass separat om träningen ställs in. Incheckningshistorik ändras inte.
- Döljning ändrar aldrig SportAdmin, delning eller kalenderinställningar. Upsert per stabil nyckel gör omförsök idempotenta och undviker att samtidiga döljningar skriver över varandra som en gemensam inställningslista skulle göra.

## Gruppvisa importkopplingar

Granskningsrader har `calendarByGroup` med exakt de valda veckogrupperna. Ett entydigt kalenderpass väljs per grupp/datum/halvdag. Flera kandidater, eller saknad kandidat för en grupp när andra grupper har kandidater, kräver uttryckligt val. Utan några kandidater visas grundplan utan kalender; UI varnar att ingen match finns. Modellen bestämmer aldrig kalendernycklarna.

Servern validerar om alla tilldelningar mot en färsk kalender vid granskning och sparande. Gemensamt klockslag/plats kan fortsätta vara en rad med flera grupper. Skilda tider blir skilda planeringsrader, med samma träningsinnehåll men respektive grupp, kalenderlänk och minuter. Varje simmare filtreras till sin grupp. Alternativa upplägg delar tillfälles-ID inom respektive kalenderträning och räknas inte ihop. Äldre klienters gemensamma `calendarKey` stöds fortfarande men får inte kopplas till inkompatibla grupper.

En redan importerad, okopplad grundplan repareras inte automatiskt. Vid samma pass/tid på dagen/grupp stoppas komplettering som annars skulle skapa en dubbel planering. Tränaren kan importera veckan igen med **Ersätt grundplan för valda grupper** och godkänna granskningen. Befintlig SQL 113/114 sköter atomisk ersättning, backup, idempotens och skydd för publicerade pass. Kalenderändringar eller döljning efter förhandsgranskningen ger en ny granskningskontroll; inga gamla nycklar tillåts passera tyst.

Verifieras med `tests/calendar-visibility*.test.mjs`, `tests/planning-import*.test.mjs`, `tests/planning-calendar.test.mjs` och `tests/workout-alternatives-api.test.mjs`. PGlite-test aktiveras via befintliga `SIMKOLL_SQL_TEST_MODULE` och provar både roller och att SQL 115 kan köras två gånger.
