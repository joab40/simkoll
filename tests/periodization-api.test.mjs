import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://periodization-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'periodization-fixture'
process.env.SIMKOLL_COACH_CODE = 'legacy-coach'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer'
const { default: handler } = await import('../api/training.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const profileId = '11111111-1111-4111-8111-111111111111', coachId = '22222222-2222-4222-8222-222222222222'
const code = createCoachToken({ id: coachId, role: 'coach' })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
async function call({ auth = code, method = 'GET', profile = profileId } = {}) {
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value }, status(value) { this.code = value; return this }, json(value) { this.data = value } }
  await handler({ method, query: { periodization: 'true', profileId: profile }, headers: { 'x-simkoll-code': auth } }, response)
  return response
}
function fixture({ role = 'coach', active = true, found = true, fail = '' } = {}) {
  return async (url, options = {}) => {
    const parsed = new URL(url), table = parsed.pathname.split('/').at(-1)
    assert.equal(parsed.hostname, 'periodization-fixture.invalid')
    assert.equal(options.method || 'GET', 'GET', 'reading cannot change rewards, sessions or historical answers')
    if (table === 'coach_accounts') { assert.equal(parsed.searchParams.get('id'), `eq.${coachId}`); assert.equal(parsed.searchParams.get('status'), 'eq.active'); return json(active ? [{ role }] : []) }
    if (table === 'profiles') { assert.equal(parsed.searchParams.get('id'), `eq.${profileId}`); assert.equal(parsed.searchParams.get('active'), 'eq.true'); assert.equal(parsed.searchParams.get('approval_status'), 'eq.approved'); return json(found ? [{ id: profileId, training_group: 'junior' }] : []) }
    if (!['daily_workouts', 'training_plans'].includes(table)) assert.equal(parsed.searchParams.get('profile_id'), `eq.${profileId}`)
    if (table === fail) return json({}, 500)
    return json([])
  }
}
test('periodization is coach-only, read-only and requires a current personal coach account', async () => {
  globalThis.fetch = () => { throw new Error('must not fetch') }
  for (const auth of ['swimmer', 'invalid', 'legacy-coach']) assert.equal((await call({ auth })).code, 403)
  assert.equal((await call({ method: 'POST' })).code, 405)
  for (const settings of [{ active: false }, { role: 'superadmin' }]) { globalThis.fetch = fixture(settings); assert.equal((await call()).code, 403) }
})
test('scoped aggregate response contains 12 weeks and 28 days with private no-store caching', async () => {
  globalThis.fetch = fixture()
  const result = await call()
  assert.equal(result.code, 200); assert.match(result.headers['Cache-Control'], /no-store/)
  assert.equal(result.data.profileId, profileId); assert.equal(result.data.macro.length, 12); assert.equal(result.data.meso.length, 28)
  assert.ok(!Object.hasOwn(result.data, 'entries'))
  assert.equal((await call({ profile: 'invalid-filter' })).code, 400)
})
test('missing profiles and failed sources produce errors rather than fabricated zero graphs', async () => {
  globalThis.fetch = fixture({ found: false }); assert.equal((await call()).code, 404)
  for (const fail of ['responses', 'session_attendance', 'daily_workouts', 'personal_training_sessions', 'training_plans']) {
    globalThis.fetch = fixture({ fail }); const result = await call(); assert.equal(result.code, 502); assert.ok(!result.data.macro)
  }
})
