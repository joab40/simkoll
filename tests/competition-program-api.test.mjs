import test from 'node:test'
import assert from 'node:assert/strict'
import { salsimmet } from './fixtures/salsimmet.mjs'
process.env.SUPABASE_URL = 'https://simkoll-test.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'fixture-coach'
process.env.OPENAI_API_KEY = 'fixture-only'
const { default: handler } = await import('../api/workouts.js')
async function post(body, code = 'fixture-coach') {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': code }, body }, response)
  return response
}
const publish = { action: 'publish-competition-program', competitionId: 'fixture-competition', programSnapshot: [], draft: salsimmet, reviewed: true }
test('analysis endpoint never replaces saved events', async () => {
  const writes = []
  const replies = [{ sessions: salsimmet.sessions, ageClasses: 'A–F', warnings: [] }, { events: salsimmet.events, warnings: [] }]
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.openai.com/')) return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(replies.shift()) }) }
    if (init?.method === 'POST' || init?.method === 'DELETE') writes.push(url)
    return { ok: true, json: async () => [] }
  }
  const response = await post({ action: 'import-competition-program', competitionId: 'fixture-competition', fileData: 'data:image/jpeg;base64,dGVzdA==', mimeType: 'image/jpeg' })
  assert.equal(response.code, 200)
  assert.equal(response.data.draft.events.length, 55)
  assert(writes.every((url) => String(url).endsWith('/ai_usage_logs')))
})
test('publishing validates review, role and rows before any write', async () => {
  globalThis.fetch = async () => { throw new Error('No database or AI call expected') }
  assert.equal((await post({ ...publish, reviewed: false })).code, 400)
  assert.equal((await post({ ...publish, draft: { ...salsimmet, events: [] } })).code, 422)
  assert.equal((await post(publish, 'invalid-code')).code, 403)
})
test('publishing uses one atomic RPC and reports conflicts without a destructive fallback', async () => {
  let count = 0
  globalThis.fetch = async (url, init) => {
    count++
    assert(String(url).endsWith('/rpc/publish_competition_program'))
    assert.equal(init.method, 'POST')
    const payload = JSON.parse(init.body)
    assert.equal(payload.p_events.length, 55)
    return { ok: false, json: async () => ({ message: 'ENTRIES_PROTECTED' }) }
  }
  const response = await post(publish)
  assert.equal(response.code, 409)
  assert.match(response.data.error, /redan anmälningar/)
  assert.equal(count, 1)
})
