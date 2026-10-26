// UID survives reordering and title/time edits in an iCalendar feed. Include
// the date because recurring events can share a UID across several days.
export function calendarActivityKey(item) {
  if (item.calendarKey) return item.calendarKey
  return JSON.stringify(item.uid
    ? [item.calendarId || '', item.uid, item.date]
    : [item.calendarId || '', item.date, item.time || '', item.location || '', item.title || ''])
}

export function explicitCalendarMatches(plan, activities) {
  if (!plan.calendarLink) return null // legacy automatic matching
  if (plan.calendarLink.mode === 'none') return []
  return activities.filter((item) => item.date === plan.date &&
    (item.calendarItems || [item]).some((original) => calendarActivityKey(original) === plan.calendarLink.key))
}

export function calendarFormValues(activity) {
  const time = /^\d{2}:\d{2}$/.test(activity.time || '') && activity.time !== '00:00' ? activity.time : ''
  return {
    calendarLink: { mode: 'linked', key: calendarActivityKey(activity), title: activity.title || '', date: activity.date, time, location: activity.location || '' },
    timeOfDay: time ? Number(time.slice(0, 2)) < 12 ? 'morning' : 'afternoon' : '',
    location: activity.location || '',
    targetGroups: activity.targetGroups || [],
  }
}

export function validateCalendarLink(value) {
  if (value == null) return true
  return typeof value === 'object' && !Array.isArray(value) &&
    (value.mode === 'none' || (value.mode === 'linked' && typeof value.key === 'string' && value.key.length > 0 && value.key.length <= 2000))
}
