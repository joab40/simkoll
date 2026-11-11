import { buildCoachControlPanel } from './coach-control-panel.js'
import { coachWeekAddDays } from './coach-week.js'

// Product thresholds for readable comparisons, not medical cut-offs.
export const COACH_COMPARISON_RULES = { minAnswers: 3, minLoadCoverage: .8, maxLoadCoverageGap: .1 }
const change = (current, previous, reason = '') => ({ current, previous,
  delta: !reason && current != null && previous != null ? Math.round((current - previous) * 10) / 10 : null,
  reason: reason || (current == null || previous == null ? 'Jämförelseunderlag saknas' : ''),
})

export function buildCoachMetricComparison(profiles, responses, { start, end, sleepRecords = [], illnessRecords = [], sleepError = false, illnessError = false, future = false }) {
  const previousStart = coachWeekAddDays(start, -7), previousEnd = coachWeekAddDays(end, -7)
  const current = buildCoachControlPanel(profiles, responses, end, sleepRecords, { periodStart: start, illnessRecords })
  const previous = buildCoachControlPanel(profiles, responses, previousEnd, sleepRecords, { periodStart: previousStart, illnessRecords })
  const coverage = report => report.completedPasses ? report.loadAnswers / report.completedPasses : 0
  const currentCoverage = coverage(current), previousCoverage = coverage(previous)
  const futureReason = future ? 'Kommande vecka – jämförelse saknas' : ''
  const loadReason = current.loadAnswers < COACH_COMPARISON_RULES.minAnswers || previous.loadAnswers < COACH_COMPARISON_RULES.minAnswers
    || currentCoverage < COACH_COMPARISON_RULES.minLoadCoverage || previousCoverage < COACH_COMPARISON_RULES.minLoadCoverage
    || Math.abs(currentCoverage - previousCoverage) > COACH_COMPARISON_RULES.maxLoadCoverageGap + 1e-9
    ? 'Otillräckligt jämförelseunderlag' : ''
  return { start, end, previousStart, previousEnd, current, previous,
    metrics: {
      passes: change(current.completedPasses, previous.completedPasses, futureReason),
      rpe: change(current.averageRpe, previous.averageRpe, futureReason || (Math.min(current.rpeAnswers, previous.rpeAnswers) < COACH_COMPARISON_RULES.minAnswers ? 'För få RPE-svar för jämförelse' : '')),
      load: { ...change(current.load, previous.load, futureReason || loadReason), currentCoverage, previousCoverage },
      illness: change(current.sickSwimmers, previous.sickSwimmers, futureReason || (illnessError ? 'Sjukdomsunderlaget är ofullständigt' : '')),
      sleep: change(current.sleep.averageMinutes, previous.sleep.averageMinutes, futureReason || (sleepError ? 'Sömnunderlaget kunde inte hämtas' : Math.min(current.sleep.nights, previous.sleep.nights) < COACH_COMPARISON_RULES.minAnswers ? 'För få sömnsvar för jämförelse' : '')),
    },
  }
}
