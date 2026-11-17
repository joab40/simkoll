# Privat dialog om appfeedback

Kör `supabase/migrations/130_app_feedback_dialog.sql` före publicering.
Ingen produktions-SQL körs automatiskt av appändringen.

## Flöde

- Ursprungliga förslag, betyg, statusar och interna kommentarer behålls.
- Befintliga skickade `admin_reply` kopieras en gång till dialoghistoriken,
  med ursprunglig tid. Gamla privata meddelanden raderas eller skickas inte om.
- Nya följdsvar sparas i en egen dialog per förslag, inte i tränarnas gemensamma
  privata inkorg. Det finns ingen gräns på ett svar. Varje meddelande har högst
  1000 tecken; högst 10 nya meddelanden per avsändare och minut skyddar mot spam.
- Simmaren får ett kort direkt under ”Hur kan vi göra Simkoll bättre?” när det finns olästa svar.
  Därifrån öppnas historik och svarsfält. Utan olästa svar visas bara en diskret
  länk till tidigare förslag. Dialogen finns kvar även om nya appfeedbackformuläret
  har dolts i klubbens inställningar.
- Simmarmenyn visar antal olästa dialoger både på ”Meny” (mobil), ”Mer” (dator)
  och länken ”Svar från utvecklaren”. Länken går till förslags- och svarskorten
  även från andra sidor. Fokus följer med; minskad rörelse respekteras. Menyn
  kvitterar inget. Märket försvinner först när själva dialogen har öppnats.
- Superadmin ser olästmarkering i tränarmenyn och Appfeedback-fliken. Sidan visar
  olästa dialoger först; Alla dialoger inkluderar historik. Förslagskorten har
  även en direktknapp till sin dialog. Vanliga tränare och huvudtränare får inte
  använda dialog-API:t. Deras tidigare anonyma feedbacksammanställning ändras inte.
- `Väntar på dig`, `Väntar på simmaren` och `Väntar på utvecklaren` beskriver senaste
  avsändaren. Förslagets Ny/Pågår/Klarmarkerad/Kommer inte implementeras och
  arkivering är separat. Ett nytt svar på ett gammalt arkiverat förslag visas i
  olästa dialoger utan att ändra förslagets status.

## Säkerhet och lässtatus

HTTP härleder simmarprofilen ur sessionscookien och administratören ur den
signerade, levande tränarsessionen. RPC:n kontrollerar aktiv/godkänd profil eller
aktiv superadmin med rätt sessionsversion. Båda tabellerna har RLS och saknar
klienträttigheter; även ursprungsförslagets tabell skyddas av RLS och indragna
direkträttigheter för klientroller. Serverns befintliga status- och feedbackflöden
behåller sina service-rollsrättigheter. Bara serverns service-roll får anropa RPC:n. Interna anteckningar
returneras aldrig i dialogdata. Inga meddelanden skickas till AI.

Lässtatus sparas per konto på servern, inte i lokal lagring. Listor och förhandskort
kvitterar inget. En öppnad, synlig dialog kvitterar bara det meddelande-ID som
ingick i dess hämtade ögonblicksbild. En nyare ankomst förblir oläst. Äldre
kvitteringar kan aldrig backa läspositionen. Ny ursprunglig feedback är oläst för
superadmin tills tråden öppnas. Märket räknar dialoger, inte antalet meddelanden.

Sändning använder UUID och transaktionell unikhet. Vid osäkert nätfel låses utkastet
till samma försök tills det bekräftats; inga dubbla meddelanden skapas vid retry.
Långa listor och konversationer har Visa fler/Visa äldre i stället för tyst klippning.
Antalet olästa beräknas före sidbegränsningen. HTTP-svar är `no-store`.

In-app-notiser uppdateras var 30:e sekund och vid fokus, medan öppen dialog
uppdateras var 15:e sekund. Dolda flikar pausas. Ändringar på samma enhet
uppdaterar räknare direkt. Detta är notiser i appen; nya dialogmeddelanden skickar
inte telefonpush till den gemensamma tränargruppen. Den äldre svarsåtgärden ger
en tydlig uppmaning att uppdatera sidan, inte ett nytt osammanhängande privatmeddelande.

## Verifiering

`tests/app-feedback-dialog*.test.mjs` provar SQL, API-åtkomst, arv av gamla svar,
följdfrågor, idempotens, läskvittens, separata administratörer, arkiverade förslag,
paginering, teckengräns och spärr mot spam. SQL-test kräver `SIMKOLL_PGLITE_MODULE`.

`/app-feedback-qa.html` använder riktiga React-komponenter med fiktiv datalagring
i sidans minne. Växla simmare/superadmin för att prova svarskedjan, menymärket
och nätfel. `?viewport=mobile` provar 390 px. Inga riktiga meddelanden, pushar,
AI-anrop eller databasändringar görs i demot.
