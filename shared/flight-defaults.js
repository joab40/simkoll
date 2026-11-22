import { defaultFlightWeights, validateFlightWeights } from './flight-line.js'
import { defaultFlightBoostSettings, validateFlightBoostSettings } from './flight-boosts.js'
import { defaultFlightPbSettings, validateFlightPbSettings } from './flight-pb.js'
import { defaultFlightPresentation, validateFlightPresentation } from './flight-presentation.js'

export const FLIGHT_OVERVIEW_BATCH = 6
export const FLIGHT_MIN_SWIMMERS = 2
export const FLIGHT_MAX_MIN_SWIMMERS = 50

export const builtInFlightDefaults = {
  weights: { ...defaultFlightWeights, taper: 0 },
  boosts: defaultFlightBoostSettings,
  pbBoosts: defaultFlightPbSettings(),
  presentation: defaultFlightPresentation,
  minSwimmers: 3,
}

export function flightGroupId(value) {
  const id = String(value ?? '').trim().toLowerCase().replace(/^ungdoms? (orange|svart)$/, 'ungdom_$1')
  return /^[a-z0-9_]{1,48}$/.test(id) ? id : null
}

export function validateFlightDefaults(value) {
  const weights = validateFlightWeights(value?.weights)
  if (weights.sleepGoal > 0) throw new Error('Sovtid mot sömnmål ställs in per simmare.')
  const minSwimmers = value.minSwimmers
  if (!Number.isInteger(minSwimmers) || minSwimmers < FLIGHT_MIN_SWIMMERS || minSwimmers > FLIGHT_MAX_MIN_SWIMMERS) {
    throw new Error(`Ange mellan ${FLIGHT_MIN_SWIMMERS} och ${FLIGHT_MAX_MIN_SWIMMERS} simmare för gruppkurvan.`)
  }
  return {
    weights: { ...weights, taper: weights.taper ?? 0 },
    boosts: validateFlightBoostSettings(value.boosts),
    pbBoosts: validateFlightPbSettings(value.pbBoosts),
    presentation: validateFlightPresentation(value.presentation),
    minSwimmers,
  }
}

export function flightGroupCurve(days, profiles, minSwimmers) {
  const byDay = new Map(days.map(date => [date, { count: 0, total: 0, reliable: 0 }]))
  for (const profile of profiles) {
    for (const point of profile.points ?? []) {
      const day = byDay.get(point.date)
      if (!day || !Number.isFinite(point.value)) continue
      day.count++
      day.total += point.value
      if (!point.limited && !profile.partial) day.reliable++
    }
  }
  return days.map(date => {
    const { count, total, reliable } = byDay.get(date)
    const value = count >= minSwimmers ? Math.round(total / count * 10) / 10 : null
    return { date, count, value, limited: value != null && (reliable < minSwimmers || reliable < profiles.length / 2) }
  })
}
