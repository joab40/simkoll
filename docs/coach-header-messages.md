# Meddelanden i tränarvyns toppmeny

Pratbubblan bredvid **Grupper** öppnar den befintliga meddelandevyn. Dator visar ikon och text; mobil visar en 44 × 44 px ikonknapp. Den aktiva vyn markeras. Gruppfilter och kontomeny finns kvar och kan radbrytas på de smalaste skärmarna.

En röd siffra visar befintligt metadataantal för nya **privata meddelanden till tränarna och simmarnas meddelanden i Info från tränarna**. Siffran är klubbövergripande, inte filtrerad per grupp. Den synliga siffran begränsas till `99+`; knappens tillgängliga namn innehåller hela antalet. Vid noll visas ingen siffra.

Räknaren återanvänder `/api/community?messageCount=true&since=…`: endast ID/antal hämtas, inte meddelandetexter. Uppdatering sker ungefär var 15:e sekund när appen är synlig samt vid fokus/återgång. Det tillkommer inga extra pollningsloopar eller AI-anrop. Meddelanden behöver inte skickas till en ny tjänst.

**Nya sedan öppning, inte individuella läskvitton:** den befintliga markeringen nollställs när meddelandevyn öppnas och tidpunkten sparas lokalt. Personliga tränarkonton använder nu kontots stabila ID som lokal nyckel i stället för den förnybara sessionssignaturen. Läststatus synkas inte mellan enheter. Första öppningen efter uppdateringen kan därför räkna äldre meddelanden som nya. Ett öppnat fönster intygar inte att varje meddelande verkligen lästs.

Meddelanden har flyttats bort från översiktsflikarna och dess inställningslista, men finns kvar i tränarmenyn. Funktionen kan fortfarande döljas via klubbens menyinställning eller tillåtna personliga menyval; samma inställning styr toppikonen. Äldre sparade översiktsordningar kan inte skapa en dubblett.

Ingen ny databasfunktion, SQL eller utökad behörighet behövs.
