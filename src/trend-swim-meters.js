import { hasTrendValue } from './trend-curve.js'

// Only explicit swim distances qualify; never infer distances from comments.
export function withTrendSwimMeters(items) {
  return items.map((item) => {
    const reported = (item.activities || []).filter((activity) => activity.type === 'swim' && hasTrendValue(activity.distanceMeters) && Number(activity.distanceMeters) >= 0)
    const planned = hasTrendValue(item.distanceMeters) && Number(item.distanceMeters) >= 0 ? Number(item.distanceMeters) : null
    const meters = reported.length ? reported.reduce((sum, activity) => sum + Number(activity.distanceMeters), 0) : planned
    return { ...item, swimMeters: meters, swimMeterScale: meters == null ? null : meters / 1000, swimMeterSource: reported.length ? 'Rapporterat' : meters != null ? 'Uppskattat från kopplat simpass' : null }
  })
}
