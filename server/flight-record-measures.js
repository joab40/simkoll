import { analyticsRows } from './analytics-rows.js'
import { supabaseRequest } from './supabase.js'
import { isTimeDate, isTimeId } from '../shared/swim-times.js'

export const sleepGoalField = 'flight_record_sleep_goal_minutes'
const failure = (message, status) => Object.assign(new Error(message), { status })

async function read(query) {
  const result = await analyticsRows(query)
  if (!result.ok || result.truncated) throw failure('Egna mätvärden kunde inte hämtas.', 502)
  return result.json()
}

export async function readFlightMeasures(profileId) {
  const rows = await read(`flight_record_metrics?profile_id=eq.${profileId}&select=id,name,category&order=category.asc,name.asc,id.asc`)
  return rows.map(row => ({ key: row.id, label: row.name, category: row.category }))
}

export async function readFlightScores(profileId, start, end) {
  const rows = await read(`flight_record_scores?profile_id=eq.${profileId}&activity_date=gte.${start}&activity_date=lte.${end}&select=metric_id,activity_date,value&order=activity_date.asc,metric_id.asc`)
  const byDate = new Map()
  for (const row of rows) {
    if (!byDate.has(row.activity_date)) byDate.set(row.activity_date, {})
    byDate.get(row.activity_date)[row.metric_id] = row.value
  }
  return byDate
}

async function write(path, values, { method = 'POST', upsert = false } = {}) {
  const result = await supabaseRequest(path, {
    method, body: JSON.stringify(values),
    headers: { Prefer: upsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation' },
  })
  if (result.ok) return (await result.json())[0]
  const detail = await result.json().catch(() => null)
  if (detail?.code === '23505') throw failure('Det finns redan ett mätvärde med det namnet i kategorin.', 409)
  if (detail?.code === '23503') throw failure('Mätvärdet finns inte på simmarens profil.', 404)
  throw failure('Mätvärdet eller sömnmålet kunde inte sparas. Försök igen.', 502)
}

export async function saveFlightMeasure(body, profileId, endpoint, today) {
  const { action } = body ?? {}
  if (action === 'sleep-goal') {
    const { minutes } = body
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 840)) {
      throw failure('Ange ett sömnmål mellan 1 och 840 minuter.', 400)
    }
    const updated = await write(`${endpoint}&select=${sleepGoalField}`, { [sleepGoalField]: minutes }, { method: 'PATCH' })
    if (!updated) throw failure('Simmarprofilen är inte tillgänglig.', 404)
    return { action }
  }
  if (action === 'create-measure') {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
    const category = typeof body.category === 'string' ? body.category.trim().replace(/\s+/g, ' ') : ''
    if (!name || name.length > 60 || !category || category.length > 40) {
      throw failure('Ange namn och kategori för mätvärdet.', 400)
    }
    const row = await write('flight_record_metrics?select=id', { profile_id: profileId, name, category })
    return { action, measureId: row.id }
  }
  if (action === 'save-score') {
    const { measureId, date, value } = body
    if (!isTimeId(measureId) || !isTimeDate(date) || date < '0001-01-01' || date > today
      || !Number.isInteger(value) || value < 1 || value > 5) {
      throw failure('Välj ett mätvärde, ett datum senast idag och ett heltal från 1 till 5.', 400)
    }
    await write('flight_record_scores?on_conflict=profile_id,metric_id,activity_date', {
      profile_id: profileId, metric_id: measureId, activity_date: date, value,
    }, { upsert: true })
    return { action, measureId, date }
  }
  throw failure('Okänd ändring av Flight Record.', 400)
}
