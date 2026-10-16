import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://goal-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'fixture-swimmer'
process.env.COACH_SESSION_SECRET = 'fixture-only'
const { default: handler } = await import('../api/goals.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const coach = createCoachToken({ id: '22222222-2222-4222-8222-222222222222', email: 'fixture@example.invalid', role: 'coach' })
const profileId = '11111111-1111-4111-8111-111111111111'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGasAAAAASUVORK5CYII='
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
async function call(body, code = coach, options = {}) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(value) { this.data = value; return this } }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': code, ...options.headers }, body, ...options }, response)
  return response
}
const goal = { action: 'create', profileId, title: 'Vändning', description: 'Arbeta med vändningen.', nextStep: '', startDate: '2026-10-15' }

test('swimmers cannot create goals or start goal AI, even with a supplied profile', async () => {
  globalThis.fetch = async () => { throw new Error('No external calls allowed') }
  for (const action of ['create', 'polish-goal']) assert.equal((await call({ ...goal, action }, 'fixture-swimmer')).code, 403)
})
test('ordinary signed-in coaches retain creation rights and text-only goals need no storage migration', async () => {
  globalThis.fetch = async (url, options) => {
    assert(String(url).endsWith('/development_goals'))
    const payload = JSON.parse(options.body)
    assert.equal(payload.profile_id, profileId)
    assert.equal(payload.image_path, undefined)
    return json([{ id: 'goal-one', ...payload }])
  }
  const result = await call({ ...goal, image_path: 'untrusted/client/path' })
  assert.equal(result.code, 201)
  assert.equal(result.data.goal.hasImage, false)
})
test('coach can correct goal text without replacing status, owner, image or history', async () => {
  let update
  globalThis.fetch = async (url, options) => {
    const path = String(url)
    assert(path.includes('/development_goals?id=eq.goal-one'))
    assert.equal(options.method, 'PATCH')
    update = JSON.parse(options.body)
    assert.deepEqual(Object.keys(update).sort(), ['description', 'next_step', 'title', 'updated_at'])
    return json([{ id: 'goal-one', profile_id: profileId, status: 'complete', image_path: `${profileId}/saved.png`, created_at: '2026-10-01T10:00:00Z', ...update }])
  }
  const result = await call({ action: 'edit', goalId: 'goal-one', title: 'Rättad rubrik', description: 'Rättad måltext.', nextStep: 'Fortsätt följa upp.' })
  assert.equal(result.code, 200)
  assert.equal(result.data.goal.title, 'Rättad rubrik')
  assert.equal(result.data.goal.status, 'complete')
  assert.equal(result.data.goal.hasImage, true)
  assert.equal(update.next_step, 'Fortsätt följa upp.')
})
test('goal edit rejects empty and overlong corrections before database access', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('must not run') }
  assert.equal((await call({ action: 'edit', goalId: 'goal-one', title: '', description: 'Text' })).code, 400)
  assert.equal((await call({ action: 'edit', goalId: 'goal-one', title: 'Rubrik', description: 'a'.repeat(2001) })).code, 400)
  assert.equal(calls, 0)
})
test('global AI off blocks goal text improvement before any paid call', async () => {
  globalThis.fetch = async (url) => { assert(String(url).includes('app_settings')); return json([{ setting_value: { aiEnabled: false } }]) }
  assert.equal((await call({ action: 'polish-goal', description: 'Test' })).code, 403)
})
test('failed goal insert removes only its freshly uploaded image and makes no AI call', async () => {
  let deleted, uploaded
  globalThis.fetch = async (url, options) => {
    const path = String(url)
    assert(!path.includes('openai.com'))
    if (path.includes('/profiles?')) return json([{ id: profileId }])
    if (path.includes('/bucket/')) return json({ public: false })
    if (path.endsWith('/object/goal-analysis-images') && options.method === 'DELETE') { deleted = JSON.parse(options.body).prefixes[0]; return json({}) }
    if (path.includes('/object/goal-analysis-images/')) { uploaded = path.split('/object/goal-analysis-images/')[1]; return json({}) }
    if (path.endsWith('/development_goals')) return json({ code: 'PGRST204' }, 400)
    throw new Error(`Unexpected fixture route ${path}`)
  }
  const result = await call({ ...goal, imageData: png })
  assert.equal(result.code, 422)
  assert.match(result.data.error, /088/)
  assert.equal(deleted, uploaded)
})
test('goal image save returns a signed preview, never the storage path', async () => {
  let stored
  globalThis.fetch = async (url, options) => {
    const path = String(url)
    if (path.includes('/profiles?')) return json([{ id: profileId }])
    if (path.includes('/bucket/')) return json({ public: false })
    if (path.includes('/object/sign/')) return json({ signedURL: '/object/sign/goal-analysis-images/fixture?token=test' })
    if (path.includes('/object/goal-analysis-images/')) return json({})
    if (path.endsWith('/development_goals')) { stored = JSON.parse(options.body); return json([{ id: 'goal-one', ...stored }]) }
    throw new Error('Unexpected fixture route')
  }
  const result = await call({ ...goal, imageData: png })
  assert.equal(result.code, 201)
  assert.match(stored.image_path, new RegExp(`^${profileId}/`))
  assert.equal(result.data.goal.hasImage, true)
  assert.match(result.data.goal.imageUrl, /object\/sign/)
  assert.equal(result.data.goal.image_path, undefined)
})
test('swimmer GET ignores requested profile and signs images only for session profile goals', async () => {
  const image_path = `${profileId}/33333333-3333-4333-8333-333333333333.png`
  let signed = 0
  globalThis.fetch = async (url) => {
    const path = String(url)
    if (path.includes('/profile_sessions?')) return json([{ profile_id: profileId }])
    if (path.includes('/profiles?')) return json([{ id: profileId }])
    if (path.includes('/development_goals?')) { assert(path.includes(`profile_id=eq.${profileId}`)); assert(!path.includes('someone-else')); return json([{ id: 'goal-one', profile_id: profileId, image_path }]) }
    if (path.includes('/goal_updates?')) return json([])
    if (path.includes('/object/sign/')) { signed++; assert(path.includes(image_path)); return json({ signedURL: '/object/sign/goal-analysis-images/fixture?token=test' }) }
    throw new Error('Unexpected fixture route')
  }
  const result = await call(null, 'fixture-swimmer', { method: 'GET', query: { profileId: 'someone-else' }, headers: { 'x-simkoll-code': 'fixture-swimmer', cookie: 'simkoll_session=fixture' } })
  assert.equal(result.code, 200)
  assert.equal(result.data.goals[0].profileId, profileId)
  assert.equal(result.data.goals[0].hasImage, true)
  assert.equal(signed, 1)
})
