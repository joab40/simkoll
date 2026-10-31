const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value

export function agreementText(value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  // An explicitly cleared summary must not resurrect older legacy fields.
  if (typeof value.summary === 'string') return value.summary.trim()
  return Object.values(value).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).join('\n\n')
}

export function latestCompletedAgreement(talks, profileId) {
  const candidates = talks.filter((talk) => talk.swimmerId === profileId && talk.status === 'completed' && validDay(talk.meetingDate))
    .map((talk) => ({ ...talk, text: agreementText(typeof talk.text === 'string' ? talk.text : talk.agreement) }))
    .filter((talk) => talk.text)
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(b.id || '').localeCompare(String(a.id || '')))
  const talk = candidates[0]
  if (!talk) return null
  // The card never needs internal notes, preparations or swimmer answers.
  return { id: talk.id, swimmerId: talk.swimmerId, status: 'completed', meetingDate: talk.meetingDate, followUpDate: validDay(talk.followUpDate) ? talk.followUpDate : null, updatedAt: talk.updatedAt || null, text: talk.text }
}

export const agreementPlainText = (text) => String(text || '').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[-*•]\s+/gm, '• ').trim()

export function agreementExcerpt(text, maxLength = 320) {
  const plain = agreementPlainText(text), chars = Array.from(plain)
  if (chars.length <= maxLength) return { text: plain, truncated: false }
  const head = chars.slice(0, maxLength).join(''), boundary = head.search(/\s+\S*$/)
  return { text: (boundary >= maxLength * .6 ? head.slice(0, boundary) : head).trimEnd() + '…', truncated: true }
}

export const agreementDayLabel = (date) => validDay(date) ? new Date(`${date}T12:00:00Z`).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric' }) : 'Datum saknas'
