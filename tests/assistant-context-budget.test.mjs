import test from 'node:test'
import assert from 'node:assert/strict'
import { assistantModelCapacity, assistantContextBudget, assistantBudgetMessage, ASSISTANT_MAX_PREVIEW_BYTES } from '../shared/assistant-context-budget.js'
import { localAssistantTokenEstimate } from '../server/assistant-token-estimate.js'
test('model budgets reserve output and safety headroom, including an explicit proxy for Sol', () => {
  const mini = assistantModelCapacity('gpt-4o-mini'), large = assistantModelCapacity('gpt-4.1-mini')
  assert.equal(mini.contextWindow, 128000)
  assert.equal(large.contextWindow, 1047576)
  assert.equal(large.inputBudget + large.outputReservation + large.safetyMargin, large.contextWindow)
  assert.deepEqual(assistantModelCapacity('gpt-4.1-mini-2025-04-14'), large)
  assert.equal(assistantModelCapacity('gpt-4X1-mini'), null)
  assert.equal(assistantModelCapacity('custom'), null)
  assert.equal(assistantModelCapacity('gpt-6.1-sol').proxy, true)
  assert(assistantContextBudget('gpt-4.1-mini', 200000, 500000).allowed)
  assert.equal(assistantContextBudget('gpt-4o-mini', 200000, 500000).reason, 'tokens')
  assert.match(assistantBudgetMessage(assistantContextBudget('gpt-4o-mini', 200000, 500000)), /säkerhetsbudgeten/)
})
test('unknown capacity, missing estimate and oversized transport never authorize a send', () => {
  assert.equal(assistantContextBudget('custom', 10, 100).allowed, false)
  assert.equal(assistantContextBudget('gpt-4.1-mini', null, 100).allowed, false)
  const budget = assistantContextBudget('gpt-4.1-mini', null, ASSISTANT_MAX_PREVIEW_BYTES + 1)
  assert.equal(budget.reason, 'transport'); assert.equal(budget.allowed, false)
})
test('token estimate is local, includes schema/instructions and handles Unicode, special token text and long strings', () => {
  const request = { instructions: 'Svara på svenska.', input: [{ content: 'Återhämtning 🏊 <|endoftext|>' }], text: { format: 'json_schema' } }
  const estimate = localAssistantTokenEstimate(request)
  assert(Number.isSafeInteger(estimate)); assert(estimate > 256)
  assert(localAssistantTokenEstimate({ ...request, input: [{ content: 'x'.repeat(190000) + '🏊' }] }) > estimate)
  assert(localAssistantTokenEstimate({ ...request, instructions: 'Mer instruktion. '.repeat(100) }) > estimate)
})
