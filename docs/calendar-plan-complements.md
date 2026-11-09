# Grundplanering kompletterad av publicerat simpass · 3.114.0

En grundplan och en redan publicerad passkoppling till samma uttryckliga SportAdmin-aktivitet ska inte bli två träningspass. Regeln är en läsprojektion, inte databasstädning: inga grundplaner raderas, skrivs över eller kopplas om i databasen. Ingen ny SQL eller AI behövs.

`shared/calendar-plan-complements.js` används för både API-/databasfält och frontendfält. En simgrundplan utan `source_workout_id` kan kompletteras av planeringsrader med ett befintligt publicerat pass. Följande krävs:

- Båda är simning med samma datum och en uttrycklig kalenderkoppling (`mode: linked`).
- Kalenderidentiteterna överlappar; samma starttid är giltig och känd. En uttryckligt avvikande plats eller datum stoppar matchning.
- Berörda grupper överlappar. Vid delvis täckning finns grundplanen kvar för återstående grupper. En plan för alla grupper försvinner inte på grund av en publicering för bara en grupp.
- Ingen rad har en explicit `detachedWorkoutId`. Kalenderläge Ingen koppling och automatiska/okända kopplingar används inte av denna regel.

Rubrik, fokus, distans och importens alternativa grupp-ID kan skilja sig. Det publicerade uppläggets mängd styr när det finns ett riktigt pass. Genuina publicerade passalternativ finns kvar; de adderas inte och utan valt upplägg hittas ingen distans på.

Tränarens veckoplanering och simmarens planering använder projektionen. Originalplanen finns under `PlanningFoundation` på huvudkortet och kan redigeras med original-ID och originalgrupper. Att ändra en delvis täckt plan får inte oavsiktligt skriva bort grupper som täckts av publikationen.

Passval, träningstillfällen vid import, dagbok, periodisering, passmetrik, uppskattad tid i träningshjärtat och veckorapport använder samma projektion via sina gemensamma hjälpare. Grundplanen skapar därför inte en falsk extra passkandidat. Historiska efterrapporter med en uttrycklig `plan:<original-id>`-referens får fortfarande sitt ursprungliga planunderlag, inte automatiskt det senare publicerade passets mängd. Inga gamla svar ändras.

Testerna täcker olika rubriker/import-ID, samma eller ändrade meter, tids-/datum-/kalender-/gruppkonflikter, saknad publikation, frikoppling, delvis grupppublicering, verkliga alternativ, historiska val, dagbok/periodisering/hjärtats tid och 3 500 m en gång i stället för 7 000 m. Kalender-ID tas med i de begränsade underlagen för hjärta och veckorapport så att dessa kan använda samma säkra matchning.
