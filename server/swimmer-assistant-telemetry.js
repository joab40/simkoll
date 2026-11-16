import { jsonBytes } from '../shared/swimmer-assistant.js'
import { pricingFor } from './ai-costs.js'

// Measure context reads only, not auth/budget/log queries. JSON sizes are
// serialized response bodies, not physical database storage or network traffic.
export function measuredAssistantRead(read) {
  const metrics = { databaseRows: 0, databaseJsonBytes: 0, databaseRequests: 0, databaseFailedRequests: 0 }
  return { metrics, read: async (...args) => {
    metrics.databaseRequests += 1
    let result
    try { result = await read(...args) } catch (error) { metrics.databaseFailedRequests += 1; throw error }
    if (!result.ok) { metrics.databaseFailedRequests += 1; return result }
    let loaded
    return { ok: result.ok, json: () => {
      loaded ||= (async () => {
        try {
          const data = await result.json()
          metrics.databaseRows += Array.isArray(data) ? data.length : 0
          metrics.databaseJsonBytes += jsonBytes(data)
          return data
        } catch (error) { metrics.databaseFailedRequests += 1; throw error }
      })()
      return loaded
    } }
  } }
}

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null
export function assistantUsageTelemetry(model, response, sizes) {
  const usage = response?.usage
  const inputTokens = count(usage?.input_tokens), outputTokens = count(usage?.output_tokens)
  const usageKnown = inputTokens != null && outputTokens != null
  const rates = pricingFor(model, inputTokens || 0)
  // Preserve a price snapshot. Explicitly do not claim invoice precision:
  // cached-input discounts, cache-write charges and regional premiums excluded.
  const standard = !response?.service_tier || response.service_tier === 'default'
  const estimatedCostUsd = usageKnown && rates && standard && !usage?.input_tokens_details?.cache_write_tokens
    ? (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000 : null
  return { version: 1, ...sizes, usageKnown, inputTokens, outputTokens,
    totalTokens: usageKnown ? count(usage.total_tokens) ?? inputTokens + outputTokens : null,
    cachedInputTokens: count(usage?.input_tokens_details?.cached_tokens),
    reasoningTokens: count(usage?.output_tokens_details?.reasoning_tokens),
    estimatedCostUsd, rates: rates || null, costBasis: 'standard-uncached-v1', pricingDate: '2026-11-15' }
}

// Counts/rate snapshots only. Never persist prompts, replies, raw source rows,
// query strings or arbitrary caller-supplied metadata in the usage log.
export function safeAssistantTelemetry(value) {
  if (value?.version !== 1) return null
  const output = { version: 1, usageKnown: value.usageKnown === true, costBasis: 'standard-uncached-v1', pricingDate: /^\d{4}-\d{2}-\d{2}$/.test(value.pricingDate) ? value.pricingDate : null }
  for (const key of ['databaseRows', 'databaseJsonBytes', 'databaseRequests', 'databaseFailedRequests', 'sourceRecords', 'contextBytes', 'packedContextBytes', 'packingSavedBytes', 'estimatedInputTokens', 'inputTokenBudget', 'requestBytes', 'historyMessages', 'inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens', 'reasoningTokens']) output[key] = count(value[key])
  output.estimatedCostUsd = typeof value.estimatedCostUsd === 'number' && Number.isFinite(value.estimatedCostUsd) && value.estimatedCostUsd >= 0 ? value.estimatedCostUsd : null
  output.rates = value.rates && ['input', 'output'].every(key => typeof value.rates[key] === 'number' && Number.isFinite(value.rates[key]) && value.rates[key] >= 0) ? { input: value.rates.input, output: value.rates.output } : null
  return output
}

export function loggedAiCost(item) {
  if (item.usage_details?.version === 1) return safeAssistantTelemetry(item.usage_details).estimatedCostUsd
  if (item.feature === 'swimmer_assistant' && !Number(item.total_tokens)) return null
  const rates = pricingFor(item.model, item.prompt_tokens)
  return rates ? (Number(item.prompt_tokens || 0) * rates.input + Number(item.completion_tokens || 0) * rates.output) / 1_000_000 : null
}
