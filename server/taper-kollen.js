import { supabaseRequest } from './supabase.js'
import { analyticsRows } from './analytics-rows.js'
import { normalizeTaperGoal, latestTaperGoals } from '../shared/taper-kollen.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { loadFormKollen } from './form-kollen.js'

const fields = 'id,competition_id,competition_title,competition_start,competition_end,priority,target_date,taper_start,target_events,note,enabled,created_at'
export const mapTaperGoal = row => ({ id: row.id, competitionId: row.competition_id, title: row.competition_title, competitionStart: row.competition_start, competitionEnd: row.competition_end, priority: row.priority, targetDate: row.target_date, taperStart: row.taper_start, events: row.target_events, note: row.note, enabled: row.enabled, createdAt: row.created_at })
export async function loadTaperGoals(profileId, read = supabaseRequest) {
  const result = await analyticsRows(`coach_taper_goals?profile_id=eq.${encodeURIComponent(profileId)}&select=${fields}&order=created_at.desc,id.desc`, read)
  if (!result.ok || result.truncated) throw Object.assign(new Error('Måltävlingarna kunde inte hämtas fullständigt. Kontrollera att SQL 122 är körd och försök igen.'), { status: 503 })
  return latestTaperGoals((await result.json()).map(mapTaperGoal))
}
export async function loadTaperKollen(profile, asOf, read = supabaseRequest) {
  const [goals, calendar, signals] = await Promise.all([
    loadTaperGoals(profile.id, read),
    analyticsRows(`competition_calendar?end_date=gte.${coachWeekAddDays(asOf, -90)}&start_date=lte.${coachWeekAddDays(asOf, 365)}&select=id,title,start_date,end_date&order=start_date.asc,id.asc`, read),
    loadFormKollen(profile, asOf, read).then(form => ({ form, formError: null })).catch(() => ({ form: null, formError: 'Rapporterade signaler kunde inte hämtas. Det betyder inte att simmaren saknar svar. Ingen nulägestolkning görs; målen går fortfarande att hantera.' })),
  ])
  if (!calendar.ok || calendar.truncated) throw new Error('Tävlingskalendern kunde inte hämtas fullständigt. Försök igen.')
  return { profileId: profile.id, asOf, goals, competitions: (await calendar.json()).map(row => ({ id: row.id, title: row.title, startDate: row.start_date, endDate: row.end_date })), ...signals }
}
export async function saveTaperGoal(profileId, actorId, input, db = supabaseRequest) {
  if (!/^[0-9a-f-]{36}$/i.test(input?.competitionId || '')) throw Object.assign(new Error('Välj en giltig tävling.'), { status: 400 })
  let competition
  // Archiving always uses the saved snapshot, even after a calendar date change.
  if (input.enabled === false) {
    const previous = (await loadTaperGoals(profileId, db)).find(goal => goal.competitionId === input.competitionId)
    if (!previous) throw Object.assign(new Error('Målet som ska avaktiveras kunde inte hittas.'), { status: 404 })
    input = { ...previous, enabled: false }
    competition = { id: previous.competitionId, title: previous.title, start_date: previous.competitionStart, end_date: previous.competitionEnd }
  } else {
    const found = await db(`competition_calendar?id=eq.${encodeURIComponent(input.competitionId)}&select=id,title,start_date,end_date&limit=1`)
    if (!found.ok) throw new Error('Tävlingen kunde inte kontrolleras. Inget sparades.')
    competition = (await found.json())[0]
  }
  const goal = normalizeTaperGoal(input, competition)
  const saved = await db('coach_taper_goals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ profile_id: profileId, created_by: actorId, competition_id: goal.competitionId, competition_title: goal.title, competition_start: goal.competitionStart, competition_end: goal.competitionEnd, priority: goal.priority, target_date: goal.targetDate, taper_start: goal.taperStart, target_events: goal.events, note: goal.note, enabled: goal.enabled }) })
  if (!saved.ok) throw new Error('Målet kunde inte sparas. Kontrollera SQL 122 och försök igen.')
  const row = (await saved.json())[0]
  if (!row) throw new Error('Ingen sparad målversion returnerades. Hämta målen igen före nytt försök.')
  return mapTaperGoal(row)
}
