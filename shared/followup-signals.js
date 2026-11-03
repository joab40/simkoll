import { coachWeekAddDays } from './coach-week.js'
import { illnessDays, validIllnessDay } from './illness.js'
import { heavyTrainingPattern, HEAVY_PATTERN_RULE } from './heavy-training-pattern.js'

export const FOLLOWUP_RULES = `${HEAVY_PATTERN_RULE} Samma regler används på simmarkortet och i kontrollpanelen. Sjukdom/sömn använder sju dagar separat: sjuk idag/igår, minst tre dagar med lite sjukdomskänningar och aktuellt känningar-svar idag/igår, eller befintlig röd sömnsignal ger rött. Övriga sjukdomssvar, aktuella ettor, RPE 8–10 på minst två dagar eller gul sömnsignal ger gult. Missad registrering av planerade pass är separat planeringsinformation, inte hälsovarning. Ingen sjukdomsprognos görs.`

// Callers provide already scoped sleep reasons. No workload threshold is used to
// infer illness; absence of an answer is not a declaration of good health.
export function followupSignals({ responses = [], illness = [], sleepReasons = [], sleepWarning, asOf }) {
  if (!validIllnessDay(asOf)) throw new Error('Ogiltigt datum för uppföljning.')
  const start = coachWeekAddDays(asOf, -6), fresh = coachWeekAddDays(asOf, -1)
  const date = row => String(row.date || row.activityDate || row.createdAt || '').slice(0, 10)
  const recent = responses.filter(row => validIllnessDay(date(row)) && date(row) >= start && date(row) <= asOf)
  const days = predicate => [...new Set(recent.filter(predicate).map(date))].sort()
  const heavy = heavyTrainingPattern(responses, asOf)
  const body = heavy.body.dates, feeling = heavy.feeling.dates
  const both = body.filter(day => feeling.includes(day))
  const highRpe = days(row => row.type === 'after' && Number.isFinite(row.rpe) && row.rpe >= 8 && row.rpe <= 10)
  const sick = days(row => row.type === 'sick')
  const answers = illnessDays(illness, start, asOf), positives = answers.filter(row => row.status !== 'none')
  const latest = answers.at(-1) || null
  // A newer explicit 'Nej' stops an older mild answer being presented as current.
  const current = latest && latest.activity_date >= fresh ? latest : null
  const currentPositive = current && current.status !== 'none' ? current : null
  const mild = answers.filter(row => row.status === 'mild')
  const illnessRed = sick.some(day => day >= fresh) || current?.status === 'sick' || (current?.status === 'mild' && mild.length >= 3)
  const persistent = heavy.persistent
  const sleepRed = sleepWarning?.level === 'red' || sleepReasons.some(reason => reason !== sleepWarning?.label)
  const reasons = []
  if (currentPositive) reasons.push(`${currentPositive.status === 'sick' ? 'Känner sig sjuk' : 'Lite sjukdomskänningar'} · ${currentPositive.activity_date}`)
  else if (positives.length) reasons.push(`Sjukdomskänningar rapporterade ${positives.length} dagar senaste veckan (senast ${positives.at(-1).activity_date})`)
  if (current?.status === 'mild' && mild.length >= 3) reasons.push(`Lite sjukdomskänningar ${mild.length} olika dagar senaste veckan`)
  if (sick.length) reasons.push(`Sjukfrånvaro rapporterad ${sick.length} dagar senaste veckan`)
  if (body.some(day => day >= start)) reasons.push(`Tung kropp (1/5) ${body.length} ${body.length === 1 ? 'dag' : 'olika dagar'} under 14 dagar${heavy.body.persistent ? ' · ihållande mönster' : ''}`)
  if (feeling.some(day => day >= start)) reasons.push(`Tung dagskänsla (1/5) ${feeling.length} ${feeling.length === 1 ? 'dag' : 'olika dagar'} under 14 dagar${heavy.feeling.persistent ? ' · ihållande mönster' : ''}`)
  if (highRpe.length >= 2) reasons.push(`Hög ansträngning (RPE 8–10) ${highRpe.length} dagar senaste veckan`)
  reasons.push(...sleepReasons)
  return { color: illnessRed || persistent || sleepRed ? 'red' : reasons.length ? 'yellow' : 'green', reasons,
    illness: { latest, current: currentPositive, answeredDays: answers.length },
    days: { body, feeling, both, highRpe, sick }, heavy, hasData: recent.length > 0 || answers.length > 0 }
}
