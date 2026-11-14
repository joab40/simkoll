import { buildFormKollen } from './form-kollen.js'
import { coachWeekAddDays as add } from './coach-week.js'

// Isolated demonstration data. Never used as a fallback for a real profile.
export const FORM_EXAMPLES = ['partial', 'steady', 'loaded', 'improving', 'positive', 'missing', 'watch'].map(key => {
  const asOf = '2026-11-14'
  if (key === 'partial') {
    const responses = [-27, -26, -25, -20, -19, -18, -13, -12, -11, -6, -4, -1].map((offset, index) => ({ id: `partial-${index}`, date: add(asOf, offset), createdAt: `${add(asOf, offset)}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: offset >= -2 ? 2.5 : 3.5, feeling: 4, speedFeeling: offset === -1 ? 5 : offset >= -6 ? null : 3.5, rpe: 5, activityMinutes: null, linkedEstimate: { source: 'linked-plan', minutes: 120 } }))
    responses.push({ ...responses.at(-1), id: 'partial-before', date: add(asOf, -2), type: 'before', speedFeeling: null })
    return { key, data: buildFormKollen({ responses, sleep: [-1, -2].map(offset => ({ activity_date: add(asOf, offset), minutes: 490, quality: 5 })), illness: [{ activity_date: add(asOf, -1), status: 'none' }], context: { observedOn: asOf, trainingPbDate: add(asOf, -1), competitionPbDate: add(asOf, -6), taperStart: asOf, competitionDate: add(asOf, 14), note: 'Fiktiv tränarobservation: flera nya personbästan. Vi har börjat minska mängden och fokuserar mer på fart.' } }, asOf) }
  }
  const responses = key === 'missing' ? [] : Array.from({ length: 42 }, (_, index) => {
    const offset = index - 41, date = add(asOf, offset)
    const value = key === 'loaded' && offset >= -2 ? 2 : key === 'positive' ? 5 : key === 'improving' ? offset >= -2 ? 4 : offset >= -6 ? 3 : 2.5 : 3.5
    return { id: `demo-${index}`, date, createdAt: `${date}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: value, feeling: key === 'loaded' ? 4 : value, speedFeeling: key === 'loaded' ? 2 : value, rpe: offset >= -6 && key === 'loaded' ? 8 : 5, activityMinutes: 60 }
  })
  const sleep = key === 'missing' ? [] : [0, -1, -2].map(offset => ({ activity_date: add(asOf, offset), minutes: 510, quality: 5 }))
  return { key, data: buildFormKollen({ responses, sleep, illness: [{ activity_date: asOf, status: key === 'watch' ? 'mild' : 'none' }] }, asOf) }
})
