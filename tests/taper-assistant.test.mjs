import test from 'node:test'
import assert from 'node:assert/strict'
process.env.COACH_SESSION_SECRET = 'taper-dialog-fixture'
process.env.OPENAI_API_KEY = 'fixture-only'
const { handleSwimmerAssistant } = await import('../server/swimmer-assistant.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const profileId = '11111111-1111-4111-8111-111111111111'
const base = { profileId, categories: ['taper'], period: '90' }
test('taper dialog reviews chosen sources first, binds target changes to signature and requires confirmation', async () => {
  let priority = 'A', sends = 0
  const read = async query => ({ ok: true, json: async () => query.startsWith('profiles?') ? [{ id: profileId, active: true, approval_status: 'approved', ai_analysis_status: 'approved', training_group: 'junior' }] : query.startsWith('coach_taper_goals?') ? [{ competition_id: 'goal', competition_title: 'Mål', priority, target_date: '2027-01-15', enabled: true, created_at: '2026-11-16T10:00:00Z' }] : [] })
  const run = async body => {
    const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data } }
    await handleSwimmerAssistant({ body: { ...base, ...body }, headers: { 'x-simkoll-code': createCoachToken({ id: 'head', role: 'head_coach' }) } }, response, { read, today: '2026-11-16', availability: async () => ({ allowed: true }), log: async () => {}, audit: async () => {}, fetch: async (_url, options) => {
      sends++
      const request = JSON.parse(options.body)
      assert.equal(request.store, false); assert.equal(request.tools, undefined)
      assert.match(request.instructions, /alternativa träningsfokus/)
      assert.doesNotMatch(request.input[0].content, /profile_daily_sleep|profile_daily_illness/)
      return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({ answer: { text: 'Diskutera målet med tränaren.', sourceIds: ['S1'] }, observations: [], interpretations: [], limitations: ['Ingen individuell prognos.'] }), usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } }) }
    } })
    return response
  }
  const preview = await run({ action: 'swimmer-assistant-preview' })
  assert.equal(preview.code, 200); assert.equal(sends, 0)
  const ask = { action: 'swimmer-assistant-chat', token: preview.data.token, question: 'Hur ligger vi till?', confirmed: false }
  assert.equal((await run(ask)).code, 400); assert.equal(sends, 0)
  priority = 'B'; assert.equal((await run({ ...ask, confirmed: true })).code, 409); assert.equal(sends, 0)
  priority = 'A'; assert.equal((await run({ ...ask, confirmed: true })).code, 200); assert.equal(sends, 1)
})
