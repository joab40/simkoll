export const hasTrendValue = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))

export function trendSegments(items, key) {
  return items.reduce((segments, item, index) => {
    if (!hasTrendValue(item[key])) return segments
    const point = { index, value: Number(item[key]) }, last = segments[segments.length - 1]
    if (last && last[last.length - 1].index === index - 1) last.push(point)
    else segments.push([point])
    return segments
  }, [])
}

// Shape-preserving Hermite curves. Tangents stop at extrema and control
// points stay within each segment's range: no invented peaks or valleys.
export function smoothTrendPath(points) {
  if (!points.length) return ''
  const slopes = points.slice(1).map((point, index) => (point.y - points[index].y) / (point.x - points[index].x))
  const tangents = points.map((_, index) => {
    if (!index) return slopes[0] || 0
    if (index === points.length - 1) return slopes[index - 1] || 0
    const before = slopes[index - 1], after = slopes[index]
    return before * after <= 0 ? 0 : Math.sign(before) * Math.min(Math.abs((before + after) / 2), 1.5 * Math.min(Math.abs(before), Math.abs(after)))
  })
  let path = `M ${points[0].x},${points[0].y}`
  points.slice(1).forEach((point, index) => {
    const previous = points[index], width = (point.x - previous.x) / 3
    path += ` C ${previous.x + width},${previous.y + width * tangents[index]} ${point.x - width},${point.y - width * tangents[index + 1]} ${point.x},${point.y}`
  })
  return path
}
