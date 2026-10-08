import test from 'node:test'
import assert from 'node:assert/strict'
import { estimatedCostUsd, pricingFor } from '../server/ai-costs.js'

test('GPT-6.1 Sol Standard estimates use $2 input/$10 output per million', () => {
  assert.deepEqual(pricingFor('gpt-6.1-sol'), { input: 2, output: 10 })
  assert.equal(estimatedCostUsd({ model: 'gpt-6.1-sol', promptTokens: 10000, completionTokens: 2000 }), 0.04)
  assert.equal(estimatedCostUsd({ model: 'gpt-6.1-sol', promptTokens: 0, completionTokens: 0 }), 0)
  assert.deepEqual(pricingFor('gpt-6.1-sol-2026-09-29'), { input: 2, output: 10 })
})
test('Sol long-context rates apply to the whole request only above 272K input', () => {
  assert.deepEqual(pricingFor('gpt-6.1-sol', 272000), { input: 2, output: 10 })
  assert.deepEqual(pricingFor('gpt-6.1-sol', 272001), { input: 4, output: 15 })
  assert.equal(estimatedCostUsd({ model: 'gpt-6.1-sol', promptTokens: 300000, completionTokens: 10000 }), 1.35)
})
test('existing models and unknown-model handling are unchanged', () => {
  assert.deepEqual(pricingFor('gpt-4o-mini'), { input: 0.15, output: 0.6 })
  assert.equal(estimatedCostUsd({ model: 'unknown', promptTokens: 1000 }), null)
  assert.equal(pricingFor('gpt-6-sol'), null)
})
