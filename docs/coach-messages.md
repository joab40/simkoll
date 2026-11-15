# Tränarnas meddelandevy

Tränarvyn använder `CoachMessages`: tre separata kanaler, Tränarinfo,
Klubbflödet och Privat. Bara vald kanal hämtas första gången; redan besökta
kanaler behåller data och utkast i komponentminnet. Dolda kanaler pollas inte.
Öppning för en viss simmare går direkt till privatfliken med vald mottagare.

Klubbflödet använder samma `PeppChannelPanel` som simmarna: kronologiska bubblor,
datumavdelare, reaktioner, emojis och senaste-meddelande-knapp. Tränare skriver
offentliga `community_posts` som Tränarna, inte poänggivande simmarpepp. Inga
nya citerade tränarsvar införs (publiceringsschemat saknar sådana fält).
Tränarna kan ta bort offentliga tränarmeddelanden med samma RADERA-bekräftelse
som tidigare. Tränarinfo och privata svar behåller befintliga serveråtgärder.

## Laddning och latens

Tidigare laddade två komponenter samma kompletta `/api/community`-svar: även
tränarinfon väntade på klubbflöde, reaktioner och privat inkorg. Dessutom var
inforutan helt dold tills hämtningen var klar.

* `?openChat=true` läser bara inställningar, infofrågor, visningsidentiteter och
  privata svar som hör till just de synliga frågorna. Inget klubbflöde, reaktioner,
  privata pepp eller full privat inkorg behövs.
* `?channel=club` använder befintlig publika flödeslogik men hoppar över frågor,
  privat inkorg, länkade privata svar och privat pepp.
* `?channel=private` är endast för tränare och läser inkorg + visningsidentiteter.
* Befintligt komplett GET-svar finns kvar för andra klienter, inklusive simmarnas
  vanliga peppvy. Ingen DB-migrering behövs.

En omedelbar laddningsruta reserverar plats. Laddningsfel skiljs från tomma
kanaler, och uppdateringsfel behåller senaste lyckade data med en synlig varning.
Synlig kanal uppdateras var 30:e sekund samt vid fokus/återkomst och privata svar;
inaktiva fönster/kanaler pollas inte. Samtidiga läsningar dedupliceras. Mutationer
avbryter äldre läsningar, så att ett gammalt svar inte skriver över ett nytt
meddelande. Publicering kvitteras direkt med den sparade posten, därefter hämtas
övriga ändringar i bakgrunden. Frågeparametrar med `Date.now()` behövs inte;
API-svar är redan `no-store`.

Detta minskar beroenden och dubbelarbete; någon produktionslatens i sekunder
har inte mätts. Serverns kallstart/nätverk kan fortfarande påverka laddningen.

## Integritet och bevarade gränser

Resurser lagras endast i komponentminnet, inte globalt/localStorage/sessionStorage.
Kod/roll/simmarbyte skapar ny chatinstans och avbryter den tidigare instansens
begäran. Privata frågor filtreras i både SQL och servermappning; länkade svar
kräver fortfarande rätt mottagare. Tränarnas privata inkorg kan inte nås med
simmarroll. Simmares privata pepp visas aldrig i tränarnas inkorg.

Den nya klubbvyn har inte knappen Förbättra text med AI. Flytten stoppades av
automatisk säkerhetsgranskning eftersom utkast kan innehålla personuppgifter
och skickas till OpenAI; separat godkännande behövs innan den återinförs här.
Ingen ny AI- eller annan extern textöverföring tillkommer i detta arbete.

## QA

`/coach-messages-qa.html` använder de riktiga komponenterna med enbart fiktiva
data och en lokal mock. Där finns simulerad fördröjning, läsfel och en anropslista.
`?viewport=mobile` visar 390 px iframe. Testerna `community-channels*` kontrollerar
isolerade serverläsningar, sekretess, rollgränser, deduplicering, avbrutna/stale
begäranden och gemensam klubbflödespresentation. Inga verkliga meddelanden skickas.
