import { coachWeekAddDays } from './coach-week.js'
import { isTimeId } from './swim-times.js'
import { boostFactor, defaultFlightBoostSettings, taperBoostSteps } from './flight-boosts.js'
import { defaultFlightPbSettings, FLIGHT_PRACTICE_BOOST_DAYS, pbBoostFraction } from './flight-pb.js'

export const FLIGHT_RECENT_DAYS = 7
export const FLIGHT_BASELINE_DAYS = 28
export const FLIGHT_TIME_BASELINE_DAYS = 56
export const FLIGHT_MAX_TIME_LIFT = 5

export const FLIGHT_SIGNAL_GROUPS = [
  { label: 'Känsla', signals: [
    { key: 'speedFeeling', label: 'Fartkänsla' },
    { key: 'body', label: 'Kroppskänsla' },
    { key: 'energy', label: 'Energi' },
    { key: 'feeling', label: 'Dagskänsla' },
    { key: 'motivation', label: 'Motivation' },
    { key: 'passRating', label: 'Passbetyg' },
    { key: 'setupRating', label: 'Uppläggsbetyg' },
  ] },
  { label: 'Återhämtning', signals: [
    { key: 'sleepQuality', label: 'Sömnkvalitet' },
    { key: 'sleepGoal', label: 'Sovtid mot sömnmål' },
  ] },
]
export const FLIGHT_SIGNALS = FLIGHT_SIGNAL_GROUPS.flatMap(group => group.signals)
const signalKeys = FLIGHT_SIGNALS.map(signal => signal.key)
const standardKeys = [...signalKeys.filter(key => key !== 'sleepGoal'), 'times']
const legacyDefaults = { speedFeeling: 4, body: 3, energy: 2, sleepQuality: 2, feeling: 0, motivation: 0, times: 3 }
const legacyKeys = Object.keys(legacyDefaults)

// Round proportionally and keep every checked measure at one percent or more.
function distributeWeights(weights, keys, total) {
  if (!keys.length) return {}
  const sum = keys.reduce((value, key) => value + weights[key], 0)
  const shares = keys.map(key => {
    const quota = weights[key] * total / sum
    const percent = Math.floor(quota)
    return { key, percent, remainder: quota - percent }
  })
  const remaining = total - shares.reduce((value, share) => value + share.percent, 0)
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder)
  ranked.slice(0, remaining).forEach(share => { share.percent++ })
  for (const share of shares.filter(item => item.percent === 0)) {
    const donor = shares.reduce((largest, item) => item.percent > largest.percent ? item : largest)
    donor.percent--
    share.percent = 1
  }
  return Object.fromEntries(shares.map(share => [share.key, share.percent]))
}

function upgradeWeights(weights) {
  return {
    ...Object.fromEntries(signalKeys.map(key => [key, 0])),
    ...distributeWeights(weights, signalKeys.filter(key => weights[key] > 0), 100),
    times: weights.times * 20,
  }
}

export const defaultFlightWeights = Object.freeze(upgradeWeights(legacyDefaults))

function hasWeights(weights, keys, max) {
  return weights && typeof weights === 'object' && !Array.isArray(weights)
    && Object.keys(weights).length === keys.length
    && keys.every(key => Object.hasOwn(weights, key)
      && Number.isInteger(weights[key]) && weights[key] >= 0 && weights[key] <= max)
}

function isPercentageWeights(weights) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)
    || !standardKeys.every(key => Object.hasOwn(weights, key))) return false
  const entries = Object.entries(weights)
  if (entries.some(([key, weight]) => (!standardKeys.includes(key) && !['sleepGoal', 'taper'].includes(key) && !isTimeId(key))
    || !Number.isInteger(weight) || weight < 0 || weight > 100)) return false
  const total = entries.reduce((sum, [key, weight]) => ['times', 'taper'].includes(key) ? sum : sum + weight, 0)
  return total === 100 || total === 0
}

export function validateFlightWeights(weights, customMeasures = []) {
  if (!isPercentageWeights(weights)) {
    throw new Error('Ange hela procenttal mellan 0 och 100. Valda grundvikter ska tillsammans bli 100 %.')
  }
  if (Object.keys(weights).some(key => isTimeId(key) && !customMeasures.some(measure => measure.key === key))) {
    throw new Error('Ett valt mätvärde saknas på simmarens profil.')
  }
  return readFlightWeights(weights)
}

export function readFlightWeights(weights) {
  if (isPercentageWeights(weights)) return { sleepGoal: 0, ...weights }
  return hasWeights(weights, legacyKeys, 5) ? upgradeWeights(weights) : { ...defaultFlightWeights }
}

export function changeFlightWeight(weights, key, percent) {
  if (key === 'times' || key === 'taper') return { ...weights, [key]: Math.max(0, Math.min(percent, 100)) }
  const customKeys = Object.keys(weights).filter(isTimeId).sort()
  const others = [...signalKeys, ...customKeys].filter(signal => signal !== key && weights[signal] > 0)
  if (percent > 0 && others.length >= 100) return weights
  const share = percent <= 0 ? 0 : others.length ? Math.min(percent, 100 - others.length) : 100
  return { ...weights, ...distributeWeights(weights, others, 100 - share), [key]: share }
}

export function sleepGoalScore(minutes, goalMinutes) {
  return Number.isFinite(minutes) && minutes >= 0 && Number.isInteger(goalMinutes) && goalMinutes > 0
    ? 1 + 4 * Math.min(minutes / goalMinutes, 1)
    : null
}

export function flightSignalGroups(customMeasures = []) {
  const groups = FLIGHT_SIGNAL_GROUPS.map(group => ({ ...group, signals: [...group.signals] }))
  for (const measure of customMeasures) {
    const existing = groups.find(group => group.label.toLocaleLowerCase('sv-SE') === measure.category.toLocaleLowerCase('sv-SE'))
    if (existing) existing.signals.push(measure)
    else groups.push({ label: measure.category, signals: [measure] })
  }
  return groups
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
export function flightTimeLifts(series, canLift = () => true) {
  const best = new Map()
  for (const group of series) {
    const points = group.points.map(point => ({ ...point, day: dayNumber(point.date) }))
    for (let index = 3, first = 0; index < points.length; index++) {
      const point = points[index]
      while (first < index && points[first].day < point.day - FLIGHT_TIME_BASELINE_DAYS) first++
      if (index - first < 3 || !canLift(group, point)) continue
      const reference = Math.round(median(points.slice(first, index).map(row => row.centis)))
      const gain = reference - point.centis
      if (gain <= 0) continue
      const strength = Math.min(FLIGHT_MAX_TIME_LIFT, gain / reference * 200)
      const lift = { date: point.date, label: group.label, kind: group.kind, centis: point.centis, reference, priorDays: index - first, strength }
      if ((best.get(point.date)?.strength ?? 0) < strength) best.set(point.date, lift)
    }
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function pickTimeLifts(timeLifts, timeBoost, pbBoosts, strength) {
  const byDate = new Map()
  for (const event of timeLifts) {
    const practice = event.kind === 'training' || event.kind === 'test'
    const kind = practice ? event.pbKind ?? 'progress' : 'race'
    const settings = practice ? pbBoosts[kind] : timeBoost
    const fraction = event.pbKind ? pbBoostFraction(event, pbBoosts) : event.strength / FLIGHT_MAX_TIME_LIFT
    const peak = fraction * settings.maxSteps * strength / 100
    if (!(peak > 0)) continue
    if (!byDate.has(event.date)) byDate.set(event.date, new Map())
    const byKind = byDate.get(event.date)
    if (peak > (byKind.get(kind)?.peak ?? 0)) byKind.set(kind, { event, practice, peak, settings })
  }
  return byDate
}

function timeEffect(date, liftByDate, timeBoost, strength) {
  const raceCap = timeBoost.maxSteps * strength / 100
  const length = Math.max(FLIGHT_PRACTICE_BOOST_DAYS, timeBoost.fullDays + timeBoost.fadeDays)
  const raceEvents = []
  let raceTotal = 0
  let practiceEvent = null
  for (let age = 0; age < length; age++) {
    const lifts = liftByDate.get(coachWeekAddDays(date, -age))
    if (!lifts) continue
    for (const lift of lifts.values()) {
      const contribution = lift.peak * boostFactor(age, lift.settings)
      if (contribution <= 0) continue
      const event = { ...lift.event, contribution }
      if (!lift.practice) {
        raceEvents.push(event)
        raceTotal += contribution
      } else if (contribution > (practiceEvent?.contribution ?? 0)) practiceEvent = event
    }
  }
  const raceLift = Math.min(raceTotal, raceCap)
  return practiceEvent && practiceEvent.contribution >= raceLift
    ? { lift: practiceEvent.contribution, events: [practiceEvent] }
    : { lift: raceLift, events: raceEvents }
}

export function flightLine(days, contextDays, timeLifts, weights, customMeasures = [], taperAdjustments = [], boosts = defaultFlightBoostSettings, pbBoosts = defaultFlightPbSettings(boosts.times)) {
  const wanted = [...FLIGHT_SIGNALS, ...customMeasures].filter(signal => weights[signal.key] > 0)
  const selectedWeights = Object.entries(weights).filter(([key, weight]) => !['times', 'taper'].includes(key) && weight > 0)
  const totalWeight = selectedWeights.reduce((total, [, weight]) => total + weight, 0)
  const byDate = new Map([...contextDays, ...days].map(day => [day.date, day]))
  const liftByDate = pickTimeLifts(timeLifts, boosts.times, pbBoosts, weights.times)
  const taperByDate = new Map(taperAdjustments.map(adjustment => [adjustment.date, adjustment]))
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
    const enough = available.length >= Math.min(2, selectedWeights.length) && usedWeight > 0 && usedWeight * 2 >= totalWeight
    const base = enough ? available.reduce((total, component) => total + component.score * component.weight, 0) / usedWeight : null
    const { lift, events } = liftByDate.size ? timeEffect(day.date, liftByDate, boosts.times, weights.times) : { lift: 0, events: [] }
    const timeLift = base == null ? null : Math.min(100 - base, lift)
    const taper = weights.taper > 0 ? taperByDate.get(day.date) : null
    const withTimeLift = base == null ? null : base + timeLift
    const taperSteps = taper ? taperBoostSteps(taper, boosts.taper) * weights.taper / 100 : 0
    const adjusted = withTimeLift == null ? null : Math.max(0, Math.min(100, withTimeLift + taperSteps))
    return {
      date: day.date, value: adjusted == null ? null : round(adjusted), base: base == null ? null : round(base),
      timeLift: timeLift == null ? null : round(timeLift), events, components, usedWeight, totalWeight,
      taper, taperEffect: taper && adjusted != null ? round(adjusted - withTimeLift) : null,
    }
  })
}
