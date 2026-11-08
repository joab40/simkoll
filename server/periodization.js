import { analyticsRows } from './analytics-rows.js'
import { supabaseRequest } from './supabase.js'
import { buildDiaryEntries, diaryAddDays } from '../shared/training-diary.js'
import { buildPeriodization, periodizationRange } from '../shared/periodization.js'

export async function loadPeriodization(profile, today, read = supabaseRequest) {
  const { start, end } = periodizationRange(today)
  const within = field => `${field}=gte.${start}&${field}=lt.${diaryAddDays(end, 1)}`
  const owner = `profile_id=eq.${encodeURIComponent(profile.id)}`
  const queries = [
    `personal_training_sessions?${owner}&${within('session_date')}&select=id,session_date,session_slot,activity_type,source&order=session_date.asc,id.asc`,
    `responses?${owner}&${within('activity_date')}&select=id,activity_date,created_at,day_type,activity_type,session_slot,competition,planned_completion,workout_reference,activity_distance_meters,activity_minutes,rpe&order=activity_date.asc,created_at.asc,id.asc`,
    `daily_workouts?${within('workout_date')}&select=id,workout_date,title,focus,distance_meters,duration_minutes,time_of_day,target_groups&order=workout_date.asc,id.asc`,
    `training_plans?${within('plan_date')}&select=id,plan_date,source_workout_id,calendar_link,activity_type,title,focus,distance_meters,duration_minutes,time_of_day,target_groups&order=plan_date.asc,id.asc`,
    `session_attendance?${owner}&${within('attendance_date')}&present=eq.true&select=attendance_date,session_slot,present,marked_at&order=attendance_date.asc,session_slot.asc`,
  ]
  const results = await Promise.all(queries.map(query => analyticsRows(query, read)))
  if (results.some(result => !result.ok || result.truncated)) throw new Error('Hela periodiseringsunderlaget kunde inte hämtas. Försök igen; inga värden visas som noll vid hämtfel.')
  const [sessions, responses, workouts, plans, attendance] = await Promise.all(results.map(result => result.json()))
  const attendanceSessions = attendance.map(row => ({ id: `attendance-${row.attendance_date}-${row.session_slot}`, session_date: row.attendance_date, session_slot: row.session_slot, activity_type: 'swim', source: 'coach-attendance' }))
  const entries = buildDiaryEntries({ sessions: [...sessions, ...attendanceSessions], responses, workouts, plans, trainingGroup: profile.training_group, today })
  // Only aggregate swim data leaves this endpoint; no diary notes or raw answers.
  return { profileId: profile.id, ...buildPeriodization(entries, today) }
}
