// Documentation snapshot checked 2026-11-16. Capacity is not account access or a
// latency guarantee. Reserve the model's *maximum* output (some API limits use
// that allowance) plus headroom; always recheck the entire request on the server.
export const ASSISTANT_CAPACITY_DATE = '2026-11-16'
export const ASSISTANT_MAX_PREVIEW_BYTES = 3_000_000
const specs = {
  'gpt-4o-mini': { contextWindow: 128000, outputReservation: 16384, proxy: false },
  'gpt-4.1-mini': { contextWindow: 1047576, outputReservation: 32768, proxy: false },
  'gpt-4.1': { contextWindow: 1047576, outputReservation: 32768, proxy: false },
  'gpt-6.1-sol': { contextWindow: 1050000, outputReservation: 128000, proxy: true },
}
export function assistantModelCapacity(model) {
  const base = Object.keys(specs).find(key => model === key || new RegExp(`^${key.replaceAll('.', '\\.')}\\-\\d{4}-\\d{2}-\\d{2}$`).test(model || ''))
  if (!base) return null
  const spec = specs[base], available = spec.contextWindow - spec.outputReservation
  const safetyMargin = Math.ceil(available * (spec.proxy ? .3 : .15))
  return { model: base, ...spec, safetyMargin, inputBudget: available - safetyMargin, checkedOn: ASSISTANT_CAPACITY_DATE }
}
export function assistantContextBudget(model, estimatedInputTokens, previewBytes) {
  const capacity = assistantModelCapacity(model)
  const transportFits = Number.isSafeInteger(previewBytes) && previewBytes >= 0 && previewBytes <= ASSISTANT_MAX_PREVIEW_BYTES
  const estimateKnown = Number.isSafeInteger(estimatedInputTokens) && estimatedInputTokens >= 0
  const modelFits = Boolean(capacity && estimateKnown && estimatedInputTokens <= capacity.inputBudget)
  return { ...capacity, model, estimatedInputTokens, tokenizer: 'o200k_base', method: capacity?.proxy ? 'local-o200k-proxy-chunked-v1' : 'local-o200k-chunked-v1',
    allowed: transportFits && modelFits, transportFits, modelFits, previewBytes, previewByteLimit: ASSISTANT_MAX_PREVIEW_BYTES,
    reason: !transportFits ? 'transport' : !capacity ? 'unknown-model' : !estimateKnown ? 'estimate-unavailable' : !modelFits ? 'tokens' : null }
}
export function assistantBudgetMessage(budget) {
  if (budget.reason === 'transport') return `Det kompakta underlaget är för stort för förhandsvisningen (${Math.ceil(budget.previewBytes / 1000)} kB, teknisk gräns ${budget.previewByteLimit / 1000} kB). Inga rader har tagits bort och inget har skickats till OpenAI. Välj färre kategorier eller kortare period; uppdelad analys behövs för större underlag.`
  if (budget.reason === 'unknown-model') return 'Serverns modell saknar verifierad kapacitetsprofil. Välj en av modellerna i listan och granska igen. Inget har skickats till OpenAI.'
  if (budget.reason === 'estimate-unavailable') return 'Tokenmängden kunde inte uppskattas lokalt. Granska underlaget igen. Inget har skickats till OpenAI.'
  if (budget.reason === 'tokens') return `Hela begäran uppskattas till ${budget.estimatedInputTokens.toLocaleString('sv-SE')} indatatokens, över säkerhetsbudgeten ${budget.inputBudget.toLocaleString('sv-SE')} för ${budget.model}. Välj en modell med större kapacitet eller minska urvalet. Inga rader klipps bort och inget har skickats till OpenAI.`
  return ''
}
