export const CHECKIN_ACTIVITIES = [
  { key: 'swim', label: 'Simning', emoji: '🏊' },
  { key: 'strength', label: 'Styrka', emoji: '🏋️' },
  { key: 'dryland', label: 'Landträning', emoji: '🤸' },
  { key: 'cycling', label: 'Cykling', emoji: '🚴' },
  { key: 'other', label: 'Annat', emoji: '👟' },
]
export function activityLabel(type) { return CHECKIN_ACTIVITIES.find((item) => item.key === type)?.label || 'Träning (typ ej angiven)' }
export function checkinTraining(body) {
  if (!['before', 'after'].includes(body.type) || (body.type === 'before' && body.competition !== true)) return null
  if (body.registerTraining === false || !(body.type === 'after' || body.registerTraining === true)) return null
  // Older clients omit the type: preserve their legacy behavior, never parse comments.
  const type = body.competition === true ? 'swim' : body.activityType || 'swim'
  if (!CHECKIN_ACTIVITIES.some((item) => item.key === type)) return null
  if (type === 'swim' && body.competition !== true && !['morning_swim', 'afternoon_swim'].includes(body.trainingSlot)) return null
  return { activity_type: type, session_slot: type === 'swim' ? (body.trainingSlot === 'morning_swim' ? 'morning_swim' : 'afternoon_swim') : type }
}
export function validCheckinActivity(body) {
  if (body.workoutReference != null && (typeof body.workoutReference !== 'string' || !/^(workout|plan):[0-9a-f-]{36}$/i.test(body.workoutReference))) return false
  if (body.trainingSlot != null && !['morning_swim', 'afternoon_swim'].includes(body.trainingSlot)) return false
  if (body.registerTraining != null && typeof body.registerTraining !== 'boolean') return false
  if (body.activityType != null && !CHECKIN_ACTIVITIES.some((item) => item.key === body.activityType)) return false
  for (const [key, max] of [['activityMinutes', 1440], ['activityDistanceMeters', 1000000]]) {
    if (body[key] != null && (!Number.isFinite(body[key]) || body[key] <= 0 || body[key] > max)) return false
  }
  return true
}
