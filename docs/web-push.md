# Pushnotiser – driftsättning och test

Första versionen skickar Web Push vid tränarinfo, tränarens klubbmeddelanden,
privata meddelanden och frågor till tränarna. Öppna peppinlägg och reaktioner
skickar inte push. Notisen innehåller en generell text, inte meddelandets innehåll.

För en samlad förklaring av alla Simkoll-miljövariabler, se
[miljövariabelguiden](environment-variables.md).

## Aktivera

1. Kör `supabase/migrations/078_web_push.sql`, `084_push_categories.sql`, `096_training_push_reminders.sql` och `097_automatic_training_reminders.sql` i Supabases SQL-editor. Redan körda migreringar behöver inte köras igen.
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

## Träningspåminnelser

Huvudtränare och superadmin hittar två val under Inställningar: påminnelse vid
utebliven incheckning och påminnelse om efterrapport. Båda är avstängda från
start. De skickas bara till simmare med en aktiv pushprenumeration som har
träningspåminnelser aktiverade på enheten, och högst en träningspåminnelse per
simmare och aktivitetsdag.

Efterrapportpåminnelsen utgår från tidpunkten då simmaren skickar ”Jag ska
träna”. Om en efterrapport för samma simpass saknas skickas en generell notis
efter 2,5 timmar. Det är en uppskattning från incheckningstidpunkten, inte en
verifiering av när simpasset faktiskt började. Supabase Cron kontrollerar detta
var femte minut. Kvällspåminnelsen kontrolleras från kl. 20 svensk tid under
en timme så att en tillfällig driftstörning kan följas av ett nytt försök.

Efter migrering 097 och driftsättning: öppna den publicerade Simkoll-appen som
huvudtränare eller superadmin, välj önskade påminnelser och tryck **Spara
påminnelser**. Simkoll skapar eller uppdaterar då schemat och de två
Vault-värdena automatiskt. Du behöver inte ange någon ny miljövariabel i
Vercel och inte heller kopiera någon nyckel till Supabase. Om 096 redan är
körd räcker det att köra 097 och sedan spara påminnelserna i appen.

Tekniskt använder servern en separat HMAC-token härledd från den befintliga
privata pushnyckeln. Pushnyckeln lämnar aldrig Vercel och token skickas aldrig
till webbläsaren. Endast serverns service-roll kan anropa SQL-funktionen som
sparar Vault-värden, uppdaterar påminnelsevalen och byter Cron-jobb i samma
transaktion. Produktionsadressen hämtas från Vercels automatiska systemuppgifter;
en förhandsvisning får inte ändra schemat. Den gamla körningen från 096 ersätts
när inställningarna sparas. Stängs båda påminnelserna av tas Cron-jobbet bort.
Om pushnyckeln eller produktionsdomänen byts: spara påminnelserna igen.

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
Antalet serverlessfunktioner är fortsatt 12. Efterrapportpåminnelsen använder
Supabase Cron var femte minut, som även sköter kvällskontrollen för
utebliven incheckning. Tempus behåller sitt befintliga Vercel Cron-jobb.
Service worker hanterar bara notiser; HTML, API-svar och användardata
cachas inte. Prenumerationer skyddas av RLS och hanteras endast server-side.
Servern kontrollerar mottagarens aktiva konto och rensar utgångna endpoints
när leverantören svarar 404/410.

Meddelandeutskick sker med Vercels `waitUntil` efter sparandet. Ett pushfel ska inte hindra
meddelandet från att sparas. Påminnelsetabellen förhindrar dubbletter samma dag,
men är inte en beständig utskickskö och garanterar inte omleverans vid driftstörning. Community-funktionen har 60 sekunders
körtid; stora utskick eller långsamma leverantörer kan avbrytas. Notisen lever
högst en timme hos leverantören. Meddelandena finns fortfarande i appen även om
push inte når fram. Push är därför inte en kvittens på att viktig information
har lästs.

Automatiska tester använder mockad databas och pushleverantör. Faktisk leverans
kräver konfigurerad server, driftsättning och ovanstående enhetstester.
