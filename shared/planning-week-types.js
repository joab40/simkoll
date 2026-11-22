import { coachWeekAddDays } from './coach-week.js'
import { flightGroupId } from './flight-defaults.js'

export const PLANNING_WEEK_TYPES = Object.freeze({
  regular: 'Ordinarie träning',
  build: 'Uppbyggnad',
  high_load: 'Högre belastning',
  specific: 'Tävlingsspecifik',
  pre_taper: 'Förtoppning',
  taper: 'Toppning',
  recovery: 'Återhämtning',
})

export const isPlanningWeekType = value => typeof value === 'string' && Object.hasOwn(PLANNING_WEEK_TYPES, value)

export function suggestPlanningWeekType(cycles, monday, groupId) {
  const sunday = coachWeekAddDays(monday, 6)
  const candidates = cycles.filter(cycle => cycle.type === 'block' && isPlanningWeekType(cycle.phase) && cycle.startDate <= sunday && cycle.endDate >= monday
    && (!cycle.targetGroups?.length || cycle.targetGroups.some(group => flightGroupId(group) === groupId)))
    .map(cycle => {
      const start = cycle.startDate > monday ? cycle.startDate : monday
      const end = cycle.endDate < sunday ? cycle.endDate : sunday
      return { ...cycle, overlap: Date.parse(end) - Date.parse(start) }
    })
    .sort((a, b) => b.overlap - a.overlap || Number(Boolean(b.targetGroups?.length)) - Number(Boolean(a.targetGroups?.length)))
  const [best] = candidates
  if (!best || candidates.some(other => other.overlap === best.overlap
    && Boolean(other.targetGroups?.length) === Boolean(best.targetGroups?.length) && other.phase !== best.phase)) return null
  return { type: best.phase, name: best.name }
}

export function flightWeekAnnotations(weekTypes, start, end) {
  const byWeek = new Map()
  for (const row of weekTypes) {
    const { weekStart, type } = row
    if (!isPlanningWeekType(type) || weekStart > end || coachWeekAddDays(weekStart, 6) < start) continue
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, [])
    byWeek.get(weekStart).push(row)
  }
  return [...byWeek].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, rows]) => ({
    weekStart,
    type: rows.every(row => row.type === rows[0].type) ? rows[0].type : 'mixed',
    text: rows.map(row => [row.groupName, PLANNING_WEEK_TYPES[row.type]].filter(Boolean).join(' · ')).join(', '),
  }))
}
