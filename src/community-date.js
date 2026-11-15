export function formatFeedDate(value) {
  const date = new Date(value)
  const day = input => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(input)
  return day(date) === day(new Date()) ? `Idag ${date.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}` : date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })
}
