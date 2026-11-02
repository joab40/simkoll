import { hasTrendValue } from './trend-curve.js'
export const SWIM_METER_COLOR = '#111111'

export function diaryPlotMeters(day) {
  if (Object.hasOwn(day, 'swimMetersPlot')) return hasTrendValue(day.swimMetersPlot) && Number(day.swimMetersPlot) >= 0 ? Number(day.swimMetersPlot) : null
  if (!hasTrendValue(day.swimMeters) && !hasTrendValue(day.estimatedSwimMeters)) return null
  return (Number(day.swimMeters) || 0) + (Number(day.estimatedSwimMeters) || 0)
}

// Only explicit swim distances qualify; never infer distances from comments.
export function withTrendSwimMeters(items) {
  return items.map((item) => {
    if (Object.hasOwn(item, 'swimMetersPlot')) {
      const meters = hasTrendValue(item.swimMetersPlot) && Number(item.swimMetersPlot) >= 0 ? Number(item.swimMetersPlot) : null
      return { ...item, swimMeters: meters, swimMeterScale: meters == null ? null : meters / 1000, swimMeterSource: item.swimMeterPlotSource || null }
    }
    const reported = (item.activities || []).filter((activity) => activity.type === 'swim' && hasTrendValue(activity.distanceMeters) && Number(activity.distanceMeters) >= 0)
    const planned = hasTrendValue(item.distanceMeters) && Number(item.distanceMeters) >= 0 ? Number(item.distanceMeters) : null
    const meters = reported.length ? reported.reduce((sum, activity) => sum + Number(activity.distanceMeters), 0) : planned
    return { ...item, swimMeters: meters, swimMeterScale: meters == null ? null : meters / 1000, swimMeterSource: reported.length ? 'Rapporterat' : meters != null ? 'Uppskattat från kopplat simpass' : null }
  })
}
