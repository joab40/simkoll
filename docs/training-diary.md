# Min träningsdagbok

Simmaren öppnar dagboken via sin meny eller Min profil. Första versionen
omfattar historik, vecka/månad/termin/egen period, jämförelse med en lika
lång föregående period, veckosammanfattningar, kalender, passdetaljer,
utvecklingsmål, tävlingsresultat och egna reflektioner.

## Driftsättning

1. Kör `supabase/migrations/095_training_diary.sql` i Supabase SQL Editor.
2. Driftsätt webbappen som vanligt.

Inga nya miljövariabler, API-funktioner eller AI-tjänster behövs.
Historiken kan läsas även före migrationen, men sidan upplyser då om att
dagboksreflektioner inte kan sparas ännu.

## Underlag

`GET /api/training?diary=true&start=YYYY-MM-DD&end=YYYY-MM-DD` använder
simmarens aktuella profilsession. Ett inskickat profil-id används inte.
Läsningen skapar inga pass, närvarorader eller poänghändelser.

- Registrerade pass och incheckningar kopplas med aktivitetsdatum,
  aktivitetstyp och explicit passval. Saknat passval kopplas bara när
  underlaget är entydigt. Oklart kopplad feedback räknas inte som extra pass.
- Profilkopplade kommentarer återges från incheckningarna. Anonyma svar
  kan inte återkopplas till profilen.
- Styrkeloggar kompletterar styrkeregistreringen utan att räknas som ett
  extra pass. Tävlingsresultat samlas per tävlingsdag och visas separat
  från simträning. Enbart avsikt att tävla är fortfarande planering.
- Rapporterade meter/minuter summeras separat från uppskattningar från
  entydigt kopplade pass. Delvis genomfört pass ger inte automatiskt hela
  den planerade mängden. Saknad uppgift är inte noll.
- Uppskattad volym är aldrig ett påstående om uppmätt simmad distans.
  Annan aktivitets distans omvandlas inte till simmeter.
- Dagens låsta passinnehåll lämnas inte ut före dagens check-in.
  Personlig planering visar bara metadata innan passet genomförts.
- En period får vara högst 366 dagar och sträcker sig som längst till idag.
  Stora källor sidindelas; avbruten eller begränsad läsning redovisas.

## Egna reflektioner

`POST /api/training` med `action: diary-reflection` sparar två textfält:
`whatWorked` och `nextTime`, högst 2 000 tecken vardera. Servern verifierar
att registreringen finns i den inloggade simmarens dagbok. Uppdatering
sker på `(profile_id, entry_key)` och skapar aldrig en träningsregistrering.
Tidigare sparade reflektioner visas även om äldre passkoppling ändras.

Tabellen har RLS aktiverat och används genom serverns profilsession.
Anteckningarna exponeras inte för andra simmare, tränarvyn eller
AI-assistenterna i denna version. De ersätter inte kommentarer till
tränaren eller svar på ett utvecklingsmål.

## Senare etapp

Valbar AI-tolkning ligger kvar i backloggen. Dagboken, graferna och
anteckningssparandet gör inga AI-anrop.
