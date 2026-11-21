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
import { FLIGHT_BASELINE_DAYS, FLIGHT_RECENT_DAYS, FLIGHT_TIME_BASELINE_DAYS, FLIGHT_SIGNALS, flightLine, flightTimeLifts, readFlightWeights, validateFlightWeights } from '../shared/flight-line.js'

const configuredProfile = 'active=eq.true&approval_status=eq.approved'
const accessFields = 'flight_record_offer_id,flight_record_choice'
const activeOffer = 'flight_record_choice=eq.active'
const acceptedTerms = 'terms_accepted_at=not.is.null'
const swimmerChartDays = 28
const returning = { Prefer: 'return=representation' }

function access(row) {
  const offered = isTimeId(row?.flight_record_offer_id)
  return offered
    ? { offered: true, offerId: row.flight_record_offer_id, choice: row.flight_record_choice }
    : { offered: false, offerId: null, choice: 'pending' }
}

async function checkAccessResult(result, migration = 134) {
  if (result.ok) return result.json()
  const detail = await result.json().catch(() => null)
  if (detail?.code === '23514' && detail.message?.includes('profiles_flight_record_weights_check')) {
    throw Object.assign(new Error('Procentvikter kräver databasuppdatering 136.'), { status: 503 })
  }
  if (['42703', 'PGRST204'].includes(detail?.code)) {
    throw Object.assign(new Error(`Flight Record kräver databasuppdatering ${migration}. Be administratören köra SQL-filen.`), { status: 503 })
  }
  throw Object.assign(new Error('Flight Record kunde inte hämtas eller sparas. Försök igen.'), { status: 502 })
}

async function readRows(query) {
  const result = await analyticsRows(query)
  if (!result.ok || result.truncated) throw new Error('Ofullständigt underlag')
  return result.json()
}

async function loadFlightRecord(profile, end, { chartOnly = false } = {}) {
  const start = coachWeekAddDays(end, 1 - (chartOnly ? swimmerChartDays : FLIGHT_HISTORY_DAYS))
  const contextStart = coachWeekAddDays(start, 1 - FLIGHT_RECENT_DAYS - FLIGHT_BASELINE_DAYS)
  const firstLiftDay = coachWeekAddDays(start, 1 - FLIGHT_RECENT_DAYS)
  const timeStart = coachWeekAddDays(firstLiftDay, -FLIGHT_TIME_BASELINE_DAYS)
  const owner = `profile_id=eq.${profile.id}`
  const during = (column, from) => `${column}=gte.${from}&${column}=lte.${end}`
  const [diary, practice, races, sleep, audit] = await Promise.allSettled([
    loadTrainingDiary(profile, contextStart, end, { includeComparison: false, includeReflections: false, includeResults: false, includeGoals: false, includeCheckinSignals: true }),
    readRows(`training_swim_times?${owner}&${during('result_date', timeStart)}&select=id,result_date,distance_meters,stroke,pool_length,result_time,kind,start_type,exercise,equipment,timing_method,conditions,created_at&order=result_date.asc,created_at.asc,id.asc`),
    readRows(`competition_results?${owner}&${during('result_date', timeStart)}&select=id,result_date,event,pool,swim_time,result_time,competition_name,source&order=result_date.asc,id.asc`),
    readRows(`profile_daily_sleep?${owner}&${during('activity_date', contextStart)}&select=activity_date,minutes,quality,skipped&order=activity_date.asc`),
    chartOnly ? [] : readRows(`audit_logs?${owner}&event_type=eq.training_time_create&status=eq.success&created_at=gte.${start}T00:00:00Z&select=role,details&order=created_at.asc,id.asc`),
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
  const history = flightTimeSeries(practice.value ?? [], races.value ?? [], origins)
  const days = flightRecordDays(contextStart, end, diary.value, sleep.value ?? [])
  const visibleDays = days.filter(day => day.date >= start)
  const contextDays = days.filter(day => day.date < start)
  const weights = readFlightWeights(profile.flight_record_weights)
  const timeLifts = flightTimeLifts(history).filter(lift => lift.date >= firstLiftDay)
  if (chartOnly) {
    const points = flightLine(visibleDays, contextDays, timeLifts, weights).map(point => ({
      date: point.date, value: point.value,
      newTimeLift: point.timeLift > 0 && point.events.some(event => event.date === point.date),
    }))
    return { asOf: end, partial: warnings.length > 0, points }
  }
  const series = history.map(group => ({ ...group, points: group.points.filter(point => point.date >= start) }))
    .filter(group => group.points.length)
    .sort((a, b) => Number(b.points.length > 1) - Number(a.points.length > 1) || b.points.at(-1).date.localeCompare(a.points.at(-1).date))
  return {
    start, asOf: end, warnings,
    weights,
    weightsAvailable: Object.hasOwn(profile, 'flight_record_weights'),
    days: visibleDays,
    contextDays: contextDays.map(day => ({
      date: day.date, ...Object.fromEntries(FLIGHT_SIGNALS.map(signal => [signal.key, day[signal.key]])),
    })),
    timeLifts,
    series,
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

function profileEndpoint(id) {
  return `profiles?id=eq.${id}&${configuredProfile}`
}

async function saveWeights(request, response, endpoint, profileId, coach) {
  let weights
  try { weights = validateFlightWeights(request.body?.weights) } catch (error) { return sendJson(response, 400, { error: error.message }) }
  const [updated] = await checkAccessResult(await supabaseRequest(`${endpoint}&select=flight_record_weights`, {
    method: 'PATCH', headers: returning, body: JSON.stringify({ flight_record_weights: weights }),
  }), 135)
  if (!updated) return sendJson(response, 404, { error: 'Simmarprofilen är inte tillgänglig.' })
  await writeAuditLog(request, { eventType: 'flight_record_weights', role: 'coach', profileId, details: { coachAccountId: coach.sub } })
  return sendJson(response, 200, { weights: readFlightWeights(updated.flight_record_weights) })
}

async function loadChartForSwimmer(response, profile) {
  const data = await loadFlightRecord(profile, stockholmDate(), { chartOnly: true })
  const live = await supabaseRequest(`${profileEndpoint(profile.id)}&flight_record_offer_id=eq.${profile.flight_record_offer_id}&${activeOffer}&select=id&limit=1`)
  if (!live.ok) return sendJson(response, 502, { error: 'Flight Records åtkomst kunde inte kontrolleras. Försök igen.' })
  if (!(await live.json()).length) return sendJson(response, 403, { error: 'Flight Record har stängts av.' })
  return sendJson(response, 200, data)
}

async function coachFlight(request, response, mode) {
  const coach = coachFromRequest(request)
  if (!isTimeId(coach?.sub)) return sendJson(response, 403, { error: 'Logga in med ditt personliga tränarkonto.' })
  const { profileId } = request.query
  if (!isTimeId(profileId)) return sendJson(response, 400, { error: 'Välj en giltig simmarprofil.' })
  const endpoint = `${profileEndpoint(profileId)}&${acceptedTerms}`
  if (mode === 'weights') return saveWeights(request, response, endpoint, profileId, coach)
  const [profile] = await checkAccessResult(await supabaseRequest(
    `${endpoint}&select=id,training_group,flight_record_weights&limit=1`,
  ), 135)
  if (!profile) return sendJson(response, 404, { error: 'Simmarprofilen är inte tillgänglig.' })
  return sendJson(response, 200, await loadFlightRecord(profile, stockholmDate()))
}

/** Called after api/training's live guardCoachSession check. */
export async function handleFlightRecord(request, response, role) {
  const mode = request.query.flightRecord
  if (!['status', 'data', 'chart', 'weights'].includes(mode)) return sendJson(response, 400, { error: 'Okänd Flight Record-vy.' })
  if (!['GET', 'POST'].includes(request.method) || (['data', 'chart'].includes(mode) && request.method !== 'GET') || (mode === 'weights' && request.method !== 'POST')) {
    return sendJson(response, 405, { error: 'Åtgärden stöds inte.' })
  }
  try {
    if (role === 'coach' && mode === 'status') return await coachAccess(request, response)
    if (role === 'coach' && ['data', 'weights'].includes(mode)) return await coachFlight(request, response, mode)
    if (mode === 'weights') return sendJson(response, 403, { error: 'Tränarna ställer in Flight Records vikter.' })
    if (mode === 'data') return sendJson(response, 403, { error: 'Detaljvyn öppnas från tränarens simmarkort.' })
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
      const endpoint = `${profileEndpoint(profile.id)}&flight_record_offer_id=eq.${offerId}&select=${accessFields}`
      const [updated] = await checkAccessResult(await supabaseRequest(endpoint, {
        method: 'PATCH', headers: returning, body: JSON.stringify({ flight_record_choice: choice }),
      }))
      if (!updated) return sendJson(response, 409, { error: 'Erbjudandet har ändrats. Hämta inställningen igen.' })
      return sendJson(response, 200, access(updated))
    }
    if (ownAccess.choice !== 'active') return sendJson(response, 403, { error: 'Aktivera Flight Record i Min profil för att se din formresa.' })
    return await loadChartForSwimmer(response, profile)
  } catch (error) {
    return sendJson(response, error.status || 502, { error: error.status ? error.message : 'Flight Record kunde inte hämtas eller sparas. Försök igen.' })
  }
}
