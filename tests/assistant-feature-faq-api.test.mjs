import test from 'node:test'
import assert from 'node:assert/strict'
import { featureFaqFor } from '../shared/feature-faq.js'

process.env.SUPABASE_URL = 'https://assistant-faq.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_SWIMMER_CODE = 'faq-swimmer'
process.env.SIMKOLL_COACH_CODE = 'faq-coach'
process.env.OPENAI_API_KEY = 'fixture-only'
const { default: handler } = await import('../api/workouts.js')
const profileId = '11111111-1111-4111-8111-111111111111'
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

for (const role of ['swimmer', 'coach']) test(`${role} assistant request includes current FAQ without expanding private data access`, async () => {
  let modelRequest
  const reads = [], writes = []
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url), table = parsed.pathname.split('/').at(-1)
    if (parsed.hostname === 'api.openai.com') {
      modelRequest = JSON.parse(init.body)
      return json({ choices: [{ message: { content: JSON.stringify({ text: 'Svar från testmodellen.' }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
    }
    assert.equal(parsed.hostname, 'assistant-faq.invalid', 'no live network or provider calls')
    if (init.method && init.method !== 'GET') {
      writes.push(table)
      assert.equal(table, 'ai_usage_logs')
      return json([])
    }
    reads.push(parsed)
    if (table === 'profile_sessions') return json([{ profile_id: profileId }])
    if (table === 'profiles') return json([{ id: profileId, display_name: 'Exempel', training_group: 'junior', active: true, approval_status: 'approved' }])
    if (table === 'app_settings') return json([{ setting_key: 'webapp', setting_value: { openChat: { enabled: false } } }])
    return json([])
  }
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method: 'POST', query: {}, headers: { 'x-simkoll-code': `faq-${role}`, cookie: 'simkoll_session=fixture' }, body: { action: 'assistant-chat', question: role === 'coach' ? 'Vad är låg kroppskänsla och hur fungerar passförslag?' : 'Varför saknas simmeter och hur fungerar sömnpilen?' } }, response)
  assert.equal(response.code, 200)
  assert.equal(response.data.text, 'Svar från testmodellen.')
  const prompt = modelRequest.messages.map(item => item.content).join('\n')
  for (const entry of featureFaqFor(role)) {
    assert.ok(prompt.includes(entry.question), entry.id)
    for (const paragraph of entry.answer) assert.ok(prompt.includes(paragraph), entry.id)
  }
  for (const forbidden of ['training_diary_reflections', 'profile_daily_sleep', 'training_swim_times', 'coach_activity_notes']) assert.ok(!reads.some(url => url.pathname.endsWith('/' + forbidden)), forbidden)
  for (const url of reads.filter(url => url.pathname.endsWith('/development_talks'))) {
    assert.equal(url.searchParams.get('swimmer_id'), `eq.${profileId}`)
    assert.doesNotMatch(url.searchParams.get('select'), /coach_notes|coach_preparation/)
  }
  assert.deepEqual(writes, ['ai_usage_logs'])
})
