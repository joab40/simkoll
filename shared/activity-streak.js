export const validActivityDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
export const stockholmActivityDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
export function shiftActivityDay(day, count) {
  if (!validActivityDay(day)) throw new Error('Ogiltigt aktivitetsdatum.')
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
export function activityStreak(dates, today = stockholmActivityDay()) {
  if (!validActivityDay(today)) return 0
  const days = new Set(dates.filter(validActivityDay))
  let count = 0, cursor = today
  while (days.has(cursor)) { count++; cursor = shiftActivityDay(cursor, -1) }
  return count
}
// Responses are only an optimistic fallback. Never let another swimmer's
// identified or anonymous group responses fill a hole in this profile's streak.
export function personalActivityStreak(dates, responses, profileId, today = stockholmActivityDay()) {
  const own = profileId ? responses.filter(row => (row.profileId ?? row.profile_id) === profileId).map(row => row.activityDate || row.activity_date || ((row.createdAt || row.created_at) ? stockholmActivityDay(new Date(row.createdAt || row.created_at)) : null)) : []
  return profileId ? activityStreak([...dates, ...own], today) : 0
}
