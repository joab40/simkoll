# Färgton i Din nivå (3.112.1)

`RewardLevelCard` är den gemensamma presentationen för stort startsideskort och kompakt nivåkort. `RewardCard` i huvudappen behåller sin tidigare styrning av belöningsfirande och navigering till peppflödet. Inga API-anrop, poängregler, nivågränser eller SQL ändras.

`reward-level-theme.js` matchar aktuell nivåemoji, oberoende av namn och poängtal. Grundnivåerna får koppar/brons, silver, guld respektive diamantblått. Vanliga färgsymboler har motsvarande palett; okända eller felaktiga värden får en neutral mintton. Paletterna är avsiktligt valda pasteller, inte pixelavläsning av operativsystemets emojigrafik. Endast kontrollerade färgvärden används som lokala CSS-variabler. Egna namn/emojis blir aldrig CSS eller externa bildförfrågningar.

Gradient, kantlinje, medaljram och stapelbakgrund följer paletten. Texten är mörk och stapelns fyllning behåller Simkolls teal. Namn/emoji och text finns kvar så att färgen inte är enda informationen. Huvudtext, liten text och etikett är testade för minst 4,5:1 kontrast över paletternas bakgrundstoner. Ingen animation, extra lagring eller nätverkstrafik införs. Stapeln har nu även semantisk progressbar med tillgängligt namn och värde.

`node --test tests/reward-level-theme.test.mjs` kontrollerar standardnivåer, egna symboler, säker neutral reserv, färgkontrast och inkoppling i båda kortvarianterna. Lokal webbläsar-QA använder enbart exempeldata och testar nivåbyte, peppknapp, kompakt/stort kort, högsta nivå samt mobil- och datorbredd. FAQ och båda assistenternas gemensamma funktionsguide förklarar färgerna.
