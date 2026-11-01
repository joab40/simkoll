import { buildDiaryEntries } from './training-diary.js'
import { trainingHeartAfterReports } from './training-heart.js'
import { trainingLoad } from './training-load.js'

export const canEstimateTrainingTime = row => row.type === 'after' && row.competition !== true && row.activityType === 'swim' && ['morning_swim', 'afternoon_swim'].includes(row.trainingSlot) && !['partial', 'no'].includes(row.plannedCompletion) && row.activityMinutes == null

function missingTimeIssue(row, entry) {
  if (row.activityMinutes != null) return 'invalid-reported-time'
  if (!['swim', 'strength', 'dryland', 'cycling', 'other'].includes(row.activityType)) return 'activity-missing'
  if (row.plannedCompletion === 'partial') return 'partial-time-missing'
  if (row.activityType !== 'swim') return 'reported-time-missing'
  if (!['morning_swim', 'afternoon_swim'].includes(row.trainingSlot)) return 'slot-missing'
  if (entry?.timeLinkIssue) return entry.timeLinkIssue
  if (entry?.linked) return entry.plannedMinutes == null ? 'planned-time-missing' : 'invalid-planned-time'
  return 'no-plan'
}

// Read-time recovery, not a backfill. Use the diary's existing date/group/slot/
// chosen-workout matcher and its full/partial rules. No sums of alternatives.
export function withLinkedTrainingAmounts(responses, { workouts = [], plans = [], trainingGroup, asOf }) {
  const latest = trainingHeartAfterReports(responses)
  const candidates = latest.filter(canEstimateTrainingTime)
  const selected = new Set(latest)
  const raw = latest.map(row => ({ id: row.id, created_at: row.createdAt, activity_date: row.date, day_type: row.type, competition: row.competition, activity_type: row.activityType, session_slot: row.trainingSlot, planned_completion: row.plannedCompletion, workout_reference: row.workoutReference, activity_minutes: row.activityMinutes, rpe: row.rpe }))
  const entries = candidates.length ? buildDiaryEntries({ responses: raw, workouts, plans, trainingGroup, today: asOf }) : []
  const linkedEntries = new Map(entries.filter(entry => entry.type === 'swim').map(entry => [`${entry.date}|${entry.slot}`, entry]))
  const byKey = new Map(entries.filter(entry => entry.type === 'swim' && entry.state === 'completed' && (entry.linked || entry.timeLinked) && !entry.partial && entry.estimatedMinutes >= 1 && entry.estimatedMinutes <= 1440).map(entry => [`${entry.date}|${entry.slot}`, entry]))
  const estimates = new Map(candidates.flatMap(row => {
    const entry = byKey.get(`${row.date}|${row.trainingSlot}`)
    return entry ? [[row, { source: 'linked-plan', minutes: entry.estimatedMinutes }]] : []
  }))
  return responses.map(row => {
    if (!selected.has(row)) return row
    if (estimates.has(row)) return { ...row, linkedEstimate: estimates.get(row), timeIssue: null }
    if (trainingLoad(row.rpe, row.activityMinutes).minutes != null) return row
    const entry = linkedEntries.get(`${row.date}|${row.trainingSlot}`)
    return { ...row, timeIssue: missingTimeIssue(row, entry) }
  })
}
