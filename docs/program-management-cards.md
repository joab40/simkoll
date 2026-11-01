# Kompakta programkort

Styrke- och landträningssidorna använder `ProgramManagementCard` för filimport, eget program, redigerbara mallar, grupptilldelning, individuell tilldelning och aktiva programs innehåll/mål. Alla är stängda vid öppning av sidan och kan fällas ut oberoende av varandra. Rubrikerna använder samma ikonlayout, chevron och tangentbordsfokus som simmarkorten. Antal/status är synligt utan hela formuläret.

Native `details` döljer innehållet utan att avmontera det. Vald fil, lokala formulärvärden, markerade simmare och osparade redigeringar behålls vid hopfällning. Inget sparas automatiskt; sidbyte/omladdning har inte fått någon ny utkastlagring. Byggarens tidigare spar-/stängbeteende och dess synliga resultatmeddelande är kvar.

API-anrop, rättigheter, AI-villkor, gruppurval och tilldelnings-/granskningsflöden är oförändrade. Öppning av kort orsakar ingen skrivning eller AI-tolkning. Vanlig tränare har fortsatt inte tillgång till import/byggare/redigering. Biblioteket och tilldelningar läses som tidigare vid sidöppning, inte först när kortet öppnas. Ingen SQL krävs.
