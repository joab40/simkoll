// Persisted workout identity outranks mutable metadata such as distance/title.
// Never turn a calendar foundation into a published workout by guessing among
// several same-afternoon sessions.
export function linkedWorkoutForPlan(plan, workouts, date) {
  if (plan.sourceWorkoutId) return workouts.find(workout => workout.id === plan.sourceWorkoutId && workout.date === date) || null
  if (plan.activityType !== 'swim' || plan.calendarLink) return null
  const matches = workouts.filter(workout => workout.date === date
    && (!plan.timeOfDay || !workout.timeOfDay || plan.timeOfDay === workout.timeOfDay)
    && (!plan.targetGroups?.length || !workout.targetGroups?.length || workout.targetGroups.some(group => plan.targetGroups.includes(group)))
    && (!plan.focus || !workout.focus || plan.focus === workout.focus)
    && (!plan.distanceMeters || !workout.distanceMeters || Number(plan.distanceMeters) === Number(workout.distanceMeters)))
  return matches.length === 1 ? matches[0] : null
}
