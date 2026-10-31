# Simmarens toppmeny

Datormenyn visar tre primära genvägar: Veckoplanering, Min träningsdagbok
och Mina mål. Mer samlar styrka, landträning, grenar, pepp, FAQ och villkor.
Profilknappen ligger separat, med kortat långt namn och fullständigt
tillgängligt namn. Inga funktioner har tagits bort och inga rättigheter ändrats.

Vid högst 1 100 px används Meny. Alla länkar exponeras i en enda navigation;
desktop och mobil delar samma knappar, utan dubblerade dolda länkar.
På de smalaste skärmarna (högst 500 px) visas en kolumn så långa etiketter
inte behöver delas mitt i ord. Brand och menyknapp hålls på samma rad.

Mer öppnas med klick/tangentbord, inte enbart hovring. Escape stänger och
återför fokus till rätt knapp. Klick utanför, fokus som lämnar Mer och vald
länk stänger också. Växling över brytpunkten återställer menyn. Tab-ordningen
följer visuell ordning. Assistentknappen och länkarna använder de befintliga
återanropen från Shell. Tränarens header påverkas inte.

`shared/swimmer-navigation.js` innehåller destinationer och profil-/planfilter.
`src/swimmer-header.jsx` och dess egna stilmall hanterar layout och beteende.
FAQ/assistenthjälp i `shared/feature-faq.js` beskriver den nya menyvägen.
Tester finns i `tests/swimmer-header.test.mjs`. Ingen SQL eller ny inställning.
