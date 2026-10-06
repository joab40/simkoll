const groupKey = (value) => ({
  'ungdom orange': 'ungdom_orange',
  'ungdom svart': 'ungdom_svart',
  'ungdoms orange': 'ungdom_orange',
  'ungdoms svart': 'ungdom_svart',
  junior: 'junior',
}[String(value || '').trim().toLowerCase()] || String(value || '').trim().toLowerCase())

const normalizedGroups = (groups) => [...new Set((Array.isArray(groups) ? groups : []).map(groupKey).filter(Boolean))].sort()
const matchesScope = (item, selectedGroups) => {
  const itemGroups = normalizedGroups(item.target_groups)
  return !selectedGroups?.size || !itemGroups.length || itemGroups.some((group) => selectedGroups.has(group))
}
const workoutFingerprint = (item) => [item.date || item.workout_date || '', item.title || '', item.focus || '', item.distance_meters || '', item.duration_minutes || '', item.time_of_day || '', normalizedGroups(item.target_groups).join(','), item.content || ''].join('|')

function unique(items, keyFor) {
  const seen = new Set()
  return items.filter((item) => {
    const key = keyFor(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function publicPlan(item) {
  return { id: item.id, date: item.plan_date, activityType: item.activity_type, title: item.title, focus: item.focus, distanceMeters: item.distance_meters, durationMinutes: item.duration_minutes, timeOfDay: item.time_of_day, targetGroups: item.target_groups || [], sourceWorkoutId: item.source_workout_id || null }
}

function publicWorkout(item) {
  return { id: item.id, date: item.workout_date, activityType: 'swim', title: item.title, focus: item.focus, distanceMeters: item.distance_meters, durationMinutes: item.duration_minutes, timeOfDay: item.time_of_day, targetGroups: item.target_groups || [], content: item.content || '' }
}

export function deduplicatePlannedActivities({ plans = [], workouts = [], from, to, selectedGroups = null }) {
  const inDateRange = (date) => date >= from && date < to
  const scopedPlans = plans.filter((item) => inDateRange(item.plan_date) && ['swim', 'strength', 'dryland', 'competition'].includes(item.activity_type) && matchesScope(item, selectedGroups)).map(publicPlan)
  const scopedWorkouts = workouts.filter((item) => inDateRange(item.workout_date) && matchesScope(item, selectedGroups)).map(publicWorkout)

  const findLinkedWorkout = (plan) => {
    const exact = scopedWorkouts.find((workout) => String(workout.id) === String(plan.sourceWorkoutId))
    const exactMatchesPlan = exact && exact.date === plan.date && (!plan.timeOfDay || !exact.timeOfDay || exact.timeOfDay === plan.timeOfDay) && (!plan.distanceMeters || !exact.distanceMeters || Number(plan.distanceMeters) === Number(exact.distanceMeters))
    if (exactMatchesPlan) return exact
    if (plan.activityType !== 'swim') return null
    const planGroups = new Set(normalizedGroups(plan.targetGroups))
    const candidates = scopedWorkouts.filter((workout) => workout.date === plan.date && (!plan.timeOfDay || !workout.timeOfDay || workout.timeOfDay === plan.timeOfDay) && (!planGroups.size || !workout.targetGroups?.length || workout.targetGroups.some((group) => planGroups.has(groupKey(group)))))
    return candidates.map((workout) => {
      let score = 0
      if (plan.focus && workout.focus === plan.focus) score += 5
      if (Number(plan.distanceMeters) > 0 && Number(workout.distanceMeters) === Number(plan.distanceMeters)) score += 4
      if (Number(plan.durationMinutes) > 0 && Number(workout.durationMinutes) === Number(plan.durationMinutes)) score += 3
      if (plan.timeOfDay && workout.timeOfDay === plan.timeOfDay) score += 3
      if (workout.title && plan.title && workout.title !== plan.title) score += 1
      return { workout, score }
    }).sort((a, b) => b.score - a.score)[0]?.workout || null
  }

  const planned = unique(scopedPlans.map((item) => ({ ...item, linkedWorkout: findLinkedWorkout(item) })), (item) => item.sourceWorkoutId
    ? `workout:${item.sourceWorkoutId}`
    : `plan:${item.date}|${item.activityType}|${item.title}|${item.focus}|${item.distanceMeters}|${item.durationMinutes}|${item.timeOfDay}|${normalizedGroups(item.targetGroups).join(',')}`)
  const linkedIds = new Set(planned.map((item) => item.sourceWorkoutId).filter(Boolean).map(String))
  const linkedFingerprints = new Set(planned.map((item) => item.linkedWorkout).filter(Boolean).map(workoutFingerprint))
  const published = unique(scopedWorkouts.filter((workout) => !linkedIds.has(String(workout.id)) && !linkedFingerprints.has(workoutFingerprint(workout))).map((workout) => ({ ...workout, sourceWorkoutId: workout.id, linkedWorkout: workout })), (item) => `workout-fingerprint:${workoutFingerprint(item.linkedWorkout || item)}`)
  const rawActivities = [...planned, ...published]
  const activityRank = (item) => (item.sourceWorkoutId ? 8 : 0) + (item.location ? 2 : 0) + (item.focus ? 2 : 0) + (item.notes ? 1 : 0) + (item.title && !/^image\.jpg$|^importerat träningspass$/i.test(item.title) ? 1 : 0)
  const deduplicated = []
  const duplicateKeys = new Map()
  rawActivities.forEach((item) => {
    const groups = normalizedGroups(item.targetGroups).join(',')
    const baseKey = [item.date, item.activityType || '', item.distanceMeters || '', item.durationMinutes || '', groups].join('|')
    const activityKey = `${baseKey}|${item.timeOfDay || ''}`
    const previousIndex = duplicateKeys.get(activityKey) ?? duplicateKeys.get(`${baseKey}|`) ?? [...duplicateKeys.entries()].find(([candidate]) => candidate.startsWith(`${baseKey}|`) && (!candidate.split('|').pop() || !item.timeOfDay))?.[1]
    if (previousIndex == null) {
      duplicateKeys.set(activityKey, deduplicated.length)
      deduplicated.push(item)
      return
    }
    const previous = deduplicated[previousIndex]
    const preferred = activityRank(item) > activityRank(previous) ? item : previous
    deduplicated[previousIndex] = { ...preferred, targetGroups: [...new Set([...(previous.targetGroups || []), ...(item.targetGroups || [])])] }
  })
  return deduplicated
}
