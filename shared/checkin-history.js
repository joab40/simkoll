import { coachWeekAddDays } from './coach-week.js'
import { isTimeDate } from './swim-times.js'

export const isPastCheckinDay = (day, today) => isTimeDate(day) && day >= '1900-01-01' && day < today
export const validCheckinHistoryRange = (start, end, today) =>
  isPastCheckinDay(start, today) && isPastCheckinDay(end, today) && start <= end && end <= coachWeekAddDays(start, 30)

export const CHECKIN_EDIT_FIELDS = [
  ['feeling', 'feeling', 'Dagskänsla', 5],
  ['energy', 'energy', 'Energi', 5],
  ['body', 'body', 'Kroppskänsla', 5],
  ['motivation', 'motivation', 'Motivation', 5],
  ['sleep', 'sleep', 'Sömn i incheckningen', 5],
  ['rpe', 'rpe', 'Upplevd ansträngning (RPE)', 10],
  ['speedFeeling', 'speed_feeling', 'Fartkänsla', 5],
  ['temperature', 'temperature', 'Upplevd temperatur', 5],
  ['pass', 'pass_rating', 'Passbetyg', [1, 3, 5]],
  ['setup', 'setup_rating', 'Uppläggsbetyg', [1, 3, 5]],
]
export const checkinEditValues = limit => Array.isArray(limit) ? limit : Array.from({ length: limit }, (_, index) => index + 1)

export function checkinAnswerPatch(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null
  const edits = {}
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'comment' && typeof value === 'string' && value.length <= 300) {
      edits.comment = value.trim() || null
      continue
    }
    const field = CHECKIN_EDIT_FIELDS.find(([name]) => name === key)
    if (!field || !(checkinEditValues(field[3]).includes(value) || (key !== 'feeling' && value === null))) return null
    edits[field[1]] = value
  }
  return Object.keys(edits).length ? edits : null
}

export function historicalCheckinKey({ type, competition, activityType, trainingSlot, personalSessionId }) {
  if (type === 'rest' || type === 'sick') return 'day-status'
  if (type !== 'after') return null
  if (personalSessionId) return `personal:${personalSessionId}`
  if (competition === true) return 'competition'
  return !activityType || activityType === 'swim' ? trainingSlot : activityType
}

export function alreadyReportedCheckin(rows, form) {
  const activityKey = historicalCheckinKey(form)
  return rows.some(row => historicalCheckinKey({
    type: row.day_type, competition: row.competition, activityType: row.activity_type,
    trainingSlot: row.session_slot, personalSessionId: row.personal_session_id,
  }) === activityKey)
}
