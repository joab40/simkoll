# Min träningsdagbok

## Min utveckling – hela bilden

Överst i dagboken samlas genomförd simträning, gym/styrka, träningsdagar,
RPE, egna reflektioner, aktuella utvecklingsmål, egna tider/testlopp och
registrerade tävlingsresultat för vald period. **Registrera testlopp +** öppnar
det befintliga tidsformuläret med typen Testlopp förvald. Ett testlopp kan vara
fristående; det skapar inte ett extra pass eller officiellt personbästa.

Korten öppnar motsvarande historik, mål eller tidsjämförelse. **Min väg vecka
för vecka** visar träningsinsatsen, RPE och egna/tävlingsresultat tillsammans.
Egna tider jämförs bara vid identiska förutsättningar och olika datum. Jämförelsen
avser bästa registreringen första respektive senaste dagen i vald period,
inte ett officiellt personbästa. Målens status är aktuell och sätts inte
automatiskt. Saknade eller begränsade källor redovisas. Vila och hög RPE
bedöms inte som sämre respektive bättre utveckling. Ingen AI körs.

Detta använder samma profilsäkra API:er och befintliga migrationer 095/098.
Ingen ytterligare SQL behövs.

Simmaren öppnar dagboken via sin meny eller Min profil. Första versionen
omfattar historik, vecka/månad/termin/egen period, jämförelse med en lika
lång föregående period, veckosammanfattningar, kalender, passdetaljer,
utvecklingsmål, tävlingsresultat och egna reflektioner.

Veckovyn **Så hänger min träning ihop** visar pass, rapporterade simmeter,
RPE, aktiva dagar och fartkänsla sida vid sida. Välj en vecka för att se
underlaget och jämför hela intilliggande veckor. Tävlingsresultat visas
separat; en snabbare tid markeras bara mot tidigare resultat i samma gren
och bassäng inom den hämtade historiken. Det innebär inte automatiskt ett
personligt rekord. Aktuella utvecklingsmål visas som kontext, inte som
historiska mätvärden. Saknade svar räknas inte som noll, och vyn gör inga
påståenden om att träningen orsakat ett visst resultat.

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
Anteckningarna exponeras inte för andra simmare, den vanliga tränarvyn eller
chattassistenterna genom dagboksfunktionen. Ett separat, uttryckligt tillval
i tränarens granskade AI-underlag för utvecklingssamtal kan ta med utvalda
reflektioner; det är avstängt som standard och texterna visas före AI-anropet.
Se [Utvecklingssamtal](development-talks.md). Reflektionerna ersätter inte
kommentarer till tränaren eller svar på ett utvecklingsmål.

## Senare etapp

Dagboken, graferna och anteckningssparandet gör inga AI-anrop. Tränarens
aktiva samtalsförberedelse och förslag till överenskommelse är separata
funktioner med granskning och källval, inte automatisk analys vid läsning.

## Hjälp i dagboken

**Frågor om träningsdagboken** ligger minimerat vid periodväljaren och kan
öppnas även om historiken inte kunde hämtas. Samma nio dagboksfrågor används
i simmarens FAQ och i assistenternas funktionshjälp. Se
[Gemensam funktionshjälp](feature-faq.md).

## Egna träningstider och testlopp

Kör även `supabase/migrations/098_training_swim_times.sql` före driftsättning.
Under **Min träningsdagbok → Mina egna tider → Registrera en tid** kan
simmaren ange datum, valfri distans 1–10 000 m, simsätt, bassäng, tid,
träning/testlopp, start, arm/ben/hel simning, hjälpmedel, tidtagning,
extra förutsättningar och en kommentar. Ett genomfört simpass på samma
datum kan kopplas till tiden. Kopplingen verifieras mot den egna dagboken.

`training_swim_times` är en separat tabell med RLS. Simmaren identifieras
alltid från profilsessionen. Inskickade profil-id:n styr aldrig läsning eller
skrivning för simmare. Ändring och radering filtrerar på både tids-id och profil-id.
Registreringen skapar inga träningspass, simmeter, officiella personbästan
eller PB-poäng. Egna tider jämförs bara när samtliga förutsättningar stämmer;
bästa egna tid avser den valda perioden. Tiderna lagras som heltal i hundradelar.

I tränarvyn finns **Träningstider och testlopp** som ett minimerat kort i
simmarkortet, under styrkeprogrammet. Historiken hämtas först när kortet
öppnas och kan filtreras på period. Alla aktiva personliga tränarkonton får
läsa, lägga till och rätta tider för klubbens aktiva, godkända simmare enligt
klubbens uttryckliga val. Kontostatus och aktuell roll verifieras på servern
vid varje anrop; den gamla delade tränarkoden räcker inte. Tränare får inte
tillgång till privata dagboksreflektioner genom den här funktionen.

Både simmare och tränare kan rätta en tidsregistrering. Simmaren kan också
radera sina egna tider. Sparande, rättning och radering loggas med profil,
tids-id och aktörsroll; för tränare loggas även kontots id. Kopplade pass
behålls när tränaren rättar en tid, men kan kopplas loss. Byter registreringen
datum tas den gamla passkopplingen bort i formuläret. Ingen ytterligare
migration utöver 098 behövs för tränarvyn.

## Tempus-historik

Hämtningen läser både kort- och långbaneresultat med `best_time_only=0`.
Den tidigare kapningen vid 500 resultat per simmare är borttagen. Om Tempus
lämnar nästa sidlänkar följs de inom samma simmares offentliga resultatsida.
Resultat dedupliceras och sparas i batchar. Tidsgräns, sidgräns eller misslyckad
sida markeras som ofullständig hämtning i svaret och synkstatusen.

Återfunna äldre resultat och första importen utlöser inte gamla PB-belöningar.
PB-belöning kräver ett resultat från de senaste 14 dagarna som slår tidigare
sparat bästa och är bäst bland de hämtade tiderna i samma gren/bassäng.
