export function latestCoachMessageId(messages = []) {
  return messages.filter((item) => item.senderRole === 'coach')
    .slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.id || ''
}

export const coachInfoReadKey = (profileId) => `simkoll-coach-info-read-${profileId}`
