export const ILLNESS_CHOICES = [
  { value: 'none', label: 'Nej', icon: '🙂' },
  { value: 'mild', label: 'Lite känningar', icon: '🤧' },
  { value: 'sick', label: 'Jag känner mig sjuk', icon: '🤒' },
]
export const illnessLabel = value => ILLNESS_CHOICES.find(choice => choice.value === value)?.label || 'Svar saknas'
export const validIllnessDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
export function illnessDays(records, start, end) {
  return [...new Map(records.filter(row => validIllnessDay(row.activity_date) && row.activity_date >= start && row.activity_date <= end && !row.skipped && ILLNESS_CHOICES.some(choice => choice.value === row.status)).map(row => [row.activity_date, row])).values()].sort((a, b) => a.activity_date.localeCompare(b.activity_date))
}
