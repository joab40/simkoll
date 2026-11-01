const valid = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
const types = new Set(['swim', 'strength', 'dryland', 'cycling', 'other'])

// Never write inferred minutes back into a reported field. A missing RPE cannot
// be inferred, and an invalid explicit time must not silently become planned time.
export function trainingLoad(rpe, reportedMinutes, estimatedMinutes = null) {
  const reported = valid(reportedMinutes, 1, 1440)
  const estimated = reportedMinutes == null && valid(estimatedMinutes, 1, 1440)
  const source = reported ? 'reported' : estimated ? 'estimated' : 'missing'
  const minutes = reported ? reportedMinutes : estimated ? estimatedMinutes : null
  const rpeKnown = valid(rpe, 1, 10)
  return { value: rpeKnown && minutes != null ? Math.round(rpe * minutes * 10) / 10 : null, minutes, source, rpeKnown }
}

export function diaryEntryLoad(entry) {
  if (entry.state !== 'completed' || !types.has(entry.type)) return trainingLoad(null, null)
  return trainingLoad(entry.rpe, entry.reportedMinutes, entry.type === 'swim' && (entry.linked || entry.timeLinked) && !entry.partial ? entry.estimatedMinutes : null)
}
