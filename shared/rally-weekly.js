// Calendar weeks are Monday–Sunday in the club's timezone, not the device's.
export function rallyWeekStart(now = new Date()) {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(now)
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}
