# Landträningsprogram

Kör `supabase/migrations/111_dryland_program_logs.sql`. Inga nya miljövariabler behövs. Befintliga program med typen `dryland` återanvänds; styrkeprogram och viktloggar lämnas separata.

Simmaren öppnar **Mina landträningsprogram** från menyn eller startsidans tilldelade programkort. Program med 1–5 pass visas med övningar, dosering, instruktioner och eventuella övningsbilder. Simmaren kan markera övningar som genomförda och frivilligt ange repetitioner, tid, sträcka och kommentar. Ett uttryckligt genomförandekryss krävs innan passet sparas. Inga värden fylls i automatiskt och mer/längre belönas inte automatiskt som bättre.

Tränarmenyn har **Landträningsprogram**, samma gemensamma bibliotek, byggverktyg och importgranskning som för styrka. Personliga huvudtränare/superadmin skapar, importerar, ändrar bilder, redigerar och arkiverar landprogram; aktiva vanliga tränare kan tilldela färdiga program individuellt eller till flera valda simmare. Den aktuella kontorollen verifieras i databasen för nya landprogramsåtgärder. Ett program av respektive typ kan tilldelas utan att styrketilldelningen tas bort. Äldre flera samtidiga landtilldelningar går fortsatt att läsa; ny tilldelning ersätter bara aktiva landprogram.

Excel/PDF/bildimport använder samma befintliga AI-modellinställning som styrkeimport, men en landanpassad instruktion och separat användningsetikett. Dokumentet skickas först vid aktivt val av AI-tolkning, och utkastet kräver granskning före sparande. Manuell konstruktion och egna övningsbilder kräver inget AI-anrop. Bilderna använder den befintliga privata övningslagringen och signerade länkar.

## Resultat, dagbok och dubbletter

Landresultat sparas i `dryland_program_logs`, en rad per tilldelning/pass/datum. Datumet kan inte ligga i framtiden. API:t kontrollerar verklig ägare, ej borttagen tilldelning, programtyp, aktuellt pass och övningsnycklar. Snapshot av programtitel, passrubrik och passtext bevarar instruktionerna som gällde vid registreringen. Programversionen kontrolleras även i databasen, så en ändring under sparandet ger konflikt.

Loggen och dagens `personal_training_sessions` sparas i en transaktion. Befintlig unik profil/datum/slot gör att programregistrering, veckoplanering och upprepade sparanden fortfarande ger **ett landpass per dag**, inte styrka eller simmeter. Flera passdelar kan ha separata övningsresultat men räknas inte som flera dagsaktiviteter. Veckomålet för landträning använder samma registrerade pass som tidigare. Inga extra progressionspoäng införs.

Dagboken visar resultaten och kommentarerna; tränaren hittar historiken i landprogrammets uppföljning och simmarkortet. En kvarvarande resultatlogg får inte återställa en manuellt avmarkerad genomförd dag. Då visas resultaten som sparade, men dagen räknas inte som genomförd och läsning skapar ingen närvaro. Ett nytt uttryckligt sparande av genomfört program kan registrera dagen igen.

Ingen ny automatisk AI-analys, videouppladdning eller pushkategori införs. Chattassistenten får hjälpinformation, inte automatisk åtkomst till övningsresultat eller kommentarer. Programbyte och arkivering sparar historiken. Permanent programradering nekas vid registrerad landhistorik; radering av en hel simmarprofil följer befintliga dataraderingsregler.

Verifiera efter publicering: skapa/importera landprogram, tilldela samtidigt med styrkeprogram, spara ett landpass, markera samma dag i veckoplaneringen och kontrollera att dagsantalet inte ökar. Avmarkera sedan genomfört och kontrollera att dagboken behåller resultaten men inte räknar passet.
