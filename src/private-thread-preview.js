export const privateThreadKey = thread => `${thread?.kind}:${thread?.id}`

function compareMessages(a, b) {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
    || a.createdAt.localeCompare(b.createdAt)
    || a.id.localeCompare(b.id)
}

export function latestPrivateMessage(current, candidate) {
  if (!candidate) return current
  return !current || compareMessages(candidate, current) > 0 ? candidate : current
}

export function summarizePrivateThreads(messages) {
  const threads = new Map()
  for (const message of messages) {
    if (!message.thread?.id) continue
    const key = privateThreadKey(message.thread)
    const summary = threads.get(key) || { latest: null, latestIncoming: null }
    summary.latest = latestPrivateMessage(summary.latest, message)
    if (message.senderRole === 'swimmer' || message.toCoach) {
      const { id, createdAt } = message
      summary.latestIncoming = latestPrivateMessage(summary.latestIncoming, { id, createdAt })
    }
    threads.set(key, summary)
  }
  return threads
}
