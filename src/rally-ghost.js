import { validRallyReplay } from './rally-engine.js'

// Replay is optional, local and profile-scoped. No auth code or health data is stored.
const key = profileId => profileId ? `simkoll:rally-ghost:${profileId}` : null
export function loadRallyGhost(storage, profileId) {
  if (!key(profileId)) return null
  try {
    const raw = storage?.getItem(key(profileId))
    if (!raw || raw.length > 250000) return null
    const replay = JSON.parse(raw)
    return validRallyReplay(replay) ? replay : null
  } catch { return null }
}
export function keepFasterRallyGhost(current, candidate) {
  if (!validRallyReplay(candidate)) return current
  return !validRallyReplay(current) || candidate.duration < current.duration ? candidate : current
}
export function saveRallyGhost(storage, profileId, candidate) {
  if (!key(profileId) || !validRallyReplay(candidate)) return false
  try {
    // Another tab might have just set a faster time. Never replace it with a slower run.
    const best = keepFasterRallyGhost(loadRallyGhost(storage, profileId), candidate)
    storage.setItem(key(profileId), JSON.stringify(best))
    return true
  } catch { return false }
}
