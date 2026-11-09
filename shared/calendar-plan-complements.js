import { calendarLinkKeys } from './planning-calendar.js'

const field = (row, camel, snake) => row[camel] ?? row[snake]
const date = row => field(row, 'date', 'plan_date')
const source = row => field(row, 'sourceWorkoutId', 'source_workout_id')
const link = row => field(row, 'calendarLink', 'calendar_link')
const type = row => field(row, 'activityType', 'activity_type')
const groupKey = value => String(value).trim().toLowerCase().replace(/^ungdoms? (svart|orange)$/, 'ungdom_$1')
const groups = row => field(row, 'targetGroups', 'target_groups') || []
const location = value => String(value || '').trim().toLocaleLowerCase('sv-SE')

// Explicit calendar identity, never similar titles/distances or merely AM/PM.
export function sameCalendarTraining(a, b) {
  const x = link(a), y = link(b), day = date(a)
  if (type(a) !== 'swim' || type(b) !== 'swim' || !day || day !== date(b) || x?.detachedWorkoutId || y?.detachedWorkoutId || x?.mode !== 'linked' || y?.mode !== 'linked') return false
  if ((x.date && x.date !== day) || (y.date && y.date !== day)) return false
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.time || '') || x.time === '00:00' || x.time !== y.time) return false
  if (x.location && y.location && location(x.location) !== location(y.location)) return false
  const keys = new Set(calendarLinkKeys(x))
  return calendarLinkKeys(y).some(key => keys.has(key))
}

// Read-only projection. Keep originals for editing and historical plan: IDs.
// A publication for just Junior must not consume Svart's remaining base plan.
export function calendarPlanComplements(plans = [], { workoutIds = null } = {}) {
  const foundations = new Map(), remaining = new Map(), redirects = new Map()
  const published = plans.filter(row => source(row) && (!workoutIds || workoutIds.has(source(row))) && !link(row)?.detachedWorkoutId)
  const byDay = new Map()
  for (const row of published) { const day = date(row); if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push(row) }
  for (const base of plans.filter(row => type(row) === 'swim' && !source(row) && !link(row)?.detachedWorkoutId)) {
    const baseGroups = groups(base)
    const matches = (byDay.get(date(base)) || []).filter(row => sameCalendarTraining(base, row) && (baseGroups.length ? !groups(row).length || baseGroups.some(group => groups(row).some(other => groupKey(group) === groupKey(other))) : !groups(row).length))
    if (!matches.length) continue
    const rest = baseGroups.filter(group => !matches.some(row => !groups(row).length || groups(row).some(other => groupKey(group) === groupKey(other))))
    remaining.set(base, rest)
    redirects.set(base.id, matches)
    for (const row of matches) foundations.set(row, [...(foundations.get(row) || []), base])
  }
  const rows = plans.flatMap(row => {
    if (remaining.has(row)) {
      const rest = remaining.get(row)
      if (!rest.length) return []
      return [{ ...row, [Object.hasOwn(row, 'target_groups') ? 'target_groups' : 'targetGroups']: rest, foundationOriginal: row }]
    }
    return [{ ...row, ...(foundations.has(row) ? { foundationPlans: foundations.get(row) } : {}) }]
  })
  return { rows, redirects }
}
