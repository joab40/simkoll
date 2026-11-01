export const validPlannedSwimTime = value => Number.isFinite(value) && value >= 1 && value <= 1440

// An explicitly linked coach planning row describes the occasion's duration.
// Conflicting linked times do not silently replace a known workout duration.
export function plannedSwimTime(workoutMinutes, linkedMinutes = []) {
  const supplied = linkedMinutes.filter(value => value != null)
  if (supplied.length && supplied.every(validPlannedSwimTime) && new Set(supplied).size === 1) return supplied[0]
  return validPlannedSwimTime(workoutMinutes) ? workoutMinutes : null
}

// A missing alternative choice need not discard time when every possible
// workout in the slot has exactly the same duration. Never sum alternatives.
export function commonPlannedSwimTime(minutes) {
  return minutes.length > 1 && minutes.every(validPlannedSwimTime) && new Set(minutes).size === 1 ? minutes[0] : null
}
