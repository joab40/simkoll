const validDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
export const planningAddDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
export const planningMonday = (date) => planningAddDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))

// Personal planning is editable from today through the following Sunday.
export function planningWeekStart(date, today) {
  if (!validDate(date) || !validDate(today) || date < today || date >= planningAddDays(planningMonday(today), 14)) return null
  return planningMonday(date)
}

export function planningDates(today, weekOffset = 0) {
  if (!validDate(today) || ![0, 1].includes(weekOffset)) throw new Error('Välj den här veckan eller nästa vecka.')
  const start = planningAddDays(planningMonday(today), weekOffset * 7)
  return Array.from({ length: 7 }, (_, index) => planningAddDays(start, index))
}

// Club slots and proactively planned personal sessions share the same weekly
// reward. An unplanned after-report must never become planning credit.
export function planningGoalWeeks(plans) {
  const weeks = new Map()
  for (const plan of plans) {
    if (!plan.profileId || !validDate(plan.date) || plan.wasPlanned === false) continue
    const weekStart = planningMonday(plan.date), key = `${plan.profileId}:${weekStart}`
    if (!weeks.has(key)) weeks.set(key, { profileId: plan.profileId, weekStart, days: new Set() })
    weeks.get(key).days.add(plan.date)
  }
  return [...weeks.values()].filter(week => week.days.size >= 3).map(({ profileId, weekStart }) => ({ profileId, sourceKey: `planning:${profileId}:${weekStart}` }))
}
