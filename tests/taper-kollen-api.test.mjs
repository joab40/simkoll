import test from 'node:test'
import assert from 'node:assert/strict'
import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
process.env.SUPABASE_URL = 'https://taper-api.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'legacy'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer'
const { default: handler } = await import('../api/training.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const id = '11111111-1111-4111-8111-111111111111', actorId = '22222222-2222-4222-8222-222222222222', competitionId = '33333333-3333-4333-8333-333333333333'
const code = createCoachToken({ id: actorId, role: 'coach' })
const goal = { competitionId, priority: 'A', targetDate: '2027-01-15', taperStart: '2027-01-02', events: '100 frisim', note: 'PRIVATE NOTE' }
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, json(data) { this.data = data } })
const call = async (overrides = {}) => { const res = response(); await coachSessionFixture(handler)({ method: 'GET', headers: { 'x-simkoll-code': code }, query: { taperKollen: 'true', profileId: id }, ...overrides }, res); return res }
function fixture({ missing = false, failGoals = false, calls = [] } = {}) {
  return async (input, options = {}) => {
    const url = new URL(input), table = url.pathname.split('/').at(-1), payload = options.body && JSON.parse(options.body)
    assert.equal(url.hostname, 'taper-api.invalid'); calls.push({ table, payload, method: options.method || 'GET' })
    const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status })
    if (table === 'profiles') {
      assert.equal(url.searchParams.get('id'), `eq.${id}`); assert.equal(url.searchParams.get('is_test_profile'), 'eq.false')
      return json(missing ? [] : [{ id, training_group: 'junior' }])
    }
    if (table === 'competition_calendar') return json([{ id: competitionId, title: 'Testmål', start_date: '2027-01-15', end_date: '2027-01-17' }])
    if (table === 'coach_taper_goals') {
      if (payload) return json([{ ...payload, id: 'saved-revision' }])
      assert.equal(url.searchParams.get('profile_id'), `eq.${id}`)
      return json([], failGoals ? 404 : 200)
    }
    if (table === 'audit_logs') return new Response(null, { status: 204 })
    assert(['responses', 'profile_daily_sleep', 'profile_daily_illness'].includes(table), table)
    assert.equal(url.searchParams.get('profile_id'), `eq.${id}`)
    return json([])
  }
}
test('coach-only route rejects shared codes, anonymous and swimmer sessions before any target read', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => { throw new Error('No data should be read') }
    for (const token of ['', 'legacy', 'swimmer']) assert.equal((await call({ headers: { 'x-simkoll-code': token } })).code, 403)
    assert.equal((await call({ query: { taperKollen: 'true', profileId: 'invalid' } })).code, 400)
    assert.equal((await call({ method: 'DELETE' })).code, 405)
  } finally { globalThis.fetch = previous }
})
test('read is scoped, no-store and read-only, absent SQL is an error rather than an empty plan', async () => {
  const previous = globalThis.fetch, calls = []
  try {
    globalThis.fetch = fixture({ calls })
    const result = await call()
    assert.equal(result.code, 200); assert.equal(result.data.profileId, id); assert.equal(result.headers['Cache-Control'], 'no-store')
    assert(calls.every(call => call.method === 'GET'))
    globalThis.fetch = fixture({ failGoals: true }); const failed = await call()
    assert.equal(failed.code, 503); assert.match(failed.data.error, /122/)
    globalThis.fetch = fixture({ missing: true }); assert.equal((await call()).code, 404)
  } finally { globalThis.fetch = previous }
})
test('saving appends a coach-owned revision, audits IDs only and never modifies plans or entries', async () => {
  const previous = globalThis.fetch, calls = []
  try {
    globalThis.fetch = fixture({ calls })
    const result = await call({ method: 'POST', body: { action: 'save-taper-goal', goal: { ...goal, profile_id: 'attacker', created_by: 'attacker' } } })
    assert.equal(result.code, 201)
    const save = calls.find(call => call.table === 'coach_taper_goals')
    assert.equal(save.payload.profile_id, id); assert.equal(save.payload.created_by, actorId); assert.equal(save.method, 'POST')
    assert.doesNotMatch(JSON.stringify(calls.find(call => call.table === 'audit_logs')), /PRIVATE NOTE|100 frisim|attacker/)
    assert(!calls.some(call => ['training_plans', 'competition_entries'].includes(call.table)))
    assert.equal((await call({ method: 'POST', body: { action: 'save-taper-goal', goal: { ...goal, targetDate: '2027-02-01' } } })).code, 400)
  } finally { globalThis.fetch = previous }
})
test('revoked coach session is rejected before target reads', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async input => { assert(new URL(input).pathname.endsWith('/coach_accounts')); return new Response('[]') }
    const result = response()
    await handler({ method: 'GET', query: { taperKollen: 'true', profileId: id }, headers: { 'x-simkoll-code': code } }, result)
    assert.equal(result.code, 401)
  } finally { globalThis.fetch = previous }
})
