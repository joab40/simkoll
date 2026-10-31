// Curated product help shared by the visible FAQ, diary help and chat assistant.
// This is documentation, not access to anyone's personal records or feature state.
export const FEATURE_FAQ_UPDATED = '2026-10-31'
export const FEATURE_FAQ_SECTIONS = [
  ['checkin', 'Incheckning och planering'],
  ['diary', 'Min träningsdagbok'],
  ['programs', 'Program, mål och utvecklingssamtal'],
  ['messages', 'Meddelanden, notiser och tävlingar'],
  ['coach', 'Kontrollpanelen och tränarens verktyg'],
]

export const FEATURE_FAQ = [
  { id: 'checkin', section: 'checkin', question: 'Checka in och följ upp passet', answer: [
    'Välj Checka in och svara på hur det känns idag. Välj om du ska träna, har tränat, tävlar, vilar eller är sjuk. ”Jag ska träna” är en avsikt, inte ett genomfört pass. Efter träningen lämnar du en efterrapport för rätt aktivitet och pass.',
    'Rubrik, fokus, planerade meter/minuter, tid och plats syns i veckoplaneringen före incheckning. Dagens serier, upplägg och tränarens passkommentar låses upp efter dagens incheckning. Incheckning en annan dag låser inte upp dagens pass.',
    'Vid simning bekräftar du helt, delvis eller inte genomfört och kan ange egen mängd. Under Annat kan du beskriva aktiviteten och frivilligt ange tid. Avmarkerad träningsregistrering sparar feedback utan att skapa ett genomfört pass. Morgon och eftermiddag/kväll hålls isär.',
  ] },
  { id: 'strength-checkin', section: 'checkin', question: 'Hur checkar jag in före och efter styrketräning?', answer: [
    'Efter Jag ska träna kan du välja Morgonpass – simning, Styrketräning eller Eftermiddag / kväll – simning. Styrketräning finns alltså redan före passet. Detta ersätter inte efterrapporten eller registreringen av genomförd träning.',
    'Efter träningen väljer du Styrka. I stället för ”Hur kändes farten?” får du ”Hur kändes kroppen på gymmet idag?”: 😩 Kraftlös, 😕 Seg, 😐 Normal, 💪 Stark eller 🔥 Explosiv. De motsvarar 1–5 och beskriver kroppens kraft och spänst. Styrka kräver inte att du anger träningstid.',
  ] },
  { id: 'late-checkin', section: 'checkin', question: 'Måste jag efterregistrera gårdagen?', answer: [
    'Nej. En eventuell fråga om missad incheckning är ett erbjudande att efterregistrera gårdagen, inte något som ska ersätta dagens incheckning automatiskt. Välj dagens incheckning om det är dagens träning du vill rapportera. Efterregistrering hör till aktivitetsdagen, inte dagen då svaret skickas.',
    'En närvaromarkering och en incheckning är olika saker: närvaro kan finnas utan svar om hur passet kändes. Anonyma svar kan inte säkert kännas igen som just din tidigare incheckning. Kontrollera datumet i formuläret innan du skickar.',
  ] },
  { id: 'week-planning', section: 'checkin', question: 'Min träning och veckoplanering', answer: [
    'I Min träning den här veckan väljer du Denna vecka eller Nästa vecka ovanför rutnätet. Planering kan ändras från idag till söndag nästa vecka. Genomfört kan bara markeras för pågående vecka till och med idag. Summeringen ovanför rutnätet gäller alltid pågående vecka.',
    'Planera minst tre olika dagar för +2 poäng, högst en gång för veckan som planeringen gäller. Tränaren ser nästa veckas planering när den veckan väljs i kontrollpanelen. Under Veckoplanering ser du gruppens publicerade pass och kalenderaktiviteter; ett publicerat pass är inte automatiskt personligen planerat av dig.',
  ] },
  { id: 'workout-alternatives', section: 'checkin', question: 'Flera passalternativ vid samma träning – vad räknas?', answer: [
    'Frisim, bröstsim eller andra upplägg kan vara alternativ för samma träningstillfälle. De visas tillsammans med egna meter och minuter, medan den planerade mängden visas som ett intervall. Alternativen summeras inte som om alla skulle genomföras.',
    'Efter träningen väljer du vilket upplägg du körde. Bara det valda uppläggets mängd används som uppskattning vid helt genomfört pass, eller den mängd du själv anger. Delvis genomfört ger inte automatiskt hela mängden. Närvaro utan entydigt passval ger ingen gissad mängd. Två faktiskt separata träningstillfällen räknas var för sig.',
  ], coachAnswer: [
    'I Lägg upp ett pass väljer du Nytt träningstillfälle eller Alternativ till befintlig träning. Välj det befintliga tillfället på rätt datum. Samma morgon-/eftermiddagsmärkning slår inte i sig ihop två uttryckligt separata tillfällen. Redan publicerade pass kan öppnas och kopplas som alternativ.',
  ] },
  { id: 'diary-overview', section: 'diary', question: 'Hur fungerar Min träningsdagbok?', answer: [
    'Öppna Meny → Min träningsdagbok eller genvägen i Min profil. Välj Vecka, Månad eller Termin. För egna datum fyller du i Från och Till och trycker Visa period. Perioden får vara högst 366 dagar och går som längst till idag. Jämförelsen gäller föregående lika långa period.',
    'Tryck på en kalenderdag eller filtrera Pass och reflektioner efter aktivitet och söktext. Öppna ett pass för mängd, upplägg, fokus, incheckningskommentarer, programresultat och tävlingsresultat när de finns. Visa hela perioden tar bort dagfiltret. Saknade eller ofullständiga källor märks ut.',
  ] },
  { id: 'whole-picture', section: 'diary', question: 'Min utveckling – hela bilden', answer: [
    'Överst i dagboken samlas genomförd simträning, gym/styrka, träningsvanor, aktuella utvecklingsmål, egna tider/testlopp och registrerade tävlingsresultat. Landträning och dess sparade övningsresultat finns också i historiken. Registrera testlopp + öppnar tidsformuläret med Testlopp förvalt.',
    'Min väg vecka för vecka visar träningsinsats och resultat sida vid sida. Så hänger min träning ihop visar veckornas mängd, RPE och känsla. Detta visar vad som registrerats, inte att en viss träningsmängd orsakat ett resultat. Målens status är aktuell; inga mål avslutas automatiskt och ingen AI körs när du läser sammanställningen.',
  ] },
  { id: 'diary-volume', section: 'diary', question: 'Varför står det Uppgift saknas för simmeter eller tid?', answer: [
    'Rapporterade simmeter och Rapporterad träningstid gäller uttryckligen rapporterade värden. Uppskattning från ett kopplat planerat eller publicerat pass visas separat med ≈. Närvaro kan alltså ge ett genomfört pass och en uppskattning utan att fältet för egenrapporterad mängd har ett värde.',
    'Ett entydigt kopplat pass kan ge planerade meter/minuter som uppskattning. Vid flera alternativ behöver rätt upplägg väljas. Vid delvis genomfört används bara angiven egen mängd, inte automatiskt hela passets mängd. Saknad uppgift är inte noll. Tävling visas separat från simträning; till exempel cykelkilometer blir aldrig simmeter.',
  ] },
  { id: 'diary-history', section: 'diary', question: 'Kommer äldre pass och närvaro med i dagboken?', answer: [
    'Dagboken använder befintlig profilkopplad historik, även från tiden innan dagboken infördes: registrerade aktiviteter, incheckningar, närvaro och kopplade pass när underlaget är tillräckligt tydligt. Välj datum som omfattar den äldre träningen. Att öppna dagboken skapar inte nya närvarorader, pass eller poäng.',
    'Uppgifter som aldrig registrerades går inte att återskapa säkert. Anonyma svar kan inte kopplas tillbaka till din profil. En äldre registrering utan tydligt passval kan sakna mängd eller visas som upplevelse utan entydigt kopplat pass. Kontrollera datum, passval och underlag i passdetaljerna vid en avvikelse.',
  ] },
  { id: 'diary-charts', section: 'diary', question: 'Hur läser jag dagbokens grafer?', answer: [
    'Mängd och upplevelse över tid skiljer rapporterad mängd från uppskattning från kopplade pass. Växla mellan RPE, Känsla, Kropp och Fartkänsla. Svep i graferna för att följa samma datum och tryck på en dag för underlaget. Visa grafens värden som tabell ger siffrorna i text.',
    'Luckor betyder att värden saknas, inte noll. Linjen är en visuell förbindelse mellan svar, inte mätningar mellan punkterna. Skattningar beskriver egen upplevelse, inte bevisad prestationsförmåga. Mer träning eller högre RPE är inte automatiskt bättre utveckling.',
  ] },
  { id: 'diary-reflections', section: 'diary', question: 'Vem ser mina dagboksreflektioner?', answer: [
    'Under ett pass kan du skriva Vad fungerade? och Vad vill jag ta med till nästa pass? Tryck Spara reflektion. Texten skapar inte pass eller poäng och skickas inte till AI bara för att den sparas. Den vanliga tränarvyn och chattassistenten får inte dina privata dagboksreflektioner genom dagboksfunktionen. Vill du ge tränaren återkoppling använder du incheckningskommentar, meddelande eller svar på mål.',
    'Ett separat undantag finns i tränarens AI-underlag för utvecklingssamtal: dagboksreflektioner kan väljas som ett uttryckligt, avstängt tillval. Då visas de utvalda texterna i underlaget som tränaren måste granska före AI-anropet. Detta ger inte chattassistenten tillgång till dem.',
  ] },
  { id: 'own-times', section: 'diary', question: 'Registrera egna träningstider och testlopp', answer: [
    'Öppna Min träningsdagbok → Mina egna tider → Registrera en tid, eller Registrera testlopp + i helhetsbilden. Ange datum, distans, simsätt, bassäng och tid, till exempel 48,21 eller 1:08,42. Välj träningstid eller testlopp och ange start, hel simning/arm/ben, hjälpmedel, tidtagning och andra förutsättningar. Ett genomfört simpass samma datum kan kopplas till tiden.',
    'Bara tider med samma förutsättningar jämförs. Bästa egna tid gäller vald period, inte ett officiellt personbästa. Registreringen skapar inte extra pass, simmeter eller PB-poäng och ändrar inga officiella rekord. Du kan rätta och ta bort dina egna tider. Alla aktiva personliga tränarkonton kan läsa, lägga till och rätta tider för klubbens godkända simmare, men inte radera dem genom tränarvyn.',
    'Tävlingsresultat och egna testlopp hålls isär. Resultat hämtade från Tempus skiljs från manuellt tillagda historiska resultat. Saknade resultat är inte bevis för att ingen tävling simmats. Chattassistenten kan förklara funktionen men har inte dina egna träningstider/testlopp i sitt faktaunderlag.',
  ], coachAnswer: [
    'Öppna Simmare → simmarkortet → Träningstider och testlopp för periodval, graf, historik och rättning. Personligt godkänt tränarkonto krävs; den gamla delade tränarkoden räcker inte.',
  ] },
  { id: 'sleep-check', section: 'diary', question: 'Sömnkoll – hur sparas mitt svar?', answer: [
    'Efter Hur känns det idag kan du vid profilkopplad incheckning frivilligt ange ungefärlig sovtid, 0–14 timmar i kvartsteg, och Dålig, Okej eller Bra sömn. Spara och fortsätt sparar direkt. Frågan kommer högst en gång per aktivitetsdag, även vid flera incheckningar och på andra enheter. Hoppa över idag gör också att frågan inte återkommer för samma dag.',
    'Natten hör till dagen efter. Vid efterregistrering svarar du om natten inför gårdagen. Anonym incheckning ger ingen profilkopplad sömnpost. Historiken finns i Min träningsdagbok → Sömn och återhämtning och är synlig för behöriga tränare i simmarkortet. Chattassistenten får inte därmed tillgång till sömnsvaren.',
  ] },
  { id: 'sleep-direction', section: 'diary', question: 'Vad betyder sömnpilen och varningsfärgen?', answer: [
    'Pilen följer bara upplevd sömnkvalitet, inte sovtid, RPE eller dagens känsla. Veckotrend kräver minst tre giltiga nätter i vardera sjudagarsperioden. Annars kan sju rapporterade nätter inom 14 dagar, varav minst tre senaste veckan, ge en tydligt märkt preliminär korttidstrend. Första tre och sista tre av de senaste sju jämförs. Sovtidens förändring visas separat.',
    'Gul/orange bakgrund betyder att de senaste tre rapporterade nätterna inom sju dagar alla är högst 7 timmar. Rött betyder minst fem sådana nätter inom sju dagar. En längre natt väger inte bort de korta nätterna. Samma signal kan visas i tränarens Individuell uppföljning. Även minst två Dålig-svar eller ett snitt under sju timmar över minst tre rapporterade nätter kan lyftas.',
    'Pilen kan peka uppåt för sömnkänslan samtidigt som färgen varnar för kort sovtid. Text och symbol förklarar signalen. Saknade eller överhoppade svar räknas inte som noll. Sju timmar är en produktregel för samtalsstöd, inte ett rekommenderat sömnmål eller en medicinsk gräns. Ingen träning ändras automatiskt.',
  ] },
  { id: 'strength-program', section: 'programs', question: 'Hur använder jag mitt styrkeprogram?', answer: [
    'Öppna ditt tilldelade styrkeprogram från startsidan eller simmarmenyn. Välj ett av programmets pass, följ övningar, instruktioner och eventuella bilder och spara genomfört pass och dina resultat. Ett program kan innehålla 1–5 separata pass. Du behöver inte genomföra hela programmet vid samma träning.',
    'Resultat och vikter används för att följa din egen träning, inte som ett krav att alltid öka. Styrka räknas separat från simning och landträning. Tidigare programhistorik finns kvar när ett nytt program tilldelas.',
  ] },
  { id: 'dryland-program', section: 'programs', question: 'Landträningsprogram', answer: [
    'Öppna Mina landträningsprogram i simmarmenyn eller ditt tilldelade program på startsidan. Välj ett pass, följ instruktioner och markera genomförda övningar. Repetitioner, sekunder, sträcka och kommentar är frivilliga. Bekräfta genomförd landträning och tryck Spara landpass och resultat. Tidigare resultat är stöd, inte krav att göra mer.',
    'Landträning räknas mot landträningsmålet, separat från styrka och simning. Programmet och veckoplaneringen ger tillsammans högst en landträningsregistrering per dag. Resultaten finns i dagboken. Avmarkering av genomfört behåller övningsresultat men de återställer inte dagen automatiskt.',
  ], coachAnswer: [
    'Tränarmenyn → Landträningsprogram har bibliotek, import, övningsbilder och tilldelning som styrkeprogrammen. Huvudtränare och superadmin skapar/importerar/redigerar; aktiva tränare kan tilldela färdiga program individuellt eller till flera simmare. Nytt landprogram ersätter inte styrkeprogrammet.',
  ] },
  { id: 'program-import', section: 'programs', roles: ['coach'], question: 'Importera styrke- och landträningsprogram', answer: [
    'Huvudtränare och superadmin kan importera XLS, XLSX, PDF, PNG, JPG eller WebP under 3 MB på respektive programsida. Ett program kan innehålla 1–5 separat loggbara pass. Granska pass, övningar, dosering och valfria AI-genererade teknikinstruktioner mot originalet innan sparandet.',
    'Tolkning med AI skickar filen vid aktivt val och använder klubbens AI-inställning och budget. Sparande, tilldelning och läsning gör inga nya AI-anrop. Vanliga aktiva tränare kan tilldela färdiga program men inte importera eller redigera biblioteket.',
  ] },
  { id: 'exercise-images', section: 'programs', question: 'Bilder till styrke- och landövningar', answer: [
    'En bild vid övningen kompletterar textinstruktionen. Tryck på bilden för att se den större. Följ programmets instruktioner och fråga vid oklarheter; en bild är inte en garanti för korrekt teknik.',
  ], coachAnswer: [
    'Huvudtränare och superadmin kan lägga till övningsbilder under importen eller via bibliotekets Övningsbilder. Ladda upp JPG/PNG/WebP under 3 MB eller generera ett AI-förslag. Justera Bildinstruktion för start-/slutläge, utrustning och kameravinkel. Det ändrar inte övningstexten. Granska och välj Använd den här bilden, spara sedan programmet. Varje omgenerering kostar ett nytt AI-anrop. Egna bildfiler skickas till privat lagring, inte till AI-tolkning.',
  ] },
  { id: 'goal-media', section: 'programs', question: 'Utvecklingsmål med bild eller video', answer: [
    'Tränaren skapar och redigerar utvecklingsmål i samråd med dig. Du läser målet under Mina mål → Mina utvecklingsmål och kan skriva ett privat svar som tränarna kan besvara. Du kan inte själv skapa eller ändra tränarens mål eller bilaga.',
    'Ett mål kan ha en bild eller ett kort teknikklipp. Tryck Spela upp video; normal hastighet, 0,5×, 0,25× och helskärm finns. Bilagan lagras privat och kan ses av målets simmare och behöriga tränare via tidsbegränsad länk. Videon skickas inte till AI och assistenten kan inte se eller analysera innehållet.',
  ], coachAnswer: [
    'Bifoga på nytt mål eller välj Bild eller video på målet på ett sparat mål. Video: högst 30 sekunder och 25 MB, MP4/MOV med H.264 eller HEVC; MP4/H.264 fungerar på flest enheter. Ingen automatisk komprimering eller klippning görs. För stora klipp måste kortas/exporteras först. En ny sparad bilaga ersätter den gamla men behåller måltext och återkoppling. Vid misslyckad videouppladdning kan målet redan vara sparat; försök då igen på samma mål.',
    'Skriv stödord i Beskrivning för Skapa målförslag med AI. Prata in beskrivning ger text att granska före infogning. Avidentifiera text och bild; automatiska kontroller hittar inte alla personuppgifter. Granska förslaget och spara aktivt. AI-inställning och budget gäller. Ljudet sparas inte i Simkoll.',
  ] },
  { id: 'talks', section: 'programs', question: 'Mina utvecklingssamtal', answer: [
    'Öppna det aktiva samtalskortet under Dagens pass när tränaren aktiverat det. Svara på förberedelserna steg för steg eller välj Spara och fortsätt senare. Redo för samtalet skickar förberedelserna till tränarna; det betyder inte att mötet är genomfört.',
    'I Mina utvecklingssamtal under din profil ser du sparad gemensam överenskommelse, samtalsdatum och eventuellt uppföljningsdatum. Dina förberedelser kan fällas ut i samma grupper och ordning som formuläret. Överenskommelsen visas när tränaren sparat den, även innan mötet markerats genomfört. Interna tränaranteckningar och tränarens förberedande AI-underlag visas inte för dig.',
  ] },
  { id: 'talk-meeting', section: 'programs', roles: ['coach'], question: 'Hur går jag vidare när simmaren är redo för samtal?', answer: [
    'Öppna Utvecklingssamtal → Gruppens förberedelser → Öppna på rätt simmare. Kryssrutorna används för att boka nya samtal, inte öppna befintliga. Tränaren ser samma frågor, rubriker och ordning som simmaren; tomma frågor visas som Ej besvarad.',
    'Under mötet kan du välja Redigera svar tillsammans för att komplettera i samråd med simmaren. Ändringarna syns även för simmaren. Genomförda samtals svar är skrivskyddade. Spara ändringar behåller status; Markera som genomfört sparar och avslutar uttryckligen. En samtidig ändring i en annan vy kan stoppa sparandet så nyare svar inte skrivs över.',
  ] },
  { id: 'talk-preparation', section: 'programs', roles: ['coach'], question: 'AI-underlag inför ett utvecklingssamtal', answer: [
    'När simmaren är Redo för samtal kan du öppna Inför samtalet, hämta och granska källorna och sedan välja Skapa och spara samtalsunderlag. Det startar inte automatiskt när simmaren blir redo. Tränaranteckningar behövs inte för detta förberedande underlag.',
    'Välj sedan förra genomförda samtalet, högst tolv månader, eller tre, sex eller tolv månader. Sparade förberedelser, tidigare överenskommelse, träningshistorik, mål, testlopp/träningstider och registrerade tävlingsresultat sammanfattas. Äldre historik sammanfattas månadsvis, senaste åtta veckorna mer detaljerat. Olika förutsättningar jämförs inte som samma resultat, och listan är inte en komplett PB-historik.',
    'Sömn och privata dagboksreflektioner är avstängda frivilliga tillval. Granska och avidentifiera underlaget innan det skickas till OpenAI. Underlaget sparas med period, källor och tid enbart för tränare. Uppdatering kräver nytt aktivt val. Det ger observationer och samtalsfrågor, inte nya beslut eller mål.',
  ] },
  { id: 'talk-agreement-ai', section: 'programs', roles: ['coach'], question: 'Föreslå gemensam överenskommelse med AI', answer: [
    'Tränarens aktuella interna anteckningar ingår alltid. Simmarens förberedelser och vald periods träningshistorik är förvalda och kan väljas bort. Historiken kan sammanfatta simning, styrka, kontinuitet, rapporterad respektive uppskattad mängd, RPE, mål, testlopp och registrerade tävlingsresultat. Sömn och dagboksreflektioner är separata, avstängda tillval.',
    'Välj Visa underlag, granska och avidentifiera, sedan Föreslå gemensam överenskommelse. Ändrade anteckningar, svar eller källor kräver ny granskning. AI ska skilja tidsmål, teknikmål, mentala utmaningar och långsiktiga ambitioner samt fånga motivation och trivsel. Önskemål och observationer får inte göras om till påhittade överenskommelser, fakta eller målvärden.',
    'Använd förslaget fyller bara överenskommelsens text. Granska tillsammans, redigera och välj Spara ändringar. Inga utvecklingsmål registreras automatiskt. Kort röstanteckning, högst två minuter, är ett frivilligt alternativ: informera och få godkännande från alla som hörs före överföring till OpenAI. Granska transkriberingen innan den läggs till; ljudet sparas inte i Simkoll. Klubbens AI-inställning och budget gäller.',
  ] },
  { id: 'agreement-card', section: 'coach', roles: ['coach'], question: 'Var hittar jag överenskommelsen i simmarkortet?', answer: [
    'Öppna simmarkortet under Simmare. Vår överenskommelse under Simmarens riktning visar ett utdrag från senaste genomförda samtalet med en sparad gemensam överenskommelse, samtalsdatum och eventuellt uppföljningsdatum. Visa hela visar texten. Ett nytt påbörjat eller tomt samtal ersätter inte den tidigare färdiga texten.',
    'Öppna utvecklingssamtalet går till exakt det samtalet för läsning och redigering. Spara där och välj Tillbaka till simmarkortet, eller Uppdatera i kortet. Läsfel skiljs från att överenskommelse saknas. Kortet visar inga interna anteckningar och skapar varken AI-analys eller nya mål.',
  ] },
  { id: 'private-reply', section: 'messages', question: 'Privata svar i Info från tränarna', answer: [
    'Tränaren kan klicka på simmarens meddelande och skriva ett privat svar inbakat under det i samma chattfönster. Svaret märks med 🔒 och visas för mottagaren och tränarna, inte övriga simmare. Simmaren kan även läsa det under privata meddelanden. Tränarens vanliga skrivfält längst ner skickar fortfarande till gruppen.',
  ], coachAnswer: [
    'Skriv själv eller välj Föreslå svar med AI. Valt meddelande, ditt utkast och relevant hjälp-, pass-, tävlings- och tränarinfo för simmarens grupp skickas då till OpenAI. Andra simmares privata svar, sömn och interna tränaranteckningar ingår inte. Granska källor och kontrollpunkter. Använd förslaget ändrar bara svarstexten; Skicka privat skickar. AI kan ha fel och följer klubbens AI-inställning och budget.',
  ] },
  { id: 'header-messages', section: 'coach', roles: ['coach'], question: 'Meddelanden i toppmenyn', answer: [
    'Öppna pratbubblan bredvid Grupper i tränarvyn. På mobil visas en kompakt ikon, på dator även Meddelanden. Röda siffran räknar nya privata meddelanden till tränarna och simmarnas inlägg i Info från tränarna sedan meddelandevyn senast öppnades på denna enhet. Den gäller hela klubben, inte gruppfiltret.',
    'Markeringen nollställs när du öppnar meddelandevyn och är inte en individuell läskvittens. Antalet uppdateras ungefär var 15:e sekund när appen är synlig och när du återvänder. Meddelanden finns även i tränarmenyn men inte som extra översiktsflik.',
  ] },
  { id: 'push', section: 'messages', question: 'Pushnotiser och träningspåminnelser', answer: [
    'Superadmin aktiverar Pushnotiser för klubben. Varje användare godkänner sedan Aktivera notiser på varje enhet: simmare under profilen, tränare via Notiser på min enhet. På iPhone/iPad behöver Simkoll öppnas från hemskärmen som webbapp; telefonen måste stödja Web Push. På Android används en webbläsare med Web Push-stöd.',
    'Kategorier omfattar Info från tränarna, privata meddelanden, utvecklingsmål/samtal, öppnad tävlingsanmälan och Nya publicerade simpass. Nya pass-notisen gäller berörda grupper när tränaren publicerar, inte bara sparar ett utkast. Flera passalternativ i en gemensam publicering ger en gemensam notis. Passet öppnas fortfarande enligt incheckningsreglerna.',
    'Om tränaren aktiverat efterrapportpåminnelse kan en notis skickas ungefär 2,5 timmar efter Jag ska träna när efterrapport för samma pass saknas. Tiden räknas från incheckningen, inte verifierad passstart eller sluttid. En separat kvällspåminnelse omkring kl. 20 svensk tid kan gälla planerad träning utan dagens incheckning. Högst en träningspåminnelse per simmare och dag. Du kan stänga av kategorin Påminnelser om träningsincheckning på varje enhet.',
    'Push är ingen leverans- eller läsgaranti. Fokusläge, uppkoppling och telefonens inställningar kan påverka. Reaktioner och öppna peppinlägg ger inga pushnotiser. Utloggning kopplar bort enheten. Chattassistenten kan varken se enhetens godkännande eller aktivera notiser åt dig.',
  ], coachAnswer: [
    'Huvudtränare och superadmin väljer påminnelser under Inställningar → Påminnelser om incheckning och trycker Spara påminnelser. Simkoll ordnar den automatiska kontrollen vid sparandet; ingen ny Vercel-variabel eller manuell kopiering av cron-hemligheter behövs. Kontroll sker ungefär var femte minut när nödvändiga databasuppdateringar och pushkonfiguration finns.',
  ] },
  { id: 'competition-pm', section: 'messages', question: 'Tävlings-PM, klasser och grenanmälan', answer: [
    'Under Meny → Mina grenar väljer du en kommande tävling för din grupp och kan öppna original-PM även innan grenanmälan öppnats. En saknad klass betyder inte att alla får delta, utan att klassen inte är angiven i den tolkade listan. Kontrollera PM och fråga vid oklarheter.',
    'När grenanmälan är öppen väljer du grenar och kontrollerar pass, distans och simsätt. Spara utkast sparar utan att skicka; Skicka till tränarna skickar valen. Assistenten kan använda dina tillgängliga sparade grenval men kan inte läsa själva PM-bilagan eller garantera att alla klasser tolkats rätt.',
  ], coachAnswer: [
    'Bifoga original-PM som PDF eller bild under 3 MB när tävlingen skapas eller senare med Bifoga PM. Bilagan är separat från grenprogrammet och finns kvar vid uppdaterad tolkning. Granska och rätta programmet, bekräfta granskningen och välj Godkänn och spara program. Saknad åldersklass och saknad/ej känd passtid behöver inte blockera sparande; kontrollera dem mot originalet. Ändrad eller borttagen gren med befintliga anmälningar kan däremot blockera sparandet.',
    'Öppna grenanmälan för simmare görs separat efter sparat program. Att stänga anmälan tar inte bort tidigare val. Om tävlingen sparas men PM-uppladdningen misslyckas, försök bifoga igen på samma tävling.',
  ] },
  { id: 'competition-export', section: 'coach', roles: ['coach'], question: 'Tävlingskalender och CSV med anmälda grenar', answer: [
    'Passerade tävlingar visas minimerade och nedtonade i tävlingskalendern och kan öppnas för detaljer. CSV-exporten av anmälda grenar innehåller grennummer. Raderna sorteras först per simmare och därefter i grenordning, inte bara alfabetiskt på gren eller efter passnamn.',
  ] },
  { id: 'control-panel', section: 'coach', roles: ['coach'], question: 'Vad finns i kontrollpanelen och veckomatrisen?', answer: [
    'Kontrollpanelen samlar den tidigare sidan Förra veckan. Ett gemensamt veckoval styr planering, rapportkort, dag-för-dag och Veckans incheckningar. Pågående vecka visar svar till och med idag; framtida vecka visar planering. Uppdatera hämtar underlaget igen. Gruppfiltret styr vilka simmare som ingår.',
    'Matrisen visar morgonsimning, styrka, landträning och eftermiddagssimning. ◆ är antal som personligen planerat, ✓ är registrerat genomförande eller närvaro. Ej planerat betyder saknad veckoplanering, inte förväntad frånvaro. En simmare kan ingå i både planerat och genomfört. Tryck på rutan för namn, status, källa och incheckningar för just det passet.',
    'Rapporterade träningspass räknas från efterrapporter; kommentars-/betygsantalet visar vilka av dessa som har återkoppling. Enbart tränarmarkerad närvaro syns i matrisen men ger inte en efterrapport. Beräknad träningsbelastning är RPE × rapporterade minuter för pass där båda finns; kortet anger svarstäckningen. Det är varken gruppens totala uppmätta belastning eller ett medicinskt mått. Sjukdom och Sömnkoll har egna kort.',
  ] },
  { id: 'followup', section: 'coach', roles: ['coach'], question: 'Låg känsla eller låg kroppskänsla – vad är skillnaden?', answer: [
    'I Kontrollpanel → Individuell uppföljning gäller låg känsla den allmänna dagskänslan från Hur känns det idag. Låg kroppskänsla gäller kroppens fysiska upplevelse, som tung/öm eller pigg/fräsch. På gymmet motsvarar Kraftlös och Seg de två låga kroppssvaren.',
    'Båda signalerna kräver svar på 1–2 av 5 på minst två olika aktivitetsdagar i det angivna sjudagarsintervallet. Minst ett lågt svar gör att dagen räknas; flera svar samma dag är fortfarande en dag, inte ett medelvärde. Saknade svar räknas inte som låga. Hög ansträngning gäller RPE 8–10 på minst två dagar. Upprepad sjukdom och sömnsignaler kan också lyftas.',
    'Listan är minimerad från början men visar antalet för Ta en dialog. Intervallet följer sju dagar bakåt från vald veckas sista dag eller idag för pågående vecka, så signalen försvinner inte automatiskt på måndag. Hovra, fokusera eller tryck på signalen/informationsikonen för förklaring och datumunderlag. Tryck igen, utanför eller Escape stänger. Öppna simmarkortet för underlag eller Skriv privat för dialog. Det är inte en diagnos eller ett automatiskt träningsbeslut.',
  ] },
  { id: 'metric-answers', section: 'coach', roles: ['coach'], question: 'Vilka svar ligger bakom korten under Idag?', answer: [
    'Tryck på Gruppens känsla, Upplevd ansträngning, Passet eller Upplägget för svaren bakom medelvärdet. Listan följer valt datum/period och gruppfilter och visar namn för profilsvar, värde, kommentar, aktivitetsdatum och inlämningstid. Anonyma svar visas utan namn. Du kan söka och sortera. Flera giltiga svar från samma simmare ingår var för sig i detta medelvärde, till skillnad från dagsräkningen i Individuell uppföljning.',
    'Gruppens känsla omfattar incheckningar med ett värde. RPE, Passet och Upplägget omfattar efterrapporter från träning/tävling med respektive värde. Samma svarsvy finns i Kontrollpanel → Veckans incheckningar. I Aktivitet → Vad har gruppen gjort? kan du öppna statusrader för namn, passval och kommentarer. Antal svar är inte alltid antal unika simmare. Att öppna underlaget gör inget AI-anrop.',
  ] },
  { id: 'card-directions', section: 'coach', roles: ['coach'], question: 'Riktningspilar och expansionspilar i simmarkortet', answer: [
    'Den runda riktningsmarkeringen är inte samma sak som vinkeln som öppnar kortet. Styrkeprogram, landträningsprogram, träningstider/testlopp och sömn använder enhetliga expansionspilar; tryck för att öppna eller stänga.',
    'Styrka/landträning jämför registrerade dagar av respektive typ mellan två sjudagarsperioder, inte uppmätt styrkeökning. Träningstider jämför bästa tid mellan de två senaste datumen i serier med samma förutsättningar. Sömnpilen följer bara sömnkvalitet. Ett streck betyder otillräckligt underlag, laddning eller fel. Läs texten vid pilen; mer träning är inte automatiskt bättre.',
  ] },
  { id: 'workout-generation', section: 'coach', roles: ['coach'], question: 'Skapa passförslag med AI och variationsreglaget', answer: [
    'I Lägg upp ett pass → Skapa passförslag väljer du inriktning, distans, tidsåtgång, mål-RPE, grupper och frivilligt önskemål. Reglaget Variation i passförslaget har Biblioteksnära, Försiktig variation, Balanserat (förvalt), Mer variation och Nytänkande. Till vänster återanvänds mer av biblioteket, till höger tillåts friare upplägg. Samma språkmodell används; träningsramarna gäller i alla lägen.',
    'Att öppna formuläret eller dra reglaget gör inget AI-anrop. Först Skapa passförslag skickar valen och högst åtta relevanta bibliotekspass med aggregerade betyg/RPE till OpenAI, inte enskilda simmarsvar. Knappen visar snurrande indikator och Skapar passförslag… under arbetet och är spärrad mot dubbelklick. Indikatorn slutar när begäran är klar eller misslyckas. Inställningen för minskad rörelse respekteras.',
    'Resultatet är ett redigerbart utkast med biblioteksreferenser och redovisning av nytt/anpassat. Granska seriernas summering, nivå, tider och intervall före publicering. AI kan räkna eller tolka fel. Inget publiceras automatiskt. Klubbens AI-inställning och tokenbudget gäller; ett fel är inte ett publicerat pass.',
  ] },
  { id: 'workout-preview', section: 'coach', roles: ['coach'], question: 'Kan jag förhandsgranska ett pass före publicering?', answer: [
    'Välj Förhandsgranska som simmare bredvid Publicera passet eller Spara ändringar. Det aktuella osparade utkastet visas med samma passkort som simmaren, upplåst som efter incheckning. Växla mellan Mobil och Webb. Webbvyn kan rullas i sidled på mindre skärm.',
    'Vid flerfliksimport kan du visa alla valda alternativ eller ett i taget; ej valda flikar ingår inte och mängderna summeras inte. Stäng, Escape eller Tillbaka och redigera återgår med utkast och granskningsbekräftelse kvar. Förhandsgranskning sparar eller publicerar inget, skickar inga notiser och gör inga AI-anrop. Publicera separat när du är nöjd.',
  ] },
  { id: 'workbook-import', section: 'coach', roles: ['coach'], question: 'Flera pass från Excel eller delad Drive-mapp', answer: [
    'Lägg upp ett pass → Välj från delad Drive-mapp stöder Google Kalkylark, XLS och XLSX med flera flikar. Hela dokumentet läses in för granskning utan AI-anrop. Granska och redigera varje flik och välj de riktiga passen. Insimsbibliotek, dolda flikar och okända mallar är inte förvalda. Högst 20 flikar och filer under 3 MB stöds.',
    'Ange gemensamt datum, morgon/eftermiddag och grupper. Valda flikar blir alternativ för samma träning, med egna meter, minuter och serier. Enbart insimsvarianter behöver inte publiceras som hela pass. Veckoplaneringen visar mängdintervall, inte summan av alternativen. Simmaren väljer körda upplägget i efterrapporten. En gemensam publicering ger en gemensam push när kategorin är påslagen.',
  ] },
  { id: 'calendar-link', section: 'coach', roles: ['coach'], question: 'Hur kopplar jag en aktivitet till rätt SportAdmin-händelse?', answer: [
    'I Planering → Lägg till eller Redigera aktivitet väljer du Koppla till kalenderaktivitet för rätt datum. Välj rätt träning i stället för att låta en annan kalenderhändelse samma dag styra kopplingen. Tid, plats och berörda grupper fylls från valet.',
    'Kalenderrader för flera grupper som tränar samma datum, tid och plats kan väljas tillsammans som samma tillfälle. Då följer samtliga valda gruppers kopplingar med; kontrollera Berörda grupper före sparandet. Olika tider eller platser ska inte kopplas som ett gemensamt tillfälle. Kalenderkoppling är inte i sig bevis på genomförd träning.',
    'Koppla loss pass tar bort passets koppling, inte originalpasset i passbiblioteket. Spara och kontrollera med omladdning vid osäkerhet. Assistenten kan beskriva flödet men kan inte ändra kopplingar eller hävda att något sparats åt dig.',
  ] },
  { id: 'storage', section: 'coach', roles: ['coach'], question: 'Lagring och historik', answer: [
    'Endast superadmin öppnar Lagring och historik i tränarmenyn. Databasen visas separat från bilder, filmer och dokument i fillagringen, med fördelning, dagliga mätpunkter och senaste serverhanterade filoperationer.',
    'Budgetar anges manuellt i GB. Kvar betyder kvar till angiven budget, inte en avläst Supabase-abonnemangsgräns. Okänd budget eller filstorlek visas som okänd, inte säkert ledigt utrymme. Gul varning gäller 80 % och röd 90 %, utan automatisk radering eller uppladdningsblockering.',
    'Uppdatera och spara mätpunkt uppdaterar dagens punkt. Historik börjar från aktivering; äldre nivåer kan inte återskapas. Loggen är inte fullständig för ändringar utanför Simkoll och visar inga privata texter eller filinnehåll. Detta är inte en faktureringsvy; verifiera kapacitet i Supabase Dashboard. Chattassistenten kan inte läsa aktuell användning eller budget och ska inte gissa siffror.',
  ] },
  { id: 'games', section: 'messages', question: 'Veckans spel och All time-topplistan', answer: [
    'Spelkorten visar Veckans spel, Tidigare veckors spel och All time-topplista när funktionen är aktiverad. Bland spelen finns Preppes balansjakt, längdhopp och 100 meter häck. Öppna spelet för dess aktuella kontroller och rekord. I häcklöpning bygger du fart och tajmar tio häckar; träffar kostar fart och snabbaste tiden vinner.',
    'All time-topplistan sammanför spelens rekord över tid och inkluderar Preppes balansjakt. Spelresultat är inte simprestationer. Tränarens testläge sparar inte simmarresultat eller poäng. Chattassistenten har inte aktuell spelranking i sitt underlag och ska inte gissa placeringar.',
  ] },
]

export function featureFaqFor(role = 'swimmer', section) {
  const audience = role === 'coach' ? 'coach' : 'swimmer'
  return FEATURE_FAQ.filter(item => (!item.roles || item.roles.includes(audience)) && (!section || item.section === section))
    .map(({ coachAnswer, ...item }) => ({ ...item, answer: [...item.answer, ...(audience === 'coach' ? coachAnswer || [] : [])] }))
}

export function featureFaqGuide(role) {
  return `\nAktuell funktionshjälp för ${role === 'coach' ? 'tränare' : 'simmare'} (samma källa som appens FAQ):\n` + featureFaqFor(role)
    .map(item => `${item.question}\n${item.answer.join('\n')}`).join('\n\n') + '\nHjälpen beskriver funktioner, inte åtkomst till personliga uppgifter. Använd bara aktuellt behörigt underlag för faktiska värden. Hitta inte på sömnsvar, dagboksreflektioner, testlopp, meddelanden, bilageinnehåll, AI-analyser eller lagringssiffror som saknas i chattunderlaget. Du kan förklara var användaren hittar dem men inte ändra, generera, publicera, skicka eller spara något åt användaren.\n'
}
