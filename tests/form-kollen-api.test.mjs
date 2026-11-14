import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://form-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'test-db-key'
process.env.COACH_SESSION_SECRET = 'form-fixture-secret'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer'
process.env.SIMKOLL_COACH_CODE = 'legacy'
const { default: handler } = await import('../api/training.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const profileId = '11111111-1111-4111-8111-111111111111', coachId = '22222222-2222-4222-8222-222222222222'
const coach = createCoachToken({ id: coachId, role: 'coach' })
async function call(code = coach, id = profileId, method = 'GET', cookie = '') {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(value) { this.code = value; return this }, json(value) { this.data = value } }
  await handler({ method, query: { formKollen: 'true', profileId: id }, headers: { 'x-simkoll-code': code, cookie } }, response)
  return response
}
function fixture({ active = true, found = true, fail = '', illnessMissing = false } = {}) {
  return async (input, options = {}) => {
    const url = new URL(input), table = url.pathname.split('/').at(-1)
    assert.equal(url.hostname, 'form-fixture.invalid')
    assert.equal(options.method || 'GET', 'GET', 'Formkollen is read-only')
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
    if (table === 'coach_accounts') return json(active ? [{ id: coachId }] : [])
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') {
      assert.equal(url.searchParams.get('id'), `eq.${profileId}`)
      assert.equal(url.searchParams.get('active'), 'eq.true')
      return json(found ? [{ id: profileId, training_group: 'junior' }] : [])
    }
    assert.ok(['responses', 'profile_daily_sleep', 'profile_daily_illness'].includes(table), table)
    assert.equal(url.searchParams.get('profile_id'), `eq.${profileId}`)
    assert.doesNotMatch(url.searchParams.get('select'), /comment|reflection|\*/)
    if (fail === table) return json({}, 500)
    if (illnessMissing && table === 'profile_daily_illness') return json({ code: 'PGRST205', message: "Could not find the table 'public.profile_daily_illness' in the schema cache" }, 404)
    return json([])
  }
}
test('requires current personal coach or own swimmer session; prevents other-profile access', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = fixture()
    for (const code of ['invalid', 'legacy', 'swimmer']) assert.equal((await call(code)).code, 403)
    assert.equal((await call(coach, profileId, 'POST')).code, 405)
    assert.equal((await call(coach, 'invalid')).code, 400)
    assert.equal((await call('swimmer', '33333333-3333-4333-8333-333333333333', 'GET', 'simkoll_session=test')).code, 403)
    assert.equal((await call('swimmer', profileId, 'GET', 'simkoll_session=test')).code, 200)
    globalThis.fetch = fixture({ active: false }); assert.equal((await call()).code, 401)
  } finally { globalThis.fetch = original }
})
test('returns only scoped summaries with no-store; missing data is not a fake success or form peak', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = fixture()
    const result = await call()
    assert.equal(result.code, 200); assert.match(result.headers['Cache-Control'], /no-store/)
    assert.equal(result.data.profileId, profileId); assert.equal(result.data.history.length, 28)
    assert.equal(result.data.phase, 'unknown')
    assert.doesNotMatch(JSON.stringify(result.data), /created_at|password|comment|profile_id/)
    globalThis.fetch = fixture({ found: false }); assert.equal((await call()).code, 404)
    for (const fail of ['responses', 'profile_daily_sleep', 'profile_daily_illness']) { globalThis.fetch = fixture({ fail }); assert.equal((await call()).code, 502) }
    globalThis.fetch = fixture({ illnessMissing: true })
    const missing = await call(); assert.equal(missing.code, 200); assert.equal(missing.data.illnessAvailable, false)
  } finally { globalThis.fetch = original }
})
