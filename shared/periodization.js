import { diaryAddDays, diaryMonday, validDiaryDate } from './training-diary.js'
import { swimMeterDay } from './swim-meter-day.js'

const validRpe = value => Number.isFinite(value) && value >= 1 && value <= 10
const metersFor = entry => [entry.reportedMeters, entry.estimatedMeters].find(value => Number.isFinite(value) && value >= 0) ?? 0
const mean = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null
export function periodizationRange(today) {
  if (!validDiaryDate(today)) throw new Error('Ogiltigt datum för periodisering.')
  return { start: diaryAddDays(diaryMonday(today), -77), end: today }
}
export function isoWeek(date) {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 3 - (day.getUTCDay() + 6) % 7)
  const year = day.getUTCFullYear()
  return { year, week: Math.ceil(((day - new Date(Date.UTC(year, 0, 1, 12))) / 86400000 + 1) / 7) }
}

// Reuse diary linkage: alternatives are not added together and reported zero
// overrides a planned amount. Unknown distance is never silently made zero.
export function buildPeriodization(entries, today) {
  const range = periodizationRange(today), days = []
  for (let date = range.start; date <= today; date = diaryAddDays(date, 1)) {
    const selected = entries.filter(entry => entry.date === date)
    const swims = selected.filter(entry => entry.type === 'swim' && entry.state === 'completed')
    const meter = swimMeterDay(selected)
    const rpes = swims.map(entry => entry.rpe).filter(validRpe)
    days.push({ start: date, end: date, meters: meter.swimMetersPlot, source: meter.swimMeterPlotSource,
      estimated: swims.some(entry => entry.reportedMeters == null && entry.estimatedMeters != null),
      rpe: mean(rpes), rpeDays: rpes.length ? 1 : 0, rpeReports: rpes.length, swims: swims.length,
      knownMeters: swims.reduce((sum, entry) => sum + metersFor(entry), 0),
      unknownDays: meter.swimMetersPlot == null ? 1 : 0 })
  }
  const macro = Array.from({ length: 12 }, (_, index) => {
    const start = diaryAddDays(range.start, index * 7), weekDays = days.filter(day => day.start >= start && day.start <= diaryAddDays(start, 6))
    const unknownDays = weekDays.filter(day => day.meters == null).length
    return { start, end: weekDays.at(-1).end, ...isoWeek(start), ongoing: diaryAddDays(start, 6) > today,
      meters: unknownDays ? null : weekDays.reduce((sum, day) => sum + day.meters, 0),
      knownMeters: weekDays.reduce((sum, day) => sum + (day.meters ?? day.knownMeters), 0), unknownDays,
      estimated: weekDays.some(day => day.estimated), rpe: mean(weekDays.map(day => day.rpe).filter(validRpe)),
      rpeDays: weekDays.filter(day => day.rpe != null).length, rpeReports: weekDays.reduce((sum, day) => sum + day.rpeReports, 0), swims: weekDays.reduce((sum, day) => sum + day.swims, 0) }
  })
  return { asOf: today, range, macro, meso: days.slice(-28) }
}
