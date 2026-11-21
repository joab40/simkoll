import { coachWeekAddDays } from './coach-week.js'

export const FLIGHT_RECENT_DAYS = 7
export const FLIGHT_BASELINE_DAYS = 28
export const FLIGHT_TIME_BASELINE_DAYS = 56
export const FLIGHT_MAX_TIME_LIFT = 5

export const FLIGHT_SIGNALS = [
  { key: 'speedFeeling', label: 'Fartkänsla', defaultWeight: 4 },
  { key: 'body', label: 'Kroppskänsla', defaultWeight: 3 },
  { key: 'energy', label: 'Energi', defaultWeight: 2 },
  { key: 'sleepQuality', label: 'Sömnkvalitet', defaultWeight: 2 },
  { key: 'feeling', label: 'Dagskänsla', defaultWeight: 0 },
  { key: 'motivation', label: 'Motivation', defaultWeight: 0 },
]
const weightKeys = [...FLIGHT_SIGNALS.map(signal => signal.key), 'times']
export const defaultFlightWeights = Object.freeze({
  ...Object.fromEntries(FLIGHT_SIGNALS.map(signal => [signal.key, signal.defaultWeight])),
  times: 3,
})

function isWeight(value) {
  return Number.isInteger(value) && value >= 0 && value <= 5
}

export function validateFlightWeights(weights) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)
    || Object.keys(weights).length !== weightKeys.length
    || weightKeys.some(key => !Object.hasOwn(weights, key) || !isWeight(weights[key]))) {
    throw new Error('Ange en vikt mellan 0 och 5 för varje signal.')
  }
  return Object.fromEntries(weightKeys.map(key => [key, weights[key]]))
}

export function readFlightWeights(weights) {
  const saved = weights && typeof weights === 'object' && !Array.isArray(weights) ? weights : {}
  return Object.fromEntries(weightKeys.map(key => [key, isWeight(saved[key]) ? saved[key] : defaultFlightWeights[key]]))
}

const round = value => Math.round(value * 10) / 10
const dayNumber = date => Date.parse(date + 'T12:00:00Z') / 86400000
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Time series are already split by conditions and contain one point per date.
// Evaluate each improvement against earlier dates only. Keep the strongest
// signal per date so a meet with several events yields at most one lift.
export function flightTimeLifts(series) {
  const best = new Map()
  for (const group of series) {
    const points = group.points.map(point => ({ ...point, day: dayNumber(point.date) }))
    for (let index = 3, first = 0; index < points.length; index++) {
      const point = points[index]
      while (first < index && points[first].day < point.day - FLIGHT_TIME_BASELINE_DAYS) first++
      if (index - first < 3) continue
      const reference = Math.round(median(points.slice(first, index).map(row => row.centis)))
      const gain = reference - point.centis
      if (gain <= 0) continue
      const strength = Math.min(FLIGHT_MAX_TIME_LIFT, gain / reference * 200)
      const lift = { date: point.date, label: group.label, centis: point.centis, reference, priorDays: index - first, strength }
      if ((best.get(point.date)?.strength ?? 0) < strength) best.set(point.date, lift)
    }
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function flightLine(days, contextDays, timeLifts, weights) {
  const wanted = FLIGHT_SIGNALS.filter(signal => weights[signal.key] > 0)
  const totalWeight = wanted.reduce((total, signal) => total + weights[signal.key], 0)
  const byDate = new Map([...contextDays, ...days].map(day => [day.date, day]))
  const liftByDate = new Map(timeLifts.map(lift => [lift.date, lift]))
  return days.map(day => {
    const window = Array.from({ length: FLIGHT_RECENT_DAYS + FLIGHT_BASELINE_DAYS }, (_, offset) => coachWeekAddDays(day.date, -offset))
    const recent = window.slice(0, FLIGHT_RECENT_DAYS)
    const baseline = window.slice(FLIGHT_RECENT_DAYS)
    const components = wanted.map(signal => {
      const values = dates => dates.map(date => byDate.get(date)?.[signal.key]).filter(value => Number.isFinite(value) && value >= 1 && value <= 5)
      const current = values(recent)
      const previous = values(baseline)
      const currentMean = current.length ? current.reduce((total, value) => total + value, 0) / current.length : null
      const reference = previous.length >= 3 ? median(previous) : null
      const score = current.length >= 2 && reference != null ? 50 + (currentMean - reference) * 12.5 : null
      return { key: signal.key, label: signal.label, weight: weights[signal.key], current: currentMean == null ? null : round(currentMean), reference, currentDays: current.length, referenceDays: previous.length, score }
    })
    const available = components.filter(component => component.score != null)
    const usedWeight = available.reduce((total, component) => total + component.weight, 0)
    const enough = available.length >= Math.min(2, wanted.length) && usedWeight > 0 && usedWeight * 2 >= totalWeight
    const base = enough ? available.reduce((total, component) => total + component.score * component.weight, 0) / usedWeight : null
    const events = []
    if (weights.times > 0) recent.forEach((date, age) => {
      const event = liftByDate.get(date)
      if (event) events.push({ ...event, contribution: event.strength * (1 - age / FLIGHT_RECENT_DAYS) * weights.times / 5 })
    })
    const timeLift = base == null ? null : Math.min(100 - base, FLIGHT_MAX_TIME_LIFT, events.reduce((total, event) => total + event.contribution, 0))
    return {
      date: day.date, value: base == null ? null : round(base + timeLift), base: base == null ? null : round(base),
      timeLift: timeLift == null ? null : round(timeLift), events, components, usedWeight, totalWeight,
    }
  })
}
