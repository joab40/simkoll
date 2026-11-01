import { buildDiaryEntries } from './training-diary.js'
import { trainingHeartAfterReports } from './training-heart.js'

export const canEstimateTrainingTime = row => row.type === 'after' && row.competition !== true && row.activityType === 'swim' && ['morning_swim', 'afternoon_swim'].includes(row.trainingSlot) && !['partial', 'no'].includes(row.plannedCompletion) && row.activityMinutes == null

// Read-time recovery, not a backfill. Use the diary's existing date/group/slot/
// chosen-workout matcher and its full/partial rules. No sums of alternatives.
export function withLinkedTrainingAmounts(responses, { workouts = [], plans = [], trainingGroup, asOf }) {
  const latest = trainingHeartAfterReports(responses)
  const candidates = latest.filter(canEstimateTrainingTime)
  if (!candidates.length) return responses
  const raw = latest.map(row => ({ id: row.id, created_at: row.createdAt, activity_date: row.date, day_type: row.type, competition: row.competition, activity_type: row.activityType, session_slot: row.trainingSlot, planned_completion: row.plannedCompletion, workout_reference: row.workoutReference, activity_minutes: row.activityMinutes, rpe: row.rpe }))
  const entries = buildDiaryEntries({ responses: raw, workouts, plans, trainingGroup, today: asOf })
  const byKey = new Map(entries.filter(entry => entry.type === 'swim' && entry.state === 'completed' && entry.linked && !entry.partial && entry.estimatedMinutes >= 1 && entry.estimatedMinutes <= 1440).map(entry => [`${entry.date}|${entry.slot}`, entry]))
  const estimates = new Map(candidates.flatMap(row => {
    const entry = byKey.get(`${row.date}|${row.trainingSlot}`)
    return entry ? [[row, { source: 'linked-plan', minutes: entry.estimatedMinutes }]] : []
  }))
  return responses.map(row => estimates.has(row) ? { ...row, linkedEstimate: estimates.get(row) } : row)
}
