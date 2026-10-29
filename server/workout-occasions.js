import { supabaseRequest } from './supabase.js'
import { groupSwimOccasions, swimWorkoutOptions } from '../shared/swim-workout-options.js'

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error }

export async function loadWorkoutOccasions(date) {
  const results = await Promise.all([
    supabaseRequest(`daily_workouts?workout_date=eq.${date}&select=*&order=created_at.asc&limit=200`),
    supabaseRequest(`training_plans?plan_date=eq.${date}&activity_type=eq.swim&select=*&limit=200`),
  ])
  if (results.some((result) => !result.ok)) fail('Träningstillfällena kunde inte hämtas. Försök igen.', 503)
  const [workouts, plans] = await Promise.all(results.map((result) => result.json()))
  const map = (row) => ({ id: row.id, date, title: row.title, timeOfDay: row.time_of_day || '', targetGroups: row.target_groups || [], alternativeGroupId: row.alternative_group_id || null, distanceMeters: row.distance_meters, durationMinutes: row.duration_minutes })
  const options = swimWorkoutOptions(workouts.map(map), plans.map((row) => ({ ...map(row), activityType: 'swim', sourceWorkoutId: row.source_workout_id, calendarLink: row.calendar_link })))
  return { workouts, plans, occasions: groupSwimOccasions(options) }
}

export function workoutOccasionChoices(context, excludeId = '') {
  return context.occasions.flatMap((occasion) => {
    const published = occasion.items.filter((item) => item.workoutReference.startsWith('workout:') && item.id !== excludeId)
    if (!published.length) return []
    return [{ targetWorkoutId: published[0].id, titles: published.map((item) => item.title), timeOfDay: published[0].timeOfDay, time: occasion.time, location: occasion.location || '', targetGroups: [...new Set(published.flatMap((item) => item.targetGroups))], alternativeGroupId: published[0].alternativeGroupId }]
  })
}

export function prepareWorkoutOccasion(context, { targetId, workoutId, timeOfDay, targetGroups }) {
  if (workoutId && !context.workouts.some((row) => row.id === workoutId)) fail('Passet finns inte längre på den valda dagen. Hämta dagens pass igen.', 409)
  if (targetId === workoutId) fail('Välj ett annat pass som befintligt träningstillfälle.')
  const occasion = context.occasions.find((item) => item.items.some((option) => option.workoutReference === `workout:${targetId}`))
  const target = occasion?.items.find((option) => option.workoutReference === `workout:${targetId}`)
  if (!target) fail('Det valda passet finns inte längre på den här dagen. Välj träningstillfälle igen.', 409)
  if (!['morning', 'afternoon'].includes(timeOfDay)) fail('Välj morgon eller eftermiddag för det gemensamma träningstillfället.')
  if (target.timeOfDay && target.timeOfDay !== timeOfDay) fail('Passalternativen måste ha samma tid på dagen. Välj rätt träningstillfälle eller ändra tid.')
  const ids = new Set(occasion.items.filter((option) => option.workoutReference.startsWith('workout:')).map((option) => option.id))
  const members = context.workouts.filter((row) => ids.has(row.id))
  const groups = [...new Set(members.flatMap((row) => row.target_groups || []))]
  if (groups.length && !targetGroups.some((group) => groups.includes(group))) fail('Välj minst en grupp som också omfattas av det befintliga passet.')
  // An old, ungrouped workout supplies a stable ID even if two coaches attach
  // alternatives concurrently. Calendar-matched siblings are promoted together.
  return { groupId: target.alternativeGroupId || target.id, timeOfDay, members, calendarPlan: context.plans.find((plan) => plan.source_workout_id === targetId && plan.calendar_link?.mode === 'linked') || context.plans.find((plan) => ids.has(plan.source_workout_id) && plan.calendar_link?.mode === 'linked') || null }
}

export async function persistWorkoutOccasion(link) {
  const ids = link.members.map((row) => row.id)
  const alreadyGrouped = link.members.every((row) => row.alternative_group_id === link.groupId && row.time_of_day === link.timeOfDay)
  if (alreadyGrouped) return link.members
  const previousGroup = link.members[0].alternative_group_id
  const result = await supabaseRequest(`daily_workouts?id=in.(${ids.join(',')})&alternative_group_id=${previousGroup ? `eq.${previousGroup}` : 'is.null'}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ alternative_group_id: link.groupId, time_of_day: link.timeOfDay, updated_at: new Date().toISOString() }),
  })
  if (!result.ok) fail('Kopplingen kunde inte sparas. Kontrollera att databasuppdatering 107 är körd och försök igen.', 503)
  const rows = await result.json()
  if (rows.length !== ids.length) fail('Träningstillfället har ändrats av en annan tränare. Hämta och välj passet igen.', 409)
  return rows
}
