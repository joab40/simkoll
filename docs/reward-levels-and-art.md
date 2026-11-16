# Fullständiga poäng och AI-nivåkonst

Kör `supabase/migrations/124_reward_totals_and_art.sql` i Supabase före driftsättning.
SQL:en räknar aldrig om eller ändrar poänghändelser. Den inför SUM-funktionen,
utkastmetadata, lagringsbucket och referenser till aktiverade bilder.
För bildbibliotek och sparade kombinationer körs även
`supabase/migrations/125_reward_card_library.sql` efter SQL 124. Befintliga
färdiga bilder behöver inte genereras om och påverkas inte av migreringen.
För gemensamma bakgrunder körs därefter
`supabase/migrations/126_shared_reward_backgrounds.sql`. Den återanvänder även
gamla bakgrunder på alla nivåer, utan filkopiering eller AI-anrop. Aktiva val,
sparade kombinationer och poäng ändras inte när SQL:en körs.
Version **3.116.0** lägger till sex bildstilar. Kör därefter
`supabase/migrations/127_reward_art_styles.sql` för att tillåta de nya stilarna.
Den ändrar endast stilernas tillåtna värden; bilder, poäng och aktiva val behålls.
För 50 bildförsök per superadmin under rullande 24 timmar körs även
`supabase/migrations/128_reward_art_superadmin_quota.sql`. Endast ett aktivt
superadmin-konto med aktuell session får generera nya bilder. Tidigare försök,
inklusive misslyckade, behålls och räknas med; kvoten nollställs inte av SQL:en.
Huvudtränare kan fortsatt blanda, spara och aktivera befintliga bilder.

## Rättningen

Tidigare läste tränarvyn en global lista med `limit=10000` utan sidindelning och
simmarvyn högst 1000 egna händelser. Supabases lägre REST-radgräns kunde dessutom
klippa den globala listan. Summorna och nivåfördelningen blev därmed ofullständiga.
Nu summerar `reward_point_totals` samtliga poänghändelser i Postgres, innan REST:s
radgräns. Endast service_role får anropa den. Tränarens godkända, aktiva,
icke-testprofiler sidindelas och samma totalkälla och tröskeltolkning används
överallt. Tränarens fördelning räknar nivå-ID, inte ändringsbara namn.
Saknad SQL eller ofullständig hämtning ger fel, aldrig en lyckad nollsummering.
Senaste belöningar hämtas separat och bestämmer inte totalen.

## Nivåverkstaden

Huvudtränare/superadmin: **Poäng & nivåer → Nivåverkstaden**. Spara först nivåns
emoji. Välj nivå, sedan bakgrund och emblem var för sig ur bibliotekets
miniatyrer. Även tidigare färdiga förslag från SQL 124 visas. Originalbakgrund
och originalemoji kan väljas utan AI. Valen ändrar endast förhandsgranskningen.
Under **Skapa fler bilder med AI** finns nio bildstilar och bekräftelsen:
Norrsken, Pool & ljusvågor, Kosmisk energi, Djuphavsglöd, Iskristall,
Solnedgång, Neonpuls, Mästarguld och Origami & papper. Beskrivning och färgpalett
visar stilens riktning utan AI-anrop, inte ett löfte om en exakt bild.
De sex nya stilarna har separata kompositionsinstruktioner för en lugn bakgrund
med läsbart centrum respektive ett igenkännbart, transparent emblem.
För **Illustrerad emoji** är **Behåll emojins originalfärger** förvalt. Stilen
styr då material, form och finish, inte färgpaletten. Konkurrerande stilfärger
och färgade kompositionsinstruktioner utelämnas helt. En röd diamant får en
uttrycklig anvisning om dominerande rubin-/karmosinröda ytor, inte bara röd kant.
Kända nivåsymboler får kontrollerade färgledtrådar; övriga behåller sin igenkännbara
emoji-palett utan att en färg gissas från nivånamnet. Ingen pixelreferens skickas.
Avmarkera rutan om stilens vanliga färger önskas. Bakgrunder påverkas inte.
Det är en prioriterad genereringsinstruktion, inte en pixelgaranti; granska bilden.
Valet `preserveEmojiColours` är en validerad intern boolesk API-flagga, inte en
ny OpenAI-parameter. Utelämnat värde betyder true för emblem. Ingen ny SQL behövs.
Material och färgkrav hålls separata enligt
[OpenAI:s bildpromptningsguide](https://developers.openai.com/api/docs/guides/image-prompting?model=gpt-image-2.5).
En ny bild sparas automatiskt i biblioteket och väljs i förhandsgranskningen;
det andra bildvalet behålls. Inget aktiveras automatiskt.
Ingen bildgenerering startas av att visa, blanda eller spara ett kort.
Endast superadmin ser genereringspanelen och får generera nya bilder.
Vanliga tränare och simmare får inte använda nivåverkstaden.

Ge kombinationen ett namn (1–60 tecken) och välj **Spara kortkombination**.
Det sparar bildreferenserna och emoji-versionen, inte en fryst poängsumma eller
en ny rasterbild. Kortnamnet skickas inte till OpenAI. Sparade kort kan öppnas
igen, kombineras om och sparas som nya varianter. Samma sparreferens vid ett
upprepat anrop skapar inte en dubblett. Gamla varianter skrivs inte över.
**Aktivera kombinationen för nivån** ändrar båda bildreferenserna atomärt.
En samtidig ändring från en annan tränare ger konflikt och kräver omläsning;
den nya kombinationen skrivs inte över från en gammal vy. Roll och session
kontrolleras igen i SQL. Sparande och aktivering loggas i samma transaktion
som ändringen; ett loggfel rullar tillbaka ändringen. Inga poäng påverkas.
Kort med äldre emoji eller oförenliga bildreferenser behålls i biblioteket
men markeras som otillgängliga. **Gemensamma bakgrunder** visar alla färdiga
bakgrunder i klubben, även om ursprungsnivåns emoji har ändrats. **Nivåns emblem**
är fortsatt bundna till vald nivå och dess aktuella emoji. Sparade kort hör till
sin nivå; en delad bakgrund kan ingå i olika kombinationer på flera nivåer.
Att välja/aktivera en annan bakgrund på en nivå påverkar inte de övriga.
Om ursprungsnivån raderas behålls bildmetadata och lagringsfil; nivåkopplingen
sätts till null så delade bakgrunder och andra nivåers sparade kort fungerar.
Övergivna emblem blir inte valbara på andra nivåer. Ingen rensningsfunktion införs.

Bibliotekets GET och kombinationsåtgärder ligger på `/api/points` med
`artLibrary=true&levelId=...`, `save-level-card` respektive `publish-level-card`.
Bilder och kort sidindelas stabilt. Läsfel, saknad SQL eller avkortad historik
ger fel, inte ett tomt bibliotek. Efter en osäker skrivning spärrar gränssnittet
nya skrivningar tills biblioteket har hämtats på nytt. Endast service_role
får anropa konfigurationsfunktionen; klientroller saknar tabellåtkomst.

OpenAI får endast nivåns sparade emoji och kontrollerade stilinstruktioner.
Inga personuppgifter, simmarnamn, fritexter, hälsovärden eller poänghistorik hämtas
för genereringen. Bilderna är generisk nivåkonst och sparas i en offentlig bucket.
Utkastmetadata har RLS och är endast åtkomlig servervägen. Bara lagrade och redo
bilder med rätt bildtyp kan aktiveras; emblem kräver dessutom rätt nivå och emoji.
Lagringssökvägen valideras mot bildens ursprungsnivå, inte målnivån. För bilder
vars ursprungsnivå tagits bort krävs fortfarande en giltig lagrad rastersökväg.
Klient-URL:er accepteras inte. Ändrad emoji döljer det gamla emblemet men inte
bakgrunden. Äldre sparade kort har fortfarande en egen emoji-version.

API använder `OPENAI_API_KEY`. Modell: `OPENAI_REWARD_IMAGE_MODEL`, annars
`OPENAI_STRENGTH_IMAGE_MODEL`, annars befintliga `gpt-image-2.5-flare`. Ingen
ny modell krävs om klubbens befintliga bildmodell har åtkomst. En bild per anrop,
medium, WebP; bakgrund 1536×1024, transparent emblem 1024×1024. Ingen AI-video:
stillbilden får rörelse i CSS. Anrop begränsas till 160 sekunder, API-funktionen
till 300 sekunder i Vercel. Befintlig AI-avstängning/månadstak gäller. Databasen
serialiserar reservationer: en pågående bild per nivå och högst 50 försök per
superadmin per rullande 24 timmar. Misslyckade försök räknas också. En
avbruten klient kan inte avbryta en redan skickad bildgenerering; håll sidan öppen.

Tokenanvändning/modell/status loggas under **Skapa nivåbild**, och befintlig
kostnadsberäkning används. Alternativa modeller utan pris i prislistan visas som
pris saknas, inte gratis. Ett fel efter OpenAI-anrop kan fortfarande kosta.
Ingen riktig generering eller publicering har gjorts i utvecklingstesterna.

Aktivering ändrar endast bildreferensen, aldrig poäng eller nivågränser. Gamla
utkast/filer behålls vid byte/återställning. Ingen automatisk rensning införs.
Den gamla backupfunktionen omfattar inte dessa nya bildfiler/utkast; inkludera
bucket, `reward_level_art` och `reward_level_cards` i klubbens ordinarie
Supabase-backup.

Simmarens kort har svävande emblem, nivåfärgade ljusvågor, partiklar och nästa
upplåsning. Pausa/starta effekter sparas lokalt på enheten. `prefers-reduced-motion`
stoppar alltid rörelsen; dolda karusellkort och dold flik pausas också. Kompakta
poängkort använder samma tema men utan den stora bakgrundsanimationen.
**Nästa upplåsning** visar nästa nivås aktiverade emblem från samma redan hämtade
nivådata, inte ett osparat bildförslag. Originalemojin visas om emblem saknas
eller bildladdningen misslyckas. Bildfel där påverkar inte den nuvarande nivåns
emblem, poäng eller framsteg. Högsta nivån har ingen ruta för nästa upplåsning.
Ingen ny SQL eller AI-generering krävs.

### Klappreaktion och dagsbonus (SQL 129)

På det stora nivåkortet är emblemet en tangentbordsvänlig knapp. Ett tryck ger
en kort studs och åtta glittrande partiklar. Pausade effekter och minskad rörelse
respekteras. Animationen fungerar även i verkstadens förhandsvisning, utan poäng.

På den egna, aktiva simmarprofilen ger ett tryck 1 poäng, högst 5 per svensk
kalenderdag. Testprofiler och tränarvyn kan inte få bonus. SQL 129 låser profilraden,
kontrollerar status och sparar bonus + poäng i samma transaktion. Kvoten gäller
över nivåbyten, omladdningar och enheter; den återställs vid midnatt i Stockholm
(även sommartid). Bonusen är separat från incheckningar och aktivitetsdagar.

Klienten köar inte poäng vid snabbtryck. Ett pågående försök återanvänder samma
UUID efter nätfel, även om poängen redan sparats. Poäng och nivå uppdateras först
efter serversvar. Efter 5/5 fungerar klappreaktionen fortfarande, utan extra poäng.
Utan migrationen fungerar tidigare poäng och animationer, men ingen bonus delas ut.
`/reward-level-qa.html?view=tap` provar kortet med fiktiv kvot och förlorade svar;
`&viewport=mobile` provar mobilbredd. Inga betalda AI-anrop används.

Verifiering: `tests/reward*.test.mjs`, SQL-test med `SIMKOLL_PGLITE_MODULE`,
och `/reward-level-qa.html` (även `?viewport=mobile`). Demo använder ingen
produktionsdata och inga betalda AI-anrop; förslagen är tydligt märkta SVG-fixturer.
`?view=next-unlock` provar nästa emblem, saknad/trasig bild, ny aktiverad bild
och högsta nivån med den riktiga kortkomponenten. Kombinera med `&viewport=mobile`.
API-detaljer kontrollerade mot https://developers.openai.com/api/docs/guides/image-generation.
