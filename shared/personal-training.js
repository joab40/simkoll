export const PERSONAL_ACTIVITIES = [
  { key: 'niu', type: 'swim', origin: 'niu', emoji: '🎓', label: 'NIU-simning' },
  { key: 'swim', type: 'swim', origin: 'self', emoji: '💧', label: 'Eget simpass' },
  { key: 'strength', type: 'strength', origin: 'self', emoji: '🏋️', label: 'Styrketräning' },
  { key: 'dryland', type: 'dryland', origin: 'self', emoji: '🤸', label: 'Landträning' },
]
export const OTHER_SPORTS = [
  { key: 'cycling', type: 'cycling', emoji: '🚴', label: 'Cykling' },
  { key: 'running', type: 'other', emoji: '🏃', label: 'Löpning' },
  { key: 'walking', type: 'other', emoji: '🚶', label: 'Promenad' },
  { key: 'other', type: 'other', emoji: '👟', label: 'Annan träning' },
]
export const PERSONAL_FOCUSES = [
  ['f2_frisim', 'F2 Frisim'], ['f2_spec', 'F2 Spec'], ['fart', 'Fart'], ['sprint', 'Sprint'],
  ['distans', 'Distans'], ['teknik', 'Teknik'], ['aterhamtning', 'Återhämtning'],
  ['troskel', 'Tröskel'], ['syra', 'Syra'], ['other', 'Annat'],
]
export const METER_PRESETS = [1000, 2000, 3000, 4000, 5000, 6000]
export const MINUTE_PRESETS = [30, 60, 90, 120]
export const personalId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const personalSlot = id => `extra_${id}`
export const isPersonalSlot = slot => typeof slot === 'string' && slot.startsWith('extra_') && personalId(slot.slice(6))
export const personalTitle = details => details.origin === 'niu' ? 'NIU-simning' : OTHER_SPORTS.find(item => item.key === details.sport)?.label || PERSONAL_ACTIVITIES.find(item => item.type === details.activityType && item.origin === 'self')?.label || 'Eget pass'
export const personalEmoji = details => details.origin === 'niu' ? '🎓' : OTHER_SPORTS.find(item => item.key === details.sport)?.emoji || PERSONAL_ACTIVITIES.find(item => item.type === details.activityType && item.origin === 'self')?.emoji || '👟'

export function normalizePersonalDetails(value) {
  if (!value || !['swim', 'strength', 'dryland', 'cycling', 'other'].includes(value.activityType) || !['niu', 'self'].includes(value.origin) || (value.origin === 'niu' && value.activityType !== 'swim')) throw new Error('Välj en giltig träningsform.')
  const sport = value.sport || null, focus = value.focus || null, timeOfDay = value.timeOfDay || null
  if (sport && !OTHER_SPORTS.some(item => item.key === sport && item.type === value.activityType)) throw new Error('Välj en giltig aktivitet.')
  if (['cycling', 'other'].includes(value.activityType) && !sport) throw new Error('Välj vilken övrig träning du menar.')
  if (focus && (value.activityType !== 'swim' || !PERSONAL_FOCUSES.some(([key]) => key === focus))) throw new Error('Välj en giltig inriktning.')
  if (timeOfDay && !['morning', 'afternoon'].includes(timeOfDay)) throw new Error('Välj morgon eller eftermiddag / kväll.')
  const amount = (key, max) => {
    const number = value[key] == null || value[key] === '' ? null : value[key]
    if (number != null && (!Number.isInteger(number) || number < 1 || number > max)) throw new Error(key === 'distanceMeters' ? 'Ange 1–50 000 meter.' : 'Ange 1–1 440 minuter.')
    return number
  }
  const distanceMeters = amount('distanceMeters', 50000), durationMinutes = amount('durationMinutes', 1440)
  if (distanceMeters != null && value.activityType !== 'swim') throw new Error('Simmeter gäller bara simpass.')
  const details = { activityType: value.activityType, origin: value.origin, sport, focus, timeOfDay, distanceMeters, durationMinutes }
  return { ...details, title: personalTitle(details) }
}

export function personalCheckinDetails(body) {
  return normalizePersonalDetails({ activityType: body.activityType, origin: body.trainingOrigin, sport: body.activitySport, focus: body.activityFocus, timeOfDay: body.personalTimeOfDay, distanceMeters: body.activityDistanceMeters, durationMinutes: body.activityMinutes })
}

export function mapPersonalPlan(row, completed = false) {
  return { id: row.id, date: row.planned_date, slot: row.session_slot, weekStart: row.week_start, ...row.personal_details, completed }
}

export function personalTrainingWeekSlots(plans, sessions, start, end) {
  const inWeek = item => item.personalSession && item.date >= start && item.date <= end
  const slotId = item => `${item.date}|${item.slot}`
  const completed = new Map(sessions.filter(inWeek).map(item => [slotId(item), item]))
  const byCell = new Map()
  const add = (item, done) => {
    const type = item.activityType ?? item.type
    const slot = type === 'swim' && ['morning', 'afternoon'].includes(item.timeOfDay) ? `${item.timeOfDay}_swim`
      : ['strength', 'dryland'].includes(type) ? type : 'personal'
    const key = `${item.date}|${slot}`
    const details = { ...item, activityType: type }
    const entries = byCell.get(key) ?? []
    entries.push({ title: item.title || personalTitle(details), icon: personalEmoji(details), origin: item.origin, done })
    byCell.set(key, entries)
  }
  for (const plan of plans.filter(inWeek)) {
    const done = completed.delete(slotId(plan))
    add(plan, done)
  }
  for (const session of completed.values()) add(session, true)
  return byCell
}
