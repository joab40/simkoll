import { supabaseRequest } from './supabase.js'
import { stockholmDate } from './profile-auth.js'
import { validDiaryDate, diaryAddDays } from '../shared/training-diary.js'
import { mapPersonalPlan, normalizePersonalDetails, personalCheckinDetails, personalId } from '../shared/personal-training.js'

async function rpc(body) {
  const result = await supabaseRequest('rpc/personal_training_action', { method: 'POST', body: JSON.stringify(body) })
  if (!result.ok) {
    const error = await result.json().catch(() => ({}))
    const migration = ['PGRST202', 'PGRST204', '42883', '42703'].includes(error.code)
    const status = migration ? 503 : error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '23505' ? 409 : error.code === '22023' ? 400 : 502
    throw Object.assign(new Error(migration ? 'Egna pass behöver SQL 131. Inget har sparats.' : status === 409 ? 'Passet har redan rapporterats eller ändrats. Hämta passen igen; det tidigare svaret har inte skrivits över.' : status === 404 || status === 403 ? 'Passet finns inte på din profil.' : 'Passet kunde inte sparas. Kontrollera uppgifterna och försök igen.'), { status })
  }
  return result.json()
}

export async function loadPersonalTraining(profileId, start, end) {
  if (![start, end].every(validDiaryDate) || start > end || Date.parse(end) - Date.parse(start) > 366 * 86400000) throw Object.assign(new Error('Välj en giltig period på högst ett år.'), { status: 400 })
  const [plans, sessions] = await Promise.all([
    supabaseRequest(`planned_training_sessions?profile_id=eq.${profileId}&personal_details=not.is.null&planned_date=gte.${start}&planned_date=lte.${end}&select=*&order=planned_date.asc,created_at.asc&limit=1000`),
    supabaseRequest(`personal_training_sessions?profile_id=eq.${profileId}&session_date=gte.${start}&session_date=lte.${end}&select=session_slot,session_date,activity_type,source&limit=1000`),
  ])
  if (!plans.ok || !sessions.ok) throw Object.assign(new Error('Egna pass kunde inte hämtas. Kontrollera att SQL 131 är körd.'), { status: 503 })
  const planRows = await plans.json(), sessionRows = await sessions.json()
  if (planRows.length === 1000 || sessionRows.length === 1000) throw Object.assign(new Error('För många pass. Välj en kortare period.'), { status: 422 })
  const completed = new Set(sessionRows.map(row => `${row.session_date}|${row.session_slot}`))
  return { sessions: planRows.map(row => mapPersonalPlan(row, completed.has(`${row.planned_date}|${row.session_slot}`))), registered: sessionRows.filter(row => row.source === 'program' && ['strength','dryland'].includes(row.activity_type) && row.session_slot === row.activity_type).map(row => ({ type: row.activity_type, date: row.session_date })) }
}

export async function savePersonalTraining(profileId, body) {
  if (!personalId(body.id)) throw Object.assign(new Error('Passets ID är ogiltigt. Öppna formuläret igen.'), { status: 400 })
  if (body.action === 'delete-personal-session') return rpc({ p_action: 'delete', p_profile_id: profileId, p_id: body.id })
  const today = stockholmDate()
  if (!validDiaryDate(body.date) || body.date < today || body.date > diaryAddDays(today, 366)) throw Object.assign(new Error('Planera från idag och högst ett år framåt.'), { status: 400 })
  let details
  try { details = normalizePersonalDetails(body.details) } catch (error) { throw Object.assign(error, { status: 400 }) }
  const data = await rpc({ p_action: 'save', p_profile_id: profileId, p_id: body.id, p_date: body.date, p_details: details })
  return { session: mapPersonalPlan(data.plan) }
}

export async function reportPersonalTraining(profileId, body, response) {
  return rpc({ p_action: 'report', p_profile_id: profileId, p_id: body.personalSessionId, p_date: response.activity_date, p_details: personalCheckinDetails(body), p_response: response })
}
