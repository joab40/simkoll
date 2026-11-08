# Simkoll Kustrally

En egen implementation av en enkel top-down-circuitracer, inspirerad av spelidén i Rally Loop. Ingen extern spelkod, grafik, iframe, spelmotor eller spårning används. Originalbanor och all grafik skapas i Simkoll. Veckans delade ghost kräver SQL 116 och tidsrankingen kräver SQL 117; inget nytt npm-paket krävs i appen.

## Var finns det?

- `rally` finns i tränarvyns **Veckans spel → Spelbibliotek → Testa spelet**. Testläge gör inga rekord- eller poänganrop och sparar en eventuell testghost enbart i komponentens minne.
- Tränaren publicerar en spelperiod via befintlig spelplanering. Inga aktuella perioder ändras eller skapas automatiskt av kodändringen.
- Simmarens aktuella veckospel och spelhistorik öppnar samma komponent med resultatlagring aktiverad.
- Spelet laddas först när det öppnas. Simkolls vanliga sidor behöver inte ladda racingfysik eller grafik.

## Spel och kontroller

En originalbana: en kortare, hinderfri Kustslinga på cirka 2 195 spelvärldsenheter. Elva ankarpunkter binds ihop med en periodisk kubisk B-spline (kontinuerlig krökning) och 48 delpunkter per segment. Interpolerade tangenter mjukar även upp körspår, kerbs och återställningsriktning. Tre varv per race mot tre verkligt simulerade AI-bilar, inte en räknare som bara ger dem en placering. Rivalerna kan passera genom varandra utan att knuffa spelaren.

Bilen gasar själv. Vänster/höger eller A/D styr. Ingen bromsknapp eller tangent för broms finns; spelarens fysik ignorerar gamla broms-/hastighetsparametrar. Mobilen har två stora hållknappar. Pointer capture, cancel, lost capture, keyup och fokusförlust släpper kontrollerna. P/pausknappen, flikbyte och fönsterblur pausar. Paus räknar ingen tid. Fullskärm återanvänder Simkolls beprövade native/CSS-fallback med säker stängning, Escape och fokusåtergång.

På styrningsytan (även mellan knapparna) motverkar `rally-touch.js` Safaris långtryck, markering, dubbeltryckszoom, touchrörelser och flerfingergester via lokala capture-lyssnare med `passive:false`. Knapptexten är inte ett separat pointermål och har eget ärvt markerings-/calloutskydd. Pointer events är fortfarande enda källan för körriktningen; ett sista touchsläpp eller touchcancel släpper dessutom styrningen som säkerhetsnät. Ett finger kan lyftas utan att släppa en kvarvarande styrtumme. Inga globala gestlyssnare eller ändringar av viewport/maximum-scale/user-scalable används. Zoom och vanlig touch utanför styrningsytan lämnas orörda. Automat-/datorwebbläsartester kan inte garantera beteendet för iOS-systemgester; slutlig Safari-iPhone-kontroll kräver en riktig enhet.

Gräset bromsar kraftigt; blå boostplattor ger 0,9 sekunders extra fart. Tolv ordnade kontrollpunkter krävs per varv. Tidigare kunde en kurva utanför den snäva vägtoleransen tyst missa en kontrollpunkt. Varvräkning använder nu en bredare korridor (vägens halva bredd + 100 enheter), medan fart/gräs/boost fortfarande följer den faktiska vägkanten. Baklängeskörning, teleportering och enbart mållinjekorsning ger inga varv. Stora otillåtna kontrollpunktsgenvägar flaggas; återställning placerar då bilen 24 enheter före just den missade kontrollpunkten. Den kostar tre sekunder men tilldelar inga kontrollpunkter. Efter tre minuter avslutas rundan utan resultat.

**Börja om** finns i verktygsraden även under nedräkning, lopp och paus. Den skapar ett helt nytt spel, släpper alla tangenter/pekare, återställer tid/varv/replay och startar en ny nedräkning. En körningsräknare startar om RAF-loopen så att gammal frame-tid inte följer med. Bästa ghost och visningsval finns kvar, även i fullskärm. Pågående resultatsparning och olösta sparfel blockerar omstart som tidigare; sparfelets uttryckliga alternativ för att fortsätta utan sparning används först.

`rally-engine.js` har fast fysiksteg på 1/120 sekund. Kraftiga tidsluckor kapas, och flikbyte pausar i komponenten. `rally-art.js` använder exakt samma banpunkter som vägprojektion, boost och fysik. Miljön cachas som en offscreen-canvas per aktuell bana; däckspår är begränsade till 110 per bil. Canvasen anpassas till elementets storlek och högst 2× pixeltäthet. Minskad rörelse tar bort kamerans framåtförskjutning och boostpuls. Ingen blinkande helskärm eller automatisk ljuduppspelning.

## Tidsranking och All time (3.112.0)

Kustrallys nya gränssnitt visar **trevarvstid**, inte placeringsbaserade poäng. Servern validerar en fullständig replay med samma kontroll som för veckoghosten och sparar exakt millisekundtid i `rally_times`. Placering mot datorbilarna visas som spelinformation men påverkar inte tidslistan. Varje simmares snabbaste tid ger en plats: etta 10 rankingpoäng, tvåa 9, ned till 1 för tiondeplatsen i den gemensamma All time-listan. Bara ett rallybidrag per simmare räknas. All time använder inte de gamla rallypoängen parallellt. Övriga spel behåller sin rangordning.

SQL 117 körs **efter 116**, i en transaktion. Den säkerhetskopierar samtliga gamla `game_scores`-rader för rally till privata `rally_score_backup` och konverterar de giltiga resultatens tidsdel till uppskattade millisekunder. `game_scores` och alla `point_events`/belöningar lämnas orörda. Ingen separat poängarkivlista visas i det nya gränssnittet. Den gamla poäng-API-vägen finns kvar för klienter som var öppna under uppdateringen; nya klienter använder `game=rally&time=true` och `submit-rally-time`.

För en gammal poäng `s` beräknas `round(180000 × (999 − s % 1000) / 999)`. Ban- och placeringsbonus tas bort. Det är **inte en återfunnen originaltid**: poängen avrundade tidsdelen till cirka 180 ms-steg, med cirka ±90 ms osäkerhet. Tiden märks `≈` och källan `converted`. Resultat som inte kan ge en giltig positiv tid visas inte, men säkerhetskopieras. Tidigare sparade poäng kan ha valt ett långsammare lopp med bättre placering; förlorade, aldrig sparade försök kan inte återskapas.

Gamla poäng har inget säkert banversions-ID. De behålls under `legacy-stage-0/1/2`, märks **Äldre bana** och följer, enligt önskat historikbevarande, med i den sammanlagda tidsrankingen. Banorna kan skilja sig från dagens bana; detta förklaras under Så räknas tiderna och i FAQ. Inget äldre resultat ges dagens banversions-ID på gissning. Serverghosts har däremot både rätt version och exakt tid och kopieras in som `recorded`. När en egen originaltid och en uppskattning faller i samma gamla avrundningsintervall föredras originaltiden. En tydligt snabbare historisk uppskattning bevaras som uppskattning.

En sparad egen lokal ghost kan återställa en bättre originaltid via `restore-rally-time` när simmaren öppnar spelet. Replays valideras på servern; profilen kommer endast från autentiserad session. Återhämtning lagrar `recovered`, utan påhittat ursprungligt datum (`achieved_at = null`), ger inga aktivitetspoäng och publicerar ingen veckoghost. Ett misslyckat återställningsanrop stoppar inte spelet och kan provas igen med Uppdatera tidslistan. Preview/betatester varken hämtar eller sparar/återställer rekord. Endast aktuell validerad banversion kan återställas från webbläsaren.

`rally_times` behåller en bästa tid per profil/banversion, inte varje försök eller replay. En SQL-RPC skyddar ett snabbare rekord mot långsammare samtidiga försök. `last_played_at` uppdateras för riktiga nya lopp även utan personbästa, för befintlig månadsbonus. Återhämtning uppdaterar inte deltagande. Vanliga riktiga lopp ger fortsatt samma idempotenta dagliga `game_played`-poäng, och månadsbonus räknar unika deltagare från gammal spelhistorik och nya tider tillsammans. Migreringen ger inga retroaktiva belöningar.

RLS/privilegier skyddar både tider och säkerhetskopia; bara service role har åtkomst. Profilradering tar även bort profilens tider och backup. Ledarlistan filtrerar inaktiva, ej godkända och testprofiler, väljer ett personbästa per simmare och använder stabil tid/datum/profil-sortering vid lika tid. Misslyckad hämtning ersätts inte tyst med en poänglista. Nya tidsinspelningar har egna spar-/återförsökskontroller och skickar inte poäng till `game_scores`.

## Äldre poängformat (endast kompatibilitet och konvertering)

Bara färdiga trevarvsrace skickar ett heltalsresultat:

`(bana + 1) × 10000 + (4 − placering) × 1000 + avrundat(999 × (1 − racetid / 180))`

Äldre klienter använder bana 0: placering vägde före tid. Formatet 10 000–33 999 med giltig nivå/placeringsdel behålls i kompatibilitetskoden för att kunna läsa äldre resultat. Luckorna 14 000–19 999 och 24 000–29 999 avvisas. Gamla råpoäng ändras inte. Nya tidslistan och dess All time-bidrag använder enbart tider enligt ovan.

Kompatibilitetsresultat lagras under `game_key=rally` i befintliga `game_scores`. Ny kod skriver inte hit för nya tidsrekord. En redan öppen äldre klient kan fortfarande spara sitt gamla format; servern tar samtidigt tillvara tidsdelen som en tydligt märkt uppskattning. Vid sparfel i det nya spelet visas omförsök för exakt den avslutade replayen; nytt race kräver att man sparar eller uttryckligen fortsätter utan sparning.

Precis som andra Simkoll-minispel verifierar servern profil och rimligt resultat, inte en kryptografisk uppspelning av körningen. Detta är ett frivilligt minispel, inte ett manipulationssäkert tävlingssystem eller ett mått på simprestation.

## Ghostbil

Den ljusblå, genomskinliga bilen spelar upp den egna snabbaste **hela trevarvskörningen**, oavsett placering. Den deltar aldrig i fysik, hinder, placering, varvräkning eller poäng. En kryssruta visar/döljer den. En ny ghost börjar användas först i nästa race, inte mitt i pågående körning.

Position och riktning registreras var 50:e millisekund av racetiden, inte väggklockan. Vinklar interpoleras längs kortaste rotationen. Start och målgång fångas exakt; återställningens tresekundersstraff och teleportering markeras utan att rita en färd genom terrängen. Bara genomförda lopp kan ge en ghost, och bara en snabbare tid ersätter den. Max 4 000 bildrutor och 180 sekunder; lagrade replays valideras avseende versions-ID, storlek, ändliga koordinater, ordning och start-/sluttid.

Ghosten lagras i `localStorage` under `simkoll:rally-ghost:<profileId>`. Profil-ID skickas från den riktiga simmarvyn (komponenten remonteras vid profilbyte); inga authkoder, namn eller träningsdata sparas. Den fungerar över omladdning i samma webbläsare, **inte mellan enheter**. Preview varken läser eller skriver lagrade ghosts. Blockerad/full lagring bryter inte spelet eller poängsparandet: ghosten lever då i minnet och UI förklarar begränsningen. Ändrad bana/fysik får nytt replay-versions-ID, nu `kustslingan-3`. En gammal poäng kan inte återskapas som ghost utan en inspelad körning. För den nya banan behöver en första körning spelas in; gamla poäng raderas inte.

## Veckans snabbaste ghost (3.111.0)

När Kustrally är det publicerade, aktuella veckospelet kan simmarna också visa en **guldfärgad veckoghost** med ledarens visningsnamn och snabbaste trevarvstid. Egen ljusblå ghost och veckans ghost kan slås på/av oberoende. Båda är visuella återspelningar utan kollisioner eller påverkan på placering. Snabbaste tid avgör, inte rallypoäng. Vid lika tid behålls först uppnådd tid, därefter profil-ID för stabil sortering. Ingen spelperiod skapas eller ändras automatiskt.

Kalenderveckan är måndag–söndag i `Europe/Stockholm`. API:t väljer veckan och aktuell banversion; klienten kan inte backdatera uppladdningar eller publicera äldre lokala personbästan. Ett lopp som passerar veckoskiftet delas inte med den nya veckan. Bara den faktiskt nyss avslutade körningen skickas, även om ett äldre lokalt personbästa var snabbare. Den egna ghosten förblir lokal och oförändrad. En gammal poäng utan inspelning går inte att återskapa.

`GET /api/points?rallyGhost=true` och POST-åtgärden `submit-rally-ghost` kräver simmarkod och giltig aktiv/godkänd profilsession. Servern tar profil-ID från sessionen, inte från begärans data. Tränarpreview och simmarbetatest använder `preview` och gör inga ghostanrop alls. Testprofiler kan inte delta i den gemensamma utmaningen. När rally inte är aktuellt publicerat veckospel returneras inaktiv utmaning; inga gamla ghosts hämtas som ersättning. Samma prioritering av överlappande spelperioder används som på simmarens startsida.

SQL 116 skapar privat `rally_weekly_ghosts` med **en bästa körning per profil/vecka/banversion**, inte varje försök. Atomic RPC `keep_weekly_rally_ghost` ersätter bara strikt långsammare tid, så parallella flikar kan inte skriva över ett snabbare rekord. RLS och privilegier tillåter endast serverns service role. Profilradering raderar tillhörande replays. Inaktiva, ej godkända och testprofiler filtreras bort vid ledarhämtning. Lagringen omfattar endast profilkoppling, veckostart, banversion, racetid, positioner/riktningar och uppnådd-tid. Namn/emoji hämtas från samma profilfält som befintlig rekordlista; ingen tränings-/hälsodata eller authkod lagras i replayen.

Servern kontrollerar version, ändliga värden, max 4 000 bildrutor/180 sekunder/250 kB, rätt startposition, rimlig hastighet och sampling, betalda tresekundersteleporter samt 36 ordnade kontrollpunkter. Det är en rimlighetskontroll av ett klientspel, inte manipulationssäker fysisk simulering. Maxstorleken gäller endast replay; typiska trevarvslopp är betydligt mindre. SQL har ytterligare format-/storleksvillkor.

Ghosten hämtas när spelet öppnas och inför varje nytt lopp. Den fryses för hela loppet, även under paus; ett nytt svar eller sparat rekord ändrar bara underlaget för nästa start. Ingen realtidspollning. Separat uppladdning ger inga extra spelpoäng och ett fel stoppar inte vanlig tidssparning. Ghostanrop har åtta sekunders timeout; därefter kan man spela vidare utan veckoghost. Delningsfel visas i ghostkortet med eget återförsök. Ett misslyckat äldre försök kan behållas framför en långsammare ny körning samma vecka. FAQ och båda assistenternas gemensamma funktionsguide beskriver funktionen.

## Verifiering

`node --test tests/rally-*.test.mjs` provar banans geometri och mjuka tangenter (även startskarven), tre fulla varv på fem olika spår inklusive båda vägkanterna och breda gräskurvor, ordnade kontrollpunkter, flaggad genväg och återgång, ren omstart, tidssteg, timeout, gräs/boost/återställning, poängordning, autentisering, bättre personbästa, resultatlistor och publiceringsurval. Replay-tester täcker inspelning, interpolation, paus, teleportering, snabbare/slöare lopp, profilseparering, omladdning och blockerad/korrupt lagring. Veckoghosttesterna täcker sessionsidentitet, publiceringsurval/testisolering, tom vecka, datum/årsskifte/sommartid, gamla banor, falska lopp och separata nätfel. Valfri PostgreSQL-körning via `SIMKOLL_SQL_TEST_MODULE` verifierar SQL 116:s idempotens, villkorade UPSERT, rättigheter och profilradering. Webbläsar-QA använder syntetiska data utan ändringar av riktiga spelperioder, profiler eller rekord.
