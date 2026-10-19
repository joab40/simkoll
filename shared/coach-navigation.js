export const COACH_NAV_ITEMS = [
  { key: 'today', label: 'Idag', mobile: 'Idag' }, { key: 'control-panel', label: 'Kontrollpanel', mobile: 'Överblick' }, { key: 'swimmers', label: 'Simmare', mobile: 'Simmare' },
  { key: 'groups', label: 'Grupper', mobile: 'Grupper' }, { key: 'workout', label: 'Pass', mobile: 'Pass' },
  { key: 'planning', label: 'Planering', mobile: 'Plan' }, { key: 'competition-calendar', label: 'Tävlingskalender', mobile: 'Tävling' },
  { key: 'community', label: 'Meddelanden', mobile: 'Meddelanden' }, { key: 'meeting', label: 'Veckomöte', mobile: 'Möte' },
  { key: 'trends', label: 'Grupptrend', mobile: 'Trend' }, { key: 'history', label: 'Historik', mobile: 'Historik' },
  { key: 'week', label: 'Förra veckan', mobile: 'Förra veckan' }, { key: 'coach-feed', label: 'Tränarflöde', mobile: 'Flöde' },
  { key: 'talks', label: 'Utvecklingssamtal', mobile: 'Samtal' }, { key: 'competition', label: 'Tävlingsresultat', mobile: 'Resultat' },
  { key: 'workout-library', label: 'Passbibliotek', mobile: 'Bibliotek' }, { key: 'goals', label: 'Utvecklingsmål', mobile: 'Mål' },
  { key: 'programs', label: 'Träningsprogram', mobile: 'Program' }, { key: 'strength-programs', label: 'Styrkeprogram', mobile: 'Styrka' },
  { key: 'games', label: 'Veckans spel', mobile: 'Spel' },
  { key: 'rewards', label: 'Poäng & nivåer', mobile: 'Poäng' }, { key: 'app-feedback', label: 'Appfeedback', mobile: 'Feedback' },
  { key: 'faq', label: 'FAQ', mobile: 'FAQ' }, { key: 'legal', label: 'Info & villkor', mobile: 'Info' },
]

export const COACH_MENU_FEATURES = COACH_NAV_ITEMS.filter(({ key }) => key !== 'today').map(({ key, label }) => [key, label])
export const COACH_OVERVIEW_FEATURES = COACH_MENU_FEATURES

export const COACH_MENU_SECTIONS = [
  ['Arbeta', ['workout', 'swimmers', 'groups', 'community']],
  ['Följa upp', ['control-panel', 'meeting', 'trends', 'history', 'week', 'coach-feed', 'competition', 'rewards']],
  ['Planera & stötta', ['planning', 'competition-calendar', 'talks', 'goals', 'programs', 'strength-programs', 'workout-library', 'games']],
  ['Övrigt', ['push-settings', 'app-feedback', 'faq', 'legal']],
]
