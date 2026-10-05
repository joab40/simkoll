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
