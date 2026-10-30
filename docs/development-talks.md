# Utvecklingssamtal

I gruppens förberedelser används kryssrutorna bara för att boka nya samtal.
Ett befintligt samtal öppnas med **Öppna →**, även när statusen är
**Redo för samtal**. Statusen betyder att simmaren skickat sina förberedelser,
inte att samtalet är genomfört.

Tränarvyn visar samtliga frågor i samma avsnitt och ordning som simmarens
formulär. Tomma frågor visas som **Ej besvarad**. Under ett pågående möte kan
tränaren välja **Redigera svar tillsammans** för att rätta befintliga svar
eller komplettera obesvarade frågor. Ändringarna blir synliga även för simmaren, så de bör göras i
samråd. Ett genomfört samtals svar är skrivskyddade. Redigeringen loggas utan
att svarstexten kopieras till loggen. Om samtalet ändrats i en annan vy sedan
det öppnades stoppas sparningen för att undvika att nyare svar skrivs över.

**Spara ändringar** behåller
statusen. **Markera som genomfört** sparar och avslutar samtalet uttryckligen.
Interna tränaranteckningar lämnas inte ut i simmarens API-svar. Den gemensamma
överenskommelsen finns i simmarens samtalshistorik. Simmarens svar skrivs inte
över när tränaren bara sparar anteckningar.

Ett genomfört samtal ligger kvar i historiken och simmaren kan bokas på nytt.
Ingen ny databasmigrering behövs för detta flöde.

## Valfria röstanteckningar

Tränaren kan spela in en kort anteckning, högst två minuter. Alla som hörs ska
informeras och godkänna överföringen till OpenAI. Ingen inspelning startar utan
aktivt val. Undvik identifierande och känsliga personuppgifter; spela inte in
hela samtalet. Ljudet behandlas i minnet och sparas inte i Simkoll.

Efter transkribering måste tränaren granska texten och uttryckligen lägga till
den i interna anteckningar, eller kasta förslaget. Först när anteckningarna
sparas lagras texten. Avbruten inspelning skickas inte. En redan skickad begäran
kan inte tas tillbaka från OpenAI, även om tränaren avbryter väntan.
Funktionen använder befintlig transkriberingsfunktion och klubbens AI-kvot.

## AI-förslag till gemensam överenskommelse

Vid interna anteckningar finns **Visa underlag**, följt av
**Föreslå gemensam överenskommelse**. Tränarens aktuella anteckningar ingår
alltid. Simmarens förberedelser (även osparade ändringar under mötet) och en
sammanfattning av träningshistoriken är förvalda och kan
väljas bort. Historiken omfattar registrerad simning/styrka/övrig träning,
kontinuitet, rapporterad respektive uppskattad mängd, RPE med svarstäckning,
utvecklingsmål, testlopp/träningstider och registrerade tävlingsresultat. Saknade registreringar är
inte bevis för utebliven träning, och resultatlistan är inte en komplett
tävlings- eller PB-historik. Privata check-in-kommentarer och styrkeloggarnas
fritext bifogas inte.

Dagboksreflektioner och sömnkoll är separata, avstängda tillval. Reflektioner
begränsas till de tolv senaste under perioden och 600 tecken per svar; detta
syns i underlaget. Sömnkollen sammanfattas för samma valda period utan att
räkna överhoppade svar som noll.

Visa underlag hämtar data enbart för det öppnade samtalets aktiva, godkända
simmare. Inget skickas till OpenAI förrän tränaren granskat underlaget och
väljer Föreslå gemensam överenskommelse. Profilens id, namn och grupp ingår
inte automatiskt i modellunderlaget. Avidentifiera fritexten och ta bort
känsliga personuppgifter som inte behövs. Kontroller i webbläsaren och
servern stoppar vanliga fullständiga namn, e-postadresser och personnummer,
men kan inte upptäcka alla personuppgifter. AI:n sorterar underlaget under
relevanta rubriker, skiljer mellan tidsmål, teknik, mentala utmaningar och
långsiktiga ambitioner och fångar simmarens egna reflektioner om motivation
och trivsel. Den ska behålla uttryckliga mål, tider, distanser och
träningsmängder samt föreslå uppföljningsbara mål när anteckningarna ger stöd
för det. Den skiljer uttryckliga överenskommelser i samtalsanteckningarna från
simmarens egna önskemål och observationer från historiken. Data får ge ett
nuläge och frågor att diskutera, aldrig skapa beslut, förklaringar till
resultat eller nya målvärden. Motsägelser ska bli klargörande frågor.

En laddningsindikator visas bara under anropet. Förslaget visas separat och
kan redigeras eller kastas. Oklarheter visas som frågor att diskutera. Om
anteckningar, formulärsvar eller källval ändras behöver underlaget uppdateras.
Servern kontrollerar även att historik och samtalsversion fortfarande stämmer
med den granskade förhandsvisningen innan något skickas till OpenAI.
**Använd förslaget**
lägger texten i Gemensam överenskommelse; befintlig text ersätts först efter
bekräftelse. Tränaren granskar tillsammans med simmaren och väljer sedan
**Spara ändringar**. Inga mål, samtalssvar eller anteckningar ändras automatiskt.

Funktionen följer klubbens AI-inställning och månadstak. Den använder samma
modellinställning som målförslag (`OPENAI_GOAL_MODEL`), med befintlig API-nyckel.
Tokenförbrukning loggas, inte anteckningstexten. Ingen ny miljövariabel behövs.
Anropet följer [OpenAI:s dokumentation om strukturerade svar](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Längre historik och samtalsunderlag inför mötet

Historikperioden är förvald till sedan förra genomförda samtalet, högst tolv
månader. Tränaren kan också välja tre, sex eller tolv månader. Tidigare
överenskommelse bifogas som daterad tidigare källa, inte som ett nytt beslut.
Längre historik sammanfattas per månad; senaste åtta veckorna även veckovis.
Första/sista registrering, RPE-täckning och begränsade källor framgår. Vi
påstår inte att två registreringar betyder obruten historik däremellan.

Testlopp och träningstider grupperas efter samma distans, simsätt, bassäng,
starttyp, övning, hjälpmedel, övriga förutsättningar och tidtagning. Högst tjugo
serier visas med första, senaste och snabbaste registrerade tid under perioden;
antal och begränsning syns. Kommentarer bifogas inte. Tävlingsresultat hålls
isär efter gren, bassäng och källa, med motsvarande periodöversikt för högst
tjugo kombinationer och de senaste tio resultaten. Dessa listor är aldrig ett
påstående om komplett tävlingshistorik eller officiella personbästan.

När simmaren valt **Redo för samtal** visas **Inför samtalet** i tränarens
öppnade samtal. Tränaren kan hämta och granska källorna och därefter välja
**Skapa och spara samtalsunderlag**, även utan interna anteckningar. Det
bygger på de sparade förberedelserna, historiken och tidigare överenskommelse.
Sömn och reflektioner förblir avstängda frivilliga tillval. Osparade ändringar
i samtalsformuläret måste sparas innan underlaget hämtas eller uppdateras.

Analysen sparas med period, källval, begränsningar och tidsstämpel. Tränaren
ser den igen när samtalet öppnas. Uppdatering sker genom aktivt knapptryck,
inte automatiskt vid öppning eller när simmaren skickar sina svar. Samtalets
version kontrolleras före modellkörning och vid sparning; ett ändrat samtal
stoppar sparningen. Modellen får formulera observationer och dialogfrågor,
inte skapa gemensamma beslut eller förklara prestationer med orsakssamband.
Analysen ersätter inga svar, anteckningar, mål eller överenskommelser.

Kör **108_development_talk_preparation.sql** för att spara coach_preparation.
Kolumnen följer samma åtkomst som samtalet; simmarens API-svar utesluter både
den och interna tränaranteckningar. Saknas kolumnen visas ett fel innan ett
betalt modell-anrop görs. Funktionen använder befintlig AI-inställning/kvot.

I **Mina utvecklingssamtal** visas sparad överenskommelse först i ett eget
avsnitt med samtalsdatum och uppföljningsdatum. Radbrytningar bevaras. Egna
förberedelser kan fällas ut i formulärets avsnitt och ordning. Överenskommelsen
är synlig när tränaren sparat den, även innan samtalet markerats genomfört;
det förberedande AI-underlaget visas bara för tränare.
