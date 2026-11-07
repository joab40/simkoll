# Individuellt betatest av spel

Tränare öppnar **Simmare → visa mer → Betatesta spel**, väljer spel och sparar. Det är en egen minimerad sektion i simmarkortet. Valen laddas först när sektionen öppnas, inte ett API-anrop per simmare på startsidan. Bara aktiva, godkända profiler kan tilldelas spel. Funktionen ändrar inte `is_test_profile` eller tränings-/gruppstatistik.

Den inloggade simmarens startsida visar **Prova nya spel** separat från veckans publicerade spel och spelhistoriken. Listan kommer från befintligt `GET /api/points?games=true`; servern använder autentiserad sessionsprofil, aldrig ett klientvalt profil-ID. Betatest kör befintliga spel med `preview`, så testresultat och spelpoäng inte sparas. En betapanel kontrollerar aktuell tilldelning igen innan den monterar spelet. Rallyghost är enbart i minnet i preview och blandas inte med spelarens vanliga ghost.

Tränaren återkallar tillgång genom att avmarkera och spara. Detta påverkar varken vanlig publicering eller befintliga rekord. En testomgång som redan är öppen kan slutföras; tilldelningen kontrolleras vid nästa öppning. Spelens källkod är inte hemlig eller skyddad med betatilldelningen — detta styr personlig förhandstillgång i appen, inte DRM.

## Lagring och behörighet

Ingen migration behövs. En egen rad per profil i befintliga `app_settings` används:

- `setting_key = game_beta:<profile UUID>`
- `setting_value = { games: [gameKey, ...], revision: <UUID> }`

`game_schedule` skrivs aldrig av betafunktionen. Sparandet godtar bara kända spel och validerat UUID. Separata rader isolerar simmare. Revisionen kontrolleras både före och i den atomiska PATCH-frågan; första skapandet använder insert-on-conflict-do-nothing och kontrollerar att en rad faktiskt skapats. Stale val eller samtidiga skrivningar ger 409, inte tyst överskrivning. Fel visas i UI med möjlighet att hämta aktuella val. Tom spellista är en giltig återkallelse.

`GET /api/points?gameBetaProfileId=<UUID>` och `POST { action: 'save-game-beta', profileId, games, revision }` kräver tränarbehörighet. Simmarsvar innehåller enbart egna tilldelade spel, inte profiler eller andra simmares tilldelningar. Inaktiva/ej godkända profiler kommer inte igenom `getSessionProfile`. Vid profilradering tas just den profilens betarad bort; befintlig arkiveringsfallback kvarstår. Inga pushmeddelanden, verkliga tilldelningar eller publiceringsperioder skapas automatiskt av denna release.

## Verifiering

API-tester täcker tilldelning/återkallelse, sessionsisolering, okänd/avstängd profil, okända spel, obehöriga anrop, samtidiga skrivningar och DB-fel. UI testas lokalt med syntetiska svar; inga verkliga simmare tilldelas spel under QA.
