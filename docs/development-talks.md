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

Vid interna anteckningar finns **Föreslå gemensam överenskommelse**. Knappen
skickar bara den aktuella anteckningstexten till OpenAI, inte profiluppgifter,
simmarens formulärsvar eller den befintliga överenskommelsen. Avidentifiera
texten och ta bort känsliga personuppgifter först. Kontroller i webbläsaren
och servern stoppar vanliga fullständiga namn, e-postadresser och personnummer,
men kan inte upptäcka alla personuppgifter. AI:n sorterar anteckningarna under
relevanta rubriker, skiljer mellan tidsmål, teknik, mentala utmaningar och
långsiktiga ambitioner och fångar simmarens egna reflektioner om motivation
och trivsel. Den ska behålla uttryckliga mål, tider, distanser och
träningsmängder samt föreslå uppföljningsbara mål när anteckningarna ger stöd
för det. Den får inte göra önskemål till bekräftade beslut eller hitta på
fakta, mätvärden eller uppföljning.

En laddningsindikator visas bara under anropet. Förslaget visas separat och
kan redigeras eller kastas. Oklarheter visas som frågor att diskutera. Om
anteckningarna ändras behöver ett nytt förslag tas fram. **Använd förslaget**
lägger texten i Gemensam överenskommelse; befintlig text ersätts först efter
bekräftelse. Tränaren granskar tillsammans med simmaren och väljer sedan
**Spara ändringar**. Inga mål, samtalssvar eller anteckningar ändras automatiskt.

Funktionen följer klubbens AI-inställning och månadstak. Den använder samma
modellinställning som målförslag (`OPENAI_GOAL_MODEL`), med befintlig API-nyckel.
Tokenförbrukning loggas, inte anteckningstexten. Ingen ny SQL eller miljövariabel behövs.
Anropet följer [OpenAI:s dokumentation om strukturerade svar](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
