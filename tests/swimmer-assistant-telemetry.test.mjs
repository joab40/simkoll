import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assistantUsageTelemetry, loggedAiCost, measuredAssistantRead, safeAssistantTelemetry } from '../server/swimmer-assistant-telemetry.js'
import { jsonBytes, resolveSwimmerAssistantModel } from '../shared/swimmer-assistant.js'

test('context read metrics count consumed JSON pages once, including support rows, and report failures', async () => {
  const rows = [{ value: 'Åäö 🏊' }, { value: 3 }]
  const measured = measuredAssistantRead(async query => {
    if (query === 'throw') throw new Error('offline')
    if (query === 'fail') return { ok: false }
    return { ok: true, json: async () => rows }
  })
  const response = await measured.read('page1')
  await Promise.all([response.json(), response.json()])
  await (await measured.read('page2')).json()
  await measured.read('fail'); await assert.rejects(measured.read('throw'))
  assert.deepEqual(measured.metrics, { databaseRows: 4, databaseJsonBytes: jsonBytes(rows) * 2, databaseRequests: 4, databaseFailedRequests: 2 })
})

test('usage subsets are not double counted; cost is a fixed Standard snapshot, not a cache-adjusted invoice', () => {
  const telemetry = assistantUsageTelemetry('gpt-4.1-mini', { usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 }, output_tokens_details: { reasoning_tokens: 100 } } }, { requestBytes: 8300 })
  assert.equal(telemetry.totalTokens, 1200); assert.equal(telemetry.cachedInputTokens, 400)
  assert.equal(telemetry.reasoningTokens, 100); assert.equal(telemetry.estimatedCostUsd, 0.00072)
  assert.deepEqual(telemetry.rates, { input: 0.4, output: 1.6 })
  const item = { model: 'price-changed-later', usage_details: telemetry }
  assert.equal(loggedAiCost(item), telemetry.estimatedCostUsd)
  assert.equal(loggedAiCost({ feature: 'swimmer_assistant', model: 'gpt-4.1', total_tokens: 0 }), null)
  assert.equal(loggedAiCost({ model: 'gpt-4.1', prompt_tokens: 1000, completion_tokens: 1000 }), 0.01)
})

test('missing, malformed, unknown-priced, cache-write and nonstandard-tier usage are never presented as a free call', () => {
  for (const usage of [undefined, {}, { input_tokens: -1, output_tokens: 20 }, { input_tokens: null, output_tokens: 20 }, { input_tokens: '100', output_tokens: 20 }]) {
    const value = assistantUsageTelemetry('gpt-4.1-mini', { usage }, {})
    assert.equal(value.usageKnown, false); assert.equal(value.estimatedCostUsd, null)
  }
  for (const [model, response] of [['unknown', { usage: { input_tokens: 20, output_tokens: 10 } }], ['gpt-4.1', { service_tier: 'flex', usage: { input_tokens: 20, output_tokens: 10 } }], ['gpt-6.1-sol', { usage: { input_tokens: 20, output_tokens: 10, input_tokens_details: { cache_write_tokens: 10 } } }]]) assert.equal(assistantUsageTelemetry(model, response, {}).estimatedCostUsd, null)
  assert.equal(assistantUsageTelemetry('gpt-4.1-mini', { usage: { input_tokens: 0, output_tokens: 0 } }, {}).estimatedCostUsd, 0)
})

test('persisted telemetry is allowlisted and cannot carry prompt text, query IDs or unexpected fields', () => {
  const safe = safeAssistantTelemetry({ ...assistantUsageTelemetry('gpt-4.1-mini', null, { requestBytes: 500, packedContextBytes: 300, packingSavedBytes: 400, estimatedInputTokens: 100, inputTokenBudget: 862586 }), prompt: 'PRIVATE', sources: ['PRIVATE'], rates: { input: 1, output: 2, private: 'PRIVATE' }, databaseRows: -1 })
  assert.equal(safe.packedContextBytes, 300); assert.equal(safe.packingSavedBytes, 400)
  assert.equal(safe.estimatedInputTokens, 100); assert.equal(safe.inputTokenBudget, 862586)
  assert(!JSON.stringify(safe).includes('PRIVATE')); assert.equal(safe.databaseRows, null)
  assert.deepEqual(safe.rates, { input: 1, output: 2 })
  assert.equal(safeAssistantTelemetry({ prompt: 'secret' }), null)
  assert.equal(resolveSwimmerAssistantModel('default', 'configured-server-model'), 'configured-server-model')
  assert.throws(() => resolveSwimmerAssistantModel({ id: 'gpt-4.1' }, 'default'))
})

test('migration adds metadata only, preserves RLS and does not add conversation storage', () => {
  const sql = readFileSync(new URL('../supabase/migrations/121_swimmer_assistant_usage_details.sql', import.meta.url), 'utf8')
  assert.match(sql, /add column if not exists usage_details jsonb/)
  assert.doesNotMatch(sql, /create table|disable row level security|grant|drop /i)
})
