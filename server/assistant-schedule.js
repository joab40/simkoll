export function assistantScheduleLabels(date, time = '') {
  const value = String(time || '').toLowerCase()
  const hour = /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) : null
  const dayPeriod = ['morning', 'morning_swim'].includes(value) ? 'förmiddag'
    : ['afternoon', 'afternoon_swim'].includes(value) ? 'eftermiddag'
      : hour == null ? null : hour < 12 ? 'förmiddag' : hour < 18 ? 'eftermiddag' : 'kväll'
  return {
    weekday: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Intl.DateTimeFormat('sv-SE', { weekday: 'long', timeZone: 'Europe/Stockholm' }).format(new Date(`${date}T12:00:00Z`)) : null,
    dayPeriod,
    time: hour == null ? null : value,
  }
}

export function assistantSwimSlot(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (['morning', 'morning_swim'].includes(normalized)) return 'morning_swim'
  if (['afternoon', 'afternoon_swim'].includes(normalized)) return 'afternoon_swim'
  if (/^\d{2}:\d{2}$/.test(normalized)) return Number(normalized.slice(0, 2)) < 12 ? 'morning_swim' : 'afternoon_swim'
  return null
}

export function buildAssistantSwimCalendar({ workouts = [], plans = [], plannedSessions = [] }) {
  const plannedKeys = new Set(plannedSessions.map((item) => {
    const slot = assistantSwimSlot(item.session_slot)
    return slot ? `${item.planned_date}|${slot}` : null
  }).filter(Boolean))
  const entries = workouts.map((item) => ({
    id: item.id,
    sourceWorkoutId: item.id,
    date: item.workout_date,
    timeOfDay: item.time_of_day,
    title: item.title || 'Simpass',
    location: item.location || '',
    source: 'daily_workout',
  }))
  const workoutIds = new Set(workouts.map((item) => item.id).filter(Boolean))
  const dedupeKeys = new Set(entries.map((item) => {
    const slot = assistantSwimSlot(item.timeOfDay)
    return `${item.date}|${slot || ''}|${String(item.title).trim().toLowerCase()}`
  }))
  plans.filter((item) => item.activity_type === 'swim').forEach((item) => {
    if (item.source_workout_id && workoutIds.has(item.source_workout_id)) return
    const key = `${item.plan_date}|${assistantSwimSlot(item.time_of_day) || ''}|${String(item.title || 'Simpass').trim().toLowerCase()}`
    if (dedupeKeys.has(key)) return
    dedupeKeys.add(key)
    entries.push({ id: item.id, sourceWorkoutId: item.source_workout_id || null, date: item.plan_date, timeOfDay: item.time_of_day, title: item.title || 'Simpass', location: item.location || '', source: 'training_plan' })
  })
  return entries.map((item) => {
    const slot = assistantSwimSlot(item.timeOfDay)
    return {
      date: item.date,
      ...assistantScheduleLabels(item.date, item.timeOfDay),
      slot,
      title: item.title,
      location: item.location || null,
      source: item.source,
      plannedBySwimmer: slot ? plannedKeys.has(`${item.date}|${slot}`) : null,
    }
  })
}

export function addScheduleWeekdays(text, dates) {
  const uniqueDates = [...new Set(dates)].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date || ''))
  const weekdays = /\b(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)(en)?[\s,*]*$/i
  let result = text
  for (const date of uniqueDates) {
    const day = Number(date.slice(8, 10)), month = Number(date.slice(5, 7))
    const monthName = new Intl.DateTimeFormat('sv-SE', { month: 'long', timeZone: 'Europe/Stockholm' }).format(new Date(`${date}T12:00:00Z`))
    const weekday = assistantScheduleLabels(date).weekday
    const pattern = new RegExp(`(?<!\\d)(?:${date}|0?${day}\\s+${monthName}(?:\\s+${date.slice(0, 4)})?|0?${day}\\/0?${month})(?!\\d)`, 'gi')
    result = result.replace(pattern, (match, offset, fullText) => {
      if (weekdays.test(fullText.slice(Math.max(0, offset - 25), offset))) return match
      return `${weekday} ${match}`
    })
  }
  return result
}
