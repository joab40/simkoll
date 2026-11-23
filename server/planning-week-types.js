import { analyticsRows } from './analytics-rows.js'
import { sendJson, supabaseRequest } from './supabase.js'
import { coachWeekAddDays, coachWeekMonday, validCoachWeek } from '../shared/coach-week.js'
import { FLIGHT_HISTORY_DAYS } from '../shared/flight-record.js'
import { isPlanningWeekType } from '../shared/planning-week-types.js'
import { flightGroupId } from '../shared/flight-defaults.js'
import { isTimeDate } from '../shared/swim-times.js'

const publicWeekType = ({ week_start, group_id, week_type }) => ({ weekStart: week_start, groupId: group_id, type: week_type })

export async function loadPlanningWeekType(trainingGroup, date) {
  const group = flightGroupId(trainingGroup)
  if (!group) return null
  const result = await supabaseRequest(`planning_week_types?week_start=eq.${coachWeekMonday(date)}&group_id=eq.${group}&select=week_type&limit=1`)
  if (!result.ok) return null
  const [row] = await result.json()
  return isPlanningWeekType(row?.week_type) ? row.week_type : null
}

async function readWeekTypes(query) {
  const result = await analyticsRows(query)
  if (result.ok && !result.truncated) return (await result.json()).map(publicWeekType)
  const detail = !result.ok ? await result.json().catch(() => null) : null
  const needsMigration = ['42P01', 'PGRST205'].includes(detail?.code)
  throw Object.assign(new Error(needsMigration ? 'Veckotyper kräver databasuppdatering 143.' : 'Veckotyperna kunde inte hämtas. Försök igen.'), { status: 503 })
}

async function competitionsInRange(from, to) {
  const result = await analyticsRows(`competition_calendar?start_date=lte.${to}&end_date=gte.${from}&select=id,title,start_date,end_date,target_groups&order=start_date.asc,id.asc`)
  if (!result.ok || result.truncated) return null
  return (await result.json()).map(row => ({ id: row.id, title: row.title, startDate: row.start_date, endDate: row.end_date, targetGroups: row.target_groups }))
}

export async function handlePlanningWeekTypes(request, response, role) {
  if (role !== 'coach') return sendJson(response, 403, { error: 'Endast tränare kan hantera planerade veckotyper.' })
  response.setHeader('Cache-Control', 'private, no-store')
  if (request.method === 'GET') {
    const { from, to, includeCompetitions } = request.query
    if (!isTimeDate(from) || !isTimeDate(to) || from < '1900-01-01' || to < from || to > coachWeekAddDays(from, FLIGHT_HISTORY_DAYS - 1)) {
      return sendJson(response, 400, { error: 'Välj en giltig period på högst 90 dagar.' })
    }
    const query = `planning_week_types?week_start=gte.${coachWeekMonday(from)}&week_start=lte.${coachWeekMonday(to)}&select=week_start,group_id,week_type&order=week_start.asc,group_id.asc`
    const [weekTypes, competitions] = await Promise.all([
      readWeekTypes(query),
      includeCompetitions === 'true' ? competitionsInRange(from, to).catch(() => null) : undefined,
    ])
    return sendJson(response, 200, { weekTypes, competitions })
  }

  if (request.method === 'POST') {
    const { weekStart, groupId, type } = request.body ?? {}
    if (!validCoachWeek(weekStart) || weekStart < '1900-01-01' || typeof groupId !== 'string'
      || !/^[a-z0-9_]{1,48}$/.test(groupId) || (type !== null && !isPlanningWeekType(type))) {
      return sendJson(response, 400, { error: 'Välj en giltig vecka, träningsgrupp och veckotyp.' })
    }
    const groups = await supabaseRequest(`training_groups?id=eq.${groupId}&active=eq.true&select=id&limit=1`)
    if (!groups.ok) return sendJson(response, 503, { error: 'Träningsgruppen kunde inte kontrolleras. Försök igen.' })
    if (!(await groups.json()).some(group => group.id === groupId)) return sendJson(response, 400, { error: 'Välj en aktiv träningsgrupp.' })
    const result = type === null
      ? await supabaseRequest(`planning_week_types?week_start=eq.${weekStart}&group_id=eq.${groupId}`, { method: 'DELETE' })
      : await supabaseRequest('planning_week_types?on_conflict=week_start,group_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ week_start: weekStart, group_id: groupId, week_type: type, updated_at: new Date().toISOString() }),
      })
    if (!result.ok) return sendJson(response, 503, { error: 'Veckotypen kunde inte sparas. Försök igen.' })
    return sendJson(response, 200, { weekStart, groupId, type })
  }
  return sendJson(response, 405, { error: 'Åtgärden stöds inte.' })
}
