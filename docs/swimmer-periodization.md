# Periodisering i simmarkortet (3.113.0)

Ersätter endast `PointProgress` i tränarens utfällda simmarkort. Nivåmärket, simmarens Din nivå-kort, poäng och belöningar påverkas inte.

Kortet använder gemensam `SwimmerCardSummary`, startar minimerat och hämtar först när det öppnas. Makro är standard: aktuell ISO-kalendervecka plus elva föregående veckor. Aktuell vecka markeras pågående tills söndagen. Meso är exakt 28 kalenderdagar till och med idag i Europe/Stockholm. Veckoår hålls isär vid årsskiftet.

Meter bygger på dagbokens etablerade passkoppling och `swimMeterDay`. Senast rapporterade distans prioriteras, även uttrycklig nolla. Annars används planerad distans från en entydig grupp-/passkoppling, märkt ≈ och randigt. Flera alternativ adderas inte. Närvaro och registrering samma tillfälle dedupliceras. Ingen registrerad simning = 0; genomförd simning utan distans är okänd. Ofullständig veckomängd redovisar bara känd del och antal okända dagar.

RPE gäller endast genomförda simpass med giltig RPE 1–10. Dagsvärde = medel av senaste efterrapporten per simpass; vecka = medel av dagsvärden med RPE. Saknade värden är luckor, inte noll och ingen interpolation görs. Gym, land och tävling ingår inte. RPE är inte RPE×minuter eller en formbedömning.

En ny läsgren i `/api/training?periodization=true&profileId=…` kräver signerat tränarkonto, verifierat aktivt medlemskap och aktiv/godkänd simmarprofil (samma klubbövergripande tränarläsning som träningstider). Endast aggregerade värden returneras, med `no-store` via gemensamma `sendJson`. Inga kommentarer, privata dagboksreflektioner, resultat eller mål hämtas. Fem paginerade källor: passregistreringar, efter-/dagsvar, publicerade pass, grundplanering och närvaro. Vid fel eller hämtgräns stoppas hela svaret. Inga skrivningar, inga poängberäkningar, ingen AI och ingen SQL.

Grafen har sidscroll, klick-/tangentbordsval, separata meters-/RPE-axlar, källförklaringar och en värdetabell. FAQ och tränarassistentens delade funktionsguide beskriver samma beräkning.
