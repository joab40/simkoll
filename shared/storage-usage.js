export const STORAGE_GB = 1000000000
export const storageBudgetInput = (bytes) => bytes == null ? '' : String(bytes / STORAGE_GB)
export function parseStorageBudget(value) {
  const input = String(value).trim().replace(',', '.')
  if (!input) return null
  if (!/^\d+(\.\d{1,6})?$/.test(input)) throw new Error('Ange budget i GB, till exempel 0,5 eller 10. Lämna tomt om gränsen är okänd.')
  const bytes = Math.round(Number(input) * STORAGE_GB)
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 1000000000000000) throw new Error('Budgeten måste vara större än 0 och högst 1 000 000 GB.')
  return bytes
}
export function storageBudgetState(used, budget, unknown = 0) {
  if (!Number.isFinite(used) || used < 0) return { level: 'unknown', percent: null, remaining: null }
  if (!(Number.isFinite(budget) && budget > 0)) return { level: 'unset', percent: null, remaining: null }
  const percent = used / budget * 100
  return { level: percent >= 90 ? 'danger' : percent >= 80 ? 'warning' : unknown ? 'unknown' : 'ok', percent,
    remaining: unknown ? null : Math.max(0, budget - used), over: Math.max(0, used - budget) }
}
export function storageBytes(value) {
  if (!Number.isFinite(Number(value)) || value == null || Number(value) < 0) return 'Uppgift saknas'
  const bytes = Number(value), units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB']
  const exponent = bytes > 0 ? Math.min(5, Math.floor(Math.log10(bytes) / 3)) : 0
  const index = Math.max(0, exponent)
  return `${(bytes / 1000 ** index).toLocaleString('sv-SE', { maximumFractionDigits: index ? 2 : 0 })} ${units[index]}`
}
export const STORAGE_BUCKET_NAMES = {
  'goal-analysis-videos': 'Utvecklingsmål · video och förhandsbilder',
  'goal-analysis-images': 'Utvecklingsmål · bilder',
  'strength-exercise-images': 'Styrkeövningar · bilder',
  'competition-pm': 'Tävlingsbilagor · PM',
}
export const STORAGE_KIND_NAMES = { video: 'Filmer', image: 'Bilder och förhandsbilder', document: 'Dokument', other: 'Övrigt / okänd filtyp' }
