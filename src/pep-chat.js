const stockholm = { timeZone: 'Europe/Stockholm' }
const dateFormat = new Intl.DateTimeFormat('sv-SE', stockholm)
const timeFormat = new Intl.DateTimeFormat('sv-SE', { ...stockholm, hour: '2-digit', minute: '2-digit' })
const dayLabelFormat = new Intl.DateTimeFormat('sv-SE', { ...stockholm, day: 'numeric', month: 'long' })

export const pepKey = item => `${item.type}-${item.id}`
export const pepDay = value => dateFormat.format(new Date(value))
export const pepTime = value => timeFormat.format(new Date(value))
export const pepDayLabel = (day, today) => day === today ? 'Idag' : dayLabelFormat.format(new Date(`${day}T12:00:00Z`))

export function pepTimeline(items) {
  const sorted = items.map(item => ({ ...item, timestamp: Date.parse(item.createdAt) }))
    .sort((a, b) => a.timestamp - b.timestamp || pepKey(a).localeCompare(pepKey(b)))
  let previous
  return sorted.map(item => {
    const day = pepDay(item.timestamp)
    const newDay = day !== previous?.day
    const grouped = !newDay && (previous.sender?.id || previous.type) === (item.sender?.id || item.type)
      && item.timestamp - previous.timestamp < 300000
    previous = { ...item, day }
    return { ...item, day, newDay, grouped }
  })
}

export function applyPepReaction(items, { messageType, messageId, emoji }, reacted) {
  if (typeof reacted !== 'boolean') return items
  const type = messageType === 'group_pep' ? 'group' : 'coach'
  return items.map(item => {
    if (item.type !== type || item.id !== messageId) return item
    const reactions = item.reactions || []
    const previous = reactions.find(reaction => reaction.emoji === emoji) || { count: 0, reacted: false }
    if (previous.reacted === reacted) return item
    const count = previous.count + (reacted ? 1 : -1)
    const next = reactions.filter(reaction => reaction.emoji !== emoji)
    if (count > 0) next.push({ emoji, count, reacted })
    return { ...item, reactions: next }
  })
}
