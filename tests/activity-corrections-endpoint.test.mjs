import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://activity-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'legacy-coach'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-code'
process.env.COACH_SESSION_SECRET = 'activity-endpoint-secret'
const { default: handler } = await import('../api/profiles.js')
const { default: activity } = await import('../api/activity.js')
const { default: points } = await import('../api/points.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const { shiftActivityDay } = await import('../shared/activity-streak.js')
const id = '11111111-1111-4111-8111-111111111111'
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } })
test('real profiles route denies old/revoked or non-superadmin sessions before reading correction data', async () => {
  for (const role of ['superadmin', 'head_coach', 'coach', 'legacy']) {
    const calls = []
    globalThis.fetch = async url => { calls.push(String(url)); assert(String(url).includes('/coach_accounts?')); return json(role === 'superadmin' ? [] : [{ id }]) }
    const result = response()
    await handler({ method: 'GET', headers: { 'x-simkoll-code': role === 'legacy' ? 'legacy-coach' : createCoachToken({ id, role }) }, query: { activityAdmin: 'true', profileId: id } }, result)
    assert.equal(result.code, role === 'superadmin' ? 401 : 403)
    assert(calls.every(url => url.includes('/coach_accounts?')))
  }
})
test('the signed-in profile is recorded before the streak read, independent of the workouts request', async () => {
  const today = stockholmDate(), calls = [], stored = new Set([shiftActivityDay(today, -1)])
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1); calls.push(table)
    if (table === 'profile_sessions') return json([{ profile_id: id }])
    if (table === 'profiles') return json([{ id }])
    if (table === 'point_events') return json([])
    assert.equal(table, 'profile_daily_activity')
    if (options.method === 'POST') { const row = JSON.parse(options.body); assert.equal(row.profile_id, id); stored.add(row.activity_date); return json([]) }
    if (url.searchParams.get('select') === 'profile_id') return json([{ profile_id: id }])
    assert.equal(url.searchParams.get('profile_id'), `eq.${id}`)
    return json([...stored].map(activity_date => ({ activity_date })))
  }
  const result = response()
  await activity({ method: 'GET', headers: { 'x-simkoll-code': 'swimmer-code', cookie: 'simkoll_session=fixture' }, query: { streak: 'true' } }, result)
  assert.equal(result.code, 200); assert.equal(result.data.today, today)
  assert(result.data.activityDates.includes(today))
  assert(calls.indexOf('profile_daily_activity') < calls.lastIndexOf('profile_daily_activity'))
})
test('milestone rewards ignore a forged client streak and use own stored dates with idempotent keys', async () => {
  const today = stockholmDate(), awarded = []
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1)
    if (table === 'profile_sessions') return json([{ profile_id: id }])
    if (table === 'profiles') return json([{ id }])
    if (table === 'profile_daily_activity') { assert.equal(url.searchParams.get('profile_id'), `eq.${id}`); return json(Array.from({ length: 12 }, (_, index) => ({ activity_date: shiftActivityDay(today, -index) }))) }
    if (table === 'point_events') { assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates'); awarded.push(JSON.parse(options.body)); return json([]) }
    assert.fail(`Unexpected ${table}`)
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = response()
    await points({ method: 'POST', headers: { 'x-simkoll-code': 'swimmer-code', cookie: 'simkoll_session=fixture' }, body: { action: 'sync-stars', stars: {}, streak: 999999 } }, result)
    assert.equal(result.code, 200)
  }
  assert.deepEqual(awarded.map(row => row.source_key), ['streak:10', 'streak:10'])
  assert(awarded.every(row => row.profile_id === id && row.event_type === 'streak_milestone'))
})
