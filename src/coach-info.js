export function latestCoachMessageId(messages = []) {
  return messages.filter((item) => item.senderRole === 'coach')
    .slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.id || ''
}

export const coachInfoReadKey = (profileId) => `simkoll-coach-info-read-${profileId}`

export function markCoachMessageRead(storage, profileId, messageId) {
  if (!storage || !profileId || !messageId) return false
  try {
    storage.setItem(coachInfoReadKey(profileId), messageId)
    return true
  } catch {
    return false
  }
}
