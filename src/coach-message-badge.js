export function coachMessageBadge(value) {
  const count = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  return { count, text: count > 99 ? '99+' : String(count), label: count ? `Meddelanden, ${count} ${count === 1 ? 'nytt meddelande' : 'nya meddelanden'}` : 'Meddelanden, inga nya meddelanden' }
}
