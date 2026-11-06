# Simkoll Kustrally

En egen implementation av en enkel top-down-circuitracer, inspirerad av spelidén i Rally Loop. Ingen extern spelkod, grafik, iframe, spelmotor eller spårning används. Originalbanor och all grafik skapas i Simkoll. Ingen ny SQL eller nytt npm-paket krävs.

## Var finns det?

- `rally` finns i tränarvyns **Veckans spel → Spelbibliotek → Testa spelet**. Testläge låser upp alla tre banor och gör inga rekord- eller poänganrop.
- Tränaren publicerar en spelperiod via befintlig spelplanering. Inga aktuella perioder ändras eller skapas automatiskt av kodändringen.
- Simmarens aktuella veckospel och spelhistorik öppnar samma komponent med resultatlagring aktiverad.
- Spelet laddas först när det öppnas. Simkolls vanliga sidor behöver inte ladda racingfysik eller grafik.

## Spel och kontroller

Tre originalbanor: Kustslingan, Tallkurvan, Midnattsrundan. Tre varv per race mot tre verkligt simulerade AI-bilar, inte en räknare som bara ger dem en placering. Rivalerna kan passera genom varandra utan att knuffa spelaren. Plats 1–2 låser upp nästa bana. Motståndet ökar något per bana.

Bilen gasar själv. Vänster/höger eller A/D styr; pil ned/S/mellanslag bromsar. Mobilen har separata stora hållknappar med stöd för samtidig styrning och broms. Pointer capture, cancel, lost capture, keyup och fokusförlust släpper kontrollerna. P/pausknappen, flikbyte och fönsterblur pausar. Paus räknar ingen tid. Fullskärm återanvänder Simkolls beprövade native/CSS-fallback med säker stängning, Escape och fokusåtergång.

Gräset bromsar kraftigt; blå boostplattor ger 0,9 sekunders extra fart. Återställning till senaste vägposition kostar tre sekunder men hoppar inte över kontrollpunkter. Tolv ordnade kontrollpunkter krävs per varv; baklängeskörning, teleportering och enbart mållinjekorsning ger inga varv. Efter tre minuter avslutas rundan utan resultat.

`rally-engine.js` har fast fysiksteg på 1/120 sekund. Kraftiga tidsluckor kapas, och flikbyte pausar i komponenten. `rally-art.js` använder exakt samma banpunkter som vägprojektion, boost och fysik. Miljön cachas som en offscreen-canvas per aktuell bana; däckspår är begränsade till 110 per bil. Canvasen anpassas till elementets storlek och högst 2× pixeltäthet. Minskad rörelse tar bort kamerans framåtförskjutning och boostpuls. Ingen blinkande helskärm eller automatisk ljuduppspelning.

## Resultat

Bara färdiga trevarvsrace skickar ett heltalsresultat:

`(bana + 1) × 10000 + (4 − placering) × 1000 + avrundat(999 × (1 − racetid / 180))`

Högre bana väger alltid först, därefter placering, därefter tid. 10 000–33 999 med giltig nivå/placeringsdel godtas; luckorna 14 000–19 999 och 24 000–29 999 avvisas. Det är rallypoäng, inte en rak jämförelse av tider på olika banor. Personbästans bana och placering avgör återupplåsning efter omladdning.

Resultat lagras under egen `game_key=rally` och den autentiserade profilen i befintliga `game_scores`. Bara ett bättre veckobästa ersätter ett tidigare resultat. En egen all-time-lista och den sammanlagda All time-listan inkluderar spelet; ogiltiga historiska rallypoäng filtreras. Existerande dags-/lagpoängregler återanvänds. Vid sparfel visas omförsök, och ett nytt race kräver att man sparar eller uttryckligen väljer att fortsätta utan sparning.

Precis som andra Simkoll-minispel verifierar servern profil och rimligt resultat, inte en kryptografisk uppspelning av körningen. Detta är ett frivilligt minispel, inte ett manipulationssäkert tävlingssystem eller ett mått på simprestation.

## Verifiering

`node --test tests/rally-*.test.mjs` provar banornas geometri, tre fulla varv på samtliga banor, ordnade kontrollpunkter, tidssteg, timeout, gräs/boost/återställning, poängordning/upplåsning, autentisering, bättre personbästa, resultatlistor och publiceringsurval. Webbläsar-QA går via det riktiga spelbiblioteket med syntetiska API-svar, utan ändringar av riktiga spelperioder, profiler eller rekord.
