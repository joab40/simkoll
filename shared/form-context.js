import { coachWeekAddDays as add } from './coach-week.js'
import { validIllnessDay as validDay } from './illness.js'

export function normalizeFormContext(input, asOf) {
  const observedOn = input?.observedOn
  if (!validDay(observedOn) || observedOn > asOf || observedOn < add(asOf, -41)) throw new Error('Välj ett observationsdatum under de senaste 42 dagarna.')
  const result = { observedOn }
  for (const key of ['trainingPbDate', 'competitionPbDate', 'taperStart', 'competitionDate']) {
    const value = input[key] || null
    if (value != null && !validDay(value)) throw new Error('Kontrollera datumen i tränaruppgiften.')
    if (value && key !== 'competitionDate' && (value > observedOn || value < add(observedOn, -41))) throw new Error('Personbästa och påbörjad toppning måste ligga på eller före observationsdatumet, högst 42 dagar bakåt.')
    if (value && key === 'competitionDate' && (value < observedOn || value > add(observedOn, 180))) throw new Error('Välj en måltävling inom sex månader efter observationen.')
    result[key] = value
  }
  if (result.taperStart && result.competitionDate && result.taperStart > result.competitionDate) throw new Error('Toppningen måste börja före måltävlingen.')
  if (input.note != null && typeof input.note !== 'string') throw new Error('Anteckningen måste vara text.')
  result.note = (input.note || '').trim()
  if (result.note.length > 600) throw new Error('Anteckningen får vara högst 600 tecken.')
  return result
}

export function currentFormContext(input, asOf) {
  if (!input) return null
  let context
  try { context = normalizeFormContext(input, asOf) } catch { return null }
  const recent = date => Boolean(date && date >= add(asOf, -6) && date <= asOf)
  return { ...context, source: 'coach', verified: false,
    trainingPbRecent: recent(context.trainingPbDate), competitionPbRecent: recent(context.competitionPbDate),
    recentPerformance: recent(context.trainingPbDate) || recent(context.competitionPbDate),
    taperActive: Boolean(context.taperStart && context.taperStart <= asOf && context.competitionDate && context.competitionDate >= asOf),
    upcomingCompetition: Boolean(context.competitionDate && context.competitionDate >= asOf) }
}
