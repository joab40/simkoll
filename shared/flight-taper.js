import { FLIGHT_BOOST_MAX_DAYS } from './flight-boosts.js'

export const FLIGHT_TAPER_METRICS = {
  meters: 'Simmeter',
  load: 'Belastning (RPE × min)',
  rpe: 'Upplevd ansträngning',
  sessions: 'Genomförda pass',
}

const recentDays = 7
const referenceDays = 28
export const FLIGHT_TAPER_CONTEXT_DAYS = referenceDays + recentDays + FLIGHT_BOOST_MAX_DAYS

function summarize(days, minimum) {
  const known = days.filter(day => day?.kind === 'training' || day?.kind === 'rest')
  if (known.length < minimum) return null
  return Object.fromEntries(Object.keys(FLIGHT_TAPER_METRICS).map(key => {
    const source = key === 'rpe' ? known.filter(day => day.kind === 'training') : known
    const values = source.map(day => day[key]).filter(Number.isFinite)
    const minimumValues = Math.max(2, Math.ceil(source.length * .75))
    return [key, values.length >= minimumValues ? values.reduce((sum, value) => sum + value, 0) / values.length : null]
  }))
}

function compareDose(current, reference, minimumLower = 2) {
  if (!current || !reference) return null
  const ratios = Object.keys(FLIGHT_TAPER_METRICS)
    .filter(key => Number.isFinite(current[key]) && reference[key] > 0)
    .map(key => ({ key, ratio: current[key] / reference[key] }))
  const lower = ratios.filter(item => item.ratio <= .8)
  return lower.length >= minimumLower && !ratios.some(item => item.ratio >= 1.2) ? lower : null
}

function firstLowerDay(days, start, end, practice) {
  let first = end
  for (let index = end; index >= start; index--) {
    const day = days[index]
    if (day?.kind === 'training' && !compareDose(day, practice)) break
    if (day?.kind === 'training' || day?.kind === 'rest') first = index
  }
  return first
}

// This rule marks observed changes in training, with the reference held fixed
// during an episode. Gaps are excluded from the dose and can break the episode.
export function flightTaperAdjustments(days) {
  const observations = days.map(day => day.taperObservation)
  const adjustments = []
  let episode = null
  let lastEpisodeEnd = -1

  for (let index = referenceDays + recentDays - 1; index < days.length; index++) {
    const recentStart = index + 1 - recentDays
    const recent = observations.slice(recentStart, index + 1)
    const usual = observations.slice(recentStart - referenceDays, recentStart)
    const reference = episode?.reference ?? summarize(usual, 16)
    const hadIllness = recent.some(day => day?.kind === 'sick')
    const restDays = recent.filter(day => day?.kind === 'rest').length
    const lower = hadIllness ? null : compareDose(summarize(recent, 5), reference, restDays >= 5 ? 1 : 2)
    if (!lower) {
      if (episode) lastEpisodeEnd = index - 1
      episode = null
      if (!hadIllness && observations[index]?.kind === 'rest' && reference?.sessions > 0) {
        adjustments.push({ date: days[index].date, kind: 'rest' })
      }
      continue
    }
    if (!episode) {
      const usualTrainingDays = usual.filter(day => day?.kind === 'training')
      const start = firstLowerDay(observations, Math.max(recentStart, lastEpisodeEnd + 1), index, summarize(usualTrainingDays, 4))
      episode = { start, reference }
    }
    const duration = index - episode.start + 1
    adjustments.push({ date: days[index].date, start: days[episode.start].date, duration, kind: 'reduced', lower })
  }
  return adjustments
}
