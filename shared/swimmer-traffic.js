import { coachWeekAddDays, coachWeekMonday } from './coach-week.js'
import { sleepFollowUpReasons } from './coach-control-panel.js'
import { shortSleepWarning } from './sleep-warning.js'

export const TRAFFIC_LABELS = {
  red: { color: 'red', label: 'Följ upp', icon: '🔴' },
  yellow: { color: 'yellow', label: 'Var uppmärksam', icon: '🟡' },
  green: { color: 'green', label: 'Ser stabilt ut', icon: '🟢' },
  unknown: { color: 'unknown', label: 'För lite data', icon: '⚪' },
}
export const validTrafficDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const low = value => Number.isFinite(value) && value >= 1 && value <= 2
const validSleep = row => !row.skipped && Number.isFinite(row.minutes) && row.minutes >= 0 && row.minutes <= 840 && [1, 3, 5].includes(row.quality)
const within = (day, start, end) => validTrafficDay(day) && day >= start && day <= end
const eligible = profile => profile.id && !profile.isTestProfile && profile.active !== false && (!profile.approvalStatus || profile.approvalStatus === 'approved')
const uniqueProfiles = profiles => [...new Map(profiles.filter(eligible).map(profile => [profile.id, profile])).values()]

// One source for card colour, colour filters and both sides of the comparison.
// Preserve card rules: low ratings count answers; sickness counts distinct days.
export function swimmerTrafficAt({ responses = [], sleep = [], sessions = [], plans = [], createdAt }, end) {
  if (!validTrafficDay(end)) throw new Error('Ogiltigt datum för trafikljus.')
  const start = coachWeekAddDays(end, -6), weekStart = coachWeekMonday(end)
  if (createdAt && String(createdAt).slice(0, 10) > end) return { ...TRAFFIC_LABELS.unknown, reasons: [] }
  const recent = responses.filter(row => within(row.date, start, end))
  const nights = [...new Map(sleep.filter(row => within(row.activity_date, start, end) && validSleep(row)).map(row => [row.activity_date, row])).values()]
  const registered = sessions.filter(row => within(row.date, weekStart, end))
  const planned = [...new Map(plans.filter(row => within(row.date, weekStart, end)).map(row => [`${row.date}|${row.slot}`, row])).values()]
  const completed = new Set(registered.map(row => `${row.date}|${row.slot}`))
  const missing = planned.filter(row => !completed.has(`${row.date}|${row.slot}`)).length
  const sick = new Set(recent.filter(row => row.type === 'sick').map(row => row.date)).size
  const body = recent.filter(row => low(row.body)).length, feeling = recent.filter(row => low(row.feeling)).length
  const sleepReasons = sleepFollowUpReasons(nights, end), warning = shortSleepWarning(nights, end)
  const sleepRed = warning?.level === 'red' || sleepReasons.some(reason => reason !== warning?.label)
  const reasons = []
  if (sick) reasons.push(`${sick} sjukdag${sick > 1 ? 'ar' : ''}`)
  if (body) reasons.push(`tung kropp ${body} gång${body > 1 ? 'er' : ''}`)
  if (feeling) reasons.push(`låg känsla ${feeling} gång${feeling > 1 ? 'er' : ''}`)
  if (missing) reasons.push(`${missing} planerade pass utan registrerat genomförande denna vecka`)
  reasons.push(...sleepReasons)
  const hasData = recent.length > 0 || nights.length > 0 || registered.length > 0 || planned.length > 0
  const color = !hasData ? 'unknown' : sick >= 2 || missing >= 3 || body >= 2 && feeling >= 2 || sleepRed ? 'red' : reasons.length ? 'yellow' : 'green'
  return { ...TRAFFIC_LABELS[color], reasons }
}

export function buildSwimmerTraffic(profiles, data, asOf) {
  if (!validTrafficDay(asOf)) throw new Error('Ogiltigt datum för trafikljus.')
  const previousEnd = coachWeekAddDays(asOf, -7)
  const group = rows => {
    const result = new Map()
    rows.forEach(row => { const id = row.profileId || row.profile_id; if (!result.has(id)) result.set(id, []); result.get(id).push(row) })
    return result
  }
  const responses = group(data.responses || []), sleep = group(data.sleep || []), sessions = group(data.sessions || []), plans = group(data.plans || [])
  return {
    asOf, range: { start: coachWeekAddDays(asOf, -6), end: asOf, previousStart: coachWeekAddDays(asOf, -13), previousEnd },
    profiles: uniqueProfiles(profiles).map(profile => {
      const own = { responses: responses.get(profile.id) || [], sleep: sleep.get(profile.id) || [], sessions: sessions.get(profile.id) || [], plans: plans.get(profile.id) || [], createdAt: profile.createdAt }
      return { profileId: profile.id, current: swimmerTrafficAt(own, asOf), previous: swimmerTrafficAt(own, previousEnd) }
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
