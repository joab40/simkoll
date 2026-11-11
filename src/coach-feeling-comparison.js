import { coachWeekAddDays } from '../shared/coach-week.js'
import { checkinDay } from './checkin-status.js'

// Match the overview: all valid feeling check-ins, not one answer per swimmer.
export function buildCoachFeelingComparison(responses, start, end) {
  const previousStart = coachWeekAddDays(start, -7), previousEnd = coachWeekAddDays(end, -7)
  const summarize = (from, to) => {
    const values = responses.filter(row => {
      const date = checkinDay(row)
      return date >= from && date <= to && Number.isInteger(row.feeling) && row.feeling >= 1 && row.feeling <= 5
    }).map(row => row.feeling)
    return { count: values.length, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
  }
  const current = summarize(start, end), previous = summarize(previousStart, previousEnd)
  const reason = Math.min(current.count, previous.count) < 3 ? 'För få känslosvar för jämförelse' : ''
  const delta = reason ? null : Math.round((current.average - previous.average) * 10) / 10
  return { start, end, previousStart, previousEnd, current, previous, metrics: { feeling: { delta, reason } } }
}
