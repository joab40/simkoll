// One interpretation of thresholds in the swimmer card, coach cards and editor.
export function rewardProgress(total, levels) {
  const ordered = [...levels].sort((a, b) => a.minPoints - b.minPoints)
  const current = [...ordered].reverse().find(level => total >= level.minPoints) || ordered[0] || null
  const next = ordered.find(level => level.minPoints > total) || null
  return { total, current, next: next ? { ...next, remaining: next.minPoints - total } : null }
}
export function rewardDistribution(profiles, levels) {
  const counts = new Map(levels.map(level => [level.id, 0]))
  for (const profile of profiles) {
    const id = rewardProgress(profile.total, levels).current?.id
    if (counts.has(id)) counts.set(id, counts.get(id) + 1)
  }
  return counts
}
