export const SWIMMER_ASSISTANT_CATEGORIES = Object.freeze([
  { key: 'checkins', label: 'Incheckningar & känslor', description: 'Kropp, dagskänsla, energi och betyg.', default: true },
  { key: 'speed', label: 'Fartkänsla', description: 'Rapporterad simfartkänsla, inte uppmätt fart.', default: true },
  { key: 'load', label: 'RPE & sRPE', description: 'RPE × minuter, med rapporterad och uppskattad tid isär.', default: true },
  { key: 'volume', label: 'Träningsmeter & tid', description: 'Rapporterad mängd och säkert kopplad planerad mängd.', default: true },
  { key: 'activity', label: 'Närvaro & personlig planering', description: 'Registrerade och planerade aktiviteter.', default: true },
  { key: 'workouts', label: 'Träningspass & upplägg', description: 'Gruppens publicerade pass och grundplanering. Inte bevis på deltagande.' },
  { key: 'results', label: 'Tävlingsresultat', description: 'Sparade resultat med gren, bassäng och datum.', default: true },
  { key: 'times', label: 'Tränings- & testtider', description: 'Tidtagning, utrustning, startsätt och förutsättningar.' },
  { key: 'programs', label: 'Styrka & landträning', description: 'Tilldelade program, viktloggar och resultat.' },
  { key: 'taper', label: 'Toppningsmål & kommande planering', description: 'Individuella A/B/C-mål, tränarens målnoteringar och gruppens planering 28 dagar framåt. Inte bekräftat genomförande.', sensitive: true },
  { key: 'goals', label: 'Mål & utvecklingssamtal', description: 'Träningsmål, utvecklingsmål, simmarens svar och överenskommelser.', sensitive: true },
  { key: 'comments', label: 'Simmarens kommentarer', description: 'Fritext från incheckningar, dagbok och träningsloggar.', sensitive: true },
  { key: 'coachNotes', label: 'Tränarnas anteckningar', description: 'Individuella anteckningar, formobservationer och samtalsanteckningar.', sensitive: true },
  { key: 'health', label: 'Sömn & sjukdomskoll', description: 'Sömnrapporter, sjukdomskoll och registrerad sjukfrånvaro.', sensitive: true },
])
export const SWIMMER_ASSISTANT_DEFAULTS = SWIMMER_ASSISTANT_CATEGORIES.filter(item => item.default).map(item => item.key)
export const SWIMMER_ASSISTANT_PERIODS = [['28', '28 dagar'], ['90', '90 dagar'], ['365', '1 år'], ['all', 'All sparad historik']]
export const canUseSwimmerAssistant = role => ['head_coach', 'superadmin'].includes(role)

// Deliberate server allowlist, not an arbitrary model ID supplied by the client.
export const SWIMMER_ASSISTANT_MODELS = [
  ['gpt-4o-mini', 'GPT-4o mini · äldre modell'],
  ['gpt-4.1-mini', 'GPT-4.1 mini'],
  ['gpt-4.1', 'GPT-4.1'],
  ['gpt-6.1-sol', 'GPT-6.1 Sol'],
]
export function resolveSwimmerAssistantModel(value, configuredDefault) {
  if (value == null || value === 'default') return configuredDefault
  if (!SWIMMER_ASSISTANT_MODELS.some(([id]) => id === value)) throw Object.assign(new Error('Välj en tillåten språkmodell.'), { status: 400 })
  return value
}
export const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value)).length
// The server measures the fixed request envelope (empty input content). Include
// JSON escaping of the nested content string, not just the raw context bytes.
export function swimmerAssistantRequestBytes(context, history, question, envelopeBytes) {
  return envelopeBytes + jsonBytes(JSON.stringify({ context, history, question: question.trim() })) - 2
}
export const formatAssistantBytes = bytes => Number.isFinite(bytes) ? bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} kB` : 'Saknas'

export function validateSwimmerAssistantSelection(body, today) {
  const allowed = SWIMMER_ASSISTANT_CATEGORIES.map(item => item.key)
  if (!Array.isArray(body.categories) || !body.categories.length || body.categories.length > allowed.length || body.categories.some(key => !allowed.includes(key))) throw Object.assign(new Error('Välj minst en giltig datakategori.'), { status: 400 })
  const categories = allowed.filter(key => body.categories.includes(key))
  const period = String(body.period || '')
  if (!SWIMMER_ASSISTANT_PERIODS.some(([key]) => key === period)) throw Object.assign(new Error('Välj en giltig historikperiod.'), { status: 400 })
  const start = period === 'all' ? '1900-01-01' : new Date(Date.parse(`${today}T12:00:00Z`) - (Number(period) - 1) * 86400000).toISOString().slice(0, 10)
  return { categories, period, start, end: today }
}
