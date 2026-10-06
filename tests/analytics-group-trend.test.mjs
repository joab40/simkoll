import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://simkoll-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'fixture-coach'
const profiles = ['a', 'b', 'c', 'other', 'test'].map((id) => ({ id, created_at: '2026-01-01T00:00:00Z', is_test_profile: id === 'test' }))
const rows = (day, value) => [...profiles.map((profile) => profile.id), null].flatMap((id) => [0, 1].map((offset) => ({ profile_id: id, created_at: `2026-10-${String(day + offset).padStart(2, '0')}T12:00:00Z`, feeling: value, body: value, day_type: 'after' })))
globalThis.fetch = async (url) => {
  assert(String(url).startsWith('https://simkoll-test.invalid/rest/v1/'))
  const table = new URL(url).pathname.split('/').pop()
  const data = table === 'profiles' ? profiles : table === 'responses' ? [...rows(1, 3), ...rows(6, 4)] : []
  return { ok: true, json: async () => data }
}
const { default: handler } = await import('../api/analytics.js')
const query = { start: '2026-10-05T22:00:00Z', end: '2026-10-12T22:00:00Z', previousStart: '2026-09-28T22:00:00Z', previousEnd: '2026-10-05T22:00:00Z' }
async function get(overrides = {}) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'GET', headers: { 'x-simkoll-code': 'fixture-coach' }, query: { ...query, ...overrides } }, response)
  assert.equal(response.code, 200)
  return response.data
}
const scoped = await get({ profileIds: 'a,b,c', includeAnonymous: 'false' })
assert.equal(scoped.groupTrend.state, 'up'); assert.equal(scoped.current.checkins, 6); assert.equal(scoped.groupTrend.current.linkedSwimmers, 3); assert.equal(scoped.groupTrend.current.anonymousResponses, 0)
assert(scoped.groupTrend.warnings.some((text) => text.includes('valda grupperna')))
const all = await get()
assert.equal(all.current.checkins, 10); assert.equal(all.groupTrend.current.linkedSwimmers, 4); assert.equal(all.groupTrend.current.anonymousResponses, 2)
const empty = await get({ profileIds: '', includeAnonymous: 'false' })
assert.equal(empty.current.checkins, 0); assert.equal(empty.groupTrend.state, 'insufficient')
console.log('PASS analytics endpoint: selected group only, excluded test profiles, anonymous handling and empty selection')
