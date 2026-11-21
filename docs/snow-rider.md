# Snow Rider 3D · Frostfjäll

Ett eget procedurgenererat 3D-vinterspel i React/React Three Fiber och Three.js.
Inga modeller, ljud, bilder eller källkod från Snow Rider/360 PlayZone används.
Banans geometri, pulkan, åkaren, granarna och övriga hinder byggs av egna
geometriska former. Grafiken laddas först när spelet öppnas, inte på startsidan.

## Prova i Simkoll

- Tränare: **Veckans spel → Spelbibliotek → Snow Rider 3D → Testa spelet**.
- Enskild simmare: tränaren tilldelar Snow Rider under **Betatesta spel** i
  simmarkortet. Simmaren öppnar det under **Prova nya spel**.
- Publicering för alla kräver en uttryckligen sparad spelperiod. Spelet läggs
  inte till i standardpubliceringen och inga riktiga betatilldelningar görs av
  kodändringen.

Ingen SQL-migration behövs. Spelet använder befintliga `game_scores` och
spel-/betainställningar. I tränar-/betatest används `preview`: inga anrop för
topplistor eller sparande, inga poäng och inga localStorage-rekord. Bästa
testresultatet finns bara i komponentens minne.

## Första versionens regler

Styr vänster/höger med piltangenter eller A/D. Hoppa med mellanslag/uppåtpil/W
eller mobilens hoppknapp. Tryck/håll vänster/höger på mobilen; flera pekare kan
styras oberoende. P pausar/fortsätter. Paus nollställer hållna knappar och
väntande hopp. Synlighetsbyte, fönsterblur och längre renderingsuppehåll
pausar åket. Fullskärm använder native-läge eller CSS-fallback och kan lämnas
med Stäng/Escape. Kroppens scroll återställs när fullskärm avslutas.

Åket varar högst 120 sekunder, om inte en krock avslutar tidigare. Farten ökar
från 18 m/s (cirka 65 km/h) med 0,085 m/s per sekund. Låga stockar/stenar kan
hoppas över; granar behöver undvikas. En spelmeter ger 1 poäng, en kristall 25.
Alla åk använder samma deterministiska bana. Stegvis fysik på 1/120 s hindrar
skillnader mellan vanliga skärmuppdateringar och tunnling genom hinder.

I publicerat läge sparas bästa resultat per svensk kalendervecka och simmare.
Listan visar veckans tio bästa. En sämre runda skriver inte över ett bättre
resultat. Simkolls samlade spelranking kan också inkludera spelet. Resultaten
ger **inga** nivå-/träningspoäng, dagspoäng, gruppbonus, aktivitetsdagar,
träningsmeter eller närvaro. Klientens profil-id används aldrig för ägarskap;
servern hämtar sessionsprofilen. Intervallet 1–10 000 kontrolleras vid sparande
och läsning. Detta är enkel rimlighetskontroll, inte serververifierad anti-cheat.

## Mobil och grafik

Skärmen har stora touchknappar och anpassas till mobilbredd. DPR begränsas
till 1–1,5, repetitiva objekt återanvänds och scenen har inga externa texturer.
Snöeffekter kan stängas av och är av från början vid minskad rörelse. En
stillastående/pausad scen renderas bara vid behov. WebGL2-stöd krävs; om
grafikstart eller grafikminne fallerar pausas spelet med återstartsmöjlighet,
inte ett osynligt pågående åk. Grafik-/fysikloopar och fullskärm städas vid
avmontering. Prestanda behöver fortfarande provas på riktiga äldre telefoner.

## Lokal verifiering

`snow-rider-qa.html` kör samma komponent i preview utan serveranrop.
`?width=390` och `?width=320` visar den i en smal iframe. Tester i
`tests/snow-rider*.test.mjs` täcker fysik, paus, hopp, kollision, FPS,
resultatgränser, sessionsägarskap, publicering och oförändrade träningspoäng.
