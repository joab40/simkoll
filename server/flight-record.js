import { randomUUID } from 'node:crypto'
import { sendJson, supabaseRequest } from './supabase.js'
import { coachFromRequest } from './coach-auth.js'
import { getSessionProfile, stockholmDate } from './profile-auth.js'
import { writeAuditLog } from './audit.js'
import { analyticsRows } from './analytics-rows.js'
import { loadTrainingDiary } from './training-diary.js'
import { readFlightMeasures, readFlightScores, saveFlightMeasure, sleepGoalField } from './flight-record-measures.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { isTimeDate, isTimeId } from '../shared/swim-times.js'
import { flightGroupId, FLIGHT_OVERVIEW_BATCH } from '../shared/flight-defaults.js'
import { coachFlightDefaults, loadFlightDefaults } from './flight-defaults.js'
import { loadPlanningWeekType } from './planning-week-types.js'
import { FLIGHT_HISTORY_DAYS, FLIGHT_PERIODS, flightRecordDays, flightTimeSeries } from '../shared/flight-record.js'
import { FLIGHT_BOOST_MAX_DAYS, readFlightBoostSettings, validateFlightBoostSettings } from '../shared/flight-boosts.js'
import { FLIGHT_PRACTICE_BOOST_DAYS, flightPbCandidates, readFlightPbSettings, tempusPbLookup, validateFlightPbSettings } from '../shared/flight-pb.js'
import { FLIGHT_TAPER_CONTEXT_DAYS, flightTaperAdjustments } from '../shared/flight-taper.js'
import { flightChartPoints, readFlightPresentation, validateFlightPresentation } from '../shared/flight-presentation.js'
import { FLIGHT_BASELINE_DAYS, FLIGHT_RECENT_DAYS, FLIGHT_TIME_BASELINE_DAYS, FLIGHT_SIGNALS, flightLine, flightTimeComparisons, flightTimeLifts, readFlightWeights, sleepGoalScore, validateFlightWeights } from '../shared/flight-line.js'

const configuredProfile = 'active=eq.true&approval_status=eq.approved'
const accessFields = 'flight_record_offer_id,flight_record_choice'
const activeOffer = 'flight_record_choice=eq.active'
const acceptedTerms = 'terms_accepted_at=not.is.null'
const taperWeightField = 'flight_record_taper_weight'
const boostSettingsField = 'flight_record_boost_settings'
const pbSettingsField = 'flight_record_pb_boost_settings'
const presentationField = 'flight_record_presentation'
const defaultCoachOverviewDays = 28
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

function profileWeights(profile) {
  const weights = readFlightWeights(profile.flight_record_weights)
  return Object.hasOwn(profile, taperWeightField) ? { ...weights, taper: profile[taperWeightField] } : weights
}

async function loadFlightRecord(profile, end, { chartOnly = false, chartDays = FLIGHT_HISTORY_DAYS, preview = false, includeWeekType = false, defaults: loadedDefaults, planningCache } = {}) {
  const defaults = loadedDefaults ?? await loadFlightDefaults([profile.training_group])
  const inherited = defaults.group(profile.training_group) ?? defaults.club
  const start = coachWeekAddDays(end, 1 - (chartOnly ? chartDays : FLIGHT_HISTORY_DAYS))
  const contextStart = coachWeekAddDays(start, 1 - FLIGHT_RECENT_DAYS - FLIGHT_BASELINE_DAYS)
  const boostSettings = readFlightBoostSettings(profile[boostSettingsField] ?? inherited.boosts)
  const presentation = readFlightPresentation(profile[presentationField] ?? inherited.presentation)
  const presentationAvailable = Object.hasOwn(profile, presentationField)
  const boostSettingsAvailable = Object.hasOwn(profile, boostSettingsField)
  const pbBoostSettings = readFlightPbSettings(profile[pbSettingsField] ?? (profile[boostSettingsField] == null ? inherited.pbBoosts : null), boostSettings.times)
  const pbBoostSettingsAvailable = Object.hasOwn(profile, pbSettingsField)
  const timeDays = !chartOnly && boostSettingsAvailable ? FLIGHT_BOOST_MAX_DAYS
    : Math.max(FLIGHT_PRACTICE_BOOST_DAYS, boostSettings.times.fullDays + boostSettings.times.fadeDays)
  const firstLiftDay = coachWeekAddDays(start, 1 - timeDays)
  const timeStart = coachWeekAddDays(firstLiftDay, -FLIGHT_TIME_BASELINE_DAYS)
  const owner = `profile_id=eq.${profile.id}`
  const during = (column, from) => `${column}=gte.${from}&${column}=lte.${end}`
  const weights = profile.flight_record_weights == null
    ? { ...inherited.weights, taper: Object.hasOwn(profile, taperWeightField) ? inherited.weights.taper : 0 }
    : profileWeights(profile)
  const needPb = pbBoostSettingsAvailable && (!chartOnly || weights.times > 0)
  const taperAvailable = Object.hasOwn(profile, taperWeightField)
  const needTaper = taperAvailable && (!chartOnly || weights.taper > 0)
  // Use the same run-up for both views so a long reduction keeps the same anchor.
  const historyStart = needTaper ? coachWeekAddDays(end, 1 - FLIGHT_HISTORY_DAYS - FLIGHT_TAPER_CONTEXT_DAYS) : contextStart
  const raceStart = needTaper && historyStart < timeStart ? historyStart : timeStart
  const extended = Object.hasOwn(profile, sleepGoalField)
  const needCustom = extended && (!chartOnly || Object.keys(weights).some(key => isTimeId(key) && weights[key] > 0))
  const [diary, practice, races, sleep, audit, measures, scores, tempus, weekType] = await Promise.allSettled([
    loadTrainingDiary(profile, historyStart, end, { includeComparison: false, includeReflections: false, includeResults: false,
      includeGoals: false, includeCheckinSignals: true, planningCache }),
    readRows(`training_swim_times?${owner}&${during('result_date', timeStart)}&select=id,result_date,distance_meters,stroke,pool_length,result_time,kind,start_type,exercise,equipment,timing_method,conditions,created_at&order=result_date.asc,created_at.asc,id.asc`),
    readRows(`competition_results?${owner}&${during('result_date', raceStart)}&select=id,result_date,event,pool,swim_time,result_time,competition_name,source&order=result_date.asc,id.asc`),
    readRows(`profile_daily_sleep?${owner}&${during('activity_date', contextStart)}&select=activity_date,minutes,quality,skipped&order=activity_date.asc`),
    chartOnly ? [] : readRows(`audit_logs?${owner}&event_type=eq.training_time_create&status=eq.success&created_at=gte.${start}T00:00:00Z&select=role,details&order=created_at.asc,id.asc`),
    needCustom ? readFlightMeasures(profile.id) : [],
    needCustom ? readFlightScores(profile.id, contextStart, end) : new Map(),
    needPb ? readRows(`competition_results?${owner}&source=eq.tempus&result_date=lte.${end}&select=source,result_date,event,pool,result_time,swim_time&order=result_date.asc,id.asc`) : [],
    preview || (includeWeekType && presentation.sky) ? loadPlanningWeekType(profile.training_group, end) : null,
  ])
  if ([diary, practice, races, sleep].every(result => result.status === 'rejected') && !scores.value?.size) {
    throw Object.assign(new Error('Formresans underlag kunde inte hämtas. Försök igen.'), { status: 502 })
  }
  const warnings = [
    diary.status === 'rejected' ? 'Träningsdagboken kunde inte hämtas.' : diary.value.warnings.length ? 'Delar av träningsdagboken saknas i underlaget.' : '',
    practice.status === 'rejected' ? 'Tränings- och testtider kunde inte hämtas.' : '',
    races.status === 'rejected' ? 'Tävlingsresultaten kunde inte hämtas.' : '',
    sleep.status === 'rejected' ? 'Sömnkollen kunde inte hämtas.' : '',
    measures.status === 'rejected' || scores.status === 'rejected' ? 'Egna mätvärden kunde inte hämtas.' : '',
    tempus.status === 'rejected' ? 'Personbästan från Tempus kunde inte hämtas.' : '',
  ].filter(Boolean)
  const origins = new Map((audit.value ?? []).map(row => [row.details?.timeId, row.role]))
  const history = flightTimeSeries(practice.value ?? [], races.value ?? [], origins)
  const customMeasures = measures.value ?? []
  const sleepGoalMinutes = profile[sleepGoalField] ?? null
  const days = flightRecordDays(historyStart, end, diary.value, sleep.value ?? [])
  const raceDays = new Set((races.value ?? []).map(row => row.result_date))
  const trainingDataIncomplete = diary.value?.warnings.some(warning => /^(registrerade pass|incheckningar|upplagda pass|grundplanering|tränarens närvaromarkeringar|styrkeloggar|landträningsloggar)/.test(warning))
  const taperAdjustments = needTaper && diary.status === 'fulfilled' && !trainingDataIncomplete
    ? flightTaperAdjustments(days.map(day => raceDays.has(day.date) && day.taperObservation?.kind !== 'sick' ? { ...day, taperObservation: null } : day))
      .filter(point => point.date >= start)
    : []
  const signalDays = days.filter(day => day.date >= contextStart).map(({ taperObservation, ...day }) => ({
    ...day, ...scores.value?.get(day.date), sleepGoal: sleepGoalScore(day.sleepMinutes, sleepGoalMinutes),
  }))
  const visibleDays = signalDays.filter(day => day.date >= start)
  const contextDays = signalDays.filter(day => day.date < start)
  const practiceSeries = history.filter(group => group.kind !== 'race')
  const practiceStart = coachWeekAddDays(start, 1 - FLIGHT_PRACTICE_BOOST_DAYS)
  const referenceFor = tempusPbLookup(tempus.value ?? [])
  const raceLifts = flightTimeLifts(history.filter(group => group.kind === 'race')).filter(lift => lift.date >= firstLiftDay)
  const practiceChecks = [
    ...flightPbCandidates(practiceSeries, referenceFor, practiceStart),
    ...flightTimeComparisons(practiceSeries, (group, point) => point.date >= practiceStart && !referenceFor(group.raceReference, point.date)),
  ]
  const practiceLifts = tempus.status === 'fulfilled' ? practiceChecks.filter(time => time.pbKind || time.strength > 0) : []
  const timeLifts = [...practiceLifts, ...raceLifts]
  if (chartOnly) {
    const line = flightLine(visibleDays, contextDays, timeLifts, weights, customMeasures, taperAdjustments, boostSettings, pbBoostSettings)
    return { asOf: end, partial: warnings.length > 0, points: flightChartPoints(line, visibleDays, presentation.sky || preview),
      ...(presentationAvailable ? { presentation } : {}), ...(weekType.value ? { weekType: weekType.value } : {}) }
  }
  const series = history.map(group => ({ ...group, points: group.points.filter(point => point.date >= start) }))
    .filter(group => group.points.length)
    .sort((a, b) => Number(b.points.length > 1) - Number(a.points.length > 1) || b.points.at(-1).date.localeCompare(a.points.at(-1).date))
  const signalKeys = [...FLIGHT_SIGNALS, ...customMeasures].map(signal => signal.key)
  return {
    start, asOf: end, warnings,
    hasOverrides: [profile.flight_record_weights, profile[boostSettingsField], profile[pbSettingsField], profile[presentationField]].some(value => value != null),
    inheritedFromGroup: Boolean(defaults.group(profile.training_group)),
    presentation,
    presentationAvailable,
    weights,
    taperAvailable,
    taperAdjustments,
    boostSettings,
    boostSettingsAvailable,
    pbBoostSettings,
    pbBoostSettingsAvailable,
    weightsAvailable: Object.hasOwn(profile, 'flight_record_weights') && measures.status === 'fulfilled',
    measuresAvailable: extended && measures.status === 'fulfilled' && scores.status === 'fulfilled',
    sleepGoalMinutes,
    customMeasures,
    days: visibleDays,
    contextDays: contextDays.map(day => ({
      date: day.date, ...Object.fromEntries(signalKeys.map(key => [key, day[key] ?? null])),
    })),
    timeLifts,
    practiceChecks: practiceChecks.filter(time => time.date >= start),
    practiceTimesAvailable: practice.status === 'fulfilled',
    tempusHistoryAvailable: tempus.status === 'fulfilled',
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

async function saveWeights(request, response, endpoint, profile, coach) {
  const input = request.body?.weights
  const hasCustom = Object.keys(input ?? {}).some(isTimeId)
  const extended = Object.hasOwn(profile, sleepGoalField)
  if (!extended && (hasCustom || input?.sleepGoal > 0)) {
    return sendJson(response, 503, { error: 'Egna mätvärden och sömnmål kräver SQL 137.' })
  }
  const customMeasures = hasCustom ? await readFlightMeasures(profile.id) : []
  let weights
  try { weights = validateFlightWeights(input, customMeasures) } catch (error) { return sendJson(response, 400, { error: error.message }) }
  const { taper = 0, sleepGoal, ...standardWeights } = weights
  const taperAvailable = Object.hasOwn(profile, taperWeightField)
  if (taper > 0 && !taperAvailable) return sendJson(response, 503, { error: 'Toppningsjustering kräver SQL 138.' })
  const patch = {
    flight_record_weights: sleepGoal || hasCustom ? { ...standardWeights, sleepGoal } : standardWeights,
    ...(taperAvailable ? { [taperWeightField]: taper } : {}),
  }
  if (Object.hasOwn(request.body ?? {}, 'boostSettings')) {
    if (!Object.hasOwn(profile, boostSettingsField)) return sendJson(response, 503, { error: 'Boostvärden och tidshorisont kräver SQL 138.' })
    try { patch[boostSettingsField] = validateFlightBoostSettings(request.body.boostSettings) }
    catch (error) { return sendJson(response, 400, { error: error.message }) }
  }
  if (Object.hasOwn(request.body ?? {}, 'pbBoostSettings')) {
    if (!Object.hasOwn(profile, pbSettingsField)) return sendJson(response, 503, { error: 'PB-boostar kräver SQL 139.' })
    try { patch[pbSettingsField] = validateFlightPbSettings(request.body.pbBoostSettings) }
    catch (error) { return sendJson(response, 400, { error: error.message }) }
  }
  const [updated] = await checkAccessResult(await supabaseRequest(`${endpoint}&select=${Object.keys(patch).join(',')}`, {
    method: 'PATCH', headers: returning, body: JSON.stringify(patch),
  }), 135)
  if (!updated) return sendJson(response, 404, { error: 'Simmarprofilen är inte tillgänglig.' })
  await writeAuditLog(request, { eventType: 'flight_record_weights', role: 'coach', profileId: profile.id, details: { coachAccountId: coach.sub } })
  return sendJson(response, 200, {
    weights: profileWeights(updated),
    ...(Object.hasOwn(updated, boostSettingsField) ? { boostSettings: readFlightBoostSettings(updated[boostSettingsField]) } : {}),
    ...(Object.hasOwn(updated, pbSettingsField) ? { pbBoostSettings: readFlightPbSettings(updated[pbSettingsField]) } : {}),
  })
}

async function loadCoachProfile(endpoint) {
  const fields = 'id,training_group,flight_record_weights'
  let optional = [sleepGoalField, taperWeightField, boostSettingsField, pbSettingsField, presentationField]
  for (;;) {
    const result = await supabaseRequest(`${endpoint}&select=${[fields, ...optional].join(',')}&limit=1`)
    if (result.ok) return (await result.json())[0]
    const detail = await result.clone().json().catch(() => null)
    const missing = optional.find(field => detail?.message?.includes(field))
    if (!missing || !['42703', 'PGRST204'].includes(detail.code)) return (await checkAccessResult(result, 135))[0]
    optional = optional.filter(field => field !== missing)
  }
}

async function loadChartForSwimmer(response, profile) {
  const data = await loadFlightRecord(profile, stockholmDate(), { chartOnly: true, includeWeekType: true })
  const live = await supabaseRequest(`${profileEndpoint(profile.id)}&flight_record_offer_id=eq.${profile.flight_record_offer_id}&${activeOffer}&select=id&limit=1`)
  if (!live.ok) return sendJson(response, 502, { error: 'Flight Records åtkomst kunde inte kontrolleras. Försök igen.' })
  if (!(await live.json()).length) return sendJson(response, 403, { error: 'Flight Record har stängts av.' })
  return sendJson(response, 200, data)
}

async function coachFlightOverview(request, response) {
  const { end, days } = request.query
  const chartDays = days === undefined ? defaultCoachOverviewDays : FLIGHT_PERIODS.find(period => String(period) === days)
  if (!chartDays) return sendJson(response, 400, { error: 'Välj 14, 28 eller 90 dagar för gruppkurvan.' })
  const ids = typeof request.query.ids === 'string' ? [...new Set(request.query.ids.split(','))] : []
  if (!isTimeDate(end) || end > stockholmDate() || end < '1900-01-01'
    || !ids.length || ids.length > FLIGHT_OVERVIEW_BATCH || !ids.every(isTimeId)) {
    return sendJson(response, 400, { error: 'Välj en giltig dag och giltiga simmarprofiler.' })
  }
  const rows = await checkAccessResult(await supabaseRequest(`profiles?id=in.(${ids.join(',')})&${configuredProfile}&${acceptedTerms}&is_test_profile=eq.false&select=id,training_group,flight_record_weights,${sleepGoalField},${taperWeightField},${boostSettingsField},${pbSettingsField},${presentationField}`), 142)
  const defaults = await loadFlightDefaults(rows.map(row => row.training_group))
  const planningCache = new Map()
  const profiles = []
  for (let index = 0; index < rows.length; index += 3) {
    const batch = await Promise.all(rows.slice(index, index + 3).map(async profile => {
      const group = flightGroupId(profile.training_group)
      const model = { id: profile.id, group, minSwimmers: (defaults.group(group) ?? defaults.club).minSwimmers }
      try {
        const chart = await loadFlightRecord(profile, end, { chartOnly: true, chartDays, defaults, planningCache })
        return { ...model, partial: chart.partial, points: chart.points.map(({ date, value, limited }) => ({ date, value, ...(limited ? { limited } : {}) })) }
      } catch {
        return { ...model, unavailable: true, points: [] }
      }
    }))
    profiles.push(...batch)
  }
  return sendJson(response, 200, { profiles, clubMinSwimmers: defaults.club.minSwimmers })
}

async function coachFlight(request, response, mode, coach) {
  const { profileId } = request.query
  if (!isTimeId(profileId)) return sendJson(response, 400, { error: 'Välj en giltig simmarprofil.' })
  const endpoint = `${profileEndpoint(profileId)}&${acceptedTerms}`
  const profile = await loadCoachProfile(endpoint)
  if (!profile) return sendJson(response, 404, { error: 'Simmarprofilen är inte tillgänglig.' })
  if (mode === 'weights') return saveWeights(request, response, endpoint, profile, coach)
  if (mode === 'preview') return sendJson(response, 200, await loadFlightRecord(profile, stockholmDate(), { chartOnly: true, preview: true }))
  if (mode === 'presentation') {
    if (!Object.hasOwn(profile, presentationField)) return sendJson(response, 503, { error: 'Flygtemats inställningar kräver SQL 142.' })
    let presentation
    try { presentation = validateFlightPresentation(request.body?.presentation) }
    catch (error) { return sendJson(response, 400, { error: error.message }) }
    const [updated] = await checkAccessResult(await supabaseRequest(`${endpoint}&select=${presentationField}`, {
      method: 'PATCH', headers: returning, body: JSON.stringify({ [presentationField]: presentation }),
    }), 142)
    if (!updated) return sendJson(response, 404, { error: 'Simmarprofilen är inte tillgänglig.' })
    await writeAuditLog(request, { eventType: 'flight_record_presentation', role: 'coach', profileId, details: { coachAccountId: coach.sub } })
    return sendJson(response, 200, { presentation: readFlightPresentation(updated[presentationField]) })
  }
  if (mode === 'measures') {
    if (!Object.hasOwn(profile, sleepGoalField)) return sendJson(response, 503, { error: 'Egna mätvärden och sömnmål kräver SQL 137.' })
    const result = await saveFlightMeasure(request.body, profileId, endpoint, stockholmDate())
    await writeAuditLog(request, { eventType: 'flight_record_measure_change', role: 'coach', profileId, details: { ...result, coachAccountId: coach.sub } })
    return sendJson(response, 200, result)
  }
  if (mode === 'inherit') {
    const patch = { flight_record_weights: null }
    for (const field of [boostSettingsField, pbSettingsField, presentationField]) if (Object.hasOwn(profile, field)) patch[field] = null
    if (Object.hasOwn(profile, taperWeightField)) patch[taperWeightField] = 0
    const [updated] = await checkAccessResult(await supabaseRequest(`${endpoint}&select=id`, {
      method: 'PATCH', headers: returning, body: JSON.stringify(patch),
    }), 135)
    if (!updated) return sendJson(response, 404, { error: 'Simmarprofilen är inte tillgänglig.' })
    await writeAuditLog(request, { eventType: 'flight_record_inherit', role: 'coach', profileId, details: { coachAccountId: coach.sub } })
    return sendJson(response, 200, { inherited: true })
  }
  return sendJson(response, 200, await loadFlightRecord(profile, stockholmDate()))
}

/** Called after api/training's live guardCoachSession check. */
export async function handleFlightRecord(request, response, role) {
  const mode = request.query.flightRecord
  if (request.body?.action === 'logout') return sendJson(response, 400, { error: 'Åtgärden hör till inloggningen.' })
  const coachWrites = ['weights', 'measures', 'presentation', 'inherit']
  const coachReads = ['data', 'preview', 'overview']
  const coachOnly = ['defaults', ...coachReads, ...coachWrites]
  if (!['status', 'chart', ...coachOnly].includes(mode)) return sendJson(response, 400, { error: 'Okänd Flight Record-vy.' })
  if (!['GET', 'POST'].includes(request.method) || (['chart', ...coachReads].includes(mode) && request.method !== 'GET') || (coachWrites.includes(mode) && request.method !== 'POST')) {
    return sendJson(response, 405, { error: 'Åtgärden stöds inte.' })
  }
  try {
    if (role === 'coach' && mode === 'status') return await coachAccess(request, response)
    if (coachOnly.includes(mode)) {
      const coach = role === 'coach' && coachFromRequest(request)
      if (!isTimeId(coach?.sub)) return sendJson(response, 403, { error: 'Logga in med ditt personliga tränarkonto.' })
      if (mode === 'defaults') return sendJson(response, 200, await coachFlightDefaults(request, coach))
      if (mode === 'overview') return await coachFlightOverview(request, response)
      return await coachFlight(request, response, mode, coach)
    }
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
