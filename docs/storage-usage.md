# Lagring och historik

Kör `supabase/migrations/110_storage_usage.sql`. Superadmin får därefter **Lagring och historik** i tränarmenyn. Ingen ny Vercel-miljövariabel, Vault-hemlighet eller betal-/Management API-nyckel krävs. Ingen produktionsdata eller fil raderas av funktionen.

## Mått och budgetar

- Databas: `pg_database_size(current_database())`, hela aktuell databas inklusive interna tabeller och index. Inte total provisionerad disk, WAL eller hela organisationens användning.
- Tabeller/scheman: `pg_total_relation_size`, med index/TOAST, utan att räkna index/TOAST eller partitioneringsföräldrar dubbelt. Radantal är katalogens uppskattning. De största 30 apptabellerna visas utan radinnehåll.
- Filer: summan av registrerade objektstorlekar från `storage.objects`, inklusive förhandsbilder, tillfälliga och eventuellt övergivna uppladdningar. Alla projektets buckets ingår. Det är inte nedladdningstrafik eller fakturans tidsvägda GB-timmar.
- Saknad/ogiltig filstorlek räknas separat. Då visas känd användning som lägstanivå och inget säkert kvarvarande filutrymme.
- Budgetar anges av superadmin i decimala GB (1 GB = 1 000 000 000 byte). Tomt betyder okänd gräns, aldrig obegränsat. Kvarvarande avser **angiven budget**, inte ett automatiskt avläst abonnemang. Gul/röd varning vid 80/90 %. Ingen automatisk push eller blockering av uppladdningar.
- Budgetändringar skyddas mot samtidig överskrivning med `expectedUpdatedAt`.

## Mätning och historik

SQL 110 skapar första mätpunkten och ett namngivet Supabase/pg_cron-jobb kl. 03:15 UTC varje dag. En mätpunkt per svensk kalenderdag; en ny mätning samma dag uppdaterar den. Ingen HTTP-callback används. Schemat påverkar inte befintliga påminnelsejobb.

Sidöppning hämtar en aktuell mätning utan att skriva historik. **Uppdatera och spara mätpunkt** uppdaterar även dagens historik. Ingen polling görs och sidan är lazy-laddad. Historiken börjar vid aktivering, utan påhittade äldre nivåer. Upp till senaste 366 dagarnas punkter visas. Metadatahistoriken raderas inte automatiskt.

## Logg och integritet

Simkolls gemensamma serverfunktion för Storage registrerar lyckade/misslyckade serveruppladdningar och raderingsbegäranden. Budgetändringar loggas i samma metadatalogg. Senaste 100 händelserna visas. Loggen innehåller åtgärd, tid, bucket, temporär/sparad fil, antal begärda objekt, känd uppladdningsstorlek och HTTP-status – **inte** objektvägar, ursprungliga filnamn, signerade länkar, person-ID, privata texter eller filinnehåll.

En lyckad serveruppladdning betyder att Storage tagit emot filen, inte att en senare koppling till ett mål säkert lyckats. Radering visar antal begärda objekt, inte garanterat antal existerande filer som frigjort utrymme. Direktuppladdning från webbläsaren till staging och ändringar i Supabase Dashboard täcks inte fullständigt av händelseloggen, men ingår i aktuell användning när objektmetadata finns. Äldre händelser kan inte återskapas. Loggfel får inte stoppa befintliga filflöden; logganrop har kort timeout och sparar inte leverantörens feltext.

API-vägen är `/api/profiles?storage=true` (ingen extra Vercel-serverfunktion). Den kräver ett signerat superadmin-konto och kontrollerar aktuell roll/status i databasen på nytt. Vanlig tränare, huvudtränare, simmare, gruppkod och inaktiverat/nedgraderat konto nekas. Tabeller har RLS utan klientpolicyer; RPC-funktioner har stängd `search_path` och EXECUTE enbart för service_role. Nytt underlag skickas inte till AI.

## Kontroll

Riktade enhets-/behörighetstester: `node --test tests/storage-usage.test.mjs`.
Isolerat PostgreSQL-test (valfri PGlite-installation utanför projektet): sätt `SIMKOLL_TEST_PGLITE_MODULE` till dess `dist/index.js` och kör `node --test tests/storage-usage-sql.test.mjs`. Testet kör SQL mot lokala fixtures, provar RLS/EXECUTE, summering, samtidighetskontroll och idempotens. Endast pg_crons externa schemaläggare ersätts med en teststub; verklig daglig körning måste kontrolleras i Supabase efter installation.
