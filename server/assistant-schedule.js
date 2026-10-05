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
