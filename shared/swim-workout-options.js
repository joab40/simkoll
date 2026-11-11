import { plannedSwimTime } from './planned-swim-time.js'
import { calendarPlanComplements } from './calendar-plan-complements.js'

// References distinguish a published workout from a manual planning row.
export const workoutReference = (item) => item.workoutReference || (item.sourceWorkoutId ? `workout:${item.sourceWorkoutId}` : `${item.activityType ? 'plan' : 'workout'}:${item.id}`)

export function swimWorkoutOptions(workouts = [], plans = []) {
  plans = calendarPlanComplements(plans, { workoutIds: new Set(workouts.map(item => item.id)) }).rows
  const published = workouts.map((item) => {
    const linked = plans.find((plan) => plan.sourceWorkoutId === item.id && plan.calendarLink?.mode === 'linked')
    const linkedMinutes = plans.filter(plan => plan.sourceWorkoutId === item.id && plan.date === item.date && !plan.calendarLink?.detachedWorkoutId).map(plan => plan.durationMinutes)
    return { ...item, durationMinutes: plannedSwimTime(item.durationMinutes, linkedMinutes), ...(linked ? { calendarLink: linked.calendarLink, timeOfDay: linked.timeOfDay || item.timeOfDay, time: linked.calendarLink.time || '', location: linked.calendarLink.location || '' } : {}), activityType: 'swim', workoutReference: `workout:${item.id}` }
  })
  const manual = plans.filter((item) => item.activityType === 'swim' && !item.calendarLink?.detachedWorkoutId && !workouts.some((workout) => workout.id === item.sourceWorkoutId)).map((item) => ({ ...item, workoutReference: `plan:${item.id}` }))
  return [...published, ...manual]
}

// A calendar assignment takes precedence over the original workbook group:
// relinking one alternative to 19:00 must separate it from its 17:00 siblings.
export function groupSwimOccasions(items) {
  const groups = new Map()
  items.forEach((item, index) => {
    const calendar = item.calendarLink?.mode === 'linked' ? item.calendarLink : null
    const time = calendar?.time || item.time || item.calendarItems?.[0]?.time || ''
    const place = calendar?.location || item.location || item.calendarItems?.[0]?.location || ''
    const location = String(place).trim().toLowerCase()
    const timed = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) && time !== '00:00'
    const key = item.activityType !== 'swim' ? `single:${index}`
      : timed && location ? `${item.date}|${time}|${location}`
        : item.alternativeGroupId ? `alternatives:${item.alternativeGroupId}|${item.date}|${item.timeOfDay || ''}|${time}|${location}`
          : `single:${index}`
    if (!groups.has(key)) groups.set(key, { key, time, timeOfDay: item.timeOfDay || '', location: place, items: [] })
    groups.get(key).items.push(item)
  })
  return [...groups.values()]
}

export function planningAmountRange(items, field) {
  let min = 0, max = 0
  groupSwimOccasions(items).forEach((occasion) => {
    const values = occasion.items.map((item) => Number(item[field]) || 0)
    min += Math.min(...values); max += Math.max(...values)
  })
  return { min, max }
}

export function validWorkoutOption(option, { date, slot, trainingGroup }) {
  const time = slot === 'morning_swim' ? 'morning' : slot === 'afternoon_swim' ? 'afternoon' : null
  return Boolean(option && option.date === date && time && (!option.timeOfDay || option.timeOfDay === time) && (!option.targetGroups?.length || (trainingGroup && option.targetGroups.includes(trainingGroup))))
}
