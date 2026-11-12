import { coachWeekAddDays } from './coach-week.js'
import { sleepFollowUpReasons } from './coach-control-panel.js'

const DAY = 86400000
const labels = { unknown: 'Mer aktuellt underlag behövs', low: 'Tyngre träningskänsla', steady: 'Okej / blandad känsla', strong: 'Stark träningskänsla', max: 'Maxad rapporterad känsla' }
const stamp = value => Date.parse(value || '')

// A visual report summary, not measured fitness or a health clearance.
// Submission time AND activity date must be recent: backfilled old training
// never turns on a fresh effect. No weekly averages or workload thresholds.
export function buildTrainingEnergy({ responses = [], illness = [], sleep = [], illnessAvailable = true } = {}, now = new Date().toISOString()) {
  const end = stamp(now)
  if (!Number.isFinite(end)) throw new Error('Ogiltig tid för träningskänsla.')
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(end))
  const yesterday = coachWeekAddDays(today, -1)
  const fresh = (time, day) => Number.isFinite(stamp(time)) && stamp(time) <= end && stamp(time) > end - DAY && day >= yesterday && day <= today
  const latest = rows => rows.slice().sort((a, b) => stamp(b.at) - stamp(a.at))[0] || null
  const select = (key, onlySwim = false) => latest(responses.filter(row => fresh(row.createdAt, row.date) && Number.isInteger(row[key]) && row[key] >= 1 && row[key] <= 5
    && (!onlySwim || (row.type === 'after' && row.activityType === 'swim' && row.competition !== true && row.plannedCompletion !== 'no')))
    .map(row => ({ value: row[key], at: row.createdAt, day: row.date })))
  const metrics = { body: select('body'), feeling: select('feeling'), speed: select('speedFeeling', true) }
  const answers = illness.filter(row => row.activity_date >= yesterday && row.activity_date <= today)
    .slice().sort((a, b) => b.activity_date.localeCompare(a.activity_date) || stamp(b.updated_at) - stamp(a.updated_at))
  const currentIllness = answers[0]
  const clear = illnessAvailable && currentIllness && !currentIllness.skipped && currentIllness.status === 'none' && fresh(currentIllness.updated_at, currentIllness.activity_date)
  const signals = []
  if (!clear) signals.push(currentIllness && !currentIllness.skipped && ['mild', 'sick'].includes(currentIllness.status) ? 'Aktuella sjukdomskänningar – glöd och maxeffekt är pausade.' : 'Ett färskt, uttryckligt Nej i sjukdomskollen behövs för glöd och maxeffekt.')
  const nights = [...new Map(sleep.filter(row => row.activity_date >= coachWeekAddDays(today, -6) && row.activity_date <= today && !row.skipped && Number.isFinite(row.minutes) && row.minutes >= 0 && row.minutes <= 840 && [1, 3, 5].includes(row.quality)).map(row => [row.activity_date, row])).values()]
  signals.push(...sleepFollowUpReasons(nights, today))
  if (responses.some(row => row.type === 'sick' && fresh(row.createdAt, row.date))) signals.push('Sjukdom rapporterad senaste dygnet – effekten är pausad.')
  const values = Object.values(metrics)
  const complete = values.every(Boolean)
  const level = !complete ? 'unknown' : values.some(row => row.value < 3) ? 'low' : values.every(row => row.value === 5) ? 'max' : values.every(row => row.value >= 4) ? 'strong' : 'steady'
  const effect = !signals.length && ['strong', 'max'].includes(level) ? level : 'none'
  const times = values.filter(Boolean).map(row => stamp(row.at) + DAY)
  if (clear) times.push(stamp(currentIllness.updated_at) + DAY)
  return { level, label: labels[level], effect, metrics, signals, sleepKnown: nights.length > 0, assessedAt: new Date(end).toISOString(),
    validUntil: times.length ? new Date(Math.min(...times)).toISOString() : new Date(end).toISOString() }
}

export function currentTrainingEnergy(energy, now = Date.now()) {
  if (!energy || !Number.isFinite(stamp(energy.validUntil)) || now >= stamp(energy.validUntil)) return { level: 'unknown', label: labels.unknown, effect: 'none', metrics: {}, signals: ['Underlaget har blivit äldre än 24 timmar. Uppdatera trafikljus för nya svar.'] }
  return energy
}
