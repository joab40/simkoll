// References distinguish a published workout from a manual planning row.
export const workoutReference = (item) => item.workoutReference || (item.sourceWorkoutId ? `workout:${item.sourceWorkoutId}` : `${item.activityType ? 'plan' : 'workout'}:${item.id}`)

export function swimWorkoutOptions(workouts = [], plans = []) {
  const published = workouts.map((item) => {
    const linked = plans.find((plan) => plan.sourceWorkoutId === item.id && plan.calendarLink?.mode === 'linked')
    return { ...item, ...(linked ? { timeOfDay: linked.timeOfDay || item.timeOfDay, time: linked.calendarLink.time || '', location: linked.calendarLink.location || '' } : {}), activityType: 'swim', workoutReference: `workout:${item.id}` }
  })
  const manual = plans.filter((item) => item.activityType === 'swim' && !item.calendarLink?.detachedWorkoutId && !workouts.some((workout) => workout.id === item.sourceWorkoutId)).map((item) => ({ ...item, workoutReference: `plan:${item.id}` }))
  return [...published, ...manual]
}

// Only a known, shared clock time and location establish alternatives.
// AM/PM alone must never merge two separate training occasions.
export function groupSwimOccasions(items) {
  const groups = new Map()
  items.forEach((item, index) => {
    const time = item.time || item.calendarItems?.[0]?.time || ''
    const location = String(item.location || '').trim().toLowerCase()
    const key = item.activityType === 'swim' && /^\d{2}:\d{2}$/.test(time) && time !== '00:00' && location
      ? `${item.date}|${time}|${location}` : `single:${index}`
    if (!groups.has(key)) groups.set(key, { key, time, location: item.location, items: [] })
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
