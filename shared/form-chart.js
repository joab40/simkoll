// Join only real observed endpoints. A dashed segment does not create an
// observation, interpolate a day, or assert that missing load was rest/zero.
export function formChartSegments(history, field) {
  const points = history.flatMap((row, index) => Number.isFinite(row[field]) ? [{ date: row.date, value: row[field], index }] : [])
  return { points, segments: points.slice(1).map((to, index) => {
    const from = points[index]
    return { from, to, gap: to.index - from.index > 1, missingDays: to.index - from.index - 1 }
  }) }
}
