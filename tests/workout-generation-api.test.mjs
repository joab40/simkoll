import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://workout-generation.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'fixture-secret'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'
process.env.OPENAI_API_KEY = 'fixture-not-a-real-key'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: handler } = await import('../api/workouts.js')
const code = createCoachToken({ id: '22222222-2222-4222-8222-222222222222', role: 'coach', email: 'coach@example.invalid' })
const body = () => ({ action: 'generate-from-library', focus: 'fart', distanceMeters: 4000, durationMinutes: 90, rpe: '6–7', groups: ['junior'], innovationLevel: 4, library: [{ title: 'Ett riktigt bibliotekspass', content: '400 m insim' }] })
const json = (data) => new Response(JSON.stringify(data))
async function call(input = body(), token = code) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'POST', query: {}, headers: { 'x-simkoll-code': token }, body: input }, response)
  return response
}
function fixture(settings = {}, generated = {}) {
  const writes = [], aiCalls = []
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://api.openai.com/')) {
      aiCalls.push(JSON.parse(init.body))
      return json({ status: 'completed', output_text: JSON.stringify({ title: 'Förslag', content: 'Insim\n400 m\nHuvudserie\n34 × 100 m\nAvsim\n200 m', focus: 'fart', distanceMeters: 4000, durationMinutes: 90, sourceNumbers: [1], changes: 'Ny huvudserie.', limitation: '', ...generated }), usage: { input_tokens: 100, output_tokens: 100 } })
    }
    const table = new URL(url).pathname.split('/').at(-1)
    if (init.method === 'POST') { writes.push(table); return json([]) }
    if (table === 'app_settings') return json([{ setting_value: settings }])
    if (table === 'ai_usage_logs') return json([{ total_tokens: 100 }])
    throw new Error(`Unexpected read: ${table}`)
  }
  return { writes, aiCalls }
}
test('coach generation returns editable draft and provenance but publishes nothing', async () => {
  const state = fixture()
  const response = await call()
  assert.equal(response.code, 200)
  assert.equal(response.data.provenance.mode, 'Nytänkande')
  assert.equal(response.data.draft.distanceMeters, 4000)
  assert.equal(response.data.model, 'gpt-6.1-sol')
  assert.deepEqual(state.writes, ['ai_usage_logs'])
  assert.equal(state.aiCalls.length, 1)
})
test('unauthenticated users and swimmers cannot generate', async () => {
  globalThis.fetch = async () => { throw new Error('No external request expected') }
  for (const token of ['', 'swimmer-fixture']) assert.equal((await call(body(), token)).code, 403)
})
test('AI off, quota reached and invalid input all stop before provider call', async () => {
  for (const settings of [{ aiEnabled: false }, { aiMonthlyTokenLimit: 100 }]) {
    const state = fixture(settings)
    assert.equal((await call()).code, 403)
    assert.equal(state.aiCalls.length, 0)
  }
  const state = fixture()
  assert.equal((await call({ ...body(), innovationLevel: 9 })).code, 400)
  assert.equal((await call({ ...body(), groups: [] })).code, 400)
  assert.equal(state.aiCalls.length, 0)
})
test('provider constraint mismatch is an error, not a successful empty draft', async () => {
  const state = fixture({}, { distanceMeters: 5000 })
  const response = await call()
  assert.equal(response.code, 422)
  assert.ok(response.data.error)
  assert.equal(response.data.draft, undefined)
  assert.deepEqual(state.writes, ['ai_usage_logs'])
})
