import { coachWeekAddDays } from '../shared/coach-week.js'
import { checkinDay } from './checkin-status.js'
import { coachMetricDetails, COACH_RESPONSE_METRICS } from './coach-metric-details.js'

// Same all-answer population and value validation as the four cards and their
// drill-downs. The caller supplies the same group/anonymity scope for both weeks.
export function buildCoachCheckinComparison(responses, start, end) {
  const previousStart = coachWeekAddDays(start, -7), previousEnd = coachWeekAddDays(end, -7)
  const summarize = (from, to) => {
    const rows = responses.filter(row => {
      if (!row.activityDate && !Number.isFinite(Date.parse(row.createdAt))) return false
      const day = checkinDay(row)
      return day >= from && day <= to
    })
    return Object.fromEntries(Object.keys(COACH_RESPONSE_METRICS).map(key => {
      const { entries } = coachMetricDetails(key, rows)
      return [key, { count: entries.length, average: entries.length ? entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length : null }]
    }))
  }
  const current = summarize(start, end), previous = summarize(previousStart, previousEnd)
  const metrics = Object.fromEntries(Object.keys(COACH_RESPONSE_METRICS).map(key => {
    const reason = Math.min(current[key].count, previous[key].count) < 3 ? 'För få svar för jämförelse' : ''
    return [key, { delta: reason ? null : Math.round((current[key].average - previous[key].average) * 10) / 10, reason }]
  }))
  return { start, end, previousStart, previousEnd, current, previous, metrics }
}
