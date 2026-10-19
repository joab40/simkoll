import { COACH_NAV_ITEMS } from '../shared/coach-navigation.js'

const coachRoleName = (role) => role === 'superadmin' ? 'Superadmin' : role === 'head_coach' ? 'Huvudtränare' : 'Tränare'
const settingEnabled = (settings, key) => settings ? settings[key] !== false : null

export function buildCoachAssistantFeatureSnapshot({ accountRole = 'coach', webappSettings, personalSettingsEnabled = false, personalSettings = {}, developmentTalksEnabled = true, pushSettings, openChatSettings } = {}) {
  const elevated = accountRole === 'head_coach' || accountRole === 'superadmin'
  const usesPersonalSettings = elevated && personalSettingsEnabled
  const effective = usesPersonalSettings
    ? { ...webappSettings, ...personalSettings, coach: { ...(webappSettings?.coach || {}), ...(personalSettings?.coach || {}) }, overview: { ...(webappSettings?.overview || {}), ...(personalSettings?.overview || {}) } }
    : webappSettings
  const nav = COACH_NAV_ITEMS.map(({ key, label }) => {
    const inMenu = key === 'today' ? true : settingEnabled(effective ? (effective.coach || {}) : null, key)
    const overviewSetting = key === 'today' ? true : settingEnabled(effective ? (effective.overview || {}) : null, key)
    return { key, label, inMenu, overviewShortcut: inMenu === false || overviewSetting === false ? false : inMenu === null || overviewSetting === null ? null : true }
  })
  const swimmerSettings = effective?.swimmer || webappSettings?.swimmer || {}
  const featureSettings = [
    { feature: 'AI-stöd', enabled: settingEnabled(effective, 'aiEnabled') },
    { feature: 'Veckoplanering i simmarvyn', enabled: settingEnabled(swimmerSettings, 'planning') },
    { feature: 'Dagens pass i simmarvyn', enabled: settingEnabled(swimmerSettings, 'workout') },
    { feature: 'Tävlingsresultat i simmarvyn', enabled: settingEnabled(swimmerSettings, 'competition') },
    { feature: 'Utvecklingssamtal i simmarvyn', enabled: developmentTalksEnabled },
    { feature: 'Veckans spel i simmarvyn', enabled: settingEnabled(swimmerSettings, 'games') },
    { feature: 'Pepp och meddelanden i simmarvyn', enabled: settingEnabled(swimmerSettings, 'community') },
    { feature: 'Träningsstjärnor i simmarvyn', enabled: settingEnabled(swimmerSettings, 'stars') },
    { feature: 'Appfeedback för simmare', enabled: settingEnabled(swimmerSettings, 'appFeedback') },
    { feature: 'Simmarens egna peppmeddelanden', enabled: settingEnabled(swimmerSettings, 'customPep') },
    { feature: 'Visuella effekter i simmarvyn', enabled: settingEnabled(effective, 'swimmerEffects') },
    { feature: 'Säsongsteman i simmarvyn', enabled: settingEnabled(effective, 'swimmerThemesEnabled') },
    { feature: 'Info från tränarna', enabled: openChatSettings ? openChatSettings.enabled === true : null, coachOnly: openChatSettings ? openChatSettings.coachOnly === true : null },
    ...(pushSettings ? [{ feature: 'Pushnotiser för klubben', enabled: pushSettings.enabled === true, categories: { coachMessages: pushSettings.coachMessages !== false, privateMessages: pushSettings.privateMessages !== false, developmentTalks: pushSettings.developmentTalks !== false, competitionEntries: pushSettings.competitionEntries !== false }, trainingReminders: { ...pushSettings.checkinReminders } }] : []),
  ]
  return {
    role: coachRoleName(accountRole),
    globalNavigationOrPersonalOverride: usesPersonalSettings ? 'personliga menyval för detta konto' : 'klubbens globala menyval',
    personalSettingsEnabled: usesPersonalSettings,
    menuAndSettingsAreReadOnlyToAssistant: true,
    navigation: nav,
    featureSettings,
  }
}

export const COACH_ASSISTANT_FEATURE_GUIDE = `Tränarfunktioner och inställningar:
- Träningspåminnelser finns under Inställningar och kan slås på av huvudtränare eller superadmin. Tryck Spara påminnelser i den publicerade appen: Simkoll ordnar schemaläggning och behörighet automatiskt, utan nya Vercel-variabler eller manuell kopiering av hemligheter. Databasuppdateringarna 096 och 097 behövs; om 096 redan körts behöver bara 097 köras och inställningarna sparas. Det går att aktivera en kvällspåminnelse omkring kl. 20 svensk tid för utebliven incheckning när gruppen har planerat pass, och en efterrapportpåminnelse. Efterrapportpåminnelsen skickas ungefär 2,5 timmar efter att simmaren svarat ”Jag ska träna”, om efterrapport för samma pass saknas. Tiden räknas från incheckningen, inte från en verifierad passstart. Simmaren kan stänga av träningspåminnelser per enhet och måste redan ha godkänt push på den enheten. Högst en träningspåminnelse per simmare och dag. Kontroll sker var femte minut med Supabase Cron. Pushleverans garanteras inte.
- Simmarvyn har Min träningsdagbok i menyn och Min profil. Där visas profilkopplad historik, veckor, kalender, passdetaljer, tävlingsresultat och jämförbara grafer över mängd, kontinuitet, RPE och känsla. Träningsmängd som rapporterats av simmaren skiljs från uppskattning från kopplat pass. Egna dagboksreflektioner är till för simmarens egen dagbok och ingår inte i tränarassistentens underlag. Varken visning eller sparande gör AI-anrop eller ger nya träningsregistreringar/poäng. Utvecklingsmål skapas fortsatt av tränaren i samråd med simmaren. Sparande av dagboksreflektioner kräver migration 095.
- Utvecklingsmål skapas bara i tränarvyn, i samråd med simmaren. Under Utvecklingsmål → Nytt mål skriver tränaren stödord eller påbörjad måltext direkt i Beskrivning och kan välja Skapa målförslag med AI. AI skriver då rubrik, sammanhängande beskrivning direkt till simmaren och ett nästa steg när underlaget stödjer det. Prata in beskrivning transkriberas via befintlig ljudtjänst; tränaren granskar texten och lägger till den i Beskrivning. Rubrik, beskrivning, nästa steg och eventuell bild används, men inga andra profiluppgifter. Innan AI-anrop gör Simkoll en lokal och serverbaserad kontroll av sannolika fullständiga namn, e-postadresser och personnummer. Tränaren ska ändå avidentifiera text och bild och använda exempelvis ”simmaren”; kontrollen kan inte upptäcka alla personuppgifter. AI-förslag sparas inte automatiskt och ska inte hitta på resultat, tider eller överenskommelser. Tränaren väljer Använd förslaget, redigerar vid behov och sparar sedan målet. Läsbara bildobservationer och osäkerheter redovisas separat. Analysbild (JPG/PNG/WebP under 3 MB) sparas privat med målet och visas för tränaren och den berörda simmaren via tidsbegränsad bildlänk. Bilden skickas till AI bara när tränaren begär målförslag, inte när den bifogas eller visas. Simmare får ingen målskapande funktion. Transkribering och målförslag följer klubbens AI-inställning och budget. Bildlagring kräver migration 088; ingen ny obligatorisk miljövariabel behövs.
- Kortet Aktivitet → Vad har gruppen gjort? har klickbara rader för Jag ska träna, Jag har tränat, Ingen träning idag och Jag känner mig sjuk. Klicka på antalet svar eller raden för att se namn, status, passval, aktivitetsdatum, inlämningstid och kommentarer. Svarsvyn följer samma datum/period och gruppfilter som kortet och kan sökas på namn eller kommentar. Flera svar från samma profil visas separat, medan profilantalet räknar unika kända profiler. Anonyma svar visas utan namn; saknade profiler märks Profil saknas. Även kategorier med noll svar kan öppnas. Att öppna svarsvyn gör inga AI-anrop.
- Incheckningen har ett eget passval för morgon eller eftermiddag/kväll när simmaren ska simma eller har simmat. Närvaro under simpass använder bara genomförd, registrerad simträning med samma passval; Ska träna är en avsikt, inte bekräftad närvaro. Morgonfeedback får inte ge kvällsnärvaro. Äldre svar utan passval visas som Pass ej angivet och skapar inte automatiskt närvaro på båda passen. Tränaren kan fortfarande markera närvaro för rätt pass manuellt. En senare manuell närvaromarkering gäller framför äldre feedback. AI-analys använder explicit passval för att hålla morgon- och eftermiddagsfeedback isär. Funktionen kräver migration 087.
- Under Idag och Förra veckan går det att klicka på korten Gruppens känsla, Upplevd ansträngning, Passet och Upplägget för att se underliggande svar. Svarsvyn följer valt datum/period och gruppfilter och visar namn för profilsvar, värde, aktivitetsdatum, inlämningstid och kommentar. Anonyma svar visas utan profilkoppling. Flera svar från samma simmare visas var för sig eftersom varje giltigt svar ingår i medelvärdet. Det går att söka och sortera svar; hjälpsymbolen förklarar skalan separat. RPE, Passet och Upplägget använder enbart svar efter träning/tävling med angivet värde. Detta använder befintliga svar och gör inga AI-anrop.
- Övningsbilder kan läggas till under styrkeprogramimporten eller via Styrkeprogram → Styrkeprogrambibliotek → Övningsbilder på ett sparat program. Huvudtränare/superadmin kan generera en bild i taget, ladda upp en egen JPG/PNG/WebP under 3 MB eller ta bort bildkopplingen. Bilder granskas före sparandet och syns sedan vid rätt övning i simmarens styrkeprogram. Egna bilder skickas bara till privat Supabase-lagring; AI-bilder använder en separat bildmodell och kostar ett separat anrop. Funktionen kräver migration 086, respekterar klubbens AI-reglage och tokenbudget för generering, och använder tidsbegränsade bildlänkar. Uppladdning/läsning gör inga AI-anrop.
- Vid varje övning finns en redigerbar Bildinstruktion (högst 2 000 tecken), förifylld från övningsbeskrivningen eller den godkända bildens sparade instruktion. Förtydliga startläge, slutläge, utrustning och kameravinkel utan att ändra simmarens övningstext. Generering ger ett nytt förslag; välj Använd den här bilden eller Behåll tidigare bild. Först när programmet sparas ersätts den gamla bilden. Bildinstruktionen sparas separat med den godkända bilden. Varje omgenerering är ett nytt betalt AI-anrop, inte en redigering av den gamla bildfilen.
- På den egna sidan Styrkeprogram kan huvudtränare och superadmin AI-importera program från XLS, XLSX, PDF, PNG, JPG eller WebP under 3 MB. Tolka först, granska pass/övningar/dosering och valfria AI-genererade teknik-instruktioner, och spara sedan i styrkeprogrambiblioteket. Under Tilldela styrkeprogram kopplas ett aktivt program till varje simmare; vanliga tränare kan tilldela klubbens färdiga program men inte importera eller redigera biblioteket. Ett program innehåller 1–3 separat loggbara pass. Bara tolkningen gör ett AI-anrop; sparande, tilldelning och läsning gör inga AI-anrop. Importen använder en separat styrkemodell och följer klubbens globala AI-inställning och tokenbudget.
- Denna guide beskriver Simkolls användarfunktioner; ingen källkod, hemlighet, token, lösenord, PIN eller privat tränar-/simmarprofil lämnas till modellen.
- Aktuell meny och status finns i coachFeatureSettings. navigation.inMenu visar om funktionen finns i tränarmenyn/Verktyg; navigation.overviewShortcut visar om den är en genväg på översikten. “Dold” är inte samma sak som saknad behörighet: menyinställningar ändrar inte roller, serverbehörigheter eller data.
- Vanlig tränare följer klubbens globala menyval. Huvudtränare och superadmin kan använda egna meny- och översiktsval om personalSettingsEnabled är sant; de påverkar bara det egna kontot. Endast superadmin har de övriga globala inställningarna.
- För frågor om en funktion: använd menyns aktuella svenska namn, berätta var den finns och förklara vad reglaget styr. Ett “okänt” värde betyder att inställningen inte kunde läsas, inte att funktionen är av.
- Du får bara förklara och läsa denna sammanfattning. Du kan aldrig ändra en inställning, göra ett AI-anrop åt användaren, eller lova att ett val har sparats.`
