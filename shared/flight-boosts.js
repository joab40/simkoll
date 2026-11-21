export const FLIGHT_BOOST_MAX_DAYS = 90

export const defaultFlightBoostSettings = Object.freeze({
  times: Object.freeze({ maxSteps: 5, fullDays: 1, fadeDays: 6 }),
  taper: Object.freeze({ maxSteps: 5, minusSteps: 5, fullDays: 14, fadeDays: 6 }),
})

export function validateFlightBoostSettings(settings) {
  const sections = Object.entries(defaultFlightBoostSettings)
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).length !== sections.length) {
    throw new Error('Ange inställningar för båda boostarna.')
  }
  for (const [key, defaults] of sections) {
    const boost = settings[key]
    if (!boost || typeof boost !== 'object' || Array.isArray(boost) || Object.keys(boost).length !== Object.keys(defaults).length
      || Object.keys(defaults).some(field => !Number.isInteger(boost[field]) || boost[field] < (field === 'fullDays' ? 1 : 0)
        || boost[field] > (field.endsWith('Days') ? FLIGHT_BOOST_MAX_DAYS : 100))) {
      throw new Error('Ange hela antal steg och dagar. Full effekt behöver minst en dag.')
    }
    if (boost.fullDays + boost.fadeDays > FLIGHT_BOOST_MAX_DAYS) {
      throw new Error(`Full effekt och avtoning får tillsammans vara högst ${FLIGHT_BOOST_MAX_DAYS} dagar per boost.`)
    }
  }
  return settings
}

export function readFlightBoostSettings(settings) {
  try { return validateFlightBoostSettings(settings) } catch { return defaultFlightBoostSettings }
}

export function boostFactor(age, { fullDays, fadeDays }) {
  if (age < fullDays) return 1
  if (age >= fullDays + fadeDays) return 0
  return (fullDays + fadeDays - age) / (fadeDays + 1)
}

export function taperBoostSteps(adjustment, settings) {
  if (adjustment.kind === 'rest') return settings.maxSteps * .3
  const age = adjustment.duration - 1
  const positive = boostFactor(age, settings)
  const negativeDays = adjustment.duration - settings.fullDays - settings.fadeDays
  return positive > 0 ? settings.maxSteps * positive : -settings.minusSteps * Math.min(1, negativeDays / 7)
}
