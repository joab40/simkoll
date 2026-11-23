import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coachWeekAddDays, coachWeekMonday } from '../shared/coach-week.js'
import { flightCompetitionJourney, flightRecordDays, flightTimeComparison, flightTimeSeries } from '../shared/flight-record.js'
import { changeFlightWeight, defaultFlightWeights, flightLine } from '../shared/flight-line.js'
import { defaultFlightBoostSettings } from '../shared/flight-boosts.js'
import { defaultFlightPbSettings } from '../shared/flight-pb.js'
import { defaultFlightPresentation, flightAircraft, flightChartPoints, flightDirection, validateFlightPresentation } from '../shared/flight-presentation.js'
import { builtInFlightDefaults, flightGroupCurve } from '../shared/flight-defaults.js'

process.env.SUPABASE_URL = 'https://flight-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'shared-coach'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer'
process.env.COACH_SESSION_SECRET = 'flight-record-isolated-test-secret'
const { default: handler } = await import('../api/training.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const coachId = '33333333-3333-4333-8333-333333333333'
const offer = '44444444-4444-4444-8444-444444444444'
const customId = '55555555-5555-4555-8555-555555555555'
const coach = createCoachToken({ id: coachId, role: 'coach' })
const today = stockholmDate(), yesterday = coachWeekAddDays(today, -1)
const trial = { id: 'time-1', result_date: today, distance_meters: 100, stroke: 'freestyle', pool_length: 25, result_time: 6147, kind: 'test', start_type: 'push', exercise: 'full', equipment: [], timing_method: 'hand' }

test('the competition journey is chronological and multi-day dates remain current until they end', () => {
  const planned = [
    { id: 'future', title: 'USM', startDate: '2026-12-02', endDate: '2026-12-03' },
    { id: 'ongoing', title: 'Höstsim', startDate: '2026-11-21', endDate: '2026-11-22' },
    { id: 'past', title: 'Kretssim', startDate: '2026-11-20' },
    { id: 'invalid', title: 'Felaktigt datum', startDate: '2026-11-31' },
  ]
  const journey = flightCompetitionJourney(planned, '2026-11-22')
  assert.deepEqual(journey.map(({ id, status }) => [id, status]), [['past', 'past'], ['ongoing', 'current'], ['future', 'upcoming']])
  assert.deepEqual(journey.map(event => event.championship), [false, false, true])
  assert.equal(journey[0].endDate, '2026-11-20')
  assert.equal(planned[0].id, 'future')
})

test('the flight journey distinguishes regional qualifiers from championship finals', () => {
  const rows = [
    ['Höstfinalen', 'Mästerskap'],
    ['USM-region', ''],
    ['USM Region', 'Mästerskap'],
    ['Svenska juniormästerskapen', ''],
    ['Sumsim Riksfinal', ''],
    ['Sundsvalls Swim Games', 'Klubbtävling'],
    ['Sommarsim', ''],
    ['Norrlandsmästerskapen', ''],
  ].map(([title, category], index) => ({ id: String(index + 1), title, category, startDate: '2026-12-02' }))
  assert.deepEqual(flightCompetitionJourney(rows, '2026-11-22').map(event => event.building),
    ['championship', 'regional', 'regional', 'championship', 'championship', 'regional', 'regional', 'norrland'])
  assert.equal(flightCompetitionJourney([{ ...rows[7], flightBuilding: 'regional' }], '2026-11-22')[0].building, 'regional')
})

test('aircraft reflects the form curve and verified heavy training', () => {
  assert.equal(flightAircraft({ value: 45 }), 'passenger')
  assert.equal(flightAircraft({ value: 58, heavy: true }), 'passenger')
  assert.equal(flightAircraft({ value: 46 }), 'sport')
  assert.equal(flightAircraft({ value: 70, limited: true }), 'sport')
  assert.equal(flightAircraft({ value: 70, heavy: true }), 'jet')
  assert.equal(flightAircraft(null), 'sport')
})

const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status })
async function call({ code = 'swimmer', method = 'GET', mode = 'status', profileId, body, query = {} } = {}) {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    status(value) { this.code = value; return this },
    json(value) { this.data = value },
  }
  await handler({
    method, query: { flightRecord: mode, ...(profileId ? { profileId } : {}), ...query }, body,
    headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' },
  }, response)
  return response
}

function dbFixture(t, { state = 'pending', offerId = offer, revoked = false, migrationMissing = false, weightsMigrationMissing = false, revokeWhileLoading = false, failSleep = false, extended = false, taper = false, pb = false, presentation = false, weekType, practiceTimes, tempusHistory } = {}) {
  const profile = { id, active: true, approval_status: 'approved', terms_accepted_at: today, flight_record_offer_id: offerId, flight_record_choice: state, ...(weightsMigrationMissing ? {} : { flight_record_weights: null }) }
  if (extended) profile.flight_record_sleep_goal_minutes = null
  if (taper) Object.assign(profile, { flight_record_taper_weight: 0, flight_record_boost_settings: null })
  if (pb) profile.flight_record_pb_boost_settings = null
  if (presentation) profile.flight_record_presentation = null
  const appSettings = new Map()
  const calls = []
  const measures = [], scores = new Map()
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input), table = url.pathname.split('/').at(-1), query = url.searchParams
    const method = options.method ?? 'GET', body = options.body ? JSON.parse(options.body) : null
    assert.equal(url.hostname, 'flight-fixture.invalid')
    calls.push({ table, method, query, body })
    if (table === 'coach_accounts') return json(revoked ? [] : [{ id: coachId }])
    if (table === 'app_settings') {
      if (method === 'POST') {
        assert.notEqual(body.setting_value, null)
        appSettings.set(body.setting_key, body.setting_value)
        return new Response(null, { status: 204 })
      }
      const keys = (query.get('setting_key') ?? '').slice(4, -1).split(',')
      return json(keys.filter(key => appSettings.has(key)).map(key => ({ setting_key: key, setting_value: appSettings.get(key) })))
    }
    if (table === 'training_groups') return json(query.get('id') === 'eq.junior' && query.get('active') === 'eq.true' ? [{ id: 'junior' }] : [])
    if (table === 'planning_week_types') return json(weekType ? [{ week_type: weekType }] : [])
    if (table === 'profile_sessions') return json([{ profile_id: id }])
    if (table === 'profiles') {
      assert([`eq.${id}`, `in.(${id})`].includes(query.get('id')))
      assert.equal(query.get('active'), 'eq.true')
      assert.equal(query.get('approval_status'), 'eq.approved')
      const scope = query.get('flight_record_offer_id')
      if (migrationMissing && query.get('select') !== '*') return json({ code: '42703' }, 400)
      if (weightsMigrationMissing && query.get('select')?.split(',').includes('flight_record_weights')) return json({ code: 'PGRST204' }, 400)
      if (!extended && query.get('select')?.split(',').includes('flight_record_sleep_goal_minutes')) {
        return json({ code: '42703', message: 'column profiles.flight_record_sleep_goal_minutes does not exist' }, 400)
      }
      if (!taper && query.get('select')?.split(',').includes('flight_record_taper_weight')) {
        return json({ code: '42703', message: 'column profiles.flight_record_taper_weight does not exist' }, 400)
      }
      if (!taper && query.get('select')?.split(',').includes('flight_record_boost_settings')) {
        return json({ code: '42703', message: 'column profiles.flight_record_boost_settings does not exist' }, 400)
      }
      if (!pb && query.get('select')?.split(',').includes('flight_record_pb_boost_settings')) {
        return json({ code: '42703', message: 'column profiles.flight_record_pb_boost_settings does not exist' }, 400)
      }
      if (!presentation && query.get('select')?.split(',').includes('flight_record_presentation')) {
        return json({ code: '42703', message: 'column profiles.flight_record_presentation does not exist' }, 400)
      }
      if (scope === 'is.null' && profile.flight_record_offer_id != null) return json([])
      if (scope === 'not.is.null' && profile.flight_record_offer_id == null) return json([])
      if (scope?.startsWith('eq.') && scope !== `eq.${profile.flight_record_offer_id}`) return json([])
      if (query.get('flight_record_choice') === 'eq.active' && profile.flight_record_choice !== 'active') return json([])
      if (method === 'PATCH') Object.assign(profile, body)
      return json([{ ...profile }])
    }
    if (['training_swim_times', 'competition_results', 'audit_logs', 'profile_daily_sleep'].includes(table) && method === 'GET') {
      assert.equal(query.get('profile_id'), `eq.${id}`)
    }
    if (table === 'training_swim_times') {
      if (revokeWhileLoading) { profile.flight_record_choice = 'pending'; profile.flight_record_offer_id = null }
      assert(!query.get('select').split(',').includes('note'))
      return json(practiceTimes ?? [{ ...trial, note: 'PRIVATE NOTE' }, { ...trial, id: 'time-2', result_date: yesterday, result_time: 6235 }])
    }
    if (table === 'audit_logs') {
      return method === 'POST' ? new Response(null, { status: 204 }) : json([{ role: 'coach', details: { timeId: 'time-1', coachAccountId: coachId } }])
    }
    if (table === 'flight_record_metrics') {
      assert.equal(extended, true)
      if (method === 'GET') {
        assert.equal(query.get('profile_id'), `eq.${id}`)
        return json(measures)
      }
      assert.equal(body.profile_id, id)
      const measure = { id: customId, ...body }
      measures.push(measure)
      return json([measure])
    }
    if (table === 'flight_record_scores') {
      assert.equal(extended, true)
      if (method === 'GET') {
        assert.equal(query.get('profile_id'), `eq.${id}`)
        return json([...scores.values()])
      }
      if (method === 'DELETE') {
        assert.equal(query.get('profile_id'), `eq.${id}`)
        const measureId = query.get('metric_id').slice(3), date = query.get('activity_date').slice(3)
        scores.delete(`${measureId}:${date}`)
        return new Response(null, { status: 204 })
      }
      assert.equal(body.profile_id, id)
      assert.equal(query.get('on_conflict'), 'profile_id,metric_id,activity_date')
      if (!measures.some(measure => measure.id === body.metric_id)) return json({ code: '23503' }, 409)
      scores.set(`${body.metric_id}:${body.activity_date}`, body)
      return json([body])
    }
    if (table === 'competition_results') {
      if (query.get('source') === 'eq.tempus') return json(tempusHistory ?? [{ source: 'tempus', result_date: '2022-06-11', event: '100 m Frisim', pool: '25m', result_time: 6080 }])
      return json([{ id: 'race', result_date: yesterday, event: '100 m Frisim', pool: '50m', result_time: 6201, source: 'tempus' }])
    }
    if (table === 'profile_daily_sleep') return failSleep ? json({}, 503) : json(Array.from({ length: 35 }, (_, offset) => ({
      activity_date: coachWeekAddDays(today, -offset), minutes: 510, quality: 5,
    })))
    if (['personal_training_sessions', 'responses', 'planned_training_sessions', 'session_attendance', 'strength_program_logs', 'program_assignments', 'workout_unlocks', 'dryland_program_logs'].includes(table)) assert.equal(query.get('profile_id'), `eq.${id}`)
    if (table === 'responses') {
      if (taper) return json(Array.from({ length: 146 }, (_, offset) => ({
        activity_date: coachWeekAddDays(today, -offset), day_type: 'after', activity_type: 'swim', session_slot: 'afternoon_swim',
        activity_distance_meters: offset < 22 ? 2400 : 4000, activity_minutes: offset < 22 ? 60 : 100,
        rpe: offset < 22 ? 4 : 6, speed_feeling: 3, body: 3, energy: 3,
      })))
      return json(Array.from({ length: 35 }, (_, offset) => ({
        activity_date: coachWeekAddDays(today, -offset),
        body: offset < 7 ? 4 : 3,
        energy: offset < 7 ? 2 : 3,
      })))
    }
    assert(!['training_diary_reflections', 'coach_taper_goals', 'coach_form_observations', 'profile_daily_illness', 'development_goals'].includes(table), table)
    return json([])
  })
  return { profile, calls, appSettings }
}

test('personal active coaches can configure visibility independently of viewing the form data', async (t) => {
  const db = dbFixture(t, { offerId: null })
  assert.equal((await call({ code: 'shared-coach', profileId: id })).code, 403)
  assert.equal(db.calls.length, 0)
  assert.equal((await call({ code: coach, profileId: id, mode: 'data' })).code, 200)
  const offered = await call({ code: coach, method: 'POST', profileId: id, body: { offered: true } })
  assert.deepEqual(offered.data, { offered: true })
  assert.equal(offered.headers['Cache-Control'], 'no-store')
  assert.notEqual(db.profile.flight_record_offer_id, null)
  assert.equal(db.profile.flight_record_choice, 'pending')
  assert.deepEqual((await call({ code: coach, profileId: id })).data, { offered: true })
})

test('an active offer is required; decline stays reversible, revocation cancels old choices, and writes use the session profile', async (t) => {
  const { profile, calls } = dbFixture(t)
  assert.equal((await call({ profileId: other })).data.offerId, offer)
  assert.equal((await call({ mode: 'chart', profileId: other })).code, 403)
  const choose = (choice, offerId = offer) => call({ method: 'POST', profileId: other, body: { choice, offerId, profileId: other } })
  assert.equal((await choose('later')).data.choice, 'later')
  assert.equal((await call({ mode: 'chart' })).code, 403)
  assert.equal((await choose('active')).data.choice, 'active')
  assert.deepEqual(calls.filter(call => call.method === 'PATCH').at(-1).body, { flight_record_choice: 'active' })
  assert.equal((await call({ mode: 'chart' })).code, 200)
  assert.equal((await choose('later')).data.choice, 'later')
  assert.equal((await call({ mode: 'chart' })).code, 403)
  assert.equal((await choose('active')).data.choice, 'active')
  const coachSelect = (offered) => call({ code: coach, method: 'POST', profileId: id, body: { offered } })
  await coachSelect(true)
  assert.equal(profile.flight_record_choice, 'active')
  await coachSelect(false)
  assert.equal(profile.flight_record_choice, 'pending')
  assert.equal((await call({ mode: 'chart' })).code, 403)
  await coachSelect(true)
  assert.notEqual(profile.flight_record_offer_id, offer)
  assert.equal((await choose('active')).code, 409)
  assert.equal((await choose('active', profile.flight_record_offer_id)).data.choice, 'active')
})

test('the coach gets date-bounded measurements and comparisons without private content', async (t) => {
  const { calls } = dbFixture(t, { state: 'active', failSleep: true })
  const result = await call({ mode: 'data', code: coach, profileId: id })
  assert.equal(result.code, 200)
  assert.equal(result.data.days.length, 90)
  assert.equal(result.data.contextDays.length, 34)
  assert.equal(result.data.days.at(-1).date, today)
  assert(result.data.days.every(day => day.sleepMinutes === null))
  assert.match(result.data.warnings.join(' '), /Sömnkollen/)
  assert.equal(result.data.series.length, 2)
  assert.equal(result.data.series[0].points.at(-1).source, 'Registrerat av tränare')
  assert.equal(flightTimeComparison(result.data.series[0].points, today), 88)
  assert.doesNotMatch(JSON.stringify(result.data), /PRIVATE NOTE|coachAccountId|flight_record_offer_id/)
  assert(calls.every(call => call.method === 'GET'))
})

test('only a personal coach can save weights for an approved profile, even with visibility off', async (t) => {
  const { profile, calls } = dbFixture(t, { offerId: null })
  const weights = changeFlightWeight(defaultFlightWeights, 'passRating', 20)
  const save = (overrides = {}) => call({ method: 'POST', mode: 'weights', code: coach, profileId: id, body: { profileId: other, weights }, ...overrides })
  assert.equal((await save({ code: 'swimmer' })).code, 403)
  assert.equal((await save({ code: 'shared-coach' })).code, 403)
  assert.equal((await save({ profileId: 'invalid' })).code, 400)
  assert.equal((await save({ body: { weights: { ...weights, energy: -1 } } })).code, 400)
  assert.equal(calls.filter(row => row.method === 'PATCH').length, 0)
  assert.deepEqual((await save()).data, { weights })
  const patch = calls.find(row => row.method === 'PATCH')
  assert.equal(patch.query.get('id'), `eq.${id}`)
  assert.equal(patch.query.get('terms_accepted_at'), 'not.is.null')
  assert.equal(profile.flight_record_offer_id, null)
  assert.deepEqual((await call({ code: coach, mode: 'data', profileId: id })).data.weights, weights)
  assert.equal(calls.find(row => row.method === 'POST' && row.table === 'audit_logs').body.details.coachAccountId, coachId)
})

test('the opted-in swimmer receives only 28 chart points with the coach’s weighting', async (t) => {
  const { calls } = dbFixture(t, { state: 'active', failSleep: true })
  const weights = { ...defaultFlightWeights, speedFeeling: 0, body: 83, energy: 17, sleepQuality: 0 }
  assert.equal((await call({ code: coach, mode: 'weights', method: 'POST', profileId: id, body: { weights } })).code, 200)
  const offset = calls.length
  const result = await call({ mode: 'chart', profileId: other })
  assert.equal(result.code, 200)
  assert.deepEqual(Object.keys(result.data).sort(), ['asOf', 'partial', 'points'])
  assert.equal(result.data.partial, true)
  assert.equal(result.data.points.length, 28)
  assert.deepEqual(result.data.points.at(-1), { date: today, value: 58.3, newTimeLift: false })
  assert(!calls.slice(offset).some(row => row.table === 'audit_logs'))
  assert.equal((await call({ mode: 'data' })).code, 403)
  assert.equal((await call({ code: coach, mode: 'chart', profileId: id })).code, 403)
  const details = (await call({ code: coach, mode: 'data', profileId: id })).data
  const coachLine = flightLine(details.days, details.contextDays, details.timeLifts, details.weights)
  assert.deepEqual(result.data.points.map(point => point.value), coachLine.slice(-28).map(point => point.value))
  const sparseWeights = { ...weights, body: 25, energy: 18, sleepQuality: 57 }
  assert.equal((await call({ code: coach, mode: 'weights', method: 'POST', profileId: id, body: { weights: sparseWeights } })).code, 200)
  const sparse = (await call({ mode: 'chart' })).data.points.at(-1)
  assert.equal(sparse.limited, true)
  assert(Number.isFinite(sparse.value))
  assert.deepEqual(Object.keys(sparse).sort(), ['date', 'limited', 'newTimeLift', 'value'])
})

test('the swimmer chart can use defaults until SQL 135 is run', async (t) => {
  dbFixture(t, { state: 'active', weightsMigrationMissing: true })
  const result = await call({ mode: 'chart' })
  assert.equal(result.code, 200)
  assert.equal(result.data.points.at(-1).value, 51.8)
  const save = await call({ mode: 'weights', method: 'POST', code: coach, profileId: id, body: { weights: defaultFlightWeights } })
  assert.equal(save.code, 503)
  assert.match(save.data.error, /135/)
})

test('the personal coach saves the swimmer presentation and previews the same chart payload', async (t) => {
  const { profile, calls } = dbFixture(t, { state: 'active', presentation: true, weekType: 'taper' })
  profile.training_group = 'Ungdom Svart'
  const configuration = { sky: true, angle: -14, forwardDays: 3 }
  const save = (code, presentation = configuration) => call({ code, mode: 'presentation', method: 'POST', profileId: id, body: { presentation } })
  assert.equal((await save('swimmer')).code, 403)
  assert.equal((await save('shared-coach')).code, 403)
  assert.equal((await save(coach, { ...configuration, forwardDays: 4 })).code, 400)
  assert.equal(calls.filter(row => row.method === 'PATCH').length, 0)
  assert.deepEqual((await save(coach)).data, { presentation: configuration })
  assert.equal(profile.flight_record_choice, 'active')
  assert.equal(profile.flight_record_weights, null)
  const preview = await call({ code: coach, mode: 'preview', profileId: id })
  const swimmer = await call({ mode: 'chart' })
  assert.equal(preview.code, 200)
  assert.deepEqual(preview.data, swimmer.data)
  assert.deepEqual(swimmer.data.presentation, configuration)
  assert.equal(swimmer.data.weekType, 'taper')
  const weekReads = calls.filter(row => row.table === 'planning_week_types')
  assert.equal(weekReads.length, 2)
  assert(weekReads.every(row => row.query.get('group_id') === 'eq.ungdom_svart'
    && row.query.get('week_start') === `eq.${coachWeekMonday(today)}`))
  assert.equal((await call({ mode: 'preview', profileId: id })).code, 403)
  profile.flight_record_choice = 'later'
  assert.equal((await call({ mode: 'chart' })).code, 403)
})

test('flight direction respects recent support and manual settings; plane size sends only a display flag', () => {
  const dates = [coachWeekAddDays(today, -4), yesterday, today]
  const line = dates.map((date, index) => ({ date, value: 40 + index * 4, timeLift: 0 }))
  const days = dates.map((date, index) => ({ date, rpe: index === 1 ? 8 : 4, reportedMeters: 2400, estimatedMeters: index === 2 ? 2600 : 1000 }))
  const points = flightChartPoints(line, days, true)
  assert.deepEqual(points.map(point => point.heavy ?? false), [false, true, true])
  assert(!flightChartPoints(line, days, false).some(point => Object.hasOwn(point, 'heavy')))
  assert.deepEqual(flightDirection(points, today, defaultFlightPresentation), { angle: 18, days: 2 })
  assert.deepEqual(flightDirection(points.slice(0, -1), today, defaultFlightPresentation), { angle: 0, days: 0 })
  assert.deepEqual(flightDirection(points.slice(-1), today, { angle: -30, forwardDays: 1 }), { angle: -30, days: 1 })
  assert.deepEqual(flightDirection(points, today, { angle: null, forwardDays: 0 }), { angle: 18, days: 0 })
})

test('automatic pitch follows the planned week before the recent trend', () => {
  const points = [64, 59, 55].map((value, index) => ({ date: coachWeekAddDays(today, index - 2), value }))
  for (const [type, angle] of Object.entries({ regular: 0, high_load: -10, pre_taper: 10, taper: 15, recovery: 12 })) {
    assert.deepEqual(flightDirection(points, today, defaultFlightPresentation, type), { angle, days: 2 })
  }
  assert.equal(flightDirection(points, today, defaultFlightPresentation).angle, -30)
  assert.equal(flightDirection(points, today, { ...defaultFlightPresentation, angle: -4 }, 'taper').angle, -4)
})

test('Flight Record supports club defaults and separate group overrides without replacing personal settings', async t => {
  const { profile, appSettings } = dbFixture(t, { state: 'active', presentation: true, extended: true, taper: true, pb: true })
  profile.training_group = 'junior'
  const headCoach = createCoachToken({ id: coachId, role: 'head_coach' })
  const save = (code, settings, group) => call({ code, mode: 'defaults', method: 'POST', body: { settings },
    query: group === undefined ? {} : { group } })
  const club = { ...builtInFlightDefaults, minSwimmers: 4, presentation: { sky: true, angle: null, forwardDays: 2 } }
  assert.equal((await save('swimmer', club, 'junior')).code, 403)
  assert.equal((await save(coach, club)).code, 403)
  assert.equal((await save(headCoach, club, 'unknown')).code, 404)
  assert.equal((await save(headCoach, { ...club, minSwimmers: 1 })).code, 400)
  assert.equal((await save(headCoach, club)).code, 200)
  const group = { ...club, minSwimmers: 2, presentation: { sky: true, angle: 12, forwardDays: 3 } }
  assert.equal((await save(coach, group, 'junior')).code, 200)
  assert.equal(appSettings.size, 2)
  assert.deepEqual((await call({ mode: 'chart' })).data.presentation, group.presentation)
  profile.flight_record_presentation = { sky: false, angle: 0, forwardDays: 0 }
  assert.deepEqual((await call({ mode: 'chart' })).data.presentation, profile.flight_record_presentation)
  assert.equal((await call({ code: coach, mode: 'inherit', profileId: id, method: 'POST' })).code, 200)
  assert.equal(profile.flight_record_choice, 'active')
  assert.deepEqual((await call({ mode: 'chart' })).data.presentation, group.presentation)
  assert.equal((await save(coach, null, 'junior')).data.inherited, true)
  assert.deepEqual((await call({ mode: 'chart' })).data.presentation, club.presentation)
})

test('the coach roster returns only date-limited chart values for approved profiles', async t => {
  const { calls } = dbFixture(t, { state: 'later', extended: true, taper: true, pb: true, presentation: true })
  const query = { ids: id, end: yesterday }
  assert.equal((await call({ mode: 'overview', query })).code, 403)
  assert.equal((await call({ code: coach, mode: 'overview', query: { ...query, ids: 'invalid' } })).code, 400)
  assert.equal((await call({ code: coach, mode: 'defaults', method: 'POST', body: { action: 'logout', settings: builtInFlightDefaults } })).code, 400)
  const result = await call({ code: coach, mode: 'overview', query })
  assert.equal(result.code, 200)
  assert.equal(calls.find(row => row.table === 'profiles').query.get('is_test_profile'), 'eq.false')
  assert.equal(result.data.clubMinSwimmers, 3)
  assert.deepEqual(Object.keys(result.data.profiles[0]).sort(), ['group', 'id', 'minSwimmers', 'partial', 'points'])
  assert.equal(result.data.profiles[0].points.length, 28)
  assert.equal(result.data.profiles[0].points.at(-1).date, yesterday)
  assert.doesNotMatch(JSON.stringify(result.data), /PRIVATE NOTE|coachAccountId|flight_record_choice/)

  const longerQuery = { ...query, days: '90' }
  const longer = await call({ code: coach, mode: 'overview', query: longerQuery })
  assert.equal(longer.code, 200)
  const longerPoints = longer.data.profiles[0].points
  assert.equal(longerPoints.length, 90)
  assert.equal(longerPoints[0].date, coachWeekAddDays(yesterday, -89))
  assert(longerPoints.slice(0, -28).some(point => Number.isFinite(point.value)))
  assert.deepEqual(longerPoints.slice(-28), result.data.profiles[0].points)
  assert.equal((await call({ mode: 'overview', query: longerQuery })).code, 403)
  for (const days of ['0', '91', '90.0', ['28', '90']]) {
    assert.equal((await call({ code: coach, mode: 'overview', query: { ...query, days } })).code, 400)
  }
})

test('group curve respects coverage thresholds and never treats missing values as zero', () => {
  const members = [{ points: [{ date: yesterday, value: 44, limited: true }, { date: today, value: 0 }] },
    { points: [{ date: yesterday, value: 51 }, { date: today, value: null }] }, { points: [] }]
  assert.deepEqual(flightGroupCurve([yesterday, today], members, 2), [
    { date: yesterday, count: 2, value: 47.5, limited: true },
    { date: today, count: 1, value: null, limited: false },
  ])
  assert.deepEqual(flightGroupCurve([yesterday], [...members, { points: [{ date: yesterday, value: 55 }] }], 2),
    [{ date: yesterday, count: 3, value: 50, limited: false }])
})

test('SQL 142 validates exactly the presentation fields and accepts the automatic angle', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create table profiles(id integer primary key); insert into profiles values (1);')
    const migration = await readFile(new URL('../supabase/migrations/142_flight_record_presentation.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const save = value => db.query('update profiles set flight_record_presentation=$1::jsonb', [JSON.stringify(value)])
    await save(defaultFlightPresentation)
    await save({ sky: true, angle: 30, forwardDays: 0 })
    for (const config of [
      { ...defaultFlightPresentation, sky: 'true' },
      { ...defaultFlightPresentation, angle: -31 },
      { ...defaultFlightPresentation, angle: 1.5 },
      { ...defaultFlightPresentation, forwardDays: 3.5 },
      { ...defaultFlightPresentation, extra: 1 },
    ]) {
      assert.throws(() => validateFlightPresentation(config))
      await assert.rejects(save(config), /check constraint/)
    }
  } finally { await db.close() }
})

test('the trainer can add and correct measures and both views use the saved settings', async (t) => {
  const { calls } = dbFixture(t, { extended: true, state: 'active' })
  const modify = (body, code = coach) => call({ code, profileId: id, mode: 'measures', method: 'POST', body })
  assert.equal((await modify({ action: 'sleep-goal', minutes: 480 }, 'swimmer')).code, 403)
  assert.equal((await modify({ action: 'sleep-goal', minutes: 841 })).code, 400)
  assert.equal((await modify({ action: 'sleep-goal', minutes: 480 })).code, 200)
  const create = await modify({ action: 'create-measure', name: '  Teknikkänsla ', category: 'Teknik', profileId: other })
  assert.deepEqual(create.data, { action: 'create-measure', measureId: customId })
  const score = (offset, value, measureId = customId) => modify({
    action: 'save-score', measureId, date: coachWeekAddDays(today, offset), value,
  })
  assert.equal((await score(1, 3)).code, 400)
  assert.equal((await score(0, 6)).code, 400)
  assert.equal((await score(0, 4, other)).code, 404)
  for (const [offset, value] of [[-12, 2], [-11, 2], [-10, 2], [-1, 4], [0, 3], [0, 5]]) {
    assert.equal((await score(offset, value)).code, 200)
  }
  const weights = Object.fromEntries(Object.keys(defaultFlightWeights).map(key => [key, 0]))
  Object.assign(weights, { sleepGoal: 30, [customId]: 70 })
  const save = weights => call({ code: coach, profileId: id, mode: 'weights', method: 'POST', body: { weights } })
  assert.equal((await save({ ...weights, [customId]: 0, [other]: 70 })).code, 400)
  assert.equal((await save(weights)).code, 200)
  const coachView = (await call({ code: coach, mode: 'data', profileId: id })).data
  assert.deepEqual(coachView.customMeasures, [{ key: customId, label: 'Teknikkänsla', category: 'Teknik' }])
  assert.equal(coachView.sleepGoalMinutes, 480)
  assert.equal(coachView.days.at(-1).sleepGoal, 5)
  assert.equal(coachView.days.at(-1)[customId], 5)
  const swimmerChart = await call({ mode: 'chart' })
  assert.equal(swimmerChart.code, 200)
  assert.equal(swimmerChart.data.points.at(-1).value, 71.9)
  assert.doesNotMatch(JSON.stringify(swimmerChart.data), /Teknikkänsla|sleepGoal|customMeasures/)
  const deletion = { action: 'delete-score', measureId: customId, date: today, profileId: other }
  assert.equal((await modify(deletion, 'swimmer')).code, 403)
  assert.equal((await modify({ ...deletion, date: coachWeekAddDays(today, 1) })).code, 400)
  assert.equal((await modify({ ...deletion, measureId: 'invalid' })).code, 400)
  assert.equal(calls.filter(row => row.table === 'flight_record_scores' && row.method === 'DELETE').length, 0)
  assert.equal((await modify(deletion)).code, 200)
  assert.equal((await modify(deletion)).code, 200)
  const refreshed = (await call({ code: coach, mode: 'data', profileId: id })).data
  assert.deepEqual(refreshed.customMeasures, coachView.customMeasures)
  assert.equal(refreshed.days.at(-1)[customId], undefined)
  assert.equal(refreshed.days.at(-2)[customId], 4)
  assert.notEqual((await call({ mode: 'chart' })).data.points.at(-1).value, 71.9)
  assert(calls.some(row => row.table === 'audit_logs' && row.body?.details?.action === 'delete-score'))
  assert(calls.some(row => row.table === 'audit_logs' && row.body?.event_type === 'flight_record_measure_change'))
})

test('taper preview and the opted-in swimmer graph use the same training history and saved strength', async (t) => {
  const { profile } = dbFixture(t, { taper: true, extended: true, state: 'active' })
  const details = () => call({ code: coach, mode: 'data', profileId: id })
  const settings = (weights, code = coach, boostSettings) => call({
    code, mode: 'weights', method: 'POST', profileId: id, body: { weights, ...(boostSettings ? { boostSettings } : {}) },
  })
  const preview = (await details()).data
  assert.equal(preview.taperAvailable, true)
  assert(preview.taperAdjustments.at(-1).duration >= 21)
  assert.equal(preview.weights.taper, 0)
  const weights = { ...preview.weights, taper: 80 }
  assert.equal((await settings(weights, 'swimmer')).code, 403)
  assert.equal((await settings({ ...weights, taper: 101 })).code, 400)
  assert.deepEqual((await settings(weights)).data.weights, weights)
  assert.equal(profile.flight_record_taper_weight, 80)
  assert(!Object.hasOwn(profile.flight_record_weights, 'taper'))
  const boostSettings = { ...defaultFlightBoostSettings, taper: { maxSteps: 7, minusSteps: 8, fullDays: 17, fadeDays: 3 } }
  assert.deepEqual((await settings(weights, coach, boostSettings)).data.boostSettings, boostSettings)
  assert.deepEqual((await details()).data.boostSettings, boostSettings)
  const swimmer = await call({ mode: 'chart' })
  assert.equal(swimmer.code, 200)
  const line = flightLine(preview.days, preview.contextDays, preview.timeLifts, weights, preview.customMeasures, preview.taperAdjustments, boostSettings)
  assert.deepEqual(swimmer.data.points.map(point => point.value), line.slice(-28).map(point => point.value))
  assert(line.at(-1).value < line.at(-1).base)
  assert.doesNotMatch(JSON.stringify(swimmer.data), /taper|load|rpe/)
})

test('PB boosts use complete Tempus history, persist settings and stay private in the swimmer projection', async (t) => {
  const { profile, calls } = dbFixture(t, { state: 'active', pb: true })
  const result = await call({ code: coach, mode: 'data', profileId: id })
  assert.equal(result.code, 200)
  assert.equal(result.data.pbBoostSettingsAvailable, true)
  assert.equal(result.data.timeLifts.find(point => point.date === today).referenceDate, '2022-06-11')
  assert.equal(result.data.practiceTimesAvailable, true)
  assert.equal(result.data.tempusHistoryAvailable, true)
  assert.equal(result.data.practiceChecks.find(point => point.date === yesterday).reference, 6080)
  const history = calls.find(row => row.table === 'competition_results' && row.query.get('source') === 'eq.tempus')
  assert.deepEqual(history.query.getAll('result_date'), [`lte.${today}`])
  const boosted = await call({ mode: 'chart' })
  assert.equal(boosted.code, 200)
  assert.equal(boosted.data.points.at(-1).newTimeLift, true)
  const pbBoostSettings = defaultFlightPbSettings()
  pbBoostSettings.margins[100] = 50
  const saved = await call({ code: coach, mode: 'weights', method: 'POST', profileId: id, body: { weights: defaultFlightWeights, pbBoostSettings } })
  assert.deepEqual(saved.data.pbBoostSettings, pbBoostSettings)
  assert.deepEqual(profile.flight_record_pb_boost_settings, pbBoostSettings)
  const reduced = await call({ mode: 'chart' })
  assert.equal(reduced.data.points.at(-1).newTimeLift, false)
  assert(reduced.data.points.at(-1).value < boosted.data.points.at(-1).value)
  assert.doesNotMatch(JSON.stringify(boosted.data), /practiceChecks|referenceDate|Tempus|Frisim/)
})

test('the selected time can be explained in the coach view even without three earlier days', async (t) => {
  dbFixture(t)
  const { data } = await call({ code: coach, mode: 'data', profileId: id })
  const time = data.practiceChecks.find(point => point.date === today)
  assert.equal(time.centis, trial.result_time)
  assert.equal(time.reference, null)
  assert.equal(time.priorDays, 1)
  assert.equal(data.timeLifts.some(point => point.date === today), false)
})

test('a practice PB in a competition suit against a Tempus Freestyle result still lifts the line two days later', async (t) => {
  const practiceDate = coachWeekAddDays(today, -2)
  dbFixture(t, {
    state: 'active', pb: true,
    practiceTimes: [{ ...trial, kind: 'training', start_type: 'dive', result_date: practiceDate, result_time: 6003, conditions: 'Tävlingsdräkt' }],
    tempusHistory: [
      { source: 'tempus', result_date: '2025-10-12', event: '100m Freestyle', pool: '25 M', swim_time: '01:00.04' },
      { source: 'tempus', result_date: '2026-07-16', event: '100m Freestyle', pool: '50 M', swim_time: '01:03.37' },
    ],
  })
  const { data } = await call({ code: coach, mode: 'data', profileId: id })
  const [lift] = data.timeLifts
  assert.equal(lift.pbKind, 'faster')
  assert.equal(lift.reference - lift.centis, 1)
  assert.match(lift.label, /Tävlingsdräkt/)
  const line = flightLine(data.days, data.contextDays, data.timeLifts, data.weights)
  const latest = line.at(-1)
  assert.equal(latest.timeLift, 3.4)
  assert.equal(latest.events[0].date, practiceDate)
  const swimmer = await call({ mode: 'chart' })
  assert.equal(swimmer.data.points.at(-1).value, latest.value)
  assert.equal(swimmer.data.points.find(point => point.date === practiceDate).newTimeLift, true)
})

test('revoked coaches, missing migration and revocation during a history read fail safely', async (t) => {
  await t.test('revoked coach', async (t) => {
    const { calls } = dbFixture(t, { revoked: true })
    assert.equal((await call({ code: coach, profileId: id })).code, 401)
    assert.equal((await call({ code: coach, profileId: id, mode: 'data' })).code, 401)
    assert.equal((await call({ code: coach, profileId: id, mode: 'weights', method: 'POST', body: { weights: defaultFlightWeights } })).code, 401)
    assert(calls.every(call => call.table === 'coach_accounts'))
  })
  await t.test('SQL missing', async (t) => {
    dbFixture(t, { migrationMissing: true })
    const result = await call({ code: coach, profileId: id })
    assert.equal(result.code, 503)
    assert.match(result.data.error, /134/)
  })
  await t.test('revoke while reading data', async (t) => {
    dbFixture(t, { state: 'active', revokeWhileLoading: true })
    const result = await call({ mode: 'chart' })
    assert.equal(result.code, 403)
    assert.equal(result.data.points, undefined)
  })
})

test('comparable time series isolate equipment, manual races and unknown pools and compare distinct days', () => {
  const practice = [trial, { ...trial, id: 'x', result_time: 6201 }, { ...trial, id: 'y', result_date: yesterday, result_time: 6300 }, { ...trial, id: 'z', equipment: ['fins'] }]
  const races = [
    { id: '1', event: '100 m frisim', pool: '25m', result_time: 6000, result_date: today, source: 'tempus' },
    { id: '2', event: '100 m frisim', pool: '25m', result_time: 5900, result_date: yesterday, source: 'manual' },
    { id: '3', event: '100 m frisim', pool: null, result_time: 6012, result_date: today, source: 'tempus' },
    { id: '4', event: '100 m frisim', pool: null, result_time: 6042, result_date: yesterday, source: 'tempus' },
  ]
  const series = flightTimeSeries(practice, races)
  assert.equal(series.length, 6)
  assert.equal(series[0].points.length, 2)
  assert.equal(series[0].points.at(-1).centis, 6147)
  assert.equal(series[0].points.at(-1).count, 2)
  assert.equal(flightTimeComparison(series[0].points, today), 153)
  assert(series.slice(1).every(group => group.points.length === 1))
})

test('daily metrics leave gaps and label load from estimated time', () => {
  const entries = [
    { date: today, type: 'swim', state: 'completed', rpe: 7, reportedMinutes: 50, speedFeeling: 4 },
    { date: today, type: 'swim', state: 'completed', rpe: 5, estimatedMinutes: 40, linked: true, speedFeeling: 3 },
    { date: today, type: 'swim', state: 'planned', rpe: 9, reportedMinutes: 50, speedFeeling: 1 },
    { date: today, type: 'competition', state: 'completed', rpe: 10, reportedMinutes: 10, speedFeeling: 5 },
  ]
  const days = flightRecordDays(yesterday, today, {
    entries, current: { days: [{ date: today, swimMeters: 3300, minutes: 50, estimatedSwimMeters: 2100 }] },
  }, [{ activity_date: yesterday, minutes: 480, quality: 3, skipped: true }])
  assert.equal(days[0].load, null)
  assert.equal(days[0].sleepMinutes, null)
  assert.equal(days[1].load, 550)
  assert.equal(days[1].loadCount, 2)
  assert.equal(days[1].loadEstimatedCount, 1)
  assert.equal(days[1].speedFeeling, 3.5)
  assert.equal(days[1].reportedMeters, 3300)
  assert.equal(days[1].estimatedMeters, 2100)
})

test('SQL 134 is idempotent and enforces a valid choice under an existing offer', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec('create table profiles(id uuid primary key); alter table profiles enable row level security;')
    await db.query('insert into profiles values ($1)', [id])
    const sql = await readFile(new URL('../supabase/migrations/134_flight_record.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    assert.equal((await db.query('select flight_record_choice from profiles')).rows[0].flight_record_choice, 'pending')
    await assert.rejects(db.exec("update profiles set flight_record_choice='active'"), /profiles_flight_record_choice_check/)
    await db.query("update profiles set flight_record_offer_id=$1, flight_record_choice='active'", [offer])
    await assert.rejects(db.exec("update profiles set flight_record_choice='unrecognised'"), /profiles_flight_record_choice_check/)
    await db.exec("update profiles set flight_record_offer_id=null, flight_record_choice='pending'")
    const { rows } = await db.query("select relrowsecurity from pg_class where oid='profiles'::regclass")
    assert.equal(rows[0].relrowsecurity, true)
  } finally { await db.close() }
})
