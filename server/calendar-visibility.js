import { createHash } from 'node:crypto'
import { supabaseRequest } from './supabase.js'
import { analyticsRows } from './analytics-rows.js'
import { calendarActivityKey, calendarLinkKeys } from '../shared/planning-calendar.js'
import { validPlanningDate } from '../shared/planning-import.js'

const fail = (message, status = 503, extra = {}) => { throw Object.assign(new Error(message), { status, ...extra }) }
const hash = key => createHash('sha256').update(key).digest('hex')
export async function loadHiddenCalendarActivities(db = supabaseRequest) {
  const result = await analyticsRows('sportadmin_hidden_activities?select=*&order=key_hash.asc', db)
  if (!result.ok || result.truncated) fail('Dolda kalenderaktiviteter kunde inte hämtas. Kontrollera att SQL 115 är körd. Försök igen.')
  return result.json()
}
export function visibleCalendarActivities(activities, hidden) {
  const keys = new Set(hidden.map(row => row.calendar_key))
  return activities.filter(item => !keys.has(calendarActivityKey(item)))
}
export async function setCalendarVisibility({ keys, hidden, confirmLinked }, activities, coachId, db = supabaseRequest) {
  if (!Array.isArray(keys) || !keys.length || keys.length > 20 || new Set(keys).size !== keys.length || keys.some(key => typeof key !== 'string' || !key || key.length > 2000) || typeof hidden !== 'boolean') fail('Välj kalenderaktiviteter att dölja eller återställa.', 400)
  if (!hidden) {
    // Delete only suppression markers; this never deletes a calendar event.
    const result = await db(`sportadmin_hidden_activities?key_hash=in.(${keys.map(hash).join(',')})`, { method: 'DELETE' })
    if (!result.ok) fail('Aktiviteten kunde inte återställas. Försök igen.')
    return { saved: true, hidden: false }
  }
  const selected = keys.map(key => activities.find(item => calendarActivityKey(item) === key))
  if (selected.some(item => !item || !validPlanningDate(item.date))) fail('Kalenderaktiviteten har ändrats eller försvunnit. Ladda om planeringen.', 409)
  const dates = [...new Set(selected.map(item => item.date))].sort()
  const plansResult = await analyticsRows(`training_plans?plan_date=gte.${dates[0]}&plan_date=lte.${dates.at(-1)}&select=id,calendar_link,source_workout_id`, db)
  if (!plansResult.ok || plansResult.truncated) fail('Kopplade pass kunde inte kontrolleras. Inget har dolts.')
  const linked = (await plansResult.json()).filter(plan => calendarLinkKeys(plan.calendar_link).some(key => keys.includes(key)))
  const impact = { plans: linked.length, published: new Set(linked.map(plan => plan.source_workout_id).filter(Boolean)).size }
  if (linked.length && confirmLinked !== true) fail('Aktiviteten har kopplad planering. Döljningen tar bara bort kalenderaktiviteten; kopplade planeringar och publicerade pass ligger kvar. Avpublicera eller ändra dem separat om träningen är inställd.', 409, { impact, needsConfirmation: true })
  const rows = selected.map(item => ({ key_hash: hash(calendarActivityKey(item)), calendar_key: calendarActivityKey(item), event_date: item.date, snapshot: { calendarKey: calendarActivityKey(item), date: item.date, time: item.time || '', title: String(item.title || 'Kalenderaktivitet').slice(0, 300), location: String(item.location || '').slice(0, 300), targetGroups: item.targetGroups || [], calendarName: item.calendarName || 'SportAdmin' }, hidden_by: coachId || null, hidden_at: new Date().toISOString() }))
  const result = await db('sportadmin_hidden_activities?on_conflict=key_hash', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) })
  if (!result.ok) fail('Aktiviteten kunde inte döljas. Kontrollera att SQL 115 är körd. Försök igen.')
  return { saved: true, hidden: true, impact }
}
