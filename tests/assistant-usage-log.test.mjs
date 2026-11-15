import test from 'node:test'
import assert from 'node:assert/strict'
import { coachSessionFixture } from './helpers/coach-session-fixture.mjs'
process.env.SUPABASE_URL = 'https://assistant-usage-log.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture-only'
const { writeAiUsage } = await import('../server/audit.js')
const { default: profilesHandler } = await import('../api/profiles.js')
const { createCoachToken } = await import('../server/coach-auth.js')
const id = '11111111-1111-4111-8111-111111111111'
const admin = createCoachToken({ id, role: 'superadmin' })
const request = { headers: { 'x-simkoll-code': admin } }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const telemetry = { version: 1, usageKnown: true, inputTokens: 100, outputTokens: 30, totalTokens: 130, requestBytes: 6000, databaseRows: 10, databaseJsonBytes: 5000, sourceRecords: 7, contextBytes: 2000, estimatedCostUsd: 0.00789, pricingDate: '2026-11-15', rates: { input: 0.4, output: 1.6 }, prompt: 'DO NOT LOG' }

test('usage writer stores numeric metadata alongside coach identity and preserves basic logs on old schemas', async () => {
  for (const missing of [[], ['usage_details'], ['usage_details', 'actor_profile_id']]) {
    const rows = []
    globalThis.fetch = async (_url, options) => {
      const row = JSON.parse(options.body); rows.push(row)
      const unavailable = missing.find(key => Object.hasOwn(row, key))
      return unavailable ? json({ message: `Could not find ${unavailable} column` }, 400) : json({})
    }
    const result = await writeAiUsage(request, { feature: 'swimmer_assistant', model: 'gpt-4.1-mini', role: 'coach', profileId: id, response: { usage: { input_tokens: 100, output_tokens: 30 } }, usageDetails: telemetry })
    assert.equal(result.saved, true); assert.equal(result.detailsSaved, !missing.length)
    assert.equal(rows[0].coach_account_id, id); assert.equal(rows[0].profile_id, id)
    assert.equal(rows.at(-1).total_tokens, 130)
    assert(!JSON.stringify(rows).includes('DO NOT LOG'))
    if (!missing.length) assert.equal(rows[0].usage_details.requestBytes, 6000)
    else assert(!Object.hasOwn(rows.at(-1), 'usage_details'))
  }
})

async function audit(code = admin) {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await coachSessionFixture(profilesHandler)({ method: 'GET', headers: { 'x-simkoll-code': code }, query: { audit: 'true' } }, response)
  return response
}

test('audit API uses stored price snapshots for call, month and model totals, and metadata remains admin-only', async () => {
  globalThis.fetch = async url => {
    const parsed = new URL(url), table = parsed.pathname.split('/').at(-1)
    if (table === 'audit_logs' || table === 'profiles') return json([])
    if (table === 'coach_accounts') return json([{ id, display_name: 'Demo-tränare' }])
    if (table === 'app_settings') return json([{ setting_value: {} }])
    if (table === 'ai_usage_logs') return json([{ id: 1, feature: 'swimmer_assistant', model: 'gpt-4.1-mini', role: 'coach', coach_account_id: id, prompt_tokens: 100, completion_tokens: 30, total_tokens: 130, status: 'success', usage_details: telemetry, created_at: new Date().toISOString() }])
    throw new Error(`Unexpected table ${table}`)
  }
  const response = await audit()
  assert.equal(response.code, 200)
  assert.equal(response.data.aiUsage[0].actor_name, 'Demo-tränare')
  assert.equal(response.data.aiUsage[0].estimated_cost_usd, telemetry.estimatedCostUsd)
  assert.equal(response.data.month.estimatedCostUsd, telemetry.estimatedCostUsd)
  assert.equal(response.data.month.byModel[0].estimatedCostUsd, telemetry.estimatedCostUsd)
  assert(!JSON.stringify(response.data).includes('DO NOT LOG'))
  assert.equal((await audit(createCoachToken({ id, role: 'head_coach' }))).code, 403)
})

test('audit API falls back without dropping actor identity if only the new metadata column is missing', async () => {
  const queries = []
  globalThis.fetch = async url => {
    const parsed = new URL(url), table = parsed.pathname.split('/').at(-1)
    if (table === 'ai_usage_logs') {
      queries.push(parsed.searchParams.get('select'))
      if (queries.at(-1).includes('usage_details')) return json({ message: 'usage_details unavailable' }, 400)
      return json([{ id: 2, role: 'coach', coach_account_id: id, model: 'gpt-4.1', prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000, created_at: new Date().toISOString() }])
    }
    if (table === 'coach_accounts') return json([{ id, display_name: 'Demo-tränare' }])
    return json([])
  }
  const response = await audit()
  assert.equal(response.code, 200); assert.equal(queries.length, 2)
  assert.equal(response.data.aiUsage[0].actor_name, 'Demo-tränare')
  assert.equal(response.data.aiUsage[0].estimated_cost_usd, 0.01)
})
