import { comparableSwimTimes } from './swim-times.js'
import { summarizeDiaryConnections } from './training-diary.js'

// Descriptive evidence only: no development score or inferred goal completion.
export function summarizeSwimmerDevelopment({ entries = [], days = [], raceResults = [], goals = [], times = [], range }) {
  const inside = (date) => date >= range.start && date <= range.end
  const selected = entries.filter((entry) => inside(entry.date))
  const completed = selected.filter((entry) => entry.state === 'completed')
  const ownTimes = times.filter((row) => inside(row.result_date))
  const results = raceResults.filter((row) => inside(row.date))
  const training = completed.filter((entry) => !['competition', 'rest', 'sick', 'reflection'].includes(entry.type))
  const strength = completed.filter((entry) => entry.type === 'strength')
  const reflections = selected.filter((entry) => entry.reflection?.whatWorked?.trim() || entry.reflection?.nextTime?.trim())
  const comparisons = comparableSwimTimes(ownTimes).flatMap((group) => {
    const firstDate = group.items[0].result_date, lastDate = group.items.at(-1).result_date
    if (firstDate === lastDate) return []
    const first = Math.min(...group.items.filter((row) => row.result_date === firstDate).map((row) => row.result_time))
    const latest = Math.min(...group.items.filter((row) => row.result_date === lastDate).map((row) => row.result_time))
    return [{ description: group.description, first, latest, firstDate, lastDate, difference: latest - first }]
  }).sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  const weeks = summarizeDiaryConnections(days.filter((day) => inside(day.date)), raceResults).map((week) => ({
    ...week,
    swimSessions: completed.filter((entry) => entry.type === 'swim' && entry.date >= week.start && entry.date <= week.end).length,
    strengthSessions: strength.filter((entry) => entry.date >= week.start && entry.date <= week.end).length,
    ownTimes: ownTimes.filter((row) => row.result_date >= week.start && row.result_date <= week.end),
  }))
  return {
    swimSessions: completed.filter((entry) => entry.type === 'swim').length,
    strengthSessions: strength.length,
    strengthLogCount: strength.reduce((sum, entry) => sum + (entry.strengthLogs || []).length, 0),
    trainingDays: new Set(training.map((entry) => entry.date)).size,
    reflectionCount: reflections.length,
    // Current status is not a historical measure of work done in this period.
    activeGoals: goals.filter((goal) => ['planned', 'active', 'paused'].includes(goal.status)),
    ownTimes, testCount: ownTimes.filter((row) => row.kind === 'test').length,
    results, comparisons, weeks,
  }
}
