import { supabaseRequest } from './supabase.js'
import { normalizeFormContext } from '../shared/form-context.js'
import { coachWeekAddDays } from '../shared/coach-week.js'

const map = row => ({ id: row.id, observedOn: row.observed_on, trainingPbDate: row.training_pb_date, competitionPbDate: row.competition_pb_date, taperStart: row.taper_start, competitionDate: row.competition_date, note: row.note, createdAt: row.created_at })
export async function loadCoachFormContext(profileId, asOf, read = supabaseRequest) {
  // Call only after personal coach authorization. Never return this private
  // source (including its existence/history) to the swimmer's own endpoint.
  try {
    const result = await read(`coach_form_observations?profile_id=eq.${encodeURIComponent(profileId)}&observed_on=lte.${asOf}&observed_on=gte.${coachWeekAddDays(asOf, -41)}&select=id,observed_on,training_pb_date,competition_pb_date,taper_start,competition_date,note,created_at&order=observed_on.desc,created_at.desc,id.desc&limit=5`)
    if (!result.ok) return { available: false, current: null, revisions: [] }
    const revisions = (await result.json()).map(map)
    return { available: true, current: revisions[0] || null, revisions }
  } catch { return { available: false, current: null, revisions: [] } }
}

export async function saveCoachFormContext(profileId, actorId, input, asOf, write = supabaseRequest) {
  const context = normalizeFormContext(input, asOf)
  const result = await write('coach_form_observations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ profile_id: profileId, observed_on: context.observedOn, training_pb_date: context.trainingPbDate, competition_pb_date: context.competitionPbDate, taper_start: context.taperStart, competition_date: context.competitionDate, note: context.note, created_by: actorId }) })
  if (!result.ok) throw new Error('Tränaruppgiften kunde inte sparas. Kontrollera att SQL 120 är körd och försök igen.')
  const [row] = await result.json()
  if (!row) throw new Error('Ingen sparad tränaruppgift returnerades. Uppdatera kortet innan du försöker igen.')
  return map(row)
}
