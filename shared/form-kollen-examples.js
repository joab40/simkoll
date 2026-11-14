import { buildFormKollen } from './form-kollen.js'
import { coachWeekAddDays as add } from './coach-week.js'

// Isolated demonstration data. Never used as a fallback for a real profile.
export const FORM_EXAMPLES = ['steady', 'loaded', 'improving', 'positive', 'missing', 'watch'].map(key => {
  const asOf = '2026-11-14'
  const responses = key === 'missing' ? [] : Array.from({ length: 42 }, (_, index) => {
    const offset = index - 41, date = add(asOf, offset)
    const value = key === 'loaded' && offset >= -2 ? 2 : key === 'positive' ? 5 : key === 'improving' ? offset >= -2 ? 4 : offset >= -6 ? 3 : 2.5 : 3.5
    return { id: `demo-${index}`, date, createdAt: `${date}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: value, feeling: key === 'loaded' ? 4 : value, speedFeeling: key === 'loaded' ? 4 : value, rpe: offset >= -6 && key === 'loaded' ? 8 : 5, activityMinutes: 60 }
  })
  const sleep = key === 'missing' ? [] : [0, -1, -2].map(offset => ({ activity_date: add(asOf, offset), minutes: 510, quality: 5 }))
  return { key, data: buildFormKollen({ responses, sleep, illness: [{ activity_date: asOf, status: key === 'watch' ? 'mild' : 'none' }] }, asOf) }
})
