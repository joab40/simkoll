const dayBefore = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10)
const mean = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null
const numeric = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
const activityDay = (row) => String(row.activityDate || row.createdAt || '').slice(0, 10)
const activityKey = (row) => `${activityDay(row)}:${row.activityType || 'unknown'}:${row.trainingSlot || 'day'}`
const uniqueDays = (rows, predicate) => new Set(rows.filter(predicate).map(activityDay)).size

export function buildCoachControlPanel(profiles, responses, asOf) {
  const start = dayBefore(asOf, 13), recentStart = dayBefore(asOf, 6)
  const scopedIds = new Set(profiles.filter((profile) => !profile.isTestProfile).map((profile) => profile.id))
  const rows = responses.filter((row) => row.profileId && scopedIds.has(row.profileId) && activityDay(row) >= start && activityDay(row) <= asOf)
  const after = rows.filter((row) => row.type === 'after' && row.competition !== true)
  const uniquePasses = new Map()
  after.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).forEach((row) => uniquePasses.set(`${row.profileId}:${activityKey(row)}`, row))
  const completed = [...uniquePasses.values()]
  const rpeValues = completed.map((row) => numeric(row.rpe)).filter((value) => value !== null)
  const knownLoads = completed.map((row) => {
    const rpe = numeric(row.rpe), minutes = numeric(row.activityMinutes)
    return rpe !== null && minutes !== null && minutes > 0 ? rpe * minutes : null
  }).filter((value) => value !== null)
  const swimmers = profiles.filter((profile) => scopedIds.has(profile.id)).map((profile) => {
    const own = rows.filter((row) => row.profileId === profile.id)
    const recent = own.filter((row) => activityDay(row) >= recentStart)
    const ownAfter = completed.filter((row) => row.profileId === profile.id)
    const currentAfter = ownAfter.filter((row) => activityDay(row) >= recentStart)
    const previousAfter = ownAfter.filter((row) => activityDay(row) < recentStart)
    const speedCurrent = currentAfter.map((row) => numeric(row.speedFeeling)).filter((value) => value !== null)
    const speedPrevious = previousAfter.map((row) => numeric(row.speedFeeling)).filter((value) => value !== null)
    const lowBodyDays = uniqueDays(recent, (row) => numeric(row.body) !== null && row.body <= 2)
    const lowFeelingDays = uniqueDays(recent, (row) => numeric(row.feeling) !== null && row.feeling <= 2)
    const highRpeDays = uniqueDays(recent, (row) => row.type === 'after' && numeric(row.rpe) !== null && row.rpe >= 8)
    const sickDays = uniqueDays(recent, (row) => row.type === 'sick')
    const reasons = []
    if (sickDays >= 2) reasons.push(`Sjukfrånvaro rapporterad ${sickDays} dagar senaste veckan`)
    if (lowBodyDays >= 2) reasons.push(`Låg kroppskänsla ${lowBodyDays} dagar senaste veckan`)
    if (lowFeelingDays >= 2) reasons.push(`Låg känsla ${lowFeelingDays} dagar senaste veckan`)
    if (highRpeDays >= 2) reasons.push(`Hög ansträngning (RPE 8–10) ${highRpeDays} dagar senaste veckan`)
    return {
      profileId: profile.id, displayName: profile.displayName, emoji: profile.emoji || '🏊',
      completed: completed.filter((row) => row.profileId === profile.id).length,
      rpe: mean(ownAfter.map((row) => numeric(row.rpe)).filter((value) => value !== null)),
      feedback: ownAfter.filter((row) => Boolean(row.comment?.trim()) || numeric(row.pass) !== null || numeric(row.setup) !== null).length,
      speedCurrent: speedCurrent.length >= 2 ? mean(speedCurrent) : null,
      speedPrevious: speedPrevious.length >= 2 ? mean(speedPrevious) : null,
      reasons,
    }
  })
  return {
    start, end: asOf,
    profileCount: swimmers.length,
    completedPasses: completed.length,
    averageRpe: mean(rpeValues), rpeAnswers: rpeValues.length,
    feedbackCount: completed.filter((row) => Boolean(row.comment?.trim()) || numeric(row.pass) !== null || numeric(row.setup) !== null).length,
    load: knownLoads.length ? knownLoads.reduce((sum, value) => sum + value, 0) : null,
    loadAnswers: knownLoads.length,
    followUps: swimmers.filter((swimmer) => swimmer.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || a.displayName.localeCompare(b.displayName, 'sv')),
    swimmers,
  }
}
