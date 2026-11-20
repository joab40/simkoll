import { diaryAddDays, validDiaryDate } from './training-diary.js'

export function diaryMonthRange(month, today) {
  const first = `${month}-01`
  if (!/^\d{4}-\d{2}$/.test(month) || !validDiaryDate(first) || !validDiaryDate(today) || first > today) return null
  const next = new Date(`${first}T12:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { start: first, end: [diaryAddDays(next.toISOString().slice(0, 10), -1), today].sort()[0] }
}

export function diaryMoveMonth(month, amount, today) {
  if (![-1, 1].includes(amount) || !diaryMonthRange(month, today)) return null
  const next = new Date(`${month}-01T12:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + amount)
  const value = next.toISOString().slice(0, 7)
  return value >= '1900-01' ? diaryMonthRange(value, today) : null
}

export function missingSwimDetails(entry) {
  if (entry.type !== 'swim' || entry.state !== 'completed') return []
  const known = value => typeof value === 'number' && Number.isFinite(value) && value > 0
  return [
    ![entry.reportedMeters, entry.estimatedMeters].some(known) && 'meter',
    ![entry.reportedMinutes, entry.estimatedMinutes].some(known) && 'tid',
    !(typeof entry.focus === 'string' && entry.focus.trim()) && 'inriktning',
  ].filter(Boolean)
}
