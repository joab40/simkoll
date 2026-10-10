// Activity day and submission order are separate: late entries belong to
// yesterday, while multiple entries on one day retain their actual order.
export function checkinDay(item) {
  return item.activityDate || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(item.createdAt))
}

export function compareCheckinsNewest(a, b) {
  const dayOrder = checkinDay(b).localeCompare(checkinDay(a))
  if (dayOrder) return dayOrder
  return new Date(b.submittedAt || b.createdAt).getTime() - new Date(a.submittedAt || a.createdAt).getTime()
}

export function latestCheckinForDay(items, day) {
  return items.filter((item) => checkinDay(item) === day).slice().sort(compareCheckinsNewest)[0]
}

export function checkinStatus(item) {
  if (!item) return null
  if (item.type === 'before') return item.competition === true ? 'ska tävla' : 'ska träna'
  if (item.type === 'after') return item.competition === true ? 'har tävlat' : 'har simmat'
  return { sick: 'känner sig sjuk', rest: 'vilar idag' }[item.type] || null
}

export function checkinFollowUp(items, day) {
  const latest = latestCheckinForDay(items, day)
  return { followUp: latest?.type === 'before' && latest.competition !== true, raceFollowUp: latest?.type === 'before' && latest.competition === true }
}
