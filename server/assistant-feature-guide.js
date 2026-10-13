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
    ...(pushSettings ? [{ feature: 'Pushnotiser för klubben', enabled: pushSettings.enabled === true, categories: { coachMessages: pushSettings.coachMessages !== false, privateMessages: pushSettings.privateMessages !== false, developmentTalks: pushSettings.developmentTalks !== false, competitionEntries: pushSettings.competitionEntries !== false } }] : []),
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
- Under Idag och Förra veckan går det att klicka på korten Gruppens känsla, Upplevd ansträngning, Passet och Upplägget för att se underliggande svar. Svarsvyn följer valt datum/period och gruppfilter och visar namn för profilsvar, värde, aktivitetsdatum, inlämningstid och kommentar. Anonyma svar visas utan profilkoppling. Flera svar från samma simmare visas var för sig eftersom varje giltigt svar ingår i medelvärdet. Det går att söka och sortera svar; hjälpsymbolen förklarar skalan separat. RPE, Passet och Upplägget använder enbart svar efter träning/tävling med angivet värde. Detta använder befintliga svar och gör inga AI-anrop.
- Övningsbilder kan läggas till under styrkeprogramimporten eller via Träningsprogram → Styrkeprogrambibliotek → Övningsbilder på ett sparat program. Huvudtränare/superadmin kan generera en bild i taget, ladda upp en egen JPG/PNG/WebP under 3 MB eller ta bort bildkopplingen. Bilder granskas före sparandet och syns sedan vid rätt övning i simmarens styrkeprogram. Egna bilder skickas bara till privat Supabase-lagring; AI-bilder använder en separat bildmodell och kostar ett separat anrop. Funktionen kräver migration 086, respekterar klubbens AI-reglage och tokenbudget för generering, och använder tidsbegränsade bildlänkar. Uppladdning/läsning gör inga AI-anrop.
- Vid varje övning finns en redigerbar Bildinstruktion (högst 2 000 tecken), förifylld från övningsbeskrivningen eller den godkända bildens sparade instruktion. Förtydliga startläge, slutläge, utrustning och kameravinkel utan att ändra simmarens övningstext. Generering ger ett nytt förslag; välj Använd den här bilden eller Behåll tidigare bild. Först när programmet sparas ersätts den gamla bilden. Bildinstruktionen sparas separat med den godkända bilden. Varje omgenerering är ett nytt betalt AI-anrop, inte en redigering av den gamla bildfilen.
- I Träningsprogram kan huvudtränare och superadmin AI-importera styrkeprogram från XLS, XLSX, PDF, PNG, JPG eller WebP under 3 MB. Tolka först, granska pass/övningar/dosering och valfria AI-genererade teknik-instruktioner, och spara sedan i styrkeprogrambiblioteket. Tilldela på simmarens kort under Styrkeprogram. Ett program innehåller 1–3 separat loggbara pass. Bara tolkningen gör ett AI-anrop; sparande och läsning gör inga anrop. Importen använder en separat styrkemodell och följer klubbens globala AI-inställning och tokenbudget.
- Denna guide beskriver Simkolls användarfunktioner; ingen källkod, hemlighet, token, lösenord, PIN eller privat tränar-/simmarprofil lämnas till modellen.
- Aktuell meny och status finns i coachFeatureSettings. navigation.inMenu visar om funktionen finns i tränarmenyn/Verktyg; navigation.overviewShortcut visar om den är en genväg på översikten. “Dold” är inte samma sak som saknad behörighet: menyinställningar ändrar inte roller, serverbehörigheter eller data.
- Vanlig tränare följer klubbens globala menyval. Huvudtränare och superadmin kan använda egna meny- och översiktsval om personalSettingsEnabled är sant; de påverkar bara det egna kontot. Endast superadmin har de övriga globala inställningarna.
- För frågor om en funktion: använd menyns aktuella svenska namn, berätta var den finns och förklara vad reglaget styr. Ett “okänt” värde betyder att inställningen inte kunde läsas, inte att funktionen är av.
- Du får bara förklara och läsa denna sammanfattning. Du kan aldrig ändra en inställning, göra ett AI-anrop åt användaren, eller lova att ett val har sparats.`
