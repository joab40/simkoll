import { supabaseRequest } from './supabase.js'
import { groupSwimOccasions, swimWorkoutOptions } from '../shared/swim-workout-options.js'
import { calendarActivityKey, calendarFormValues, calendarLinkKeys } from '../shared/planning-calendar.js'
import { createHash } from 'node:crypto'

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error }

export async function loadWorkoutOccasions(date, { calendarActivities = [] } = {}) {
  const results = await Promise.all([
    supabaseRequest(`daily_workouts?workout_date=eq.${date}&select=*&order=created_at.asc&limit=200`),
    supabaseRequest(`training_plans?plan_date=eq.${date}&activity_type=eq.swim&select=*&limit=200`),
  ])
  if (results.some((result) => !result.ok)) fail('Träningstillfällena kunde inte hämtas. Försök igen.', 503)
  const [workouts, plans] = await Promise.all(results.map((result) => result.json()))
  if (workouts.length >= 200 || plans.length >= 200) fail('Dagens träningar är för många för en säker koppling. Begränsa planeringen och försök igen.', 503)
  const map = row => {
    const clock = row.calendar_link?.mode === 'linked' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.calendar_link.time || '') && row.calendar_link.time !== '00:00' ? row.calendar_link.time : ''
    return { id: row.id, date, title: row.title, timeOfDay: clock ? Number(clock.slice(0, 2)) < 12 ? 'morning' : 'afternoon' : ['morning', 'afternoon'].includes(row.time_of_day) ? row.time_of_day : '', time: clock, location: row.location || row.calendar_link?.location || '', targetGroups: row.target_groups || [], alternativeGroupId: row.alternative_group_id || null, distanceMeters: row.distance_meters, durationMinutes: row.duration_minutes }
  }
  const availablePlans = plans.filter(row => !row.source_workout_id || workouts.some(workout => workout.id === row.source_workout_id))
  const options = swimWorkoutOptions(workouts.map(map), availablePlans.map((row) => ({ ...map(row), activityType: 'swim', sourceWorkoutId: row.source_workout_id, calendarLink: row.calendar_link })))
  const occasions = groupSwimOccasions(options)
  // Only clearly named, timed swim training is eligible, not camps, meets,
  // registration deadlines, gym/land training or untimed calendar notices.
  const calendar = calendarActivities.filter(item => item.date === date && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time || '') && item.time !== '00:00' && /sim|träning|traning|training|swim/i.test(item.title || '') && !/styrk|landträ|landtra|tävling|tavling|anmäl|anmal|läger|lager|möte|mote/i.test(item.title || ''))
  const calendarOccasions = groupSwimOccasions(calendar.map(item => ({ ...item, activityType: 'swim', workoutReference: `calendar:${calendarActivityKey(item)}` }))).map(occasion => ({ ...occasion, values: calendarFormValues(occasion.items) }))
  const represented = new Set(plans.flatMap(plan => calendarLinkKeys(plan.calendar_link)))
  const unmatchedCalendar = calendarOccasions.filter(occasion => !occasion.items.some(item => represented.has(calendarActivityKey(item))) && !occasions.some(known => known.time === occasion.time && known.location && known.location.trim().toLowerCase() === occasion.location?.trim().toLowerCase()))
  return { workouts, plans, occasions, calendarOccasions: unmatchedCalendar }
}

export function workoutOccasionChoices(context, excludeId = '', includePlanning = false) {
  const choices = context.occasions.flatMap((occasion) => {
    const published = occasion.items.filter((item) => item.workoutReference.startsWith('workout:') && item.id !== excludeId)
    if (!published.length) {
      const manual = occasion.items.filter(item => item.workoutReference.startsWith('plan:'))
      if (!includePlanning || !manual.length) return []
      return [{ targetPlanId: manual[0].id, titles: manual.map(item => item.title || 'Planerad simträning'), timeOfDay: manual[0].timeOfDay, time: occasion.time, location: occasion.location || '', targetGroups: [...new Set(manual.flatMap(item => item.targetGroups))] }]
    }
    return [{ targetWorkoutId: published[0].id, titles: published.map((item) => item.title), timeOfDay: published[0].timeOfDay, time: occasion.time, location: occasion.location || '', targetGroups: [...new Set(published.flatMap((item) => item.targetGroups))], alternativeGroupId: published[0].alternativeGroupId }]
  })
  if (includePlanning) choices.push(...(context.calendarOccasions || []).map(occasion => ({ targetCalendarKey: calendarActivityKey(occasion.items[0]), titles: [...new Set(occasion.items.map(item => item.title))], timeOfDay: occasion.values.timeOfDay, time: occasion.time, location: occasion.location || '', targetGroups: occasion.values.targetGroups })))
  return choices.sort((a, b) => String(a.time || (a.timeOfDay === 'morning' ? '06:00' : '18:00')).localeCompare(String(b.time || (b.timeOfDay === 'morning' ? '06:00' : '18:00'))))
}

export function prepareWorkoutOccasion(context, { targetId, targetPlanId, targetCalendarKey, workoutId, timeOfDay, targetGroups }) {
  if ([targetId, targetPlanId, targetCalendarKey].filter(Boolean).length !== 1) fail('Välj exakt ett befintligt träningstillfälle.')
  if (workoutId && !context.workouts.some((row) => row.id === workoutId)) fail('Passet finns inte längre på den valda dagen. Hämta dagens pass igen.', 409)
  if (workoutId && targetId === workoutId) fail('Välj ett annat pass som befintligt träningstillfälle.')
  // A successful import can consume the previously empty planning row. Resolve
  // the same persisted target on retry instead of creating another occasion.
  const linkedPlan = targetPlanId ? context.plans.find(plan => plan.id === targetPlanId && plan.source_workout_id && !plan.calendar_link?.detachedWorkoutId) : targetCalendarKey ? context.plans.find(plan => plan.source_workout_id && !plan.calendar_link?.detachedWorkoutId && calendarLinkKeys(plan.calendar_link).includes(targetCalendarKey)) : null
  if (linkedPlan) return prepareWorkoutOccasion(context, { targetId: linkedPlan.source_workout_id, workoutId, timeOfDay, targetGroups })
  if (targetCalendarKey) {
    const occasion = context.calendarOccasions?.find(item => item.items.some(event => calendarActivityKey(event) === targetCalendarKey))
    if (!occasion) fail('Kalenderträningen finns inte längre på den här dagen. Välj träningstillfälle igen.', 409)
    const values = occasion.values
    if (timeOfDay !== values.timeOfDay) fail('Passalternativen måste ha samma tid på dagen som kalenderträningen.')
    if (values.targetGroups.length && !targetGroups.some(group => values.targetGroups.includes(group))) fail('Välj minst en grupp som omfattas av kalenderträningen.')
    const hash = createHash('sha256').update(calendarLinkKeys(values.calendarLink).sort().join('|')).digest('hex')
    const groupId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    return { groupId, timeOfDay, members: [], planIds: [], calendarPlan: { calendar_link: values.calendarLink, location: values.location } }
  }
  const reference = targetPlanId ? `plan:${targetPlanId}` : `workout:${targetId}`
  const occasion = context.occasions.find((item) => item.items.some((option) => option.workoutReference === reference))
  const target = occasion?.items.find((option) => option.workoutReference === reference)
  if (!target) fail('Det valda passet finns inte längre på den här dagen. Välj träningstillfälle igen.', 409)
  if (!['morning', 'afternoon'].includes(timeOfDay)) fail('Välj morgon eller eftermiddag för det gemensamma träningstillfället.')
  if (target.timeOfDay && target.timeOfDay !== timeOfDay) fail('Passalternativen måste ha samma tid på dagen. Välj rätt träningstillfälle eller ändra tid.')
  const ids = new Set(occasion.items.filter((option) => option.workoutReference.startsWith('workout:')).map((option) => option.id))
  const members = context.workouts.filter((row) => ids.has(row.id))
  const groups = [...new Set(occasion.items.flatMap(item => item.targetGroups || []))]
  if (groups.length && !targetGroups.some((group) => groups.includes(group))) fail('Välj minst en grupp som också omfattas av det befintliga passet.')
  // An old, ungrouped workout supplies a stable ID even if two coaches attach
  // alternatives concurrently. Calendar-matched siblings are promoted together.
  const planIds = occasion.items.filter(item => item.workoutReference.startsWith('plan:')).map(item => item.id)
  return { groupId: target.alternativeGroupId || target.id, timeOfDay, members, planIds, calendarPlan: (targetPlanId && context.plans.find(plan => plan.id === targetPlanId)) || context.plans.find((plan) => plan.source_workout_id === targetId && plan.calendar_link?.mode === 'linked') || context.plans.find((plan) => ids.has(plan.source_workout_id) && plan.calendar_link?.mode === 'linked') || null }
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
