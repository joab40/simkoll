import { planningAddDays, planningMonday } from './weekly-planning.js'

export const COMPETITION_LOGO_PRESETS = {
  club: { label: 'Klubbtävling', src: '/competition-logos/club.png' },
  regional: { label: 'Regiontävling', src: '/competition-logos/regional.png' },
  championship: { label: 'Mästerskap', src: '/competition-logos/championship.png' },
}

export function competitionLogoPreset(id) {
  return typeof id === 'string' && Object.hasOwn(COMPETITION_LOGO_PRESETS, id) ? COMPETITION_LOGO_PRESETS[id] : null
}

export function showCompetitionLogoThisWeek(competition, today) {
  if (!competition?.logo || !competition.startDate) return false
  const sunday = planningAddDays(planningMonday(today), 6)
  return competition.startDate <= sunday && (competition.endDate || competition.startDate) >= today
}
