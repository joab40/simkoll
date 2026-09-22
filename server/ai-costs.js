// Approximate text-token prices in USD per 1M tokens. Keep this list small and
// explicit: unknown models are shown as "pris saknas" rather than guessed.
const PRICES = [
  { match: /^gpt-4o-mini(?:-|$)/i, input: 0.15, output: 0.60 },
  { match: /^gpt-4o(?:-|$)/i, input: 2.50, output: 10.00 },
  { match: /^gpt-4\.1-mini(?:-|$)/i, input: 0.40, output: 1.60 },
  { match: /^gpt-4\.1(?:-|$)/i, input: 2.00, output: 8.00 },
  { match: /^o3-mini(?:-|$)/i, input: 1.10, output: 4.40 },
]

export function pricingFor(model) {
  const found = PRICES.find((entry) => entry.match.test(String(model || '')))
  return found ? { input: found.input, output: found.output } : null
}

export function estimatedCostUsd({ model, promptTokens = 0, completionTokens = 0 }) {
  const pricing = pricingFor(model)
  if (!pricing) return null
  return (Number(promptTokens || 0) * pricing.input + Number(completionTokens || 0) * pricing.output) / 1_000_000
}
