// Approximate text-token prices in USD per 1M tokens. Keep this list small and
// explicit: unknown models are shown as "pris saknas" rather than guessed.
// Logs currently retain total input/output only, not cache breakdown or service
// tier. Estimates therefore use Standard rates and count all input as uncached.
const PRICES = [
  // https://developers.openai.com/api/docs/models/gpt-6.1-sol (2026-10-08)
  { match: /^gpt-6\.1-sol(?:-|$)/i, input: 2.00, output: 10.00, longContext: { above: 272000, input: 4.00, output: 15.00 } },
  { match: /^gpt-4o-mini(?:-|$)/i, input: 0.15, output: 0.60 },
  { match: /^gpt-4o(?:-|$)/i, input: 2.50, output: 10.00 },
  { match: /^gpt-4\.1-mini(?:-|$)/i, input: 0.40, output: 1.60 },
  { match: /^gpt-4\.1(?:-|$)/i, input: 2.00, output: 8.00 },
  { match: /^o3-mini(?:-|$)/i, input: 1.10, output: 4.40 },
]

export function pricingFor(model, promptTokens = 0) {
  const found = PRICES.find((entry) => entry.match.test(String(model || '')))
  if (!found) return null
  const rates = found.longContext && Number(promptTokens) > found.longContext.above ? found.longContext : found
  return { input: rates.input, output: rates.output }
}

export function estimatedCostUsd({ model, promptTokens = 0, completionTokens = 0 }) {
  const pricing = pricingFor(model, promptTokens)
  if (!pricing) return null
  return (Number(promptTokens || 0) * pricing.input + Number(completionTokens || 0) * pricing.output) / 1_000_000
}
