# Vintertema · Snö

Det befintliga temat **Snö ❄️** (`swimmerTheme: snow`) har en mörk vinterhimmel, mjuka snödrivor, granar och en egen SVG-snögubbe med simglasögon, mössa och halsduk. Simmarnas känslor och räknare ligger framför dekoren; landskapet får en egen nederkant så att inga svar, stjärnor, knappar eller tävlingsbudskap täcks. Inchecknings- och träningskort får ljusa frostiga detaljer och veckokortet en liten vinterkompis. Dekorationerna är inte tränings- eller hälsosignaler och tillför inga poäng eller krav.

De 16 små flingorna använder endast CSS-transformer. Mobil visar högst tio. Snögubben vinkar försiktigt. En IntersectionObserver pausar rörelsen utanför vyn, även när ett annat karusellkort är synligt; dold flik pausar också. Inga bildhämtningar, extra API-anrop, canvasloopar, tidsstyrda nätverksanrop eller AI används.

**Säsongsteman av:** standardvyn, utan vinterdekorationer. **Visuella effekter av:** statisk vinterdekor. **Minskad rörelse i webbläsare/enhet:** inget snöfall eller vinkande, men vinterscenen finns kvar. Dekor är `aria-hidden`, saknar fokus och blockerar inte klick. Halloween och Jul ändras inte. Befintligt temaval används; ingen SQL, nya inställningsnycklar eller automatisk ändring av klubbens val görs.

`winter-qa.html` visar de riktiga vinterkomponenterna med fiktiva känslor och lokala testknappar. `?viewport=mobile` ger en 390-pixelsförhandsvisning. Inga riktiga svar eller inställningar läses eller sparas.
