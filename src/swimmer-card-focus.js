import { checkinDay, compareCheckinsNewest } from './checkin-status.js'

// Local presentation only. Late entries belong to their activity day, not the
// day they were submitted. Never promote yesterday's comment to today's card.
export function latestSwimmerComment(items, day) {
  return items.filter(item => typeof item.comment === 'string' && item.comment.trim()
    && Number.isFinite(Date.parse(item.createdAt)) && checkinDay(item) === day)
    .slice().sort(compareCheckinsNewest)[0]?.comment.trim() || ''
}
