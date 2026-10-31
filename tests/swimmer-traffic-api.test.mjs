import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://traffic-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'traffic-coach-fixture'
const { default: handler } = await import('../api/training.js')
const { stockholmDate } = await import('../server/profile-auth.js')
const call = async () => {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method: 'GET', query: { traffic: 'true' }, headers: { 'x-simkoll-code': 'traffic-coach-fixture' } }, response)
  return response
}
test('authorized traffic GET is read-only, no-store and returns only aggregate signals', async () => {
  const requests = [], originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => {
      requests.push(String(url))
      assert.equal(options.method, undefined)
      const rows = String(url).includes('/profiles?') ? [{ id: 'a', created_at: '2026-01-01T10:00:00Z' }] : String(url).includes('/responses?') ? [{ profile_id: 'a', activity_date: stockholmDate(), body: 4, feeling: 4 }] : []
      return new Response(JSON.stringify(rows), { status: 200 })
    }
    const response = await call()
    assert.equal(response.code, 200)
    assert.match(response.headers['Cache-Control'], /no-store/)
    assert.equal(response.data.asOf, stockholmDate())
    assert.equal(response.data.profiles[0].current.color, 'green')
    assert.equal(requests.length, 5)
    assert.ok(requests.every(path => /\/(profiles|responses|profile_daily_sleep|personal_training_sessions|planned_training_sessions)\?/.test(path)))
    assert.doesNotMatch(JSON.stringify(response.data), /comment|minutes|reflection|coach_notes|display_name/)
  } finally { globalThis.fetch = originalFetch }
})
test('a failed source returns an explicit API error, never successful partial colours', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async url => new Response(JSON.stringify([]), { status: String(url).includes('/profile_daily_sleep?') ? 503 : 200 })
    const response = await call()
    assert.equal(response.code, 502)
    assert.match(response.data.error, /fullständigt/)
    assert.equal(response.data.profiles, undefined)
  } finally { globalThis.fetch = originalFetch }
})
