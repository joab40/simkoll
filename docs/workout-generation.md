# Passförslag med valbar variation

I **Lägg upp ett pass → Skapa passförslag** väljer tränaren variation med ett reglage i fem steg. Balanserat är förvalt:

1. **Biblioteksnära:** återanvänd befintliga serier; anpassa främst mängd och intervall.
2. **Försiktig variation:** behåll en tydlig stomme, gör mindre förändringar.
3. **Balanserat:** kombinera bibliotekets idéer med några nya variationer.
4. **Mer variation:** tillåt fler nya serier och en ny ordning.
5. **Nytänkande:** ett friare upplägg; biblioteket är en referens, inte en mall.

Reglaget byter instruktioner, inte språkmodell. Vald inriktning, distans, tid, mål-RPE och gruppnivå gäller oavsett läge. Saknade betyg är okända och RPE används för belastningsmatchning, inte som ett kvalitetsbetyg. Om AI:n anger att kraven inte kan uppfyllas ändras inte utkastet.

## Modell och underlag

- Responses API, `gpt-6.1-sol`, `medium` reasoning och strikt JSON-schema.
- Befintlig `OPENAI_API_KEY` återanvänds. Inga nya obligatoriska miljövariabler eller SQL.
- Valfri `OPENAI_WORKOUT_GENERATION_MODEL` ändrar enbart denna funktion; tävlingsimportens modell påverkar den inte.
- Högst åtta bibliotekspass med rubrik, innehåll, inriktning, mängd, tidsåtgång och aggregerat passbetyg/RPE samt formulärets val och önskemål skickas. Inga simmarprofiler eller enskilda svar läggs till.
- Biblioteksreferensernas titlar hämtas från underlaget, inte från AI-genererade titlar. AI anger vilka referenser den använt och beskriver nytt/anpassat separat. Detta är modellens redovisning, inte en automatisk plagiat-/ursprungskontroll.
- `store: false`, 180 sekunders timeout. Ofärdiga, vägrade, oläsbara eller felaktiga svar används inte som utkast. Ingen tyst reservmodell. Tokenanvändning loggas även vid ofärdiga svar.

Enbart generering gör ingen publicering eller ändring av träningsplaneringen. Tränaren måste granska seriernas summering, nivå, tider och intervall och spara/publicera uttryckligen. JSON-valideringen kontrollerar metadata men kan inte garantera att varje fri textserie summerar rätt. Klubbens AI-avstängning och tokenbudget gäller som tidigare. Att flytta reglaget gör inget AI-anrop.

## Verifiering

`node --test tests/workout-generation*.test.mjs` testar samtliga lägen, fasta krav, modellval, felhantering, källreferenser, tokenloggning och coachbehörighet utan externa AI-anrop.
