import test from 'node:test'
import assert from 'node:assert/strict'

process.env.OPENAI_API_KEY = 'fixture-only'
process.env.SUPABASE_URL = 'https://talk-ai-fixture.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
process.env.SIMKOLL_COACH_CODE = 'coach-fixture'
process.env.SIMKOLL_SWIMMER_CODE = 'swimmer-fixture'
const { proposeTalkAgreement } = await import('../server/talk-agreement.js')
const { default: handler } = await import('../api/goals.js')
const notes = 'Vill arbeta med tajmingen i vändningar. Tränaren ger återkoppling vid teknikträningen.'
const draft = { agreement: 'Du arbetar med tajmingen i vändningarna och får återkoppling av tränaren vid teknikträningen.', questions: ['Hur vill ni följa upp arbetet?'] }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const modelResponse = (value = draft, status = 'completed') => json({ status, output_text: JSON.stringify(value), usage: { input_tokens: 100, output_tokens: 50 } })

test('draft sends only notes, uses structured output and logs usage without note text', async () => {
  let usage
  const result = await proposeTalkAgreement({}, notes, {
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses')
      const body = JSON.parse(options.body)
      assert.equal(body.store, false)
      assert.equal(body.text.format.strict, true)
      assert.deepEqual(JSON.parse(body.input[1].content), { notes })
      assert.match(body.input[0].content, /Hitta inte på mål/)
      assert.match(body.input[0].content, /Kopiera inte privata omdömen/)
      return modelResponse()
    }, log: async (_, entry) => { usage = entry },
  })
  assert.deepEqual(result, { draft })
  assert.equal(usage.feature, 'talk_agreement_draft')
  assert.equal(usage.response.usage.input_tokens, 100)
  assert.doesNotMatch(JSON.stringify(usage), /tajmingen/)
})

test('empty, overlong and identifiable notes never reach the model', async () => {
  let calls = 0
  const deps = { fetch: async () => { calls++; throw new Error('must not run') }, log: async () => {} }
  for (const input of [null, '', ' ', 'x'.repeat(10001), 'Johan Andersson vill träna.', 'Kontakt simmare@example.se', '20100101-1234']) await assert.rejects(proposeTalkAgreement({}, input, deps))
  assert.equal(calls, 0)
})

test('incomplete and malformed drafts are rejected, while clarifying questions can stand alone', async () => {
  for (const value of [{ ...draft, agreement: 'x'.repeat(5001) }, { ...draft, questions: [42] }, { agreement: '', questions: [] }]) {
    await assert.rejects(proposeTalkAgreement({}, notes, { fetch: async () => modelResponse(value), log: async () => {} }), /ofullständigt/)
  }
  await assert.rejects(proposeTalkAgreement({}, notes, { fetch: async () => modelResponse(draft, 'incomplete'), log: async () => {} }), /ofullständigt/)
  const clarification = { agreement: '', questions: ['Vilket område vill ni fokusera på?'] }
  assert.deepEqual(await proposeTalkAgreement({}, notes, { fetch: async () => modelResponse(clarification), log: async () => {} }), { draft: clarification })
})

test('provider failure is logged once and original notes are never persisted', async () => {
  const logs = []
  await assert.rejects(proposeTalkAgreement({}, notes, { fetch: async () => json({}, 401), log: async (_, entry) => logs.push(entry) }), /nyckeln/)
  assert.equal(logs.length, 1)
  assert.equal(logs[0].status, 'failure')
  assert.doesNotMatch(JSON.stringify(logs), /tajmingen/)
})

async function call(code = 'coach-fixture') {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method: 'POST', headers: { 'x-simkoll-code': code }, body: { action: 'propose-talk-agreement', notes, profileId: 'not-model-input', swimmerAnswers: { private: 'not-model-input' } } }, response)
  return response
}

test('swimmers cannot invoke agreement AI and global disable/budget stop paid calls', async () => {
  globalThis.fetch = async () => { throw new Error('must not run') }
  assert.equal((await call('swimmer-fixture')).code, 403)
  globalThis.fetch = async (url) => { assert.match(String(url), /app_settings/); return json([{ setting_value: { aiEnabled: false } }]) }
  assert.equal((await call()).code, 403)
  globalThis.fetch = async (url) => String(url).includes('app_settings') ? json([{ setting_value: { aiMonthlyTokenLimit: 100 } }]) : json([{ total_tokens: 100 }])
  const limited = await call()
  assert.equal(limited.code, 403)
  assert.match(limited.data.error, /månadstak/)
})

test('coach API returns draft but never writes a conversation or forwards profile data', async () => {
  const writes = []
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url)
    if (path.includes('app_settings')) return json([{ setting_value: { aiEnabled: true } }])
    if (path.includes('api.openai.com')) { assert.doesNotMatch(options.body, /not-model-input/); return modelResponse() }
    if (options.method === 'POST' && path.includes('ai_usage_logs')) { writes.push(JSON.parse(options.body)); return json([]) }
    throw new Error(`Unexpected request: ${path}`)
  }
  const result = await call()
  assert.equal(result.code, 200)
  assert.deepEqual(result.data, { draft })
  assert.equal(writes.length, 1)
  assert.equal(writes[0].feature, 'talk_agreement_draft')
  assert.doesNotMatch(JSON.stringify(writes), /tajmingen/)
})
