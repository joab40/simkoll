export const FLIGHT_PITCH_LIMIT = 30
export const FLIGHT_FORWARD_LIMIT = 3
export const defaultFlightPresentation = Object.freeze({ sky: false, angle: null, forwardDays: 2 })

export function validateFlightPresentation(input) {
  if (!input || Object.keys(input).length !== 3 || typeof input.sky !== 'boolean'
    || (input.angle !== null && (!Number.isInteger(input.angle) || Math.abs(input.angle) > FLIGHT_PITCH_LIMIT))
    || !Number.isInteger(input.forwardDays) || input.forwardDays < 0 || input.forwardDays > FLIGHT_FORWARD_LIMIT) {
    throw new Error('Välj en lutning mellan −30° och +30° och högst tre dagars illustrerad riktning.')
  }
  return { sky: input.sky, angle: input.angle, forwardDays: input.forwardDays }
}

export function readFlightPresentation(input) {
  try { return validateFlightPresentation(input) } catch { return defaultFlightPresentation }
}

export function flightChartPoints(line, days, sky) {
  const dayByDate = new Map(days.map(day => [day.date, day]))
  return line.map(point => {
    const day = dayByDate.get(point.date)
    const heavy = sky && day && (day.rpe >= 8 || (day.reportedMeters ?? 0) + (day.estimatedMeters ?? 0) >= 5000)
    return {
      date: point.date,
      value: point.value,
      newTimeLift: point.timeLift > 0 && point.events.some(event => event.date === point.date),
      ...(point.limited ? { limited: true } : {}),
      ...(heavy ? { heavy: true } : {}),
    }
  })
}

export function flightAircraft(point) {
  if (!Number.isFinite(point?.value)) return 'sport'
  if (!point.limited && point.value >= 70) return 'jet'
  if (point.heavy || (!point.limited && point.value <= 45)) return 'passenger'
  return 'sport'
}

const dateOffset = (start, end) => (Date.parse(end) - Date.parse(start)) / 86400000
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function flightDirection(points, asOf, presentation) {
  const latest = points.findLast(point => Number.isFinite(point.value))
  const recent = points.filter(point => Number.isFinite(point.value) && !point.limited && dateOffset(point.date, asOf) >= 0 && dateOffset(point.date, asOf) < 7)
  const fresh = latest && latest.date === asOf
  const measured = fresh && !latest.limited && recent.length >= 3
  const first = recent[0]
  const stepsPerDay = measured ? (latest.value - first.value) / dateOffset(first.date, latest.date) : 0
  const angle = presentation.angle ?? clamp(stepsPerDay * 9, -FLIGHT_PITCH_LIMIT, FLIGHT_PITCH_LIMIT)
  const days = fresh && presentation.forwardDays > 0 && (measured || presentation.angle != null) ? presentation.forwardDays : 0
  return { angle, days }
}
