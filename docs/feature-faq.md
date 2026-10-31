# Gemensam funktionshjälp

Uppdaterad 2026-10-31. `shared/feature-faq.js` är den gemensamma källan för
nya funktionsfrågor i tränarens FAQ, simmarens FAQ, den utfällbara hjälpen
**Frågor om träningsdagboken** och båda chattassistenternas funktionsunderlag.
Rollfiltrering håller tränarverktyg borta från simmarens instruktioner.
Gemensamma frågor kan ha separata, kompletterande tränarsvar.

Ämnena täcker incheckning/styrka, aktuell och nästa vecka, alternativa pass,
dagbokens helhetsbild, rapporterad/uppskattad mängd, äldre historik, reflektioner,
testlopp/resultat, sömntrend/varningar, program och video, utvecklingssamtal,
AI-förberedelse och överenskommelse, privata svar, push, tävlings-PM/CSV,
kontrollpanel/signaler, passförslag/förhandsgranskning, Drive-flikar,
SportAdmin-kopplingar, lagring och spel. Äldre begrepp, konton och integritet
finns kvar i FAQ-vyn. Sömnskalan visar nu de verkliga valen Dålig/Okej/Bra.

Hjälpen medför **inte** några nya läsbehörigheter för chattassistenten.
Sömnposter, privata reflektioner, testlopp, videoinnehåll och interna
tränaranteckningar läses inte in bara för att funktionen finns dokumenterad.
Tränarens granskade AI-underlag inför samtal är en separat funktion, med
uttryckliga källval. Inga nya databasmigrationer, miljövariabler eller
modelländringar behövs. Att läsa FAQ eller dagbokshjälp gör inga AI-anrop.

Vid nya funktioner: uppdatera relevant post och roll, kontrollera fakta mot
implementationen och utöka regressionstesterna. `featureFaqGuide` formaterar
samma svar som UI:t för assistenterna; inget särskilt FAQ-index behöver byggas
om och ingen omträning krävs. Ändringen börjar gälla vid nästa publicering.

Tester i `feature-faq.test.mjs` verifierar rollfilter, diary-urval, nyckelregler
och gemensamma svar. `assistant-feature-faq-api.test.mjs` kör båda verkliga
assistentflödena mot en simulerad modell, inspekterar begäran och kontrollerar
att inga privata datakällor eller skrivflöden lagts till. Inga externa AI-anrop
görs i testerna.
