# Rätta en missad aktivitetsdag

Kör först `supabase/migrations/123_profile_activity_corrections.sql` i Supabase.
Ingen befintlig svit eller simmaraktivitet ändras av migreringen i sig.

Superadmin öppnar **Simmare → Visa mer → Profilinställningar → Rätta aktivitetsdag**.
Det fungerar för samtliga simmarprofiler, inklusive superadmins egen kopplade
simmarprofil. För att rätta sig själv används tränarvyn och det egna simmarkortet;
tränarkontots inloggning är inte en simmaraktivitetsdag. Vanliga tränare,
huvudtränare och simmare får inte läsa eller använda rättelseverktyget.

Kalendern skiljer registrerade, rättade och saknade dagar. En saknad dag betyder
ingen registrering, inte bevis på att personen var frånvarande. Välj ett datum
från profilens skapandedag till idag, ange en anledning på 5–500 tecken och
bekräfta simmare/datum. Förhandsberäkningen gäller registrerad svit till idag;
om dagens aktivitet saknas förblir den noll tills idag också registrerats.

`/api/profiles?activityAdmin=true&profileId=...` läser målprofilens historik;
POST `correct-activity-day` lägger till en saknad dag. API:t kontrollerar aktuell
superadminsession. Databasfunktionen kontrollerar konto/roll/sessionsversion
igen och lagrar aktivitetsdagen, rättelsehistoriken och auditloggen i samma
transaktion. Ett loggfel rullar tillbaka hela rättelsen. Funktionen kan endast
anropas av `service_role`; RLS ger inga klientroller tillgång till rättelsetabellen.
Datum, anledning, målprofil, administratör och tid sparas. `last_seen_at` för
en rättad dag anger när registreringen gjordes, inte en uppmätt historisk inloggning.

Befintliga dagar ändras inte. Dubblettklick och upprepade anrop skapar varken
dubbletter eller extra poäng. Inga träningsrapporter, hälsovärden, planeringsrader
eller passlås ändras. Verktyget har ingen radera-/ångrafunktion för aktivitetsdagar.
Återkommande rättelser kan granskas i kalendern och superadmins **Loggar**.

Sviten bygger nu bara på den egna profilens aktivitetsdatum, med egna svar som
optimistiskt tillägg i gränssnittet. Gruppens/andras/anonyma svar räknas aldrig in.
Stockholms kalenderdag används även över tidszon-/sommartidsgränser. Den egna
dagens aktivitet registreras innan historiken hämtas, så sidans parallella
passhämtning inte behöver bli klar först. Historiken sidindelas i stället för
att klippas vid 120 dagar; ofullständig läsning ger fel, inte ett påhittat nollvärde.

Rättelsen delar inte ut poäng. När simmaren nästa gång öppnar appen kan den
ordinarie synkningen utvärdera svitmilstolpar på nytt. Servern räknar då sviten
från den egna aktivitetstabellen, inte klientens uppgivna antal. Milstolpars
befintliga unika poängnycklar återanvänds, så samma milstolpe inte betalas två gånger.

Verifiering: `tests/activity-corrections*.test.mjs` och lokal fiktiv demo
`/activity-correction-qa.html` (även `?viewport=mobile`). Inga riktiga profiler
eller databasskrivningar behövs i dessa tester. SQL måste fortfarande köras
i målmiljön innan funktionen kan användas där.
