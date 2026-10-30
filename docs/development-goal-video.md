# Video på utvecklingsmål

## Användning

Tränaren kan välja en bild **eller** ett kort teknikklipp när ett mål skapas. På ett befintligt mål finns **Bild eller video på målet**, med val för att spara, ersätta eller ta bort bilagan. Måltext, status och återkoppling behålls vid bilagebyten. Simmaren kan läsa och spela upp sin bilaga, men inte ändra den.

- Högst **30 sekunder och 25 MB** per video.
- MP4/MOV med H.264 eller HEVC. MP4/H.264 ger bäst kompatibilitet; HEVC kräver stöd på enheten.
- Originalfilens kvalitet och bildfrekvens behålls. Ingen automatisk komprimering, trimning eller omkodning i denna version. För stora klipp måste exporteras/kortas först.
- En JPEG-förhandsbild skapas lokalt om webbläsaren kan avkoda klippet. Videon hämtas först efter **Spela upp video**, med 1×, 0,5×, 0,25× och helskärm.
- Om målet sparas men videon misslyckas finns målet kvar; tränaren får ett tydligt meddelande och kan försöka med samma bilaga på samma mål.
- Videon skickas inte till AI. Assistenten får hjälpinformation om funktionen, inte klippets innehåll.

## Installation

Kör `supabase/migrations/109_development_goal_video.sql` före publicering. Den bygger vidare på befintliga utvecklingsmål och bildstöd (088). Den skapar en privat bucket, `goal-analysis-videos`, och videometadata på `development_goals`. Inga nya miljövariabler eller externa videotjänster behövs.

Ingen publik Storage-policy skapas. Befintliga serverbehörigheter används; bara målets simmare och behöriga tränare får uppspelningslänkar via det autentiserade API:t. Uppladdning, bilagebyte och borttagning är tränarfunktioner.

## Lagring och säkerhet

1. API:t kontrollerar tränarbehörighet, målets verkliga ägare, databasstöd och privat bucket.
2. En signerad uppladdningslänk skapas för ett slumpmässigt staging-objekt under just det målet. En separat HMAC-biljett binder uppladdningen till mål, ägare, storlek och målversion och gäller i 15 minuter.
3. Webbläsaren laddar upp direkt till Supabase Storage. Videobytes går inte genom Vercels inkommande API-anrop; endast metadata och en liten förhandsbild skickas dit.
4. Servern hämtar filen med storleksgräns och kontrollerar container, deklarerad speltid, videospår, bildmått och codec. Detta är metadata-/containerkontroll, inte fullständig avkodning av varje bildruta.
5. Exakt de kontrollerade bytesen sparas som ett nytt serverägt objekt. Den signerade staging-länken kan därför inte användas för att ändra en redan kopplad video.
6. Bilagan kopplas med villkorad uppdatering av målversionen. En samtidig ändring ger konflikt i stället för att skriva över någon annans ändringar.
7. Uppspelningslänken gäller i 30 minuter och hämtas först vid aktiv uppspelning. Länken är en tillfällig åtkomstnyckel och bör inte delas. Förhandsbilden har också en tidsbegränsad länk.

Originalets inbäddade metadata behålls eftersom filen inte omkodas. Tränaren bör bara ladda upp klipp som är lämpliga att dela med simmaren och klubbens behöriga tränare, utan ovidkommande personer eller känsliga uppgifter. Det ursprungliga filnamnet lagras inte.

Efter ett bekräftat bilagebyte tas tidigare bild/video och förhandsbild bort. Misslyckad/avbruten uppladdning försöker rensa staging-objektet. Vid nästa uppladdning på samma mål görs även begränsad städning av övergivna objekt äldre än 24 timmar; vid målradering rensas målanknutna objekt. Ingen separat schemalagd global städning finns. Vid osäkert nätverksfel under databasuppdateringen behålls den nya filen, eftersom uppdateringen kan ha lyckats.

## Verifiering

Riktade tester finns i `tests/goal-video.test.mjs` och `tests/goal-video-api.test.mjs`, med syntetiska mediafixtures. De täcker format-/storleksgränser, ägarskap, signerade biljetter, direktuppladdning, samtidiga ändringar och säker ersättning/borttagning.

En offentlig exempelvideo används för lokal visuell kontroll, förhandsbild och långsam uppspelning på mobilbredd. Faktisk uppladdning mot klubbens Supabase och fysisk iPhone behöver kontrolleras efter att SQL 109 har körts och appen publicerats. Produktionens lagrings-/nätverksflöde är inte verifierat av de lokala mocktesterna.
