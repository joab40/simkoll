import { coachWeekAddDays } from './coach-week.js'
import { sleepFollowUpReasons } from './coach-control-panel.js'

const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const valid = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const round = value => value == null ? null : Math.round(value * 10) / 10
const types = new Set(['swim', 'strength', 'dryland', 'cycling', 'other'])
const within = (row, start, end) => day(row.date) && row.date >= start && row.date <= end
const newest = rows => rows.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id || '').localeCompare(String(b.id || '')))

function dailyMetric(rows, key, min = 1, max = 5) {
  const groups = new Map()
  for (const row of rows) if (valid(row[key], min, max)) { if (!groups.has(row.date)) groups.set(row.date, []); groups.get(row.date).push(row[key]) }
  const dates = [...groups.keys()].sort()
  return { value: round(mean([...groups.values()].map(mean))), days: dates.length, lastDay: dates.at(-1) || null }
}

// Latest submitted after-report per day, explicit activity and slot. This is a
// report grouping, not a claim that every physical training occasion is known.
function afterReports(rows) {
  return [...new Map(newest(rows.filter(row => row.type === 'after' && row.competition !== true))
    .map(row => [`${row.date}|${row.activityType}|${row.trainingSlot || 'day'}`, row])).values()].filter(row => row.plannedCompletion !== 'no')
}

function load(rows) {
  const reports = afterReports(rows), known = reports.filter(row => types.has(row.activityType) && valid(row.rpe, 1, 10) && valid(row.activityMinutes, 1, 1440))
  return { value: known.length ? round(known.reduce((sum, row) => sum + row.rpe * row.activityMinutes, 0)) : null, known: known.length, total: reports.length, days: new Set(known.map(row => row.date)).size }
}

export function buildTrainingHeart({ responses = [], sleep = [] } = {}, asOf) {
  if (!day(asOf)) throw new Error('Ogiltigt datum för träningshjärtat.')
  const start = coachWeekAddDays(asOf, -6), feelingStart = coachWeekAddDays(asOf, -2), previousStart = coachWeekAddDays(asOf, -13), previousEnd = coachWeekAddDays(asOf, -7)
  const recent = responses.filter(row => within(row, start, asOf)), mood = recent.filter(row => row.date >= feelingStart)
  const body = dailyMetric(mood, 'body'), feeling = dailyMetric(mood, 'feeling')
  const enough = body.days >= 2 && feeling.days >= 2
  // Explicit product thresholds, not a validated medical/readiness score.
  const color = !enough ? 'unknown' : body.value <= 2 || feeling.value <= 2 ? 'red' : body.value < 3.5 || feeling.value < 3.5 ? 'yellow' : 'green'
  const currentLoad = load(recent), previousLoad = load(responses.filter(row => within(row, previousStart, previousEnd)))
  const covered = value => value.known >= 3 && value.days >= 2 && value.known / value.total >= .8
  const comparable = covered(currentLoad) && covered(previousLoad) && previousLoad.value > 0
  // Classify the same one-decimal percentage that the panel displays.
  const ratio = comparable ? Math.round(currentLoad.value / previousLoad.value * 1000) / 1000 : null
  const ring = ratio == null ? 'unknown' : ratio < .8 ? 'lower' : ratio > 1.2 ? 'higher' : 'similar'
  const speed = dailyMetric(afterReports(recent).filter(row => row.activityType === 'swim'), 'speedFeeling')
  const moving = speed.days >= 2 && speed.lastDay >= feelingStart
  const motion = !moving ? 'none' : speed.value <= 2 ? 'slow' : speed.value >= 4 ? 'brisk' : 'gentle'
  const nights = [...new Map(sleep.filter(row => !row.skipped && day(row.activity_date) && row.activity_date >= start && row.activity_date <= asOf && valid(row.minutes, 0, 840) && [1, 3, 5].includes(row.quality)).map(row => [row.activity_date, row])).values()]
  const sickDays = [...new Set(recent.filter(row => row.type === 'sick').map(row => row.date))].sort()
  const warnings = sleepFollowUpReasons(nights, asOf)
  if (sickDays.length) warnings.push(`Sjukdom rapporterad ${sickDays.length} dag${sickDays.length === 1 ? '' : 'ar'} senaste sju dagarna`)
  return {
    asOf, periods: { feelingStart, start, end: asOf, previousStart, previousEnd }, color, body, feeling,
    load: { ...currentLoad, previous: previousLoad, ratio, ring },
    speed: { ...speed, motion },
    sleep: { nights: nights.length, averageMinutes: round(mean(nights.map(row => row.minutes))), poorNights: nights.filter(row => row.quality === 1).length, lastDay: nights.map(row => row.activity_date).sort().at(-1) || null },
    sickDays, warnings,
  }
}
