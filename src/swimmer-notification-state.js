const storageKey = profileId => `simkoll-notifications-seen-${profileId}`

export function readSeenNotifications(profileId) {
  if (!profileId) return new Set()
  try {
    const ids = JSON.parse(window.localStorage.getItem(storageKey(profileId)) || '[]')
    return new Set(Array.isArray(ids) ? ids : [])
  } catch { return new Set() }
}

export function rememberSeenNotifications(profileId, ids) {
  if (!profileId || !ids.length) return
  const seen = readSeenNotifications(profileId)
  for (const id of ids) {
    seen.delete(id)
    seen.add(id)
  }
  try { window.localStorage.setItem(storageKey(profileId), JSON.stringify([...seen].slice(-100))) }
  catch { /* The active view can still dismiss notifications. */ }
}
