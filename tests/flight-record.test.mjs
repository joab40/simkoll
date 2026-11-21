import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { flightRecordDays, flightTimeComparison, flightTimeSeries } from '../shared/flight-record.js'
import { defaultFlightWeights, flightLine } from '../shared/flight-line.js'

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
const coach = createCoachToken({ id: coachId, role: 'coach' })
const today = stockholmDate(), yesterday = coachWeekAddDays(today, -1)
const trial = { id: 'time-1', result_date: today, distance_meters: 100, stroke: 'freestyle', pool_length: 25, result_time: 6147, kind: 'test', start_type: 'push', exercise: 'full', equipment: [], timing_method: 'hand' }

const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status })
async function call({ code = 'swimmer', method = 'GET', mode = 'status', profileId, body } = {}) {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    status(value) { this.code = value; return this },
    json(value) { this.data = value },
  }
  await handler({
    method, query: { flightRecord: mode, ...(profileId ? { profileId } : {}) }, body,
    headers: { 'x-simkoll-code': code, cookie: 'simkoll_session=fixture' },
  }, response)
  return response
}

function dbFixture(t, { state = 'pending', offerId = offer, revoked = false, migrationMissing = false, weightsMigrationMissing = false, revokeWhileLoading = false, failSleep = false } = {}) {
  const profile = { id, active: true, approval_status: 'approved', terms_accepted_at: today, flight_record_offer_id: offerId, flight_record_choice: state, ...(weightsMigrationMissing ? {} : { flight_record_weights: null }) }
  const calls = []
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input), table = url.pathname.split('/').at(-1), query = url.searchParams
    const method = options.method ?? 'GET', body = options.body ? JSON.parse(options.body) : null
    assert.equal(url.hostname, 'flight-fixture.invalid')
    calls.push({ table, method, query, body })
    if (table === 'coach_accounts') return json(revoked ? [] : [{ id: coachId }])
    if (table === 'profile_sessions') return json([{ profile_id: id }])
    if (table === 'profiles') {
      assert.equal(query.get('id'), `eq.${id}`)
      assert.equal(query.get('active'), 'eq.true')
      assert.equal(query.get('approval_status'), 'eq.approved')
      const scope = query.get('flight_record_offer_id')
      if (migrationMissing && query.get('select') !== '*') return json({ code: '42703' }, 400)
      if (weightsMigrationMissing && query.get('select')?.split(',').includes('flight_record_weights')) return json({ code: 'PGRST204' }, 400)
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
      return json([{ ...trial, note: 'PRIVATE NOTE' }, { ...trial, id: 'time-2', result_date: yesterday, result_time: 6235 }])
    }
    if (table === 'audit_logs') {
      return method === 'POST' ? new Response(null, { status: 204 }) : json([{ role: 'coach', details: { timeId: 'time-1', coachAccountId: coachId } }])
    }
    if (table === 'competition_results') return json([{ id: 'race', result_date: yesterday, event: '100 m Frisim', pool: '50m', result_time: 6201, source: 'tempus' }])
    if (table === 'profile_daily_sleep') return failSleep ? json({}, 503) : json(Array.from({ length: 35 }, (_, offset) => ({
      activity_date: coachWeekAddDays(today, -offset), minutes: 510, quality: 5,
    })))
    if (['personal_training_sessions', 'responses', 'planned_training_sessions', 'session_attendance', 'strength_program_logs', 'program_assignments', 'workout_unlocks', 'dryland_program_logs'].includes(table)) assert.equal(query.get('profile_id'), `eq.${id}`)
    if (table === 'responses') {
      return json(Array.from({ length: 35 }, (_, offset) => ({
        activity_date: coachWeekAddDays(today, -offset),
        body: offset < 7 ? 4 : 3,
        energy: offset < 7 ? 2 : 3,
      })))
    }
    assert(!['training_diary_reflections', 'coach_taper_goals', 'coach_form_observations', 'profile_daily_illness', 'development_goals'].includes(table), table)
    return json([])
  })
  return { profile, calls }
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
  const weights = { ...defaultFlightWeights, speedFeeling: 5, energy: 0 }
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
  const weights = { ...defaultFlightWeights, speedFeeling: 0, body: 5, energy: 1, sleepQuality: 0 }
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
