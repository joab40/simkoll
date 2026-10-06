export function estimateAverageSwimMeters({ offeredMeters, offeredPasses, completedPasses, swimmerCount }) {
  const meters = Number(offeredMeters || 0)
  const offers = Number(offeredPasses || 0)
  const completed = Number(completedPasses || 0)
  const swimmers = Number(swimmerCount || 0)
  if (!meters || !offers || !swimmers) return null

  const averageCompletedPasses = completed / swimmers
  const averageMetersPerPass = meters / offers
  const estimate = Math.round((averageCompletedPasses * averageMetersPerPass) / 100) * 100
  return Math.min(meters, Math.max(0, estimate))
}
