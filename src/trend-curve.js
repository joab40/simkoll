export const hasTrendValue = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const calendarGap = (a, b) => Date.parse(`${b?.date}T12:00:00Z`) - Date.parse(`${a?.date}T12:00:00Z`) > 86400000

// Multiple workouts on a day need distinct x coordinates for interpolation.
// Keep them inside that day, with a single centered calendar label.
export function trendDateLayout(items) {
  const days = items.map((item) => Date.parse(`${item.date}T12:00:00Z`))
  const first = Math.min(...days), dayMs = 86400000
  const span = Math.max(dayMs, Math.max(...days) - first + dayMs)
  const counts = new Map(), seen = new Map()
  days.forEach((day) => counts.set(day, (counts.get(day) || 0) + 1))
  return {
    dayWidth: dayMs / span,
    positions: days.map((day) => {
      const index = seen.get(day) || 0
      seen.set(day, index + 1)
      return (day - first + dayMs * (index + 1) / (counts.get(day) + 1)) / span
    }),
    labels: [...counts.keys()].map((day) => ({ date: new Date(day).toISOString().slice(0, 10), position: (day - first + dayMs / 2) / span })),
  }
}

export function trendSegments(items, key) {
  return items.reduce((segments, item, index) => {
    if (!hasTrendValue(item[key])) return segments
    const point = { index, value: Number(item[key]) }, last = segments[segments.length - 1]
    if (last && last[last.length - 1].index === index - 1 && !calendarGap(items[index - 1], item)) last.push(point)
    else segments.push([point])
    return segments
  }, [])
}

// Visual bridges only. No intermediate values/points and no extrapolation.
export function trendGapSegments(items, key) {
  const gaps = []
  let previous = null
  items.forEach((item, index) => {
    if (!hasTrendValue(item[key])) return
    const point = { index, value: Number(item[key]) }
    if (previous && (index > previous.index + 1 || calendarGap(items[previous.index], item))) gaps.push([previous, point])
    previous = point
  })
  return gaps
}

// Calendar-only rows remain display data, never new responses or activities.
export function trendCalendarItems(items, { start, endExclusive, meterDays = [] } = {}) {
  const grouped = new Map()
  for (const item of items) {
    if (!grouped.has(item.date)) grouped.set(item.date, [])
    grouped.get(item.date).push(item)
  }
  const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
  const dates = [...grouped.keys()].filter(validDay).sort()
  const from = validDay(start) ? start : dates[0]
  const until = validDay(endExclusive) ? endExclusive : dates.length ? new Date(Date.parse(`${dates.at(-1)}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : null
  if (!from || !until || from >= until || Date.parse(until) - Date.parse(from) > 366 * 86400000) return items
  const amounts = new Map(meterDays.map(day => [day.date, day]))
  const result = []
  for (let date = from; date < until; date = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
    const rows = grouped.get(date) || [{ date, title: amounts.get(date)?.swimMetersPlot === 0 ? 'Ingen registrerad simning' : 'Inga registrerade pass eller svar', count: 0, calendarOnly: true }]
    result.push(...rows.map(row => ({ ...row, ...(amounts.has(date) ? { swimMetersPlot: amounts.get(date).swimMetersPlot, swimMeterPlotSource: amounts.get(date).swimMeterPlotSource } : {}) })))
  }
  return result
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
