# NIU och egna träningspass

## Installation

Kör `supabase/migrations/131_personal_training_sessions.sql` i Supabase SQL Editor
innan denna kod publiceras. Migreringen är additiv: inga historiska pass eller
svar raderas. Den nya RPC-funktionen får bara anropas med serverns service-roll.
Utan migreringen visar de nya funktionerna ett felmeddelande; ingen lyckad
registrering påstås ha gjorts.

## Simmarens flöde

- Planera egna pass under veckoplaneringen eller veckans träningskort.
- Välj klubbens pass, NIU-simning, eget simpass, styrka, landträning eller annan
  träning i check-in. Annan träning har val för cykling, löpning, promenad och
  övrigt.
- Simning har meterknappar 1 000–6 000 m och inriktningsval. Träningstid har
  knappar för 30, 60, 90 och 120 minuter. Annan mängd och ”Vet inte” finns också.
- Välj det redan planerade passet efter träningen och bekräfta eller ändra
  uppgifterna till det som faktiskt genomfördes.
- Redan loggad styrka/landträning från ett program kan få återkoppling utan att
  skapa ett extra pass.

Ett stabilt UUID och en `extra_<uuid>`-slot följer varje eget pass. Två egna
pass samma morgon slås inte ihop. Inför-svar skapar inte genomförd träning.
Efter-svar och genomförd registrering sparas atomiskt och identiska återförsök
skapar inte dubbletter. Ändrade återförsök skriver inte över ett tidigare svar.

Planerade och rapporterade mängder lagras separat. Okänd faktisk mängd fylls
inte automatiskt med klubbens eller det egna planerade passets mängd.
Dagboken visar rapporterade meter/minuter och RPE när de finns. Egna simpass
räknas i träningsmängd och veckans simmål, men inte i klubbens närvarolista.
Vanliga check-in-poäng är begränsade per aktivitetskategori och dag, inte per
nytt pass-ID. Egna proaktivt planerade pass och klubbpass räknas tillsammans
mot den befintliga veckobonusen för tre planerade dagar (+2 poäng en gång per
vecka). En oplanerad efterrapport ger inte planeringsbonus.
Funktionen använder inga AI-anrop.

## Ebba, 17 november 2026

`supabase/diagnostics/ebba11-evening-workout-choice.sql` är en separat,
skrivskyddad kontroll av profilen `ebba11`. Den väljer relevanta tidsstämplar,
passreferenser och mängder, men inga fritextsvar, hälsouppgifter eller
inloggningsuppgifter. Den är inte körd mot produktionsdatabasen av agenten.

Ett regressionstest täcker tränarens närvaro först, två alternativa kvällspass
och ett senare efter-svar med explicit passval. Det ska ge ett enda genomfört
pass med rätt alternativ, mängd och RPE, oavsett inläsningsordning. Enbart
närvaro eller ett inför-svar räcker inte för att välja mellan alternativen.
Det betyder inte att orsaken till Ebbas faktiska registrering är fastställd;
den kräver resultatet av den skrivskyddade kontrollen.

## Verifiering

`tests/personal-training*.test.mjs` täcker validering, ägarskap, API-svar,
atomiska databasoperationer, idempotens, flera pass samma dag och dagboken.
SQL-testet kräver `SIMKOLL_PGLITE_MODULE` som pekar på en installerad PGlite.

`personal-training-qa.html` är en lokal testvy för de riktiga React-komponenterna
med fiktiv lagring och utan riktiga API-anrop eller poäng. Lägg till
`?viewport=mobile` för en 390 px bred vy.
