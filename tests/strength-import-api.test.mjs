import test from 'node:test'
import assert from 'node:assert/strict'
process.env.SUPABASE_URL = 'https://strength-import.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'fixture-secret'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: training } = await import('../api/training.js')
const { default: workouts } = await import('../api/workouts.js')
const draft = { title: 'Program', description: 'Testprogram', passes: [{ title: 'Bål', exercises: [{ name: 'Planka', prescription: '3 x 30 sek' }] }] }
async function call(handler, role, body) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': createCoachToken({ id: 'fixture', email: 'fixture@example.invalid', display_name: 'Fixture', role }) }, body, query: {} }, response)
  return response
}
test('ordinary coaches cannot import or save strength drafts', async () => {
  globalThis.fetch = async () => { throw new Error('No database or AI call is allowed') }
  assert.equal((await call(workouts, 'coach', { action: 'import-strength-program' })).code, 403)
  assert.equal((await call(training, 'coach', { action: 'save-strength-import', reviewed: true, draft })).code, 403)
})
test('global AI off blocks file interpretation before any OpenAI call', async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /rest\/v1\/app_settings\?/)
    return { ok: true, json: async () => [{ setting_value: { aiEnabled: false } }] }
  }
  const result = await call(workouts, 'head_coach', { action: 'import-strength-program' })
  assert.equal(result.code, 403)
  assert.match(result.data.error, /avstängt/)
})
test('review is required and saving creates an unassigned library program without AI calls', async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /rest\/v1\/training_programs$/)
    assert.equal(options.method, 'POST')
    const row = JSON.parse(options.body)
    assert.equal(row.program_type, 'strength')
    assert.match(row.content, /Pass 1 · Bål/)
    return { ok: true, json: async () => [{ id: 'saved', ...row }] }
  }
  assert.equal((await call(training, 'head_coach', { action: 'save-strength-import', draft })).code, 400)
  const result = await call(training, 'superadmin', { action: 'save-strength-import', reviewed: true, draft })
  assert.equal(result.code, 201)
  assert.equal(result.data.program.id, 'saved')
})
