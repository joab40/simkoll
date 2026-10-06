const dayKey = (value) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(value))
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const rounded = (value) => value == null ? null : Number(value.toFixed(2))
const direction = (change, threshold) => change >= threshold - 1e-9 ? 'up' : change <= -threshold + 1e-9 ? 'down' : 'steady'
const percentDirection = (current, previous, threshold = .05) => {
  if (current == null || previous == null || current + previous === 0) return { state: 'insufficient', percent: null }
  if (previous === 0) return { state: current > 0 ? 'up' : 'steady', percent: null }
  const change = (current - previous) / previous
  return { state: direction(change, threshold), percent: Math.round(change * 100) }
}

function responseSummary(rows, days) {
  const ratings = rows.filter((row) => ['feeling', 'body'].some((key) => Number.isFinite(row[key])))
  const people = new Set(ratings.map((row) => row.profile_id).filter(Boolean))
  const metrics = Object.fromEntries(['feeling', 'body'].map((key) => {
    const values = ratings.filter((row) => Number.isFinite(row[key]) && row[key] >= 1 && row[key] <= 5)
    const buckets = new Map()
    values.forEach((row) => { const day = dayKey(row.created_at); if (!buckets.has(day)) buckets.set(day, []); buckets.get(day).push(row[key]) })
    // Each day has equal weight, so a day with many check-ins cannot dominate.
    const enough = values.length >= 6 && buckets.size >= Math.min(2, days) && (new Set(values.map((row) => row.profile_id).filter(Boolean)).size >= 3 || values.filter((row) => !row.profile_id).length >= 6)
    return [key, { value: enough ? rounded(mean([...buckets.values()].map(mean))) : null, count: values.length, days: buckets.size }]
  }))
  return { responses: ratings.length, linkedSwimmers: people.size, anonymousResponses: ratings.filter((row) => !row.profile_id).length, people, metrics }
}

export function buildGroupTrend({ currentResponses, previousResponses, currentSessions, previousSessions, profiles, workouts = [], plans = [], start, end, previousStart, previousEnd, includeAnonymous = true, truncated = false }) {
  const days = (from, to) => Math.max(1, Math.round((Date.parse(`${dayKey(to)}T12:00:00Z`) - Date.parse(`${dayKey(from)}T12:00:00Z`)) / 86400000))
  const currentDays = days(start, end), previousDays = days(previousStart, previousEnd)
  const current = responseSummary(currentResponses, currentDays), previous = responseSummary(previousResponses, previousDays)
  const changes = Object.fromEntries(['feeling', 'body'].map((key) => [key, current.metrics[key].value != null && previous.metrics[key].value != null ? rounded(current.metrics[key].value - previous.metrics[key].value) : null]))
  let state = 'insufficient'
  if (!truncated && changes.feeling != null && changes.body != null) {
    const feeling = direction(changes.feeling, .2), body = direction(changes.body, .2)
    state = feeling === 'up' && body === 'down' || feeling === 'down' && body === 'up' ? 'mixed' : feeling === 'down' || body === 'down' ? 'down' : feeling === 'up' || body === 'up' ? 'up' : 'steady'
  }
  // Keep the same roster in both periods; new profiles get a note, not a false decline.
  const cohort = new Set(profiles.filter((profile) => profile.created_at && profile.created_at <= previousStart).map((profile) => profile.id))
  const countPasses = (rows) => new Set(rows.filter((row) => row.activity_type === 'swim' && cohort.has(row.profile_id)).map((row) => `${row.profile_id}|${row.session_date}|${row.session_slot || 'legacy'}`)).size
  const currentPasses = countPasses(currentSessions), previousPasses = countPasses(previousSessions)
  const currentRate = cohort.size ? currentPasses / cohort.size / (currentDays / 7) : null
  const previousRate = cohort.size ? previousPasses / cohort.size / (previousDays / 7) : null
  const continuityChange = currentRate != null ? rounded(currentRate - previousRate) : null
  const continuityState = !truncated && cohort.size >= 3 && currentPasses + previousPasses > 0 ? direction(continuityChange, .15) : 'insufficient'
  const profileGroups = new Map(profiles.map((profile) => [profile.id, profile.training_group || '']))
  const expectedTime = (slot) => slot === 'morning_swim' ? 'morning' : slot === 'afternoon_swim' ? 'afternoon' : ''
  const appliesToProfile = (row, profileId) => !Array.isArray(row.target_groups) || !row.target_groups.length || row.target_groups.includes(profileGroups.get(profileId))
  const sessionKey = (row) => `${row.profile_id}|${row.session_date}|${row.session_slot || row.activity_type}`
  const uniqueSessions = (rows) => [...new Map(rows.filter((row) => cohort.has(row.profile_id)).map((row) => [sessionKey(row), row])).values()]
  const matchingPlan = (session) => {
    const source = session.activity_type === 'swim' ? [...workouts, ...plans.filter((row) => row.activity_type === 'swim')] : plans
    const candidates = source.filter((row) => {
      const rowDate = row.workout_date || row.plan_date
      const rowType = row.activity_type || 'swim'
      if (rowDate !== session.session_date || rowType !== session.activity_type || !appliesToProfile(row, session.profile_id)) return false
      return true
    })
    const time = expectedTime(session.session_slot)
    const exactTime = time ? candidates.filter((row) => row.time_of_day === time) : []
    const untimed = time ? candidates.filter((row) => !row.time_of_day) : candidates
    const matching = exactTime.length ? exactTime : untimed.length ? untimed : candidates
    const detailScore = (row) => (Number(row.distance_meters) > 0 ? 2 : 0) + (Number(row.duration_minutes) > 0 ? 1 : 0)
    return matching.sort((a, b) => detailScore(b) - detailScore(a))[0] || null
  }
  const volumeSummary = (rows, periodDays) => {
    const sessions = uniqueSessions(rows)
    const values = sessions.map((session) => ({ session, plan: matchingPlan(session) }))
    const weeks = periodDays / 7
    const normalize = (value) => cohort.size ? rounded(value / cohort.size / weeks) : null
    const minutesByType = Object.fromEntries(['swim', 'strength', 'dryland'].map((type) => {
      const typed = values.filter(({ session }) => session.activity_type === type)
      const known = typed.filter(({ plan }) => Number(plan?.duration_minutes) > 0)
      const minutes = known.reduce((sum, { plan }) => sum + Number(plan.duration_minutes), 0)
      return [type, known.length ? normalize(minutes) : typed.length ? null : 0]
    }))
    const knownDuration = values.filter(({ plan }) => Number(plan?.duration_minutes) > 0)
    const swimSessions = values.filter(({ session }) => session.activity_type === 'swim')
    const knownSwimMeters = swimSessions.filter(({ plan }) => Number(plan?.distance_meters) > 0)
    const swimMeters = knownSwimMeters.reduce((sum, { plan }) => sum + Number(plan.distance_meters), 0)
    return {
      metersPerSwimmerWeek: knownSwimMeters.length ? normalize(swimMeters) : null,
      minutesPerSwimmerWeek: knownDuration.length ? normalize(knownDuration.reduce((sum, { plan }) => sum + Number(plan.duration_minutes), 0)) : null,
      minutesByType,
      sessions: sessions.length,
      sessionsWithDuration: knownDuration.length,
      swimSessionsWithMeters: knownSwimMeters.length,
    }
  }
  const currentVolume = volumeSummary(currentSessions, currentDays), previousVolume = volumeSummary(previousSessions, previousDays)
  const metersTrend = cohort.size >= 3 && currentVolume.swimSessionsWithMeters && previousVolume.swimSessionsWithMeters ? percentDirection(currentVolume.metersPerSwimmerWeek, previousVolume.metersPerSwimmerWeek) : { state: 'insufficient', percent: null }
  const minutesTrend = cohort.size >= 3 && currentVolume.sessionsWithDuration && previousVolume.sessionsWithDuration ? percentDirection(currentVolume.minutesPerSwimmerWeek, previousVolume.minutesPerSwimmerWeek) : { state: 'insufficient', percent: null }
  const warnings = []
  if (current.anonymousResponses || previous.anonymousResponses) warnings.push('Anonyma svar ingår. Antalet unika svarande och om samma simmare svarat i båda perioderna kan inte fastställas.')
  if (!includeAnonymous) warnings.push('Endast profilkopplade svar för de valda grupperna ingår. Anonyma svar kan inte kopplas till en grupp.')
  if (current.responses && previous.responses && Math.abs(current.responses - previous.responses) / Math.max(current.responses, previous.responses) > .25) warnings.push('Antalet svar skiljer sig tydligt mellan perioderna. Det kan påverka jämförelsen.')
  if (current.people.size >= 3 && previous.people.size >= 3) {
    const overlap = [...current.people].filter((id) => previous.people.has(id)).length
    if (overlap / new Set([...current.people, ...previous.people]).size < .7) warnings.push('Vilka simmare som lämnat profilkopplade svar har ändrats mellan perioderna.')
  }
  if (profiles.length > cohort.size) warnings.push(`${profiles.length - cohort.size} nyare profiler ingår inte i kontinuitetsjämförelsen, så samma simmare jämförs i båda perioderna.`)
  if (currentVolume.sessionsWithDuration < currentVolume.sessions || previousVolume.sessionsWithDuration < previousVolume.sessions) warnings.push('Vissa registrerade pass saknar angiven tidsåtgång i planeringen och ingår därför inte i träningstiden.')
  if (truncated) warnings.push('Underlaget når hämtgränsen. Ingen riktning visas eftersom perioden kan vara ofullständig.')
  const publicSummary = ({ people, ...summary }) => summary
  return {
    state, changes, current: publicSummary(current), previous: publicSummary(previous),
    periods: { start: dayKey(start), end: dayKey(end), previousStart: dayKey(previousStart), previousEnd: dayKey(previousEnd), currentDays, previousDays },
    continuity: { state: continuityState, current: rounded(currentRate), previous: rounded(previousRate), change: continuityChange, swimmers: cohort.size, currentPasses, previousPasses },
    volume: { current: currentVolume, previous: previousVolume, meters: metersTrend, minutes: minutesTrend, swimmers: cohort.size },
    warnings,
  }
}
