import { supabaseRequest } from './supabase.js'
import { swimWorkoutOptions } from '../shared/swim-workout-options.js'

export async function loadWorkoutChoices(date, trainingGroup) {
  const results = await Promise.all([
    supabaseRequest(`daily_workouts?workout_date=eq.${date}&select=id,workout_date,title,focus,distance_meters,duration_minutes,time_of_day,target_groups,alternative_group_id&limit=200`),
    supabaseRequest(`training_plans?plan_date=eq.${date}&activity_type=eq.swim&select=id,plan_date,title,focus,distance_meters,duration_minutes,time_of_day,target_groups,source_workout_id,calendar_link,alternative_group_id&limit=200`),
  ])
  if (results.some((result) => !result.ok)) throw new Error('Passalternativen kunde inte hämtas. Försök igen.')
  const [workouts, plans] = await Promise.all(results.map((result) => result.json()))
  const map = (row) => ({ id: row.id, date: row.workout_date || row.plan_date, title: row.title, focus: row.focus || '', distanceMeters: row.distance_meters, durationMinutes: row.duration_minutes, timeOfDay: row.time_of_day || '', targetGroups: row.target_groups || [], alternativeGroupId: row.alternative_group_id || null })
  return swimWorkoutOptions(workouts.map(map), plans.map((row) => ({ ...map(row), activityType: 'swim', sourceWorkoutId: row.source_workout_id, calendarLink: row.calendar_link }))).filter((item) => !item.targetGroups.length || (trainingGroup && item.targetGroups.includes(trainingGroup)))
}
