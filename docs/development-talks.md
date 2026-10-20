# Utvecklingssamtal

I gruppens förberedelser används kryssrutorna bara för att boka nya samtal.
Ett befintligt samtal öppnas med **Öppna →**, även när statusen är
**Redo för samtal**. Statusen betyder att simmaren skickat sina förberedelser,
inte att samtalet är genomfört.

Tränaren läser svaren och dokumenterar samtalet. Under ett pågående möte kan
tränaren välja **Redigera svar tillsammans** för att rätta simmarens redan
ifyllda svar. Ändringarna blir synliga även för simmaren, så de bör göras i
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
