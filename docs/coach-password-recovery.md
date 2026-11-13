# Återställning av tränarlösenord och testmejl

## Driftsättning

1. Kör `supabase/migrations/119_coach_password_recovery.sql` före kodens driftsättning. Den lägger till atomiska engångslänkar, beständiga anropsgränser och sessionsversioner.
2. Konfigurera servervariabler i Vercel: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (standard `Simkoll <noreply@simkoll.app>`) och `APP_PUBLIC_URL` (standard `https://www.simkoll.app`). Avsändardomänen måste vara verifierad i Resend. Inga nycklar får ha prefixet `VITE_`.
3. `COACH_SESSION_SECRET` måste vara en hemlig, stabil servervariabel. Befintlig `SIMKOLL_COACH_BOOTSTRAP_TOKEN` stöds som reserv; den tidigare osäkra fasta standardhemligheten är borttagen. Byt inte en fungerande hemlighet utan att avsiktligt logga ut befintliga tränare.
4. Driftsätt koden efter miljöändringar.

## Användning och manuell kontroll

- På tränarinloggningen: **Glömt lösenord?**. Svaret avslöjar inte om adressen har ett aktivt konto. Endast aktiva konton får återställningsmejl.
- Superadmin: **Tränarkonton → Testa mejl** på önskat konto. Bekräfta mottagaren. Knappen använder kontots lagrade adress, skickar inget lösenord och ändrar inte kontot.
- Ett lyckat svar från Resend betyder accepterat för utskick, inte bekräftad leverans. Kontrollera inkorg/skräppost och vid behov leveransstatus i Resend.
- Kontrollera återställning med ett avsett testkonto: öppna länken, välj nytt lösenord, kontrollera att samma länk inte går att använda igen och att tidigare personliga tränarsessioner avvisas. Delade gruppkoder påverkas inte.
- Testa också felaktig länk och olika lösenord i de två fälten. Att bara öppna en länk ändrar inte lösenordet.

## Säkerhet och omfattning

Länkar har 256 bitars slump, gäller 30 minuter och lagras enbart som SHA-256-hash. Ny begäran ersätter äldre länkar. Byte av lösenord och förbrukning av token sker i samma låsta SQL-transaktion. Personliga sessioner verifieras mot konto, aktiv status, roll och sessionsversion vid varje API-anrop; det innebär en extra databasläsning per sådant anrop. Databasfel stoppar åtkomst i stället för att godkänna en okontrollerad session.

Token ligger i URL-fragment, tas bort från adressfältet när återställningsvyn laddats och skickas aldrig i sidans referer. Återställningsadressen kommer från serverkonfiguration, inte inkommande Host-header. Rå token, lösenord och leverantörssvar loggas inte. Auditloggen spårar utskick och slutförda återställningar utan dessa uppgifter.

Beständiga gränser: återställningsbegäran 10/IP och 3/adress per 15 minuter; inlösen 20/IP per 15 minuter; testmejl 10/admin och 3/mottagare per 15 minuter. Alla utskick delar en gräns på 90 per rullande dygn. Begränsade återställningsbegäranden får samma generiska svar. Mejlsändning körs med Vercels `waitUntil`; klientens svar är inte leveransbekräftelse. Inga schemalagda anrop eller AI används.

Automatiska tester använder enbart mockade databas- och Resend-anrop. De verifierar inte riktig leverans eller exekverar migrationen i PostgreSQL.
