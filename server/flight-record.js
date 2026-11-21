import { randomUUID } from 'node:crypto'
import { sendJson, supabaseRequest } from './supabase.js'
import { coachFromRequest } from './coach-auth.js'
import { getSessionProfile, stockholmDate } from './profile-auth.js'
import { writeAuditLog } from './audit.js'
import { analyticsRows } from './analytics-rows.js'
import { loadTrainingDiary } from './training-diary.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { isTimeId } from '../shared/swim-times.js'
import { FLIGHT_HISTORY_DAYS, flightRecordDays, flightTimeSeries } from '../shared/flight-record.js'

const configuredProfile = 'active=eq.true&approval_status=eq.approved'
const accessFields = 'flight_record_offer_id,flight_record_choice'
const returning = { Prefer: 'return=representation' }

function access(row) {
  const offered = isTimeId(row?.flight_record_offer_id)
  return offered
    ? { offered: true, offerId: row.flight_record_offer_id, choice: row.flight_record_choice }
    : { offered: false, offerId: null, choice: 'pending' }
}

async function checkAccessResult(result) {
  if (result.ok) return result.json()
  const detail = await result.json().catch(() => null)
  if (['42703', 'PGRST204'].includes(detail?.code)) {
    throw Object.assign(new Error('Flight Record kräver databasuppdatering 134. Be administratören köra SQL-filen.'), { status: 503 })
  }
  throw Object.assign(new Error('Flight Record kunde inte hämtas eller sparas. Försök igen.'), { status: 502 })
}

async function readRows(query) {
  const result = await analyticsRows(query)
  if (!result.ok || result.truncated) throw new Error('Ofullständigt underlag')
  return result.json()
}

async function loadFlightRecord(profile, end) {
  const start = coachWeekAddDays(end, 1 - FLIGHT_HISTORY_DAYS)
  const owner = `profile_id=eq.${profile.id}`
  const during = column => `${column}=gte.${start}&${column}=lte.${end}`
  const [diary, practice, races, sleep, audit] = await Promise.allSettled([
    loadTrainingDiary(profile, start, end, { includeComparison: false, includeReflections: false, includeResults: false, includeGoals: false }),
    readRows(`training_swim_times?${owner}&${during('result_date')}&select=id,result_date,distance_meters,stroke,pool_length,result_time,kind,start_type,exercise,equipment,timing_method,conditions,created_at&order=result_date.asc,created_at.asc,id.asc`),
    readRows(`competition_results?${owner}&${during('result_date')}&select=id,result_date,event,pool,swim_time,result_time,competition_name,source&order=result_date.asc,id.asc`),
    readRows(`profile_daily_sleep?${owner}&${during('activity_date')}&select=activity_date,minutes,quality,skipped&order=activity_date.asc`),
    readRows(`audit_logs?${owner}&event_type=eq.training_time_create&status=eq.success&created_at=gte.${start}T00:00:00Z&select=role,details&order=created_at.asc,id.asc`),
  ])
  if ([diary, practice, races, sleep].every(result => result.status === 'rejected')) {
    throw Object.assign(new Error('Formresans underlag kunde inte hämtas. Försök igen.'), { status: 502 })
  }
  const warnings = [
    diary.status === 'rejected' ? 'Träningsdagboken kunde inte hämtas.' : diary.value.warnings.length ? 'Delar av träningsdagboken saknas i underlaget.' : '',
    practice.status === 'rejected' ? 'Tränings- och testtider kunde inte hämtas.' : '',
    races.status === 'rejected' ? 'Tävlingsresultaten kunde inte hämtas.' : '',
    sleep.status === 'rejected' ? 'Sömnkollen kunde inte hämtas.' : '',
  ].filter(Boolean)
  const origins = new Map((audit.value ?? []).map(row => [row.details?.timeId, row.role]))
  return {
    start, asOf: end, warnings,
    days: flightRecordDays(start, end, diary.value, sleep.value ?? []),
    series: flightTimeSeries(practice.value ?? [], races.value ?? [], origins),
  }
}

async function coachAccess(request, response) {
  const coach = coachFromRequest(request)
  if (!coach || !isTimeId(coach.sub)) return sendJson(response, 403, { error: 'Logga in med ditt personliga tränarkonto.' })
  const profileId = request.query.profileId
  if (!isTimeId(profileId)) return sendJson(response, 400, { error: 'Välj en giltig simmarprofil.' })
  const endpoint = `profiles?id=eq.${profileId}&${configuredProfile}&select=flight_record_offer_id`
  let row
  if (request.method === 'POST') {
    const offered = request.body?.offered
    if (typeof offered !== 'boolean') return sendJson(response, 400, { error: 'Välj om Flight Record ska erbjudas.' })
    const change = offered ? `${endpoint}&flight_record_offer_id=is.null` : `${endpoint}&flight_record_offer_id=not.is.null`
    const patch = { flight_record_offer_id: offered ? randomUUID() : null, flight_record_choice: 'pending' }
    const [updated] = await checkAccessResult(await supabaseRequest(change, {
      method: 'PATCH', headers: returning, body: JSON.stringify(patch),
    }))
    row = updated
    if (row) await writeAuditLog(request, { eventType: 'flight_record_offer', role: 'coach', profileId, details: { offered, coachAccountId: coach.sub } })
  }
  if (!row) [row] = await checkAccessResult(await supabaseRequest(`${endpoint}&limit=1`))
  if (!row) return sendJson(response, 404, { error: 'Simmarprofilen är inte aktiv och godkänd.' })
  return sendJson(response, 200, { offered: isTimeId(row.flight_record_offer_id) })
}

/** Called after api/training's live guardCoachSession check. */
export async function handleFlightRecord(request, response, role) {
  const mode = request.query.flightRecord
  if (!['status', 'data'].includes(mode)) return sendJson(response, 400, { error: 'Okänd Flight Record-vy.' })
  if (!['GET', 'POST'].includes(request.method) || (request.method === 'POST' && mode !== 'status')) {
    return sendJson(response, 405, { error: 'Åtgärden stöds inte.' })
  }
  try {
    if (role === 'coach' && mode === 'status') return await coachAccess(request, response)
    if (role !== 'swimmer') return sendJson(response, 403, { error: 'Formresan öppnas från simmarens egen profil.' })
    const profile = await getSessionProfile(request)
    if (!profile || !isTimeId(profile.id) || !profile.terms_accepted_at) return sendJson(response, 403, { error: 'Logga in på din simmarprofil.' })
    const ownAccess = access(profile)
    if (request.method === 'GET' && mode === 'status') return sendJson(response, 200, ownAccess)
    if (request.method === 'POST') {
      const { choice, offerId } = request.body ?? {}
      if (!['active', 'later'].includes(choice) || !isTimeId(offerId)) return sendJson(response, 400, { error: 'Välj Aktivera eller Inte nu.' })
      if (!ownAccess.offered || offerId !== ownAccess.offerId) return sendJson(response, 409, { error: 'Erbjudandet har ändrats. Hämta inställningen igen.' })
      // Match the exact current offer. A revoke/re-offer cannot apply an old choice.
      const endpoint = `profiles?id=eq.${profile.id}&${configuredProfile}&flight_record_offer_id=eq.${offerId}&select=${accessFields}`
      const [updated] = await checkAccessResult(await supabaseRequest(endpoint, {
        method: 'PATCH', headers: returning, body: JSON.stringify({ flight_record_choice: choice }),
      }))
      if (!updated) return sendJson(response, 409, { error: 'Erbjudandet har ändrats. Hämta inställningen igen.' })
      return sendJson(response, 200, access(updated))
    }
    if (ownAccess.choice !== 'active') return sendJson(response, 403, { error: 'Aktivera Flight Record i Min profil för att se din formresa.' })
    const data = await loadFlightRecord(profile, stockholmDate())
    const live = await supabaseRequest(`profiles?id=eq.${profile.id}&${configuredProfile}&flight_record_offer_id=eq.${ownAccess.offerId}&flight_record_choice=eq.active&select=id&limit=1`)
    if (!live.ok) return sendJson(response, 502, { error: 'Flight Records åtkomst kunde inte kontrolleras. Försök igen.' })
    if (!(await live.json()).length) return sendJson(response, 403, { error: 'Flight Record har stängts av.' })
    return sendJson(response, 200, data)
  } catch (error) {
    return sendJson(response, error.status || 502, { error: error.status ? error.message : 'Flight Record kunde inte hämtas eller sparas. Försök igen.' })
  }
}
