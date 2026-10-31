// Product follow-up rules, not age-adjusted sleep targets or medical cut-offs.
export const SHORT_SLEEP_MINUTES = 420
const dayBefore = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10)
const duration = (minutes) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
const validDay = (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day

export function shortSleepWarning(records, asOf) {
  if (!validDay(asOf)) return null
  const start = dayBefore(asOf, 6), dates = new Map()
  for (const row of records || []) {
    if (row && !row.skipped && validDay(row.activity_date) && row.activity_date >= start && row.activity_date <= asOf && Number.isFinite(row.minutes) && row.minutes >= 0 && row.minutes <= 840) dates.set(row.activity_date, row)
  }
  const nights = [...dates.values()].sort((a, b) => a.activity_date.localeCompare(b.activity_date))
  const short = nights.filter((row) => row.minutes <= SHORT_SLEEP_MINUTES), latest = nights.slice(-3)
  const level = short.length >= 5 ? 'red' : latest.length === 3 && latest.every((row) => row.minutes <= SHORT_SLEEP_MINUTES) ? 'amber' : null
  if (!level) return null
  const contributing = level === 'red' ? short : latest
  const averageMinutes = Math.round(contributing.reduce((sum, row) => sum + row.minutes, 0) / contributing.length)
  return {
    level, count: contributing.length, dates: contributing.map((row) => row.activity_date), averageMinutes,
    label: level === 'red' ? `Kort sovtid ${short.length} nätter senaste veckan · ${duration(averageMinutes)} i snitt dessa nätter` : `Kort sovtid senaste 3 nätterna · ${duration(averageMinutes)} i snitt`,
    detail: `${level === 'red' ? `${short.length} rapporterade nätter senaste sju dagarna` : 'De senaste tre rapporterade nätterna inom sju dagar'} har alla högst 7 timmars sömn. Underlag för samtal om sömn och återhämtning, inte en medicinsk bedömning. 7 timmar är en uppföljningsgräns, inte ett rekommenderat sömnmål.`,
  }
}
