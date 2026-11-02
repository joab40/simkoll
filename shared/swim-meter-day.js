const valid = value => Number.isFinite(value) && value >= 0

// Zero is no registered swim, never an unknown distance of a completed swim.
export function swimMeterDay(entries) {
  const swims = entries.filter(entry => entry.state === 'completed' && entry.type === 'swim')
  if (entries.some(entry => (entry.type === 'unknown' && entry.state !== 'planned') || (entry.type === 'swim' && entry.state === 'feedback'))) return { swimMetersPlot: null, swimMeterPlotSource: 'Aktivitet eller passkoppling är okänd' }
  if (!swims.length) return { swimMetersPlot: 0, swimMeterPlotSource: 'Ingen registrerad simning' }
  const amounts = swims.map(entry => valid(entry.reportedMeters) ? { value: entry.reportedMeters, source: 'reported' } : valid(entry.estimatedMeters) ? { value: entry.estimatedMeters, source: 'planned' } : null)
  if (amounts.some(value => value == null)) return { swimMetersPlot: null, swimMeterPlotSource: 'Registrerad simning · distans saknas för minst ett pass' }
  const sources = new Set(amounts.map(value => value.source))
  return { swimMetersPlot: amounts.reduce((sum, value) => sum + value.value, 0), swimMeterPlotSource: sources.size > 1 ? 'Rapporterat + uppskattat från planering' : sources.has('reported') ? 'Rapporterat' : 'Uppskattat från kopplat simpass' }
}

export function swimMeterCalendar(entries, start, endExclusive, { complete = true } = {}) {
  const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
  if (!validDay(start) || !validDay(endExclusive) || start >= endExclusive || Date.parse(endExclusive) - Date.parse(start) > 366 * 86400000) return []
  const byDay = new Map()
  for (const entry of entries) {
    if (!byDay.has(entry.date)) byDay.set(entry.date, [])
    byDay.get(entry.date).push(entry)
  }
  const days = []
  for (let date = start; date < endExclusive; date = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) days.push({ date, ...(complete ? swimMeterDay(byDay.get(date) || []) : { swimMetersPlot: null, swimMeterPlotSource: 'Ofullständigt mängdunderlag' }) })
  return days
}
