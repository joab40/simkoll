import { supabaseRequest } from './supabase.js'
import { analyticsRows } from './analytics-rows.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { buildFormKollen } from '../shared/form-kollen.js'
import { trainingHeartAfterReports } from '../shared/training-heart.js'
import { canEstimateTrainingTime, withLinkedTrainingAmounts } from '../shared/linked-training-amounts.js'
import { missingIllnessTable } from './daily-illness.js'

export async function loadFormKollen(profile, asOf, read = supabaseRequest) {
  const start = coachWeekAddDays(asOf, -41), scope = `profile_id=eq.${encodeURIComponent(profile.id)}`
  const dates = field => `${field}=gte.${start}&${field}=lte.${asOf}`
  const rows = async (query, optionalIllness = false) => {
    const result = await analyticsRows(query, read)
    if (optionalIllness && !result.ok && await missingIllnessTable(result)) return null
    if (!result.ok || result.truncated) throw new Error('Formkollens underlag kunde inte hämtas fullständigt. Försök igen.')
    return result.json()
  }
  const [responses, sleep, illness] = await Promise.all([
    rows(`responses?${scope}&${dates('activity_date')}&select=id,activity_date,created_at,day_type,body,feeling,rpe,activity_minutes,speed_feeling,activity_type,session_slot,competition,planned_completion,workout_reference&order=activity_date.asc,id.asc`),
    rows(`profile_daily_sleep?${scope}&${dates('activity_date')}&select=activity_date,minutes,quality,skipped&order=activity_date.asc`),
    rows(`profile_daily_illness?${scope}&${dates('activity_date')}&select=activity_date,status,skipped&order=activity_date.asc`, true),
  ])
  const normalized = responses.map(row => ({ id: row.id, date: row.activity_date, createdAt: row.created_at, type: row.day_type, body: row.body, feeling: row.feeling, rpe: row.rpe, activityMinutes: row.activity_minutes, speedFeeling: row.speed_feeling, activityType: row.activity_type, trainingSlot: row.session_slot, competition: row.competition === true, plannedCompletion: row.planned_completion, workoutReference: row.workout_reference }))
  const estimates = trainingHeartAfterReports(normalized).some(canEstimateTrainingTime)
  const [workouts, plans] = estimates ? await Promise.all([
    rows(`daily_workouts?${dates('workout_date')}&select=id,workout_date,distance_meters,duration_minutes,time_of_day,target_groups&order=workout_date.asc,id.asc`),
    rows(`training_plans?activity_type=eq.swim&${dates('plan_date')}&select=id,plan_date,activity_type,distance_meters,duration_minutes,time_of_day,target_groups,source_workout_id,calendar_link&order=plan_date.asc,id.asc`),
  ]) : [[], []]
  const enriched = withLinkedTrainingAmounts(normalized, { workouts, plans, trainingGroup: profile.training_group, asOf })
  return { profileId: profile.id, ...buildFormKollen({ responses: enriched, sleep, illness: illness || [], illnessAvailable: illness !== null }, asOf) }
}
