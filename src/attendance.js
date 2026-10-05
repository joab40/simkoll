// A newer check-in can replace an older attendance decision. A coach's
// decision after that check-in remains authoritative, including absence.
export function attendanceFromCheckins(rows, responses) {
  const latest = new Map()
  for (const item of responses) {
    if (!item.profileId) continue
    if (!latest.has(item.profileId) || new Date(item.createdAt) > new Date(latest.get(item.profileId).createdAt)) latest.set(item.profileId, item)
  }
  const result = {}
  for (const [id, item] of latest) result[id] = ['before', 'after'].includes(item.type) && item.competition !== true
  for (const row of rows) {
    const checkin = latest.get(row.profile_id)
    if (!checkin || new Date(row.marked_at) >= new Date(checkin.createdAt)) result[row.profile_id] = row.present === true
  }
  return result
}
