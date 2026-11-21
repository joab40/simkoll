import { defaultFlightBoostSettings } from './flight-boosts.js'
import { racePool } from './flight-record.js'
import { isTimeDate, parseTrainingTime, TIME_STROKES } from './swim-times.js'

export const FLIGHT_PRACTICE_BOOST_DAYS = 7
export const FLIGHT_PB_DISTANCES = [50, 100, 200]
const marginDefaults = Object.freeze({ 50: 50, 100: 100, 200: 300 })
const pbKinds = ['near', 'faster', 'progress']
const fields = ['maxSteps', 'fullDays', 'fadeDays']

export function practiceBoostConfig(config) {
  const fullDays = Math.min(config.fullDays, FLIGHT_PRACTICE_BOOST_DAYS)
  return { maxSteps: config.maxSteps, fullDays, fadeDays: Math.min(config.fadeDays, FLIGHT_PRACTICE_BOOST_DAYS - fullDays) }
}

export function defaultFlightPbSettings(timeBoost = defaultFlightBoostSettings.times) {
  return {
    near: { maxSteps: 5, fullDays: 1, fadeDays: 6 },
    faster: { maxSteps: 8, fullDays: 1, fadeDays: 6 },
    progress: practiceBoostConfig(timeBoost),
    margins: { ...marginDefaults },
  }
}

const hasFields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

export function validateFlightPbSettings(settings) {
  if (!hasFields(settings, [...pbKinds, 'margins']) || !pbKinds.every(kind => {
    const boost = settings[kind]
    return hasFields(boost, fields) && fields.every(key => Number.isInteger(boost[key]))
      && boost.maxSteps >= 0 && boost.maxSteps <= 100 && boost.fullDays >= 1 && boost.fadeDays >= 0
      && boost.fullDays + boost.fadeDays <= FLIGHT_PRACTICE_BOOST_DAYS
  })) throw new Error('Ange hela steg och dagar. Tidsboostar för träning och testlopp får gälla högst 7 dagar, inklusive avtoning.')
  if (!hasFields(settings.margins, FLIGHT_PB_DISTANCES) || FLIGHT_PB_DISTANCES.some(distance => {
    const margin = settings.margins[distance]
    return !Number.isInteger(margin) || margin < 0 || margin > 599999
  })) throw new Error('Ange en tidsgräns i sekunder med högst två decimaler för varje distans.')
  return {
    ...Object.fromEntries(pbKinds.map(kind => [kind, Object.fromEntries(fields.map(field => [field, settings[kind][field]]))])),
    margins: Object.fromEntries(FLIGHT_PB_DISTANCES.map(distance => [distance, settings.margins[distance]])),
  }
}

export function readFlightPbSettings(settings, timeBoost) {
  try { return validateFlightPbSettings(settings) } catch { return defaultFlightPbSettings(timeBoost) }
}

const strokesByName = new Map([
  ...Object.entries(TIME_STROKES).flatMap(([key, label]) => [[key, key], [label.toLocaleLowerCase('sv-SE'), key]]),
  ['individual medley', 'medley'],
])
const eventKey = ({ distance, stroke, pool }) => `${distance}:${stroke}:${pool}`

export function tempusPbLookup(rows) {
  const records = new Map()
  for (const row of [...rows].sort((a, b) => String(a.result_date).localeCompare(String(b.result_date)))) {
    if (row.source !== 'tempus' || !isTimeDate(row.result_date)) continue
    const event = String(row.event || '').trim().toLocaleLowerCase('sv-SE').match(/^(\d+)\s*([\p{L}\s]+)$/u)
    const pool = racePool(row.pool)
    const name = event?.[2]?.trim()
    const stroke = name && (strokesByName.get(name) ?? strokesByName.get(name.replace(/^(?:meter|m)\s*/, '')))
    const distance = Number(event?.[1])
    const centis = Number.isInteger(row.result_time) && row.result_time > 0 ? row.result_time : parseTrainingTime(row.swim_time)
    if (!stroke || !pool || !distance || centis == null) continue
    const key = eventKey({ distance, stroke, pool })
    if (!records.has(key)) records.set(key, [])
    const history = records.get(key)
    if (centis < (history.at(-1)?.centis ?? Infinity)) history.push({ date: row.result_date, centis })
  }
  return (event, before) => {
    const history = event ? records.get(eventKey(event)) : null
    if (!history) return null
    let left = 0
    let right = history.length
    while (left < right) {
      const middle = Math.floor((left + right) / 2)
      if (history[middle].date < before) left = middle + 1
      else right = middle
    }
    return history[left - 1] ?? null
  }
}

export function flightPbCandidates(series, referenceFor, start) {
  return series.flatMap(group => {
    if (!group.raceReference) return []
    return group.points.filter(point => point.date >= start).flatMap(point => {
      const reference = referenceFor(group.raceReference, point.date)
      if (!reference) return []
      return [{
        date: point.date, label: group.label, seriesKey: group.key, kind: group.kind, centis: point.centis,
        distance: group.raceReference.distance, reference: reference.centis, referenceDate: reference.date,
        pbKind: point.centis < reference.centis ? 'faster' : 'near',
      }]
    })
  })
}

export function pbBoostFraction(event, settings) {
  if (event.pbKind === 'faster') return 1
  const gap = event.centis - event.reference
  const margin = settings.margins[event.distance] ?? 0
  if (gap === 0) return 1
  return gap <= margin ? 1 - gap / (2 * margin) : 0
}
