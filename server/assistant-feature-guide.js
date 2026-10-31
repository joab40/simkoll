import { COACH_NAV_ITEMS } from '../shared/coach-navigation.js'
import { featureFaqGuide } from '../shared/feature-faq.js'

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
    const overviewSetting = key === 'community' ? false : key === 'today' ? true : settingEnabled(effective ? (effective.overview || {}) : null, key)
    return { key, label, inMenu, ...(key === 'community' ? { headerShortcut: inMenu } : {}), overviewShortcut: inMenu === false || overviewSetting === false ? false : inMenu === null || overviewSetting === null ? null : true }
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
    ...(pushSettings ? [{ feature: 'Pushnotiser för klubben', enabled: pushSettings.enabled === true, categories: { coachMessages: pushSettings.coachMessages !== false, privateMessages: pushSettings.privateMessages !== false, developmentTalks: pushSettings.developmentTalks !== false, competitionEntries: pushSettings.competitionEntries !== false, publishedWorkouts: pushSettings.publishedWorkouts !== false }, trainingReminders: { ...pushSettings.checkinReminders } }] : []),
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

export const COACH_ASSISTANT_FEATURE_GUIDE = featureFaqGuide('coach') + `Tränarfunktioner och inställningar:\n- Denna guide beskriver Simkolls användarfunktioner; ingen källkod, hemlighet, token, lösenord, PIN eller privat tränar-/simmarprofil lämnas till modellen.
- Aktuell meny och status finns i coachFeatureSettings. navigation.inMenu visar om funktionen finns i tränarmenyn/Verktyg; navigation.overviewShortcut visar om den är en genväg på översikten. “Dold” är inte samma sak som saknad behörighet: menyinställningar ändrar inte roller, serverbehörigheter eller data.
- Vanlig tränare följer klubbens globala menyval. Huvudtränare och superadmin kan använda egna meny- och översiktsval om personalSettingsEnabled är sant; de påverkar bara det egna kontot. Endast superadmin har de övriga globala inställningarna.
- För frågor om en funktion: använd menyns aktuella svenska namn, berätta var den finns och förklara vad reglaget styr. Ett “okänt” värde betyder att inställningen inte kunde läsas, inte att funktionen är av.
- Du får bara förklara och läsa denna sammanfattning. Du kan aldrig ändra en inställning, göra ett AI-anrop åt användaren, eller lova att ett val har sparats.`
