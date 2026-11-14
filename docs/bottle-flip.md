# Bottle Flip · Poolside

Ett eget Simkoll-spel med håll–släpp-mekanik, inspirerat av den generella bottle-flip-idén i användarens referens: https://360playzone.com/play/bottle-flip. Ingen källkod, grafik, ljud, iframe eller extern spelserver från referensen används. Originalgrafik ritas i canvas: Simkoll-flaska, poolterrass, bänkar och utrustningslådor. Inga nya beroenden, annonser, spårningsskript eller AI-anrop.

## Hitta och testa

**Tränare → Veckans spel → Bottle Flip · Poolside → Testa spelet.** Samma spel kan tilldelas som individuellt betatest. Tränartest och beta använder `preview`: inga topplistor hämtas och inga rekord/poäng sparas. Ett tillfälligt testbästa finns bara i komponentens minne.

Spelet är tillagt i biblioteket, inte automatiskt publicerat eller valt i stället för nuvarande veckospel. Planera/publicera det via befintlig spelplanering. Ny publicering följer samma veckospel-/arkivregler som övriga spel.

## Spela

- Håll fingret/musknappen på spelbilden eller kraftknappen och släpp för att kasta. Mellanslag/uppåtpil/W fungerar också. P pausar; pausknapp finns.
- Tre flaskor. En miss förbrukar en flaska och återställer till senast klarade plattform. Längsta runda två minuter eller 80 landningar.
- 10 poäng per landning. Mittmarkering ger svitbonus +5, +10, +15, sedan +20. Att hoppa över en plattform ger ytterligare +10. En vanlig landning/miss bryter sviten.
- Samma deterministiska bana för alla. Smalare och mer varierande plattformar längre fram. Exakta kollisionsögonblick, inte bildrutebaserad chans.
- Sidbyte/bakgrund eller tappat fönsterfokus pausar. Avbruten pekgest kastar inte av misstag. Paus avbryter pågående uppladdning men behåller en pågående flygning för fortsättning. Ingen animation körs i vänteläge/paus/avslutad runda. Minskad rörelse stänger av dekorativa partiklar; själva spelrörelsen behövs för att spela.
- Fullskärm använder befintligt stöd för element-fullskärm med mobilanpassad fallback, stängknapp, Escape och återställd sidrullning.

## Rekord och data

Egen spelnyckel `bottleflip` i befintliga `game_scores`. Ingen ny SQL behövs: `game_key` är fri text och poängkolumnen rymmer intervallet. API:t godtar positiva heltal upp till 3 200 (80 × högst 40 poäng). Som i andra spel är detta en rimlighetskontroll, inte serververifierad fysik eller fuskfri ranking.

Endast ett avslutat positivt resultat skickas; nollresultat sparas inte. Sessionsprofilen bestämmer ägare, inte klientvalt profil-ID. Veckorekord förbättras bara av högre poäng, och spelet visar personbästa/topplista genom tiderna. Bottle Flip bidrar till befintlig gemensam All time-ranking. Omöjliga historiska poäng filtreras bort. Befintliga regler för deltagarpoäng/lagbonus återanvänds; träningsdata påverkas inte.

Nätfel lämnar resultatet kvar i minnet med återförsök eller ett uttryckligt val att spela utan att spara. Det står inte ”sparat” vid fel. En försenad ursprunglig topplistehämtning får inte skriva över ett nytt sparresultat. Inga riktiga konton, tilldelningar eller publiceringar används under lokal QA.

## Verifiering

`node --test tests/*.test.mjs` och `node node_modules/vite/bin/vite.js build --configLoader runner`.

Lokalt, fristående: `/bottle-flip-qa.html` (fiktivt preview, noll API-anrop). `?viewport=mobile` visar 390 px. `?scenario=save-error` använder enbart lokala mocks för hämtning och misslyckat sparande; växla felet för återförsök. Inte kopplat till databasen.
