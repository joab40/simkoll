import { responseDay } from './individual-analysis.js'

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length
const rounded = (value) => Math.round(value * 100) / 100
const direction = (change, threshold) => change >= threshold - 1e-9 ? 'up' : change <= -threshold + 1e-9 ? 'down' : 'steady'
const day = (value) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(value))
const days = (from, to) => Math.max(1, Math.round((Date.parse(`${day(to)}T12:00:00Z`) - Date.parse(`${day(from)}T12:00:00Z`)) / 86400000))

export function buildSwimmerTrend({ currentResponses, previousResponses, currentSessions, previousSessions, start, end, previousStart, previousEnd, truncated = false }) {
  const summarize = (rows) => ({ responses: rows.length, metrics: Object.fromEntries(['feeling', 'body'].map((key) => {
    const buckets = new Map()
    rows.filter((row) => Number.isFinite(row[key]) && row[key] >= 1 && row[key] <= 5).forEach((row) => { const date = responseDay(row); buckets.set(date, [...(buckets.get(date) || []), row[key]]) })
    return [key, { value: !truncated && buckets.size >= 3 ? rounded(mean([...buckets.values()].map(mean))) : null, days: buckets.size }]
  })) })
  const current = summarize(currentResponses), previous = summarize(previousResponses)
  const changes = Object.fromEntries(['feeling', 'body'].map((key) => [key, current.metrics[key].value != null && previous.metrics[key].value != null ? rounded(current.metrics[key].value - previous.metrics[key].value) : null]))
  let state = 'insufficient'
  if (changes.feeling != null && changes.body != null) {
    const feeling = direction(changes.feeling, .2), body = direction(changes.body, .2)
    state = feeling === 'up' && body === 'down' || feeling === 'down' && body === 'up' ? 'mixed' : feeling === 'down' || body === 'down' ? 'down' : feeling === 'up' || body === 'up' ? 'up' : 'steady'
  }
  const currentDays = days(start, end), previousDays = days(previousStart, previousEnd)
  const count = (rows) => new Set(rows.filter((row) => row.activity_type === 'swim').map((row) => `${row.session_date}|${row.session_slot || 'legacy'}`)).size
  const currentPasses = count(currentSessions), previousPasses = count(previousSessions)
  const rate = currentPasses / (currentDays / 7), previousRate = previousPasses / (previousDays / 7)
  return {
    state, current, previous, changes,
    periods: { start: day(start), end: day(end), previousStart: day(previousStart), previousEnd: day(previousEnd), currentDays, previousDays },
    continuity: { state: truncated || !(currentPasses + previousPasses) ? 'insufficient' : direction(rate - previousRate, .15), current: rounded(rate), previous: rounded(previousRate), currentPasses, previousPasses, swimmers: 1 },
    warnings: truncated ? ['Underlaget når hämtgränsen. Ingen riktning visas eftersom perioden kan vara ofullständig.'] : ['Riktningen beskriver skattad känsla och kropp, inte bevisad prestationsutveckling. Registrerade pass är inte automatiskt all genomförd träning.'],
  }
}
