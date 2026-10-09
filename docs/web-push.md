# Pushnotiser – driftsättning och test

Första versionen skickar Web Push vid tränarinfo, tränarens klubbmeddelanden,
privata meddelanden och frågor till tränarna. Öppna peppinlägg och reaktioner
skickar inte push. Notisen innehåller en generell text, inte meddelandets innehåll.

För en samlad förklaring av alla Simkoll-miljövariabler, se
[miljövariabelguiden](environment-variables.md).

## Aktivera

1. Kör `supabase/migrations/078_web_push.sql` i Supabases SQL-editor.
2. Generera ett VAPID-nyckelpar en gång: `npx web-push generate-vapid-keys --json`.
3. Lägg in följande servermiljövariabler i Vercel för rätt miljö:
   - `WEB_PUSH_PUBLIC_KEY`: publicKey från genereringen.
   - `WEB_PUSH_PRIVATE_KEY`: privateKey från genereringen.
   - `WEB_PUSH_SUBJECT`: `mailto:` följt av klubbens riktiga kontaktadress.
4. Driftsätt den nya versionen. Öppna Inställningar → Pushnotiser som superadmin
   och aktivera önskade kategorier.
5. Varje användare aktiverar notiser på sin egen enhet och godkänner webbläsarens
   fråga. Simmare hittar valet under sin profil (även en genväg på startsidan).
   Tränare väljer **Notiser på min enhet** i menyn.

Den privata nyckeln ska aldrig läggas i klientkod, Git eller en `VITE_`-variabel.
Behåll samma nyckelpar vid nya versioner. Ett nyckelbyte kan kräva att användarna
stänger av och aktiverar sina prenumerationer igen.

## Enheter

- iPhone/iPad: iOS/iPadOS 16.4 eller senare. Lägg till Simkoll på hemskärmen
  via Safari och öppna därifrån innan notiser aktiveras.
- Android: aktuell webbläsare med Web Push, till exempel Chrome, över HTTPS.
- Dator: fungerar där webbläsaren och operativsystemet stöder Web Push.
- Tillstånd ges via en användarklickning, aldrig automatiskt vid inloggning.
  Fokusläge, avstängda systemnotiser och uppkoppling kan påverka leveransen.

## Kontrollera före lansering

Använd minst en riktig iPhone och en Android-enhet, samt två olika simmarkonton.

- Skicka testnotisen. Kontrollera även när appen är stängd.
- Skicka tränarinfo: mottagare som valt kategorin ska få en generell notis.
- Skicka privat till simmare A: A ska få notisen, aldrig B.
- Skicka en fråga från en simmare: aktiva tränarkonton med privata notiser ska
  få den; andra simmare ska inte få den.
- Stäng av en kategori och sedan klubbens push. Nya meddelanden ska då inte
  skicka den avstängda typen av notis.
- Kontrollera att reaktioner och öppna peppinlägg inte skickar push.
- Tryck på notisen: rätt meddelandevy ska öppnas efter eventuell inloggning.
  En notis för ett annat konto ska inte öppna det kontots meddelanden.
- Logga ut och byt konto på samma enhet: gamla kontots prenumeration ska
  kopplas bort. En avstängd profil/tränare ska inte få nya utskick.
- Kontrollera FAQ, personliga inställningar och superadmins inställningskort.

## Teknik och begränsningar

Push använder befintliga `/api/notifications?push=true` och meddelande-API:t.
Antalet serverlessfunktioner är fortsatt 12. Ingen cron eller extra funktion
behövs. Service worker hanterar bara notiser; HTML, API-svar och användardata
cachas inte. Prenumerationer skyddas av RLS och hanteras endast server-side.
Servern kontrollerar mottagarens aktiva konto och rensar utgångna endpoints
när leverantören svarar 404/410.

Utskick sker med Vercels `waitUntil` efter sparandet. Ett pushfel ska inte hindra
meddelandet från att sparas. Detta är en första version utan beständig utskickskö
eller garanterad omleverans vid driftstörning. Community-funktionen har 60 sekunders
körtid; stora utskick eller långsamma leverantörer kan avbrytas. Notisen lever
högst en timme hos leverantören. Meddelandena finns fortfarande i appen även om
push inte når fram. Push är därför inte en kvittens på att viktig information
har lästs.

Automatiska tester använder mockad databas och pushleverantör. Faktisk leverans
kräver konfigurerad server, driftsättning och ovanstående enhetstester.
