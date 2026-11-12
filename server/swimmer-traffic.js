import { supabaseRequest } from './supabase.js'
import { analyticsRows } from './analytics-rows.js'
import { coachWeekAddDays } from '../shared/coach-week.js'
import { buildSwimmerTraffic, validTrafficDay } from '../shared/swimmer-traffic.js'
import { trainingHeartAfterReports } from '../shared/training-heart.js'
import { canEstimateTrainingTime, withLinkedTrainingAmounts } from '../shared/linked-training-amounts.js'
import { missingIllnessTable } from './daily-illness.js'

export async function loadSwimmerTraffic(asOf, read = supabaseRequest) {
  if (!validTrafficDay(asOf)) throw new Error('Ogiltigt datum för trafikljus.')
  const start = coachWeekAddDays(asOf, -13)
  const dated = (field, from = start) => `${field}=gte.${from}&${field}=lte.${asOf}`
  const rows = async query => {
    const result = await analyticsRows(query, read)
    if (!result.ok || result.truncated) throw new Error('Trafikljusunderlaget kunde inte hämtas fullständigt. Försök igen.')
    return result.json()
  }
  const illnessResult = async () => {
    const result = await analyticsRows(`profile_daily_illness?${dated('activity_date')}&select=profile_id,activity_date,status,skipped&order=activity_date.asc,profile_id.asc`, read)
    if (!result.ok && await missingIllnessTable(result)) return { records: [], available: false }
    if (!result.ok || result.truncated) throw new Error('Sjukdomsunderlaget kunde inte hämtas fullständigt. Försök igen.')
    return { records: await result.json(), available: true }
  }
  const [profiles, responses, sleep, sessions, plans, illness] = await Promise.all([
    rows('profiles?active=eq.true&approval_status=eq.approved&is_test_profile=eq.false&select=id,created_at,active,approval_status,is_test_profile,training_group&order=id.asc'),
    rows(`responses?profile_id=not.is.null&${dated('activity_date', coachWeekAddDays(asOf, -20))}&select=id,profile_id,activity_date,created_at,day_type,body,feeling,rpe,activity_minutes,speed_feeling,activity_type,session_slot,competition,planned_completion,workout_reference&order=activity_date.asc,id.asc`),
    rows(`profile_daily_sleep?${dated('activity_date')}&select=profile_id,activity_date,minutes,quality,skipped&order=activity_date.asc,profile_id.asc`),
    rows(`personal_training_sessions?${dated('session_date')}&select=profile_id,session_date,session_slot&order=session_date.asc,id.asc`),
    rows(`planned_training_sessions?${dated('planned_date')}&select=profile_id,planned_date,session_slot&order=planned_date.asc,id.asc`),
    illnessResult(),
  ])
  const eligibleIds = new Set(profiles.map(row => row.id))
  const own = new Map()
  for (const row of responses) {
    if (!eligibleIds.has(row.profile_id)) continue
    if (!own.has(row.profile_id)) own.set(row.profile_id, [])
    own.get(row.profile_id).push({ id: row.id, profileId: row.profile_id, date: row.activity_date, createdAt: row.created_at, type: row.day_type, body: row.body, feeling: row.feeling, rpe: row.rpe, activityMinutes: row.activity_minutes, speedFeeling: row.speed_feeling, activityType: row.activity_type, trainingSlot: row.session_slot, competition: row.competition === true, plannedCompletion: row.planned_completion, workoutReference: row.workout_reference })
  }
  const needsEstimates = [...own.values()].some(reports => trainingHeartAfterReports(reports.filter(row => row.date >= start)).some(canEstimateTrainingTime))
  const [workouts, trainingPlans] = needsEstimates ? await Promise.all([
    rows(`daily_workouts?${dated('workout_date')}&select=id,workout_date,distance_meters,duration_minutes,time_of_day,target_groups&order=workout_date.asc,id.asc`),
    rows(`training_plans?activity_type=eq.swim&${dated('plan_date')}&select=id,plan_date,activity_type,distance_meters,duration_minutes,time_of_day,target_groups,source_workout_id,calendar_link&order=plan_date.asc,id.asc`),
  ]) : [[], []]
  const linkedPlans = trainingPlans.map(row => ({ ...row, calendar_link: row.calendar_link || { mode: row.calendar_mode, detachedWorkoutId: row.detached_workout_id } }))
  const enriched = profiles.flatMap(profile => withLinkedTrainingAmounts(own.get(profile.id) || [], { workouts, plans: linkedPlans, trainingGroup: profile.training_group, asOf }))
  return buildSwimmerTraffic(profiles.map(row => ({ id: row.id, createdAt: row.created_at, active: row.active, approvalStatus: row.approval_status, isTestProfile: row.is_test_profile })), {
    responses: enriched,
    sleep,
    illness: illness.records, illnessAvailable: illness.available,
    sessions: sessions.map(row => ({ profileId: row.profile_id, date: row.session_date, slot: row.session_slot })),
    plans: plans.map(row => ({ profileId: row.profile_id, date: row.planned_date, slot: row.session_slot })),
  }, asOf)
}
