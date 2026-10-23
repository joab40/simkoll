# AI-förslag för privata chattsvar

Tränaren kan svara själv eller trycka Föreslå svar med AI. Förslaget är separat och kan granskas, redigeras, användas eller kastas. Använd förslaget ändrar bara svarstexten. Meddelandet skickas enbart med Skicka privat. Ett eget utkast behålls om AI-anropet misslyckas. Vid ändrat eget utkast visas en varning innan förslaget används. Ingen AI körs vid sidladdning.

Det godkända underlaget till OpenAI är vald simmares meddelandetext, tränarens eventuella utkast och relevant hjälpinformation, pass-, tävlings- och tränarinfo för simmarens grupp. Servern hämtar ursprungsmeddelandet färskt via id och kontrollerar att avsändaren är en aktiv, godkänd simmare. Klienten kan inte byta mottagarprofil eller skicka egna verifierade källor. Inga andra simmares privata meddelanden, sömnsvar eller interna tränaranteckningar hämtas. Profilnamn läggs inte till automatiskt. Namn som skrivits i själva meddelandet eller utkastet kan ingå.

Passmetadata omfattar högst fem grundplaner och fem publicerade pass inom 14 dagar. Serier och passinnehåll skickas inte. Tävlingskalendern omfattar högst fem tävlingar inom 90 dagar och upp till 1200 tecken av respektive publicerad information. PM-filer läses inte. Högst tre relevanta meddelanden från tränarnas gruppkanal används. Kalender och gruppinfo hämtas bara när frågans ord ger anledning till det; detta är ingen fullständig fritextsökning över Simkoll. Det går alltid att svara själv när underlag saknas.

`POST /api/community` action `propose-private-reply` är endast för tränare. Befintlig AI-avstängning och tokenbudget gäller. Befintlig OPENAI_API_KEY och OPENAI_MODEL används, standard gpt-4o-mini; inga nya miljövariabler eller SQL krävs. Responses API med strikt JSON-schema, store:false, 45 sekunders timeout och max 1200 outputtokens. Käll-ID kontrolleras på servern; klienten visar de verkliga källetiketterna och eventuella kontrollpunkter. AI kan fortfarande formulera felaktiga uppgifter, så tränaren granskar alltid förslaget.

AI-loggen innehåller modell, feature private_reply_draft, användarroll, tokenantal och status – inte frågan, utkastet, källtexterna eller svaret. Tester använder enbart mockade datakällor och modellsvar och skickar inga riktiga simmaruppgifter till OpenAI.

API-formatet följer OpenAI:s dokumentation om [strukturerade svar](https://developers.openai.com/api/docs/guides/structured-outputs).
