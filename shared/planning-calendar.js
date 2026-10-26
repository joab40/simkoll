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
  const keys = calendarLinkKeys(plan.calendarLink)
  return activities.filter((item) => item.date === plan.date &&
    (item.calendarItems || [item]).some((original) => keys.includes(calendarActivityKey(original))))
}

export function calendarLinkKeys(link) {
  return link?.mode === 'linked' ? [...new Set(Array.isArray(link.keys) ? link.keys : [link.key])].filter(Boolean) : []
}

export function sameCalendarOccasion(activities) {
  const first = activities[0]
  if (!first || activities.length === 1) return Boolean(first)
  const location = (value) => String(value || '').trim().toLocaleLowerCase('sv-SE')
  return Boolean(first.time && first.time !== '00:00' && first.location && activities.every((item) => item.date === first.date && item.time === first.time && location(item.location) === location(first.location)))
}

export function calendarFormValues(value) {
  const activities = Array.isArray(value) ? value : [value]
  const activity = activities[0]
  const keys = [...new Set(activities.map(calendarActivityKey))]
  const time = /^\d{2}:\d{2}$/.test(activity.time || '') && activity.time !== '00:00' ? activity.time : ''
  return {
    calendarLink: { mode: 'linked', key: keys[0], keys, title: [...new Set(activities.map((item) => item.title || ''))].join(' / '), date: activity.date, time, location: activity.location || '' },
    timeOfDay: time ? Number(time.slice(0, 2)) < 12 ? 'morning' : 'afternoon' : '',
    location: activity.location || '',
    targetGroups: [...new Set(activities.flatMap((item) => item.targetGroups || []))],
  }
}

export function validateCalendarLink(value) {
  if (value == null) return true
  const validKey = (key) => typeof key === 'string' && key.length > 0 && key.length <= 2000
  return typeof value === 'object' && !Array.isArray(value) &&
    (value.mode === 'none' || (value.mode === 'linked' && validKey(value.key) &&
      (value.keys === undefined || (Array.isArray(value.keys) && value.keys.length >= 1 && value.keys.length <= 20 && value.keys.every(validKey) && value.keys.includes(value.key)))))
}
