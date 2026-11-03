// Presentation only: values, endpoints and stored scale meanings stay unchanged.
export const CHECKIN_FEELINGS = [
  { value: 1, emoji: '😣', label: 'Tungt' },
  { value: 2, emoji: '😕', label: 'Segt' },
  { value: 3, emoji: '😌', label: 'Okej' },
  { value: 4, emoji: '🙂', label: 'Bra' },
  { value: 5, emoji: '🤩', label: 'Toppen' },
]
const feelings = CHECKIN_FEELINGS.map(item => item.emoji)
const icons = {
  body: feelings, energy: feelings, motivation: feelings, speedFeeling: feelings,
  sleep: ['😴', '🥱', '😐', '🙂', '😀'],
  rpe: ['😌', '🙂', '😊', '😐', '😅', '😤', '😓', '😣', '😫', '🥵'],
}
export function checkinScaleIcons(key, { competition = false } = {}) {
  // Race motivation means calm/focus, not excitement or being "taggad".
  if (key === 'motivation' && competition) return ['😰', '😟', '😐', '🙂', '😌']
  return icons[key] || null
}
