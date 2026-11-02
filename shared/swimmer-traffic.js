import { coachWeekAddDays, coachWeekMonday } from './coach-week.js'
import { sleepFollowUpReasons } from './coach-control-panel.js'
import { shortSleepWarning } from './sleep-warning.js'
import { buildTrainingHeart } from './training-heart.js'
import { followupSignals } from './followup-signals.js'

export const TRAFFIC_LABELS = {
  red: { color: 'red', label: 'Följ upp', icon: '🔴' },
  yellow: { color: 'yellow', label: 'Var uppmärksam', icon: '🟡' },
  green: { color: 'green', label: 'Ser stabilt ut', icon: '🟢' },
  unknown: { color: 'unknown', label: 'För lite data', icon: '⚪' },
}
export const validTrafficDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const validSleep = row => !row.skipped && Number.isFinite(row.minutes) && row.minutes >= 0 && row.minutes <= 840 && [1, 3, 5].includes(row.quality)
const within = (day, start, end) => validTrafficDay(day) && day >= start && day <= end
const eligible = profile => profile.id && !profile.isTestProfile && profile.active !== false && (!profile.approvalStatus || profile.approvalStatus === 'approved')
const uniqueProfiles = profiles => [...new Map(profiles.filter(eligible).map(profile => [profile.id, profile])).values()]

// One source for card colour, colour filters and both sides of the comparison.
// Health signals count distinct activity days; planning gaps are kept separate.
export function swimmerTrafficAt({ responses = [], sleep = [], illness = [], sessions = [], plans = [], createdAt }, end) {
  if (!validTrafficDay(end)) throw new Error('Ogiltigt datum för trafikljus.')
  const start = coachWeekAddDays(end, -6), weekStart = coachWeekMonday(end)
  if (createdAt && String(createdAt).slice(0, 10) > end) return { ...TRAFFIC_LABELS.unknown, reasons: [] }
  const recent = responses.filter(row => within(row.date, start, end))
  const nights = [...new Map(sleep.filter(row => within(row.activity_date, start, end) && validSleep(row)).map(row => [row.activity_date, row])).values()]
  const registered = sessions.filter(row => within(row.date, weekStart, end))
  const planned = [...new Map(plans.filter(row => within(row.date, weekStart, end)).map(row => [`${row.date}|${row.slot}`, row])).values()]
  const completed = new Set(registered.map(row => `${row.date}|${row.slot}`))
  const missing = planned.filter(row => !completed.has(`${row.date}|${row.slot}`)).length
  const sleepReasons = sleepFollowUpReasons(nights, end), warning = shortSleepWarning(nights, end)
  const signals = followupSignals({ responses: recent, illness, sleepReasons, sleepWarning: warning, asOf: end })
  const color = signals.hasData || nights.length > 0 ? signals.color : 'unknown'
  return { ...TRAFFIC_LABELS[color], reasons: signals.reasons, illness: signals.illness,
    planningNotes: missing ? [`${missing} planerade pass utan registrerat genomförande denna vecka`] : [] }
}

export function buildSwimmerTraffic(profiles, data, asOf) {
  if (!validTrafficDay(asOf)) throw new Error('Ogiltigt datum för trafikljus.')
  const previousEnd = coachWeekAddDays(asOf, -7)
  const group = rows => {
    const result = new Map()
    rows.forEach(row => { const id = row.profileId || row.profile_id; if (!result.has(id)) result.set(id, []); result.get(id).push(row) })
    return result
  }
  const responses = group(data.responses || []), sleep = group(data.sleep || []), illness = group(data.illness || []), sessions = group(data.sessions || []), plans = group(data.plans || [])
  return {
    asOf, illnessAvailable: data.illnessAvailable !== false, range: { start: coachWeekAddDays(asOf, -6), end: asOf, previousStart: coachWeekAddDays(asOf, -13), previousEnd },
    profiles: uniqueProfiles(profiles).map(profile => {
      const own = { responses: responses.get(profile.id) || [], sleep: sleep.get(profile.id) || [], illness: illness.get(profile.id) || [], illnessAvailable: data.illnessAvailable !== false, sessions: sessions.get(profile.id) || [], plans: plans.get(profile.id) || [], createdAt: profile.createdAt }
      return { profileId: profile.id, current: swimmerTrafficAt(own, asOf), previous: swimmerTrafficAt(own, previousEnd), heart: buildTrainingHeart(own, asOf) }
    }),
  }
}

export function trafficCounts(profiles, report) {
  const index = new Map((report?.profiles || []).map(row => [row.profileId, row]))
  const current = { red: 0, yellow: 0, green: 0, unknown: 0 }, previous = { ...current }
  const cohort = uniqueProfiles(profiles)
  for (const profile of cohort) {
    const row = index.get(profile.id)
    current[Object.hasOwn(current, row?.current?.color) ? row.current.color : 'unknown']++
    previous[Object.hasOwn(previous, row?.previous?.color) ? row.previous.color : 'unknown']++
  }
  return { current, previous, total: cohort.length, canCompare: cohort.length > current.unknown && cohort.length > previous.unknown }
}
