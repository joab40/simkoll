# Simmarassistent för huvudtränare och superadmin

Tryck på emojin i ett simmarkort. Den är en separat, tangentbordsåtkomlig knapp,
inte en del av kortets öppningsknapp. Vanliga tränare och simmare får ingen
knapp och nekas även av servern. Personligt tränarkonto, aktuell session/roll,
aktiv och godkänd simmarprofil samt `ai_analysis_status=approved` krävs.
Klubben måste dessutom ha rätt rutiner/godkännanden för de konkreta valen;
kryssrutan i dialogen är inte i sig ett juridiskt samtyckesflöde.

## Aktivt val, granskning och sändning

13 kategorier kan väljas: incheckningar, simfartkänsla, RPE/sRPE, mängd,
aktiviteter, gruppass, tävlingsresultat, träningstider, program/loggar, mål/samtal,
simmarkommentarer, tränaranteckningar samt sömn/sjukdom. Känsliga tillval är
avstängda i grundurvalet. ”Välj allt relevant” väljer alla erbjudna kategorier.
28 dagar, 90 dagar, ett år eller all sparad historik till och med idag stöds.

1. `swimmer-assistant-preview` läser valda uppgifter på servern utan AI-anrop.
2. Tränaren kan läsa alla källposter, dagsberäkningar och begränsningar.
3. En aktiv bekräftelse anger destinationen OpenAI, även för känslig fritext.
4. Först Skicka fråga till OpenAI anropar modellen. Klubbens AI-switch/budget
   och profilens godkännandestatus kontrolleras igen vid varje fråga.

Namn, alias, e-post, inloggningsuppgifter och databas-ID:n ingår inte som egna
modellfält. Fritext kan ändå innehålla personuppgifter, även om andra personer;
den måste granskas. Anonyma svar kan inte knytas till simmaren och ingår inte.
Privata meddelanden, gruppchatt, media/bilagor, spel/poäng och teknisk kontodata
ingår inte. Det är alltså all *vald analysdata*, inte en rå kontobackup.

För mycket underlag stoppas vid 180 000 JSON-tecken; välj kortare period eller
färre kategorier. Högst 10 000 rader per källa sidindelas. En ofullständig eller
misslyckad källa visas uttryckligen som otillgänglig, inte som tom/noll.
Ingen osynlig promptavklippning används. Saknat pass-/planeringsunderlag ger
ingen uppskattning av minuter/meter. En del kategoriöverlapp förekommer, men
det betyder inte extra genomförda aktiviteter.

## Beräkningar, källor och dialog

Befintlig koppling mellan datum, grupp, passval och rapport används för sRPE
och mängd. Egen tid prioriteras; säkert kopplad planerad tid märks uppskattad.
Delvis genomfört får inte hela planerade distansen. Senaste efterrapport per
dag/aktivitet/passval används för belastning. Tävling räknas inte som sRPE.
Det är samma begränsning som Formkollen: flera fysiska pass i samma rapportgrupp
kan inte säkert särskiljas. Dagsmedel och känd del av belastningen beräknas i
kod, med antal rapporter och tidskälla, inte genom fria modellberäkningar.

Gruppass filtreras på dagens grupptillhörighet och är inte bevis på deltagande.
Programmål utan datum märks aktuell status. Odaterade/årsbestämda tävlingsresultat
ingår endast vid all historik. Resultat för olika gren/bassäng eller olika
träningsförutsättningar får inte behandlas som likvärdiga. Resultattider lagras
i hundradelar. Manuella resultat är inte verifierade Tempus-resultat.

Modellen svarar strukturerat: svar, observationer, möjliga tolkningar och
begränsningar. Hänvisningar måste finnas i den aktuella källförteckningen.
Det verifierar att en källa finns, **inte** att alla modellens slutsatser är
korrekta. Fritext är opålitlig data, aldrig instruktioner. Ingen fri SQL,
webbsökning, skrivfunktion, diagnos eller säker toppformsprognos exponeras.

Förhandsvisningen är signerad och bunden till tränare, sessionsversion,
simmare, kategorier, period och exakt underlag, giltig i 30 minuter.
Källändring eller annat urval kräver ny granskning. Följdfrågornas historik
signeras för samma underlag och kan inte flyttas mellan simmare/tränare.
Högst sex frågor per dialog; därefter ny granskning. Byten av urval rensar
dialogen. Stängning av rutan raderar den ur komponentens minne. Ingen ny
chattdatabas, localStorage eller extern vektorlagring införs.

## Drift och integritet

Befintlig `/api/workouts` används, inga nya serverless-rutter eller SQL behövs.
`OPENAI_API_KEY` används som tidigare. Frivillig modellvariabel:
`OPENAI_SWIMMER_ASSISTANT_MODEL`, annars `OPENAI_MODEL`, annars `gpt-4o-mini`.
Responses API, strukturerat JSON-schema, `store:false`, utan verktyg eller
`previous_response_id`. Underlag och signerad kort dialog skickas för varje
fråga; ingen extern lagrad konversation eller automatisk bakgrundskörning.

`store:false` stoppar inte nödvändigtvis leverantörens övriga lagring/loggar.
Klubbens ansvariga måste kontrollera API-kontots avtal och datainställningar.
Se [OpenAI Data controls](https://developers.openai.com/api/docs/guides/your-data)
och [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).
Användningsloggen mäter modell/tokens/status och auditloggen valda kategorier,
period och ansvarig tränare – inte fråga, svar eller källtexter. Befintlig
AI-budget gäller, med samma begränsningar för samtidiga anrop som andra
AI-funktioner. Verifiera modellåtkomst i drift före första verkliga analysen.

## Verifiering

`tests/swimmer-assistant.test.mjs` och `tests/swimmer-assistant-endpoint.test.mjs`
testar urval, datakällor, behörighet, återkallad session, profilgodkännande,
AI-switch/budget, beräkningar, otillgängligt underlag, storleksgräns,
signerad scope/historik, utgången granskning, modellfel och källhänvisningar.
Alla modell-anrop är mockade. Ingen riktig simmardata används.
`/swimmer-assistant-qa.html` är en fiktiv UI-demo utan API-anrop, med riktig
emojiknapp/dialog, rollbyte och godkännandestatus. Kontrollera även mobilbredd,
Escape, fokusretur, ny dialog och öppningsbara källor.
