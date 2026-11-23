const stockholm = { timeZone: 'Europe/Stockholm' }
const day = new Intl.DateTimeFormat('sv-SE', stockholm)
const time = new Intl.DateTimeFormat('sv-SE', { ...stockholm, hour: '2-digit', minute: '2-digit' })
const short = new Intl.DateTimeFormat('sv-SE', { ...stockholm, day: 'numeric', month: 'short' })

export function formatFeedDate(value) {
  const date = new Date(value)
  return day.format(date) === day.format(new Date()) ? `Idag ${time.format(date)}` : short.format(date)
}
