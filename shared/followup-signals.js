import { coachWeekAddDays } from './coach-week.js'
import { illnessDays, validIllnessDay } from './illness.js'

export const FOLLOWUP_RULES = 'Sju aktivitetsdagar, samma regler på simmarkortet och i kontrollpanelen. Rött: sjuk idag/igår; lite sjukdomskänningar minst tre dagar med ett aktuellt svar idag/igår; både kropp och dagskänsla 1–2/5 på samma minst tre olika dagar, varav en idag/igår; eller befintlig röd sömnsignal. Gult: övriga sjukdomssvar under veckan, låg kropp eller känsla, RPE 8–10 på minst två dagar eller gul sömnsignal. Flera svar samma dag räknas bara som en dag. Missad registrering av planerade pass är separat planeringsinformation, inte en hälsovarning. Produktregler för dialog – inte diagnos, sjukdomsprognos eller medicinska gränsvärden.'

// Callers provide already scoped sleep reasons. No workload threshold is used to
// infer illness; absence of an answer is not a declaration of good health.
export function followupSignals({ responses = [], illness = [], sleepReasons = [], sleepWarning, asOf }) {
  if (!validIllnessDay(asOf)) throw new Error('Ogiltigt datum för uppföljning.')
  const start = coachWeekAddDays(asOf, -6), fresh = coachWeekAddDays(asOf, -1)
  const date = row => String(row.date || row.activityDate || row.createdAt || '').slice(0, 10)
  const recent = responses.filter(row => validIllnessDay(date(row)) && date(row) >= start && date(row) <= asOf)
  const days = predicate => [...new Set(recent.filter(predicate).map(date))].sort()
  const low = value => Number.isFinite(value) && value >= 1 && value <= 2
  const body = days(row => low(row.body)), feeling = days(row => low(row.feeling))
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
  const persistent = both.length >= 3 && both.some(day => day >= fresh)
  const sleepRed = sleepWarning?.level === 'red' || sleepReasons.some(reason => reason !== sleepWarning?.label)
  const reasons = []
  if (currentPositive) reasons.push(`${currentPositive.status === 'sick' ? 'Känner sig sjuk' : 'Lite sjukdomskänningar'} · ${currentPositive.activity_date}`)
  else if (positives.length) reasons.push(`Sjukdomskänningar rapporterade ${positives.length} dagar senaste veckan (senast ${positives.at(-1).activity_date})`)
  if (current?.status === 'mild' && mild.length >= 3) reasons.push(`Lite sjukdomskänningar ${mild.length} olika dagar senaste veckan`)
  if (sick.length) reasons.push(`Sjukfrånvaro rapporterad ${sick.length} dagar senaste veckan`)
  if (body.length) reasons.push(`Låg kroppskänsla ${body.length} dagar senaste veckan`)
  if (feeling.length) reasons.push(`Låg känsla ${feeling.length} dagar senaste veckan`)
  if (persistent) reasons.push(`Både låg kropp och dagskänsla ${both.length} olika dagar, senast ${both.at(-1)}`)
  if (highRpe.length >= 2) reasons.push(`Hög ansträngning (RPE 8–10) ${highRpe.length} dagar senaste veckan`)
  reasons.push(...sleepReasons)
  return { color: illnessRed || persistent || sleepRed ? 'red' : reasons.length ? 'yellow' : 'green', reasons,
    illness: { latest, current: currentPositive, answeredDays: answers.length },
    days: { body, feeling, both, highRpe, sick }, hasData: recent.length > 0 || answers.length > 0 }
}
